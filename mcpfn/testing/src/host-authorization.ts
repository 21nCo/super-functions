import type { McpFnDiagnosticPhase } from "@mcpfn/client";

import {
  MCPFN_NAMED_OAUTH_HOST_FIXTURES,
  MCPFN_OAUTH_EXTENSION_GRANTS,
  createOAuthClientMetadataFixture,
  type McpFnNamedOAuthHostFixture,
  type McpFnOAuthClientMetadata,
} from "./auth-core.js";

export type McpFnProtocolLayer =
  | "mcpfn-preflight"
  | "authorization-server"
  | "resource-server"
  | "mcp-initialization";

export type McpFnNamedHostId = keyof typeof MCPFN_NAMED_OAUTH_HOST_FIXTURES;

export interface McpFnNamedHostRegistration {
  source: "pre-registered" | "dynamic" | "client-metadata-document";
  clientId: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: ["code"];
  tokenEndpointAuthMethod: "none";
  metadata: McpFnOAuthClientMetadata;
}

export interface McpFnNamedHostAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: "code";
  scopes: string[];
}

export interface McpFnNamedHostClientRequestMetadata {
  redirectUris: string[];
  grantTypes: string[];
}

export interface McpFnNamedHostAuthorizationCase {
  host: McpFnNamedHostId;
  name: string;
  registration: McpFnNamedHostRegistration;
  authorizationRequest: McpFnNamedHostAuthorizationRequest;
  clientRequestMetadata: McpFnNamedHostClientRequestMetadata;
  expectedLayer?: McpFnProtocolLayer;
}

export interface CreateNamedHostAuthorizationCaseOverrides {
  registration?: {
    source?: McpFnNamedHostRegistration["source"];
    clientId?: string;
    redirectUris?: string[];
    grantTypes?: string[];
  };
  authorizationRequest?: {
    clientId?: string;
    redirectUri?: string;
    scopes?: string[];
  };
  clientRequestMetadata?: Partial<McpFnNamedHostClientRequestMetadata>;
  expectedLayer?: McpFnProtocolLayer;
  name?: string;
}

const DEFAULT_SCOPES = ["mcp:read"];

const HOST_REGISTRATION_SOURCE: Record<McpFnNamedHostId, McpFnNamedHostRegistration["source"]> = {
  chatgpt: "pre-registered",
  claude: "client-metadata-document",
};

const HOST_CLIENT_IDS: Record<McpFnNamedHostId, string> = {
  chatgpt: "chatgpt-client",
  claude: "https://claude.example.com/client.json",
};

function hostFixture(host: McpFnNamedHostId): McpFnNamedOAuthHostFixture {
  return MCPFN_NAMED_OAUTH_HOST_FIXTURES[host];
}

function registrationMetadata(
  clientId: string,
  redirectUris: string[],
  grantTypes: string[],
  name: string,
): McpFnOAuthClientMetadata {
  const documentClientId = clientId.startsWith("https://")
    ? clientId
    : `https://clients.example.test/${clientId}`;
  return {
    ...createOAuthClientMetadataFixture({
      clientId: documentClientId,
      redirectUris,
      clientName: name,
    }),
    client_id: documentClientId,
    grant_types: [...grantTypes],
  };
}

/**
 * Build a named-host case whose AS registration, client-sent authorization
 * request, and client-owned metadata are independently configurable.
 */
export function createNamedHostAuthorizationCase(
  host: McpFnNamedHostId,
  overrides: CreateNamedHostAuthorizationCaseOverrides = {},
): McpFnNamedHostAuthorizationCase {
  const fixture = hostFixture(host);
  const clientId = overrides.registration?.clientId ??
    overrides.authorizationRequest?.clientId ??
    HOST_CLIENT_IDS[host];
  const registeredRedirects = overrides.registration?.redirectUris ?? [...fixture.redirectUris];
  const grantTypes = overrides.registration?.grantTypes ?? [...fixture.grantTypes];
  const requestRedirect = overrides.authorizationRequest?.redirectUri ?? registeredRedirects[0];
  const metadataClientId = clientId.startsWith("https://")
    ? clientId
    : `https://clients.example.test/${clientId}`;
  const registration: McpFnNamedHostRegistration = {
    source: overrides.registration?.source ?? HOST_REGISTRATION_SOURCE[host],
    clientId,
    redirectUris: registeredRedirects,
    grantTypes,
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none",
    metadata: {
      ...registrationMetadata(metadataClientId, registeredRedirects, grantTypes, fixture.name),
      client_id: metadataClientId,
    },
  };
  const clientRequestMetadata: McpFnNamedHostClientRequestMetadata = {
    redirectUris: overrides.clientRequestMetadata?.redirectUris ?? [requestRedirect],
    grantTypes: overrides.clientRequestMetadata?.grantTypes ?? grantTypes,
  };
  return {
    host,
    name: overrides.name ?? `${fixture.name} authorization case`,
    registration,
    authorizationRequest: {
      clientId,
      redirectUri: requestRedirect,
      responseType: "code",
      scopes: overrides.authorizationRequest?.scopes ?? [...DEFAULT_SCOPES],
    },
    clientRequestMetadata,
    ...(overrides.expectedLayer ? { expectedLayer: overrides.expectedLayer } : {}),
  };
}

