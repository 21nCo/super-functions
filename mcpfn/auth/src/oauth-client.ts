import type {
  AddClientAuthentication,
  OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  generateStateId,
  redactOAuthValue,
} from "@superfunctions/oauth-core";
import type { TokenCipher } from "@superfunctions/oauth-storage";

import {
  matchMcpRedirectUri,
  type McpFnRedirectPolicy,
} from "./redirects.js";

export type McpFnOAuthCredentialScope = "all" | "client" | "tokens" | "verifier" | "state";

export interface McpFnOAuthSessionStore {
  readonly security: "memory" | "encrypted";
  getClientInformation(): Promise<OAuthClientInformationMixed | undefined>;
  setClientInformation(value: OAuthClientInformationMixed): Promise<void>;
  getTokens(): Promise<OAuthTokens | undefined>;
  setTokens(value: OAuthTokens): Promise<void>;
  getCodeVerifier(): Promise<string | undefined>;
  setCodeVerifier(value: string): Promise<void>;
  getState(): Promise<string | undefined>;
  setState(value: string): Promise<void>;
  clear(scope: McpFnOAuthCredentialScope): Promise<void>;
}

export class MemoryMcpFnOAuthSessionStore implements McpFnOAuthSessionStore {
  readonly security = "memory" as const;
  private client?: OAuthClientInformationMixed;
  private tokenSet?: OAuthTokens;
  private verifier?: string;
  private pendingState?: string;

  async getClientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return this.client ? structuredClone(this.client) : undefined;
  }

  async setClientInformation(value: OAuthClientInformationMixed): Promise<void> {
    this.client = structuredClone(value);
  }

  async getTokens(): Promise<OAuthTokens | undefined> {
    return this.tokenSet ? structuredClone(this.tokenSet) : undefined;
  }

  async setTokens(value: OAuthTokens): Promise<void> {
    this.tokenSet = structuredClone(value);
  }

  async getCodeVerifier(): Promise<string | undefined> {
    return this.verifier;
  }

  async setCodeVerifier(value: string): Promise<void> {
    this.verifier = value;
  }

  async getState(): Promise<string | undefined> {
    return this.pendingState;
  }

  async setState(value: string): Promise<void> {
    this.pendingState = value;
  }

  async clear(scope: McpFnOAuthCredentialScope): Promise<void> {
    if (scope === "all" || scope === "client") this.client = undefined;
    if (scope === "all" || scope === "tokens") this.tokenSet = undefined;
    if (scope === "all" || scope === "verifier") this.verifier = undefined;
    if (scope === "all" || scope === "state") this.pendingState = undefined;
  }
}

export interface McpFnEncryptedSessionRecord {
  ciphertext: string;
  keyRef: string;
}

export interface McpFnEncryptedSessionRecordStore {
  get(key: string): Promise<McpFnEncryptedSessionRecord | null>;
  put(key: string, value: McpFnEncryptedSessionRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

const ENCRYPTED_SESSION_ENVELOPE_KIND = "mcpfn.oauth-session-envelope";

/** Encrypts client registration, tokens, and the transient verifier at rest. */
export function createEncryptedMcpFnOAuthSessionStore(options: {
  namespace: string;
  keyRef: string;
  cipher: TokenCipher;
  store: McpFnEncryptedSessionRecordStore;
}): McpFnOAuthSessionStore {
  if (!options.namespace || !options.keyRef) {
    throw new Error("Encrypted McpFn OAuth storage requires namespace and keyRef");
  }
  const key = (part: string) => `${options.namespace}:${part}`;
  const get = async <T>(part: string): Promise<T | undefined> => {
    const record = await options.store.get(key(part));
    if (!record) return undefined;
    const parsed = JSON.parse(await options.cipher.decrypt(record.ciphertext, record.keyRef)) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { formatVersion?: unknown }).formatVersion === 1 &&
      Object.hasOwn(parsed, "value") &&
      (
        (parsed as { kind?: unknown }).kind === ENCRYPTED_SESSION_ENVELOPE_KIND ||
        isLegacyEncryptedSessionEnvelope(parsed)
      )
    ) {
      return (parsed as { value: T }).value;
    }
    return parsed as T;
  };
  const put = async (part: string, value: unknown): Promise<void> => {
    await options.store.put(key(part), {
      ciphertext: await options.cipher.encrypt(JSON.stringify({
        kind: ENCRYPTED_SESSION_ENVELOPE_KIND,
        formatVersion: 1,
        value,
      }), options.keyRef),
      keyRef: options.keyRef,
    });
  };
  return {
    security: "encrypted",
    getClientInformation: () => get("client"),
    setClientInformation: (value) => put("client", value),
    getTokens: () => get("tokens"),
    setTokens: (value) => put("tokens", value),
    getCodeVerifier: () => get("verifier"),
    setCodeVerifier: (value) => put("verifier", value),
    getState: () => get("state"),
    setState: (value) => put("state", value),
    async clear(scope) {
      if (scope === "all" || scope === "client") await options.store.delete(key("client"));
      if (scope === "all" || scope === "tokens") await options.store.delete(key("tokens"));
      if (scope === "all" || scope === "verifier") await options.store.delete(key("verifier"));
      if (scope === "all" || scope === "state") await options.store.delete(key("state"));
    },
  };
}

