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
    return JSON.parse(await options.cipher.decrypt(record.ciphertext, record.keyRef)) as T;
  };
  const put = async (part: string, value: unknown): Promise<void> => {
    await options.store.put(key(part), {
      ciphertext: await options.cipher.encrypt(JSON.stringify(value), options.keyRef),
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
  readonly validateResourceURL?: McpFnOAuthClientProviderOptions["validateResourceURL"];
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
    await this.store.setClientInformation(value);
    await this.emit("client-registration", "succeeded", undefined, {
      clientId: value.client_id,
      storage: this.store.security,
    });
  }

  tokens(): Promise<OAuthTokens | undefined> {
    return this.store.getTokens();
  }

  async saveTokens(value: OAuthTokens): Promise<void> {
    const previous = await this.store.getTokens();
    await this.store.setTokens(value);
    await this.emit(previous ? "token-refresh" : "token-exchange", "succeeded", undefined, {
      tokenType: value.token_type,
      hasRefreshToken: Boolean(value.refresh_token),
      storage: this.store.security,
    });
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
    await this.options.openAuthorization(authorizationUrl);
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

  async revoke(): Promise<void> {
    const tokens = await this.store.getTokens();
    if (!tokens) return;
    await this.emit("token-revocation", "started");
    try {
      await this.options.revoke?.(tokens);
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
    await this.options.diagnostics?.(redactOAuthValue({
      phase,
      outcome,
      ...(code ? { code } : {}),
      at: (this.options.clock?.() ?? new Date()).toISOString(),
      ...(details ? { details } : {}),
    }));
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
