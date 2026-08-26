import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import {
  matchMcpRedirectUri,
  McpFnRedirectMismatchError,
  type McpFnRedirectPolicy,
} from "./redirects.js";

export type McpFnClientRegistrationSource =
  | "pre-registered"
  | "dynamic"
  | "client-metadata-document"
  | "enterprise";

export interface McpFnNormalizedClientRegistration {
  clientId: string;
  source: McpFnClientRegistrationSource;
  redirectUris: string[];
  responseTypes: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
  metadata: OAuthClientMetadata;
}

export interface McpFnHostedClientRegistry {
  resolve(clientId: string): Promise<McpFnNormalizedClientRegistration | null>;
  register?(
    metadata: OAuthClientMetadata,
    request: Request,
  ): Promise<McpFnNormalizedClientRegistration>;
}

export interface McpFnValidatedAuthorizationRequest {
  client: McpFnNormalizedClientRegistration;
  responseType: "code";
  redirectUri: string;
  redirectMatch: "exact" | "loopback-dynamic-port";
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: string[];
  state?: string;
  resource?: string;
  raw: URLSearchParams;
}

export class McpFnHostedAuthorizationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options: { status?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "McpFnHostedAuthorizationError";
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
  }
}

export function normalizeMcpClientRegistration(input: {
  clientId: string;
  source: McpFnClientRegistrationSource;
  metadata: OAuthClientMetadata;
}): McpFnNormalizedClientRegistration {
  if (!input.clientId) {
    throw new McpFnHostedAuthorizationError("invalid_client_metadata", "client_id is required");
  }
  const redirectUris = uniqueUrls(input.metadata.redirect_uris ?? []);
  if (!redirectUris.length) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "At least one redirect_uri is required",
    );
  }
  const responseTypes = unique(input.metadata.response_types ?? ["code"]);
  const grantTypes = unique(input.metadata.grant_types ?? ["authorization_code"]);
  return {
    clientId: input.clientId,
    source: input.source,
    redirectUris,
    responseTypes,
    grantTypes,
    tokenEndpointAuthMethod: input.metadata.token_endpoint_auth_method ?? "none",
    metadata: {
      ...input.metadata,
      redirect_uris: redirectUris,
      response_types: responseTypes,
      grant_types: grantTypes,
      token_endpoint_auth_method: input.metadata.token_endpoint_auth_method ?? "none",
    },
  };
}

export function validateMcpAuthorizationRequest(options: {
  url: string | URL;
  client: McpFnNormalizedClientRegistration;
  redirectPolicy?: McpFnRedirectPolicy;
  allowedResources?: ReadonlyArray<string | URL>;
  supportedScopes?: ReadonlyArray<string>;
}): McpFnValidatedAuthorizationRequest {
  const url = new URL(options.url.toString());
  const responseType = url.searchParams.get("response_type");
  if (responseType !== "code" || !options.client.responseTypes.includes("code")) {
    throw new McpFnHostedAuthorizationError(
      "unsupported_response_type",
      "This MCP authorization profile requires response_type=code",
    );
  }
  if (!options.client.grantTypes.includes("authorization_code")) {
    throw new McpFnHostedAuthorizationError(
      "unauthorized_client",
      "The client has no compatible authorization_code flow",
    );
  }
  const requestedClientId = url.searchParams.get("client_id");
  if (requestedClientId !== options.client.clientId) {
    throw new McpFnHostedAuthorizationError("invalid_client", "client_id does not match registration");
  }
  const redirectUri = url.searchParams.get("redirect_uri");
  if (!redirectUri) {
    throw new McpFnHostedAuthorizationError("invalid_request", "redirect_uri is required");
  }
  let redirectMatch;
  try {
    redirectMatch = matchMcpRedirectUri(
      redirectUri,
      options.client.redirectUris,
      options.redirectPolicy,
    );
  } catch (error) {
    if (error instanceof McpFnRedirectMismatchError) {
      throw new McpFnHostedAuthorizationError(
        "invalid_request",
        error.message,
        { details: { phase: "redirect-validation", redirect: error.requested } },
      );
    }
    throw error;
  }
  const codeChallenge = url.searchParams.get("code_challenge");
  if (!codeChallenge) {
    throw new McpFnHostedAuthorizationError("invalid_request", "PKCE code_challenge is required");
  }
  if (url.searchParams.get("code_challenge_method") !== "S256") {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      "PKCE code_challenge_method must be S256",
    );
  }
  const resource = url.searchParams.get("resource") ?? undefined;
  if (resource && options.allowedResources?.length) {
    const allowed = new Set(options.allowedResources.map((value) => new URL(value.toString()).toString()));
    if (!allowed.has(new URL(resource).toString())) {
      throw new McpFnHostedAuthorizationError("invalid_target", "resource is not allowed");
    }
  }
  const scopes = unique((url.searchParams.get("scope") ?? "").split(/\s+/).filter(Boolean));
  if (options.supportedScopes) {
    const supported = new Set(options.supportedScopes);
    const unsupported = scopes.filter((scope) => !supported.has(scope));
    if (unsupported.length) {
      throw new McpFnHostedAuthorizationError("invalid_scope", "Requested MCP scope is unsupported", {
        details: { unsupportedScopes: unsupported },
      });
    }
  }
  return {
    client: options.client,
    responseType: "code",
    redirectUri: new URL(redirectUri).toString(),
    redirectMatch: redirectMatch.kind,
    codeChallenge,
    codeChallengeMethod: "S256",
    scopes,
    ...(url.searchParams.get("state") ? { state: url.searchParams.get("state")! } : {}),
    ...(resource ? { resource: new URL(resource).toString() } : {}),
    raw: new URLSearchParams(url.searchParams),
  };
}