function isLegacyEncryptedSessionEnvelope(value: object): boolean {
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes("formatVersion") && keys.includes("value");
}

export type McpFnOAuthClientPhase =
  | "client-registration"
  | "authorization-request"
  | "authorization-callback"
  | "token-exchange"
  | "token-refresh"
  | "token-revocation";

export interface McpFnOAuthClientDiagnostic {
  phase: McpFnOAuthClientPhase;
  outcome: "started" | "succeeded" | "failed";
  code?: string;
  at: string;
  details?: Record<string, unknown>;
}

export interface McpFnOAuthClientProviderOptions {
  redirectUrl: string | URL;
  clientMetadata: OAuthClientMetadata;
  clientMetadataUrl?: string;
  store?: McpFnOAuthSessionStore;
  redirectPolicy?: McpFnRedirectPolicy;
  openAuthorization(url: URL): void | Promise<void>;
  diagnostics?(event: McpFnOAuthClientDiagnostic): void | Promise<void>;
  state?: () => string | Promise<string>;
  addClientAuthentication?: AddClientAuthentication;
  validateResourceURL?(serverUrl: string | URL, resource?: string): Promise<URL | undefined>;
  revoke?(tokens: OAuthTokens): void | Promise<void>;
  clock?: () => Date;
}

export class McpFnOAuthClientProvider implements OAuthClientProvider {
  readonly redirectUrl: string | URL;
  readonly clientMetadata: OAuthClientMetadata;
  readonly clientMetadataUrl?: string;
  readonly addClientAuthentication?: AddClientAuthentication;
  readonly validateResourceURL: McpFnOAuthClientProviderOptions["validateResourceURL"] | undefined;
  private readonly options: McpFnOAuthClientProviderOptions;
  private readonly store: McpFnOAuthSessionStore;

  constructor(options: McpFnOAuthClientProviderOptions) {
    this.options = options;
    this.redirectUrl = options.redirectUrl;
    this.clientMetadata = structuredClone(options.clientMetadata);
    this.clientMetadataUrl = options.clientMetadataUrl;
    this.store = options.store ?? new MemoryMcpFnOAuthSessionStore();
    this.addClientAuthentication = options.addClientAuthentication;
    this.validateResourceURL = options.validateResourceURL;
    if (!this.clientMetadata.redirect_uris?.length) {
      throw new Error("McpFn OAuth client metadata requires registered redirect_uris");
    }
  }

  async state(): Promise<string> {
    const value = await (this.options.state?.() ?? generateStateId("mcpfn_state"));
    await this.store.setState(value);
    return value;
  }

  clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    return this.store.getClientInformation();
  }

  async saveClientInformation(value: OAuthClientInformationMixed): Promise<void> {
    await this.emit("client-registration", "started", undefined, {
      storage: this.store.security,
    });
    try {
      await this.store.setClientInformation(value);
      await this.emit("client-registration", "succeeded", undefined, {
        clientId: value.client_id,
        storage: this.store.security,
      });
    } catch (error) {
      await this.emit("client-registration", "failed", readCode(error) ?? "MCPFN_OAUTH_STORAGE_FAILED", {
        message: error instanceof Error ? error.message : String(error),
        storage: this.store.security,
      });
      throw error;
    }
  }

  tokens(): Promise<OAuthTokens | undefined> {
    return this.store.getTokens();
  }

  async saveTokens(value: OAuthTokens): Promise<void> {
    let phase: "token-exchange" | "token-refresh" = "token-exchange";
    try {
      const [previous, verifier, pendingState] = await Promise.all([
        this.store.getTokens(),
        this.store.getCodeVerifier(),
        this.store.getState(),
      ]);
      const completesAuthorizationCodeExchange = Boolean(verifier) && !pendingState;
      phase = previous && !completesAuthorizationCodeExchange
        ? "token-refresh"
        : "token-exchange";
      await this.emit(phase, "started", undefined, { storage: this.store.security });
      await this.store.setTokens(value);
      if (completesAuthorizationCodeExchange) {
        await this.store.clear("verifier");
      }
      await this.emit(phase, "succeeded", undefined, {
        tokenType: value.token_type,
        hasRefreshToken: Boolean(value.refresh_token),
        storage: this.store.security,
      });
    } catch (error) {
      await this.emit(phase, "failed", readCode(error) ?? "MCPFN_OAUTH_STORAGE_FAILED", {
        message: error instanceof Error ? error.message : String(error),
        storage: this.store.security,
      });
      throw error;
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.emit("authorization-request", "started");
    const requested = authorizationUrl.searchParams.get("redirect_uri");
    if (!requested) {
      await this.emit("authorization-request", "failed", "MCPFN_REDIRECT_MISSING");
      throw new Error("MCP authorization request is missing redirect_uri");
    }
    try {
      const client = await this.store.getClientInformation();
      const registered = "redirect_uris" in (client ?? {}) &&
          Array.isArray((client as { redirect_uris?: unknown }).redirect_uris)
        ? (client as { redirect_uris: string[] }).redirect_uris
        : this.clientMetadata.redirect_uris;
      const match = matchMcpRedirectUri(requested, registered, this.options.redirectPolicy);
      await this.options.openAuthorization(authorizationUrl);
      await this.emit("authorization-request", "succeeded", undefined, {
        redirect: match,
        clientId: authorizationUrl.searchParams.get("client_id"),
      });
    } catch (error) {
      await this.emit("authorization-request", "failed", readCode(error), {
        redirectOrigin: safeOrigin(requested),
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  saveCodeVerifier(value: string): Promise<void> {
    return this.store.setCodeVerifier(value);
  }

  async codeVerifier(): Promise<string> {
    const value = await this.store.getCodeVerifier();
    if (!value) throw new Error("No PKCE verifier is available for this MCP authorization session");
    return value;
  }

  async validateAuthorizationState(value: string | undefined): Promise<void> {
    const expected = await this.store.getState();
    if (!expected || !value || expected !== value) {
      await this.emit("authorization-callback", "failed", "MCPFN_STATE_MISMATCH");
      throw new Error("MCP authorization callback state does not match the pending session");
    }
    await this.store.clear("state");
    await this.emit("authorization-callback", "succeeded");
  }

  invalidateCredentials(scope: McpFnOAuthCredentialScope): Promise<void> {
    return this.store.clear(scope);
  }

  async invalidatePendingAuthorization(): Promise<void> {
    await Promise.all([
      this.store.clear("verifier"),
      this.store.clear("state"),
    ]);
  }

  async revoke(): Promise<void> {
    const tokens = await this.store.getTokens();
    if (!tokens) {
      await this.emit("token-revocation", "succeeded", "MCPFN_NO_LOCAL_TOKEN", {
        remote: false,
      });
      return;
    }
    await this.emit("token-revocation", "started");
    try {
      if (!this.options.revoke) {
        const error = Object.assign(
          new Error("Remote token revocation is not configured; local credentials were retained"),
          { code: "MCPFN_REVOCATION_UNAVAILABLE" },
        );
        throw error;
      }
      await this.options.revoke(tokens);
      await this.store.clear("tokens");
      await this.emit("token-revocation", "succeeded");
    } catch (error) {
      await this.emit("token-revocation", "failed", readCode(error), {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async emit(
    phase: McpFnOAuthClientPhase,
    outcome: McpFnOAuthClientDiagnostic["outcome"],
    code?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.options.diagnostics?.(redactOAuthValue({
        phase,
        outcome,
        ...(code ? { code } : {}),
        at: (this.options.clock?.() ?? new Date()).toISOString(),
        ...(details ? { details } : {}),
      }) as unknown as McpFnOAuthClientDiagnostic);
    } catch {
      // Diagnostics are observational and must never change OAuth semantics.
    }
  }
}

export function createMcpFnOAuthClientProvider(
  options: McpFnOAuthClientProviderOptions,
): McpFnOAuthClientProvider {
  return new McpFnOAuthClientProvider(options);
}

function readCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function safeOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "invalid";
  }
}