export function createNamedHostRedirectDriftCase(
  host: McpFnNamedHostId,
  layer: Extract<McpFnProtocolLayer, "mcpfn-preflight" | "authorization-server">,
): McpFnNamedHostAuthorizationCase {
  const fixture = hostFixture(host);
  const attacker = host === "chatgpt"
    ? "https://chatgpt.com/wrong-callback"
    : "https://claude.example.com/unregistered";
  if (layer === "mcpfn-preflight") {
    return createNamedHostAuthorizationCase(host, {
      name: `${fixture.name} unregistered redirect preflight`,
      authorizationRequest: { redirectUri: attacker },
      clientRequestMetadata: { redirectUris: [...fixture.redirectUris] },
      expectedLayer: "mcpfn-preflight",
    });
  }
  return createNamedHostAuthorizationCase(host, {
    name: `${fixture.name} unregistered redirect at the authorization server`,
    authorizationRequest: { redirectUri: attacker },
    clientRequestMetadata: { redirectUris: [attacker] },
    expectedLayer: "authorization-server",
  });
}

export function createNamedHostIncompatibleGrantCase(
  host: McpFnNamedHostId,
): McpFnNamedHostAuthorizationCase {
  const fixture = hostFixture(host);
  return createNamedHostAuthorizationCase(host, {
    name: `${fixture.name} without a compatible authorization-code flow`,
    registration: { grantTypes: [MCPFN_OAUTH_EXTENSION_GRANTS.deviceCode] },
    expectedLayer: "mcpfn-preflight",
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readPhase(error: object): McpFnDiagnosticPhase | undefined {
  const phase = "phase" in error ? readString(error.phase) : undefined;
  return phase as McpFnDiagnosticPhase | undefined;
}

function readDetailsPhase(error: object): string | undefined {
  const details = "details" in error && error.details && typeof error.details === "object"
    ? error.details as Record<string, unknown>
    : undefined;
  return details ? readString(details.phase) : undefined;
}

/** Map a redacted error to the protocol layer that owns the failure. */
export function classifyMcpFnFailure(error: unknown): McpFnProtocolLayer {
  if (!error || typeof error !== "object") return "mcp-initialization";
  const name = readString((error as { name?: unknown }).name) ?? "";
  const code = readString((error as { code?: unknown }).code) ?? "";
  const message = readString((error as { message?: unknown }).message) ?? "";
  const phase = readPhase(error);
  const detailsPhase = readDetailsPhase(error);

  if (name === "McpFnRedirectMismatchError" || code === "MCPFN_REDIRECT_MISMATCH") {
    return "mcpfn-preflight";
  }
  if (
    name === "McpFnAuthAssertionError" ||
    code === "invalid_client_metadata" ||
    code === "unauthorized_client" ||
    detailsPhase === "redirect-compatibility-preflight"
  ) {
    return "mcpfn-preflight";
  }
  if (phase === "client-registration" || phase === "resource-discovery") {
    return "mcpfn-preflight";
  }
  if (phase === "authorization-server-discovery") return "mcpfn-preflight";
  if (code === "unsupported_grant_type" || /unsupported_grant_type/.test(message)) {
    return "authorization-server";
  }
  if (
    /unauthorized_client|no compatible authorization_code|does not support authorization_code/i.test(message)
  ) {
    return "mcpfn-preflight";
  }
  if (
    name === "McpFnHostedAuthorizationError" ||
    phase === "authorization-request" ||
    phase === "authorization-callback" ||
    phase === "token-exchange" ||
    phase === "token-refresh" ||
    detailsPhase === "redirect-validation" ||
    /invalid_request|invalid_grant|redirect_uri is not registered/i.test(message)
  ) {
    return "authorization-server";
  }
  if (
    code === "MCPFN_AUTHORIZATION_REQUIRED" ||
    phase === "transport-connect" ||
    phase === "token-revocation" ||
    /\b401\b/.test(message) ||
    /WWW-Authenticate/i.test(message)
  ) {
    return "resource-server";
  }
  if (phase === "mcp-initialize") return "mcp-initialization";
  return "mcp-initialization";
}

export function namedHostAuthorizationCases(): McpFnNamedHostAuthorizationCase[] {
  return [
    createNamedHostAuthorizationCase("chatgpt"),
    createNamedHostAuthorizationCase("claude"),
    createNamedHostRedirectDriftCase("chatgpt", "mcpfn-preflight"),
    createNamedHostRedirectDriftCase("chatgpt", "authorization-server"),
    createNamedHostRedirectDriftCase("claude", "mcpfn-preflight"),
    createNamedHostRedirectDriftCase("claude", "authorization-server"),
    createNamedHostIncompatibleGrantCase("chatgpt"),
    createNamedHostIncompatibleGrantCase("claude"),
  ];
}