export interface McpFnAuthorizationCompatibilityOptions {
  issuer: string | URL;
  clients: McpFnHostedClientRegistry;
  authorize(
    input: McpFnValidatedAuthorizationRequest,
    request: Request,
  ): Promise<Response> | Response;
  token(request: Request): Promise<Response> | Response;
  revoke?(request: Request): Promise<Response> | Response;
  supportedScopes?: string[];
  allowedResources?: Array<string | URL>;
  redirectPolicy?: McpFnRedirectPolicy;
  clientMetadataDocuments?: {
    enabled: boolean;
    /** Required allowlist/policy hook before fetching an external client document. */
    allow?(url: URL): boolean | Promise<boolean>;
    fetch?: typeof globalThis.fetch;
    maxBytes?: number;
  };
  extraMetadata?: Record<string, unknown>;
  diagnostics?(event: {
    phase: string;
    outcome: "succeeded" | "failed";
    code?: string;
    details?: Record<string, unknown>;
  }): void | Promise<void>;
}

/**
 * MCP-specific authorization compatibility router. Identity, login, consent,
 * signing, token issuance, and durable security state stay in the callbacks.
 */
export function createMcpAuthorizationCompatibilityHandler(
  options: McpFnAuthorizationCompatibilityOptions,
): (request: Request) => Promise<Response> {
  const issuer = new URL(options.issuer.toString());
  issuer.hash = "";
  const endpoint = (path: string) => new URL(path, issuer).toString();
  const metadata = {
    ...options.extraMetadata,
    issuer: issuer.toString(),
    authorization_endpoint: endpoint("/authorize"),
    token_endpoint: endpoint("/token"),
    ...(options.clients.register ? { registration_endpoint: endpoint("/register") } : {}),
    ...(options.revoke ? { revocation_endpoint: endpoint("/revoke") } : {}),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    ...(options.supportedScopes ? { scopes_supported: unique(options.supportedScopes) } : {}),
    client_id_metadata_document_supported: options.clientMetadataDocuments?.enabled === true,
  };

  return async (request): Promise<Response> => {
    const url = new URL(request.url);
    try {
      if (
        request.method === "GET" &&
        (url.pathname === "/.well-known/oauth-authorization-server" ||
          url.pathname === "/.well-known/openid-configuration")
      ) {
        return json(200, metadata, { "cache-control": "public, max-age=300" });
      }
      if (request.method === "POST" && url.pathname === "/register") {
        if (!options.clients.register) {
          throw new McpFnHostedAuthorizationError(
            "invalid_request",
            "Dynamic client registration is disabled",
            { status: 404 },
          );
        }
        const raw = await readBoundedJson(request, 256_000) as OAuthClientMetadata;
        const metadata = normalizeClientMetadata(raw);
        const registration = await options.clients.register(metadata, request);
        await emit(options, "client-registration", "succeeded", undefined, {
          clientId: registration.clientId,
          source: registration.source,
        });
        return json(201, {
          ...registration.metadata,
          client_id: registration.clientId,
        });
      }
      if (request.method === "GET" && url.pathname === "/authorize") {
        const clientId = url.searchParams.get("client_id");
        if (!clientId) {
          throw new McpFnHostedAuthorizationError("invalid_request", "client_id is required");
        }
        const client = await resolveClient(options, clientId);
        if (!client) {
          throw new McpFnHostedAuthorizationError("invalid_client", "Unknown MCP client");
        }
        const validated = validateMcpAuthorizationRequest({
          url,
          client,
          redirectPolicy: options.redirectPolicy,
          allowedResources: options.allowedResources,
          supportedScopes: options.supportedScopes,
        });
        await emit(options, "authorization-request", "succeeded", undefined, {
          clientId,
          registrationSource: client.source,
          redirectMatch: validated.redirectMatch,
        });
        return options.authorize(validated, request);
      }
      if (request.method === "POST" && url.pathname === "/token") {
        return options.token(request);
      }
      if (request.method === "POST" && url.pathname === "/revoke" && options.revoke) {
        return options.revoke(request);
      }
      return json(404, { error: "not_found" });
    } catch (error) {
      const normalized = error instanceof McpFnHostedAuthorizationError
        ? error
        : new McpFnHostedAuthorizationError(
          "server_error",
          "MCP authorization compatibility processing failed",
          { status: 500 },
        );
      await emit(options, inferPhase(url.pathname), "failed", normalized.code, {
        message: normalized.message,
        ...normalized.details,
      });
      return json(normalized.status, {
        error: normalized.code,
        error_description: normalized.message,
      });
    }
  };
}

async function resolveClient(
  options: McpFnAuthorizationCompatibilityOptions,
  clientId: string,
): Promise<McpFnNormalizedClientRegistration | null> {
  const stored = await options.clients.resolve(clientId);
  if (stored) return stored;
  if (!options.clientMetadataDocuments?.enabled) return null;
  let clientUrl: URL;
  try {
    clientUrl = new URL(clientId);
  } catch {
    return null;
  }
  if (clientUrl.protocol !== "https:" || clientUrl.pathname === "/") return null;
  if (!options.clientMetadataDocuments.allow ||
      !(await options.clientMetadataDocuments.allow(clientUrl))) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document URL is not permitted",
    );
  }
  const fetchImplementation = options.clientMetadataDocuments.fetch ?? globalThis.fetch;
  if (!fetchImplementation) throw new Error("A fetch implementation is required");
  const response = await fetchImplementation(clientUrl, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document could not be loaded",
    );
  }
  const raw = await readBoundedJson(response, options.clientMetadataDocuments.maxBytes ?? 256_000);
  const record = raw as Record<string, unknown>;
  if (record.client_id !== undefined && record.client_id !== clientId) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "Client ID Metadata Document client_id does not match its URL",
    );
  }
  return normalizeMcpClientRegistration({
    clientId,
    source: "client-metadata-document",
    metadata: normalizeClientMetadata(record as OAuthClientMetadata),
  });
}

function normalizeClientMetadata(value: OAuthClientMetadata): OAuthClientMetadata {
  if (!value || typeof value !== "object") {
    throw new McpFnHostedAuthorizationError("invalid_client_metadata", "Client metadata must be an object");
  }
  return {
    ...value,
    redirect_uris: Array.isArray(value.redirect_uris) ? value.redirect_uris : [],
  };
}

async function readBoundedJson(
  source: Request | Response,
  maxBytes: number,
): Promise<unknown> {
  const length = Number(source.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    throw new McpFnHostedAuthorizationError("invalid_request", "Metadata body is too large", {
      status: 413,
    });
  }
  const text = await source.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new McpFnHostedAuthorizationError("invalid_request", "Metadata body is too large", {
      status: 413,
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new McpFnHostedAuthorizationError("invalid_request", "Metadata body is not valid JSON");
  }
}

function json(status: number, body: unknown, headers: HeadersInit = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function uniqueUrls(values: Array<string | URL>): string[] {
  return unique(values.map((value) => new URL(value.toString()).toString()));
}

async function emit(
  options: McpFnAuthorizationCompatibilityOptions,
  phase: string,
  outcome: "succeeded" | "failed",
  code?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await options.diagnostics?.(redactOAuthValue({
    phase,
    outcome,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  }));
}

function inferPhase(pathname: string): string {
  if (pathname === "/register") return "client-registration";
  if (pathname === "/authorize") return "authorization-request";
  if (pathname === "/token") return "token-exchange";
  if (pathname === "/revoke") return "token-revocation";
  return "authorization-server-discovery";
}
