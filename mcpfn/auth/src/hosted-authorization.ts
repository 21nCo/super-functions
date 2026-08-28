import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import {
  matchMcpRedirectUri,
  McpFnRedirectMismatchError,
  normalizeMcpRedirectUri,
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

export type McpFnHostedTokenEndpointAuthMethod =
  | "none"
  | "client_secret_basic"
  | "client_secret_post";

export interface McpFnHostedTokenSet {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  resource?: string;
  [key: string]: unknown;
}

export interface McpFnHostedClientAuthentication {
  client: McpFnNormalizedClientRegistration;
  method: McpFnHostedTokenEndpointAuthMethod;
}

export interface McpFnHostedTokenAuthority {
  /** Exchange and validate a single-use authorization code and its PKCE binding. */
  exchangeAuthorizationCode(
    input: McpFnHostedClientAuthentication & {
      code: string;
      redirectUri: string;
      codeVerifier: string;
      resource?: string;
    },
    request: Request,
  ): Promise<McpFnHostedTokenSet> | McpFnHostedTokenSet;
  /** Presence advertises and enables refresh_token. Calls are serialized per credential. */
  refreshToken?(
    input: McpFnHostedClientAuthentication & {
      refreshToken: string;
      scopes: string[];
      resource?: string;
    },
    request: Request,
  ): Promise<McpFnHostedTokenSet> | McpFnHostedTokenSet;
  /** Presence advertises and enables RFC 7009 revocation. */
  revokeToken?(
    input: McpFnHostedClientAuthentication & {
      token: string;
      tokenTypeHint?: "access_token" | "refresh_token";
    },
    request: Request,
  ): Promise<void> | void;
  /** Required when a secret-based token endpoint authentication method is enabled. */
  authenticateClient?(
    input: {
      client: McpFnNormalizedClientRegistration;
      method: Exclude<McpFnHostedTokenEndpointAuthMethod, "none">;
      clientSecret: string;
    },
    request: Request,
  ): Promise<boolean> | boolean;
}

export interface McpFnHostedAuthorizationCapabilities {
  tokenEndpointAuthMethods?: McpFnHostedTokenEndpointAuthMethod[];
  /** Defaults to true. */
  requireState?: boolean;
  /** Defaults to true when allowedResources is configured. */
  requireResource?: boolean;
  /** Defaults to false so a rotating refresh token can retain its stored audience. */
  requireRefreshResource?: boolean;
  /** Defaults to true when refresh is enabled. */
  rotateRefreshTokens?: boolean;
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
  redirectPolicy?: McpFnRedirectPolicy;
}): McpFnNormalizedClientRegistration {
  if (!input.clientId) {
    throw new McpFnHostedAuthorizationError("invalid_client_metadata", "client_id is required");
  }
  let redirectUris: string[];
  try {
    redirectUris = unique(
      registrationStringArray(input.metadata.redirect_uris, "redirect_uris", []).map((value) =>
        normalizeMcpRedirectUri(value, input.redirectPolicy),
      ),
    );
  } catch (error) {
    if (error instanceof McpFnRedirectMismatchError) {
      throw new McpFnHostedAuthorizationError(
        "invalid_client_metadata",
        "redirect_uris contains an unsafe or malformed URI",
      );
    }
    throw error;
  }
  if (!redirectUris.length) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "At least one redirect_uri is required",
    );
  }
  const responseTypes = unique(
    registrationStringArray(input.metadata.response_types, "response_types", ["code"]),
  );
  const grantTypes = unique(
    registrationStringArray(input.metadata.grant_types, "grant_types", ["authorization_code"]),
  );
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

function registrationStringArray(
  value: unknown,
  field: string,
  fallback: string[],
): string[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || Array.from(value).some((entry) => typeof entry !== "string")) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      `${field} must be an array of strings`,
    );
  }
  return value;
}

export function validateMcpAuthorizationRequest(options: {
  url: string | URL;
  client: McpFnNormalizedClientRegistration;
  redirectPolicy?: McpFnRedirectPolicy;
  allowedResources?: ReadonlyArray<string | URL>;
  supportedScopes?: ReadonlyArray<string>;
}): McpFnValidatedAuthorizationRequest {
  const url = new URL(options.url.toString());
  const responseType = authorizationParameter(url, "response_type", true);
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
  const requestedClientId = authorizationParameter(url, "client_id", true);
  if (requestedClientId !== options.client.clientId) {
    throw new McpFnHostedAuthorizationError("invalid_client", "client_id does not match registration");
  }
  const redirectUri = authorizationParameter(url, "redirect_uri", true);
  if (!redirectUri) {
    throw new McpFnHostedAuthorizationError("invalid_request", "redirect_uri is required");
  }
  const redirectMatch = validateAuthorizationRedirect(
    redirectUri,
    options.client.redirectUris,
    options.redirectPolicy,
  );
  const codeChallenge = validateAuthorizationPkce(url);
  const resource = normalizeAuthorizationResource(
    authorizationParameter(url, "resource"),
    options.allowedResources,
  );
  const scopes = unique(
    (authorizationParameter(url, "scope") ?? "").split(/\s+/).filter(Boolean),
  );
  assertSupportedScopes(scopes, options.supportedScopes);
  assertScopesWithinClientRegistration(scopes, options.client);
  const state = normalizeAuthorizationState(
    authorizationParameter(url, "state"),
  );
  return {
    client: options.client,
    responseType: "code",
    redirectUri: new URL(redirectUri).toString(),
    redirectMatch: redirectMatch.kind,
    codeChallenge,
    codeChallengeMethod: "S256",
    scopes,
    ...(state ? { state } : {}),
    ...(resource ? { resource } : {}),
    raw: new URLSearchParams(url.searchParams),
  };
}

function validateAuthorizationRedirect(
  redirectUri: string,
  registeredRedirectUris: string[],
  policy?: McpFnRedirectPolicy,
) {
  try {
    return matchMcpRedirectUri(redirectUri, registeredRedirectUris, policy);
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
}

function validateAuthorizationPkce(url: URL): string {
  const codeChallenge = authorizationParameter(url, "code_challenge", true);
  if (!codeChallenge) {
    throw new McpFnHostedAuthorizationError("invalid_request", "PKCE code_challenge is required");
  }
  if (authorizationParameter(url, "code_challenge_method", true) !== "S256") {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      "PKCE code_challenge_method must be S256",
    );
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      "PKCE S256 code_challenge must be 43 base64url characters",
    );
  }
  return codeChallenge;
}

function authorizationParameter(
  url: URL,
  name: string,
  required = false,
): string | null {
  const values = url.searchParams.getAll(name);
  if (
    values.length > 1 ||
    (required && (values.length !== 1 || values[0]?.trim() === ""))
  ) {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      `${name} must be supplied exactly once`,
    );
  }
  return values[0] ?? null;
}

function normalizeAuthorizationState(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (
    value.length < 1 ||
    value.length > 512 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      "state is invalid",
    );
  }
  return value;
}

function normalizeAuthorizationResource(
  value: string | null,
  allowedResources?: ReadonlyArray<string | URL>,
): string | undefined {
  if (value === null) return undefined;
  let resource: string;
  try {
    resource = new URL(value).toString();
  } catch {
    throw new McpFnHostedAuthorizationError(
      "invalid_target",
      "resource must be an absolute URL",
    );
  }
  if (allowedResources?.length) {
    const allowed = new Set(allowedResources.map((entry) => new URL(entry.toString()).toString()));
    if (!allowed.has(resource)) {
      throw new McpFnHostedAuthorizationError("invalid_target", "resource is not allowed");
    }
  }
  return resource;
}

export interface McpFnAuthorizationCompatibilityOptions {
  issuer: string | URL;
  /** Allow HTTP only for literal loopback issuers in controlled local testing. */
  allowInsecureLoopbackIssuer?: boolean;
  /** Route prefix for authorize/token/register/revoke. Defaults to the issuer path. */
  endpointPrefix?: string;
  clients: McpFnHostedClientRegistry;
  authorize(
    input: McpFnValidatedAuthorizationRequest,
    request: Request,
  ): Promise<Response> | Response;
  tokenAuthority: McpFnHostedTokenAuthority;
  capabilities?: McpFnHostedAuthorizationCapabilities;
  supportedScopes?: string[];
  allowedResources?: Array<string | URL>;
  redirectPolicy?: McpFnRedirectPolicy;
  clientMetadataDocuments?: {
    enabled: boolean;
    /** Required allowlist/policy hook before fetching an external client document. */
    allow?(url: URL): boolean | Promise<boolean>;
    fetch?: typeof globalThis.fetch;
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
  };
  extraMetadata?: Record<string, unknown>;
  diagnostics?(event: {
    phase: string;
    outcome: "succeeded" | "failed";
    code?: string;
    details?: Record<string, unknown>;
  }): void | Promise<void>;
}

export interface McpFnAuthorizationServerMetadataOptions {
  issuer: string | URL;
  /** Allow HTTP only for literal loopback issuers in controlled local testing. */
  allowInsecureLoopbackIssuer?: boolean;
  endpointPrefix?: string;
  dynamicRegistration: boolean;
  refreshTokenGrant: boolean;
  tokenRevocation: boolean;
  tokenEndpointAuthMethods?: McpFnHostedTokenEndpointAuthMethod[];
  supportedScopes?: string[];
  clientMetadataDocuments: boolean;
  extraMetadata?: Record<string, unknown>;
}

/**
 * MCP-specific authorization compatibility router. Identity, login, consent,
 * signing, token issuance, and durable security state stay in the callbacks.
 */
export function createMcpAuthorizationCompatibilityHandler(
  options: McpFnAuthorizationCompatibilityOptions,
): (request: Request) => Promise<Response> {
  validateClientMetadataDocumentOptions(options.clientMetadataDocuments);
  const issuer = normalizeIssuer(options.issuer, options.allowInsecureLoopbackIssuer ?? false);
  const issuerPath = issuer.pathname === "/" ? "" : trimTrailingSlashes(issuer.pathname);
  const endpointPrefix = normalizeEndpointPrefix(
    options.endpointPrefix ?? issuerPath,
  );
  const tokenEndpointAuthMethods = unique(
    options.capabilities?.tokenEndpointAuthMethods ?? ["none"],
  ) as McpFnHostedTokenEndpointAuthMethod[];
  validateHostedCapabilities(options, tokenEndpointAuthMethods);
  const metadata = createMcpAuthorizationServerMetadata({
    issuer: options.issuer,
    allowInsecureLoopbackIssuer: options.allowInsecureLoopbackIssuer,
    endpointPrefix,
    dynamicRegistration: Boolean(options.clients.register),
    refreshTokenGrant: Boolean(options.tokenAuthority.refreshToken),
    tokenRevocation: Boolean(options.tokenAuthority.revokeToken),
    tokenEndpointAuthMethods,
    ...(options.supportedScopes
      ? { supportedScopes: options.supportedScopes }
      : {}),
    clientMetadataDocuments: options.clientMetadataDocuments?.enabled === true,
    ...(options.extraMetadata
      ? { extraMetadata: options.extraMetadata }
      : {}),
  });
  const routes = createHostedRoutes(issuerPath, endpointPrefix, options);

  return async (request): Promise<Response> => {
    const url = new URL(request.url);
    const route = routes.get(`${request.method} ${url.pathname}`);
    try {
      return await dispatchHostedRoute({
        route,
        request,
        url,
        metadata,
        options,
        tokenEndpointAuthMethods,
      });
    } catch (error) {
      const normalized = error instanceof McpFnHostedAuthorizationError
        ? error
        : new McpFnHostedAuthorizationError(
          "server_error",
          "MCP authorization compatibility processing failed",
          { status: 500 },
        );
      await emit(options, inferPhase(route), "failed", normalized.code, {
        message: normalized.message,
        ...normalized.details,
      });
      const retryAfter = normalized.details?.retryAfterSeconds;
      return json(
        normalized.status,
        {
          error: normalized.code,
          error_description: normalized.message,
        },
        typeof retryAfter === "number" && Number.isFinite(retryAfter)
          ? { "retry-after": String(Math.max(0, Math.ceil(retryAfter))) }
          : {},
      );
    }
  };
}

export function createMcpAuthorizationServerMetadata(
  options: McpFnAuthorizationServerMetadataOptions,
): Record<string, unknown> {
  const issuer = normalizeIssuer(options.issuer, options.allowInsecureLoopbackIssuer ?? false);
  const issuerPath =
    issuer.pathname === "/" ? "" : trimTrailingSlashes(issuer.pathname);
  const endpointPrefix = normalizeEndpointPrefix(
    options.endpointPrefix ?? issuerPath,
  );
  const endpoint = (name: string) => {
    const url = new URL(issuer);
    url.pathname = `${endpointPrefix}/${name}`;
    return url.toString();
  };
  const tokenEndpointAuthMethods = unique(
    options.tokenEndpointAuthMethods ?? ["none"],
  ) as McpFnHostedTokenEndpointAuthMethod[];
  if (!tokenEndpointAuthMethods.length) {
    throw new TypeError(
      "At least one supported token endpoint authentication method is required",
    );
  }
  return {
    ...options.extraMetadata,
    issuer:
      issuer.pathname === "/" && !issuer.search && !issuer.hash
        ? issuer.origin
        : issuer.toString(),
    authorization_endpoint: endpoint("authorize"),
    token_endpoint: endpoint("token"),
    ...(options.dynamicRegistration
      ? { registration_endpoint: endpoint("register") }
      : {}),
    ...(options.tokenRevocation
      ? { revocation_endpoint: endpoint("revoke") }
      : {}),
    response_types_supported: ["code"],
    grant_types_supported: [
      "authorization_code",
      ...(options.refreshTokenGrant ? ["refresh_token"] : []),
    ],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: tokenEndpointAuthMethods,
    ...(options.supportedScopes
      ? { scopes_supported: unique(options.supportedScopes) }
      : {}),
    client_id_metadata_document_supported: options.clientMetadataDocuments,
  };
}

type McpFnHostedRoute = "metadata" | "register" | "authorize" | "token" | "revoke";

function createHostedRoutes(
  issuerPath: string,
  endpointPrefix: string,
  options: McpFnAuthorizationCompatibilityOptions,
): Map<string, McpFnHostedRoute> {
  const routes = new Map<string, McpFnHostedRoute>([
    [`GET /.well-known/oauth-authorization-server${issuerPath}`, "metadata"],
    [`GET ${issuerPath}/.well-known/openid-configuration`, "metadata"],
    [`POST ${endpointPrefix}/register`, "register"],
    [`GET ${endpointPrefix}/authorize`, "authorize"],
    [`POST ${endpointPrefix}/token`, "token"],
  ]);
  if (options.tokenAuthority.revokeToken) {
    routes.set(`POST ${endpointPrefix}/revoke`, "revoke");
  }
  return routes;
}

async function dispatchHostedRoute(input: {
  route: McpFnHostedRoute | undefined;
  request: Request;
  url: URL;
  metadata: Record<string, unknown>;
  options: McpFnAuthorizationCompatibilityOptions;
  tokenEndpointAuthMethods: McpFnHostedTokenEndpointAuthMethod[];
}): Promise<Response> {
  switch (input.route) {
    case "metadata":
      return json(200, input.metadata, { "cache-control": "public, max-age=300" });
    case "register":
      return handleRegistrationRequest(input.options, input.request);
    case "authorize":
      return handleAuthorizationRequest(input.options, input.url, input.request);
    case "token":
      return handleTokenRequest(input.options, input.request, input.tokenEndpointAuthMethods);
    case "revoke":
      return handleRevocationRequest(input.options, input.request, input.tokenEndpointAuthMethods);
    default:
      return json(404, { error: "not_found" });
  }
}

async function handleRegistrationRequest(
  options: McpFnAuthorizationCompatibilityOptions,
  request: Request,
): Promise<Response> {
  if (!options.clients.register) {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      "Dynamic client registration is disabled",
      { status: 404 },
    );
  }
  const callbackRequest = request.clone();
  const raw = (await readBoundedJson(request, 256_000)) as OAuthClientMetadata;
  const clientMetadata = normalizeClientMetadata(raw, options.redirectPolicy);
  const requested = normalizeMcpClientRegistration({
    clientId: "pending-dynamic-registration",
    source: "dynamic",
    metadata: clientMetadata,
    redirectPolicy: options.redirectPolicy,
  });
  const supportedMethods = options.capabilities?.tokenEndpointAuthMethods ?? [
    "none",
  ];
  assertCompatibleClientRegistration(requested, supportedMethods, options.supportedScopes);
  const persisted = await options.clients.register(clientMetadata, callbackRequest);
  const registration = normalizeMcpClientRegistration({
    clientId: persisted.clientId,
    source: persisted.source,
    metadata: persisted.metadata,
    redirectPolicy: options.redirectPolicy,
  });
  assertCompatibleClientRegistration(registration, supportedMethods, options.supportedScopes);
  await emit(options, "client-registration", "succeeded", undefined, {
    clientId: registration.clientId,
    source: registration.source,
  });
  return json(201, {
    ...registration.metadata,
    client_id: registration.clientId,
  });
}

function assertCompatibleClientRegistration(
  registration: McpFnNormalizedClientRegistration,
  supportedMethods: McpFnHostedTokenEndpointAuthMethod[],
  supportedScopes?: string[],
): void {
  if (
    !supportedMethods.includes(
      registration.tokenEndpointAuthMethod as McpFnHostedTokenEndpointAuthMethod,
    )
  ) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "token_endpoint_auth_method is not supported",
    );
  }
  if (!registration.responseTypes.includes("code")) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "response_types must include code",
    );
  }
  if (!registration.grantTypes.includes("authorization_code")) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "grant_types must include authorization_code",
    );
  }
  const scopes = registeredClientScopes(registration) ?? [];
  assertSupportedScopes(scopes, supportedScopes);
}

async function handleAuthorizationRequest(
  options: McpFnAuthorizationCompatibilityOptions,
  url: URL,
  request: Request,
): Promise<Response> {
  const clientId = authorizationParameter(url, "client_id", true)!;
  const client = await resolveClient(options, clientId);
  if (!client) {
    throw new McpFnHostedAuthorizationError("invalid_client", "Unknown MCP client");
  }
  const trustedRedirect = validateAuthorizationRedirect(
    authorizationParameter(url, "redirect_uri", true)!,
    client.redirectUris,
    options.redirectPolicy,
  ).requested;
  let validated: McpFnValidatedAuthorizationRequest;
  try {
    validated = validateMcpAuthorizationRequest({
      url,
      client,
      redirectPolicy: options.redirectPolicy,
      allowedResources: options.allowedResources,
      supportedScopes: options.supportedScopes,
    });
    if ((options.capabilities?.requireState ?? true) && !validated.state) {
      throw new McpFnHostedAuthorizationError(
        "invalid_request",
        "state is required for this MCP authorization profile",
      );
    }
    if (
      (options.capabilities?.requireResource ?? Boolean(options.allowedResources?.length)) &&
      !validated.resource
    ) {
      throw new McpFnHostedAuthorizationError(
        "invalid_target",
        "resource is required for this MCP authorization profile",
      );
    }
  } catch (error) {
    if (!(error instanceof McpFnHostedAuthorizationError)) throw error;
    await emit(options, "authorization-request", "failed", error.code, {
      clientId,
      registrationSource: client.source,
    });
    return trustedAuthorizationErrorRedirect(trustedRedirect, url, error);
  }
  await emit(options, "authorization-request", "succeeded", undefined, {
    clientId,
    registrationSource: client.source,
    redirectMatch: validated.redirectMatch,
  });
  return options.authorize(validated, request);
}

function trustedAuthorizationErrorRedirect(
  redirectUri: string,
  authorizationUrl: URL,
  error: McpFnHostedAuthorizationError,
): Response {
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("error", error.code);
  redirect.searchParams.set("error_description", error.message);
  try {
    const state = normalizeAuthorizationState(
      authorizationParameter(authorizationUrl, "state"),
    );
    if (state) redirect.searchParams.set("state", state);
  } catch {
    // Invalid state is never reflected to the client.
  }
  return new Response(null, {
    status: 302,
    headers: {
      "cache-control": "no-store",
      location: redirect.toString(),
    },
  });
}

const refreshLocks = new WeakMap<McpFnHostedTokenAuthority, Map<string, Promise<McpFnHostedTokenSet>>>();

async function handleTokenRequest(
  options: McpFnAuthorizationCompatibilityOptions,
  request: Request,
  supportedMethods: McpFnHostedTokenEndpointAuthMethod[],
): Promise<Response> {
  const authenticationRequest = request.clone();
  const tokenAuthorityRequest = request.clone();
  try {
    const form = await readBoundedForm(request, 64_000);
    const grantType = singleFormValue(form, "grant_type", true)!;
    const authentication = await authenticateHostedClient(
      options,
      form,
      authenticationRequest,
      supportedMethods,
    );
    const tokenSet = await issueHostedToken(
      grantType,
      options,
      authentication,
      form,
      tokenAuthorityRequest,
    );
    validateHostedTokenSet(tokenSet);
    await emit(options, grantType === "refresh_token" ? "token-refresh" : "token-exchange", "succeeded", undefined, {
      clientId: authentication.client.clientId,
      tokenEndpointAuthMethod: authentication.method,
      hasRefreshToken: Boolean(tokenSet.refresh_token),
    });
    return json(200, tokenSet);
  } finally {
    void authenticationRequest.body?.cancel().catch(() => undefined);
    void tokenAuthorityRequest.body?.cancel().catch(() => undefined);
  }
}

function issueHostedToken(
  grantType: string,
  options: McpFnAuthorizationCompatibilityOptions,
  authentication: McpFnHostedClientAuthentication,
  form: URLSearchParams,
  request: Request,
): Promise<McpFnHostedTokenSet> | McpFnHostedTokenSet {
  if (grantType === "authorization_code") {
    return exchangeHostedAuthorizationCode(options, authentication, form, request);
  }
  if (grantType === "refresh_token") {
    return refreshHostedToken(options, authentication, form, request);
  }
  throw new McpFnHostedAuthorizationError(
    "unsupported_grant_type",
    "The requested OAuth grant is not supported",
  );
}

async function exchangeHostedAuthorizationCode(
  options: McpFnAuthorizationCompatibilityOptions,
  authentication: McpFnHostedClientAuthentication,
  form: URLSearchParams,
  request: Request,
): Promise<McpFnHostedTokenSet> {
  if (!authentication.client.grantTypes.includes("authorization_code")) {
    throw new McpFnHostedAuthorizationError(
      "unauthorized_client",
      "The client is not registered for authorization_code",
    );
  }
  const redirectUri = normalizeRequiredUrl(form, "redirect_uri");
  const resource = normalizeOptionalResource(form, options.allowedResources);
  assertRequiredTokenResource(options, resource, "authorization_code");
  assertAuthorizationCodeRedirect(redirectUri, authentication.client.redirectUris, options);
  const codeVerifier = singleFormValue(form, "code_verifier", true)!;
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) {
    throw new McpFnHostedAuthorizationError("invalid_grant", "PKCE code_verifier is invalid");
  }
  return options.tokenAuthority.exchangeAuthorizationCode({
    ...authentication,
    code: singleFormValue(form, "code", true)!,
    redirectUri,
    codeVerifier,
    ...(resource ? { resource } : {}),
  }, request);
}

function assertAuthorizationCodeRedirect(
  redirectUri: string,
  registeredRedirectUris: string[],
  options: McpFnAuthorizationCompatibilityOptions,
): void {
  try {
    matchMcpRedirectUri(redirectUri, registeredRedirectUris, options.redirectPolicy);
  } catch (error) {
    if (!(error instanceof McpFnRedirectMismatchError)) throw error;
    throw new McpFnHostedAuthorizationError(
      "invalid_grant",
      "Authorization code redirect binding does not match the client registration",
    );
  }
}

async function refreshHostedToken(
  options: McpFnAuthorizationCompatibilityOptions,
  authentication: McpFnHostedClientAuthentication,
  form: URLSearchParams,
  request: Request,
): Promise<McpFnHostedTokenSet> {
  if (!options.tokenAuthority.refreshToken) {
    throw new McpFnHostedAuthorizationError(
      "unsupported_grant_type",
      "refresh_token is not enabled by the token authority",
    );
  }
  if (!authentication.client.grantTypes.includes("refresh_token")) {
    throw new McpFnHostedAuthorizationError(
      "unauthorized_client",
      "The client is not registered for refresh_token",
    );
  }
  const credential = singleFormValue(form, "refresh_token", true)!;
  const scopes = unique((singleFormValue(form, "scope") ?? "").split(/\s+/).filter(Boolean));
  assertSupportedScopes(scopes, options.supportedScopes);
  assertScopesWithinClientRegistration(scopes, authentication.client);
  const resource = normalizeOptionalResource(form, options.allowedResources);
  assertRequiredTokenResource(options, resource, "refresh_token");
  return withSerializedRefresh(options.tokenAuthority, credential, async () => {
    const refreshed = await options.tokenAuthority.refreshToken!({
      ...authentication,
      refreshToken: credential,
      scopes,
      ...(resource ? { resource } : {}),
    }, request);
    assertRefreshTokenRotated(options, credential, refreshed);
    return refreshed;
  });
}

function assertRefreshTokenRotated(
  options: McpFnAuthorizationCompatibilityOptions,
  credential: string,
  refreshed: McpFnHostedTokenSet,
): void {
  if (
    (options.capabilities?.rotateRefreshTokens ?? true) &&
    (!refreshed.refresh_token || refreshed.refresh_token === credential)
  ) {
    throw new McpFnHostedAuthorizationError(
      "server_error",
      "The token authority did not rotate the refresh credential",
      { status: 500 },
    );
  }
}

async function handleRevocationRequest(
  options: McpFnAuthorizationCompatibilityOptions,
  request: Request,
  supportedMethods: McpFnHostedTokenEndpointAuthMethod[],
): Promise<Response> {
  const authenticationRequest = request.clone();
  const revocationRequest = request.clone();
  try {
    const form = await readBoundedForm(request, 64_000);
    const authentication = await authenticateHostedClient(
      options,
      form,
      authenticationRequest,
      supportedMethods,
    );
    const rawHint = singleFormValue(form, "token_type_hint");
    const tokenTypeHint = rawHint === "access_token" || rawHint === "refresh_token"
      ? rawHint
      : undefined;
    await options.tokenAuthority.revokeToken!({
      ...authentication,
      token: singleFormValue(form, "token", true)!,
      ...(tokenTypeHint ? { tokenTypeHint } : {}),
    }, revocationRequest);
    await emit(options, "token-revocation", "succeeded", undefined, {
      clientId: authentication.client.clientId,
      tokenEndpointAuthMethod: authentication.method,
    });
    return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
  } finally {
    void authenticationRequest.body?.cancel().catch(() => undefined);
    void revocationRequest.body?.cancel().catch(() => undefined);
  }
}

async function authenticateHostedClient(
  options: McpFnAuthorizationCompatibilityOptions,
  form: URLSearchParams,
  request: Request,
  supportedMethods: McpFnHostedTokenEndpointAuthMethod[],
): Promise<McpFnHostedClientAuthentication> {
  const basic = readBasicClientCredentials(request.headers.get("authorization"));
  const bodyClientId = singleFormValue(form, "client_id");
  const bodySecret = singleFormValue(form, "client_secret");
  if (basic && (bodyClientId || bodySecret)) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Use exactly one token endpoint client authentication method",
      { status: 401 },
    );
  }
  let method: McpFnHostedTokenEndpointAuthMethod;
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  if (basic) {
    method = "client_secret_basic";
    clientId = basic.clientId;
    clientSecret = basic.clientSecret;
  } else if (bodySecret) {
    method = "client_secret_post";
    clientId = bodyClientId;
    clientSecret = bodySecret;
  } else {
    method = "none";
    clientId = bodyClientId;
  }
  if (!clientId || !supportedMethods.includes(method)) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "The token endpoint client authentication method is not supported",
      { status: 401 },
    );
  }
  let client: McpFnNormalizedClientRegistration | null;
  try {
    client = await resolveClient(options, clientId);
  } catch (error) {
    if (error instanceof McpFnHostedAuthorizationError) {
      throw new McpFnHostedAuthorizationError(
        "invalid_client",
        "Client metadata is invalid or unavailable",
        { status: 401 },
      );
    }
    throw error;
  }
  if (client?.tokenEndpointAuthMethod !== method) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client authentication does not match the registered method",
      { status: 401 },
    );
  }
  if (method !== "none") {
    const accepted = await options.tokenAuthority.authenticateClient?.({
      client,
      method,
      clientSecret: clientSecret!,
    }, request);
    if (!accepted) {
      throw new McpFnHostedAuthorizationError(
        "invalid_client",
        "Client authentication failed",
        { status: 401 },
      );
    }
  }
  return { client, method };
}

async function readBoundedForm(request: Request, maxBytes: number): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      "OAuth endpoint requests must use application/x-www-form-urlencoded",
    );
  }
  return new URLSearchParams(await readBoundedText(request, maxBytes));
}

function singleFormValue(
  form: URLSearchParams,
  name: string,
  required = false,
): string | undefined {
  const values = form.getAll(name);
  if (values.length > 1 || (required && (!values[0] || values[0].trim() === ""))) {
    throw new McpFnHostedAuthorizationError(
      "invalid_request",
      `${name} must be supplied exactly once`,
    );
  }
  return values[0] || undefined;
}

function normalizeRequiredUrl(form: URLSearchParams, name: string): string {
  const value = singleFormValue(form, name, true)!;
  try {
    return new URL(value).toString();
  } catch {
    throw new McpFnHostedAuthorizationError("invalid_request", `${name} must be an absolute URL`);
  }
}

function normalizeOptionalResource(
  form: URLSearchParams,
  allowedResources?: ReadonlyArray<string | URL>,
): string | undefined {
  const value = singleFormValue(form, "resource");
  if (!value) return undefined;
  let resource: string;
  try {
    resource = new URL(value).toString();
  } catch {
    throw new McpFnHostedAuthorizationError("invalid_target", "resource must be an absolute URL");
  }
  if (allowedResources?.length) {
    const allowed = new Set(allowedResources.map((entry) => new URL(entry.toString()).toString()));
    if (!allowed.has(resource)) {
      throw new McpFnHostedAuthorizationError("invalid_target", "resource is not allowed");
    }
  }
  return resource;
}

function assertSupportedScopes(scopes: string[], supportedScopes?: ReadonlyArray<string>): void {
  if (!supportedScopes) return;
  const supported = new Set(supportedScopes);
  const unsupported = scopes.filter((scope) => !supported.has(scope));
  if (unsupported.length) {
    throw new McpFnHostedAuthorizationError("invalid_scope", "Requested MCP scope is unsupported", {
      details: { unsupportedScopes: unsupported },
    });
  }
}

function registeredClientScopes(
  client: McpFnNormalizedClientRegistration,
): string[] | undefined {
  const value: unknown = client.metadata.scope;
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "scope must be a space-delimited string",
    );
  }
  return unique(value.split(/\s+/).filter(Boolean));
}

function assertScopesWithinClientRegistration(
  scopes: string[],
  client: McpFnNormalizedClientRegistration,
): void {
  const registeredScopes = registeredClientScopes(client);
  if (!registeredScopes) return;
  const registered = new Set(registeredScopes);
  const unauthorized = scopes.filter((scope) => !registered.has(scope));
  if (unauthorized.length) {
    throw new McpFnHostedAuthorizationError(
      "invalid_scope",
      "Requested MCP scope exceeds the client registration",
      { details: { unauthorizedScopes: unauthorized } },
    );
  }
}

function assertRequiredTokenResource(
  options: McpFnAuthorizationCompatibilityOptions,
  resource: string | undefined,
  grantType: "authorization_code" | "refresh_token",
): void {
  const required = grantType === "refresh_token"
    ? options.capabilities?.requireRefreshResource ?? false
    : options.capabilities?.requireResource ?? Boolean(options.allowedResources?.length);
  if (required && !resource) {
    throw new McpFnHostedAuthorizationError(
      "invalid_target",
      "resource is required for this MCP token request",
    );
  }
}

function readBasicClientCredentials(
  authorization: string | null,
): { clientId: string; clientSecret: string } | undefined {
  if (!authorization) return undefined;
  const match = /^Basic +(\S+) *$/i.exec(authorization);
  if (!match) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Unsupported Authorization header at the token endpoint",
      { status: 401 },
    );
  }
  try {
    const decoded = atob(match[1]);
    const separator = decoded.indexOf(":");
    if (separator < 1) throw new Error("missing separator");
    return {
      clientId: decodeFormComponent(decoded.slice(0, separator)),
      clientSecret: decodeFormComponent(decoded.slice(separator + 1)),
    };
  } catch {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Malformed Basic client authentication",
      { status: 401 },
    );
  }
}

function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replaceAll("+", " "));
}

async function withSerializedRefresh(
  authority: McpFnHostedTokenAuthority,
  credential: string,
  operation: () => Promise<McpFnHostedTokenSet>,
): Promise<McpFnHostedTokenSet> {
  let locks = refreshLocks.get(authority);
  if (!locks) {
    locks = new Map();
    refreshLocks.set(authority, locks);
  }
  const previous = locks.get(credential);
  const current = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(operation);
  locks.set(credential, current);
  try {
    return await current;
  } finally {
    if (locks.get(credential) === current) locks.delete(credential);
  }
}

function validateHostedTokenSet(value: McpFnHostedTokenSet): void {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.access_token !== "string" ||
    value.access_token.length === 0 ||
    typeof value.token_type !== "string" ||
    value.token_type.length === 0 ||
    (value.expires_in !== undefined &&
      (!Number.isFinite(value.expires_in) || value.expires_in <= 0)) ||
    (value.refresh_token !== undefined &&
      (typeof value.refresh_token !== "string" || value.refresh_token.length === 0)) ||
    (value.scope !== undefined && typeof value.scope !== "string") ||
    (value.resource !== undefined && typeof value.resource !== "string")
  ) {
    throw new McpFnHostedAuthorizationError(
      "server_error",
      "The token authority returned an invalid token set",
      { status: 500 },
    );
  }
}

function validateHostedCapabilities(
  options: McpFnAuthorizationCompatibilityOptions,
  methods: string[],
): void {
  const allowed = new Set(["none", "client_secret_basic", "client_secret_post"]);
  if (!methods.length || methods.some((method) => !allowed.has(method))) {
    throw new TypeError("At least one supported token endpoint authentication method is required");
  }
  if (methods.some((method) => method !== "none") && !options.tokenAuthority.authenticateClient) {
    throw new TypeError("Secret-based client authentication requires tokenAuthority.authenticateClient");
  }
}

async function resolveClient(
  options: McpFnAuthorizationCompatibilityOptions,
  clientId: string,
): Promise<McpFnNormalizedClientRegistration | null> {
  const stored = await options.clients.resolve(clientId);
  if (stored) {
    const registration = normalizeMcpClientRegistration({
      clientId: stored.clientId,
      source: stored.source,
      metadata: stored.metadata,
      redirectPolicy: options.redirectPolicy,
    });
    try {
      assertCompatibleClientRegistration(
        registration,
        options.capabilities?.tokenEndpointAuthMethods ?? ["none"],
        options.supportedScopes,
      );
    } catch (error) {
      if (error instanceof McpFnHostedAuthorizationError) return null;
      throw error;
    }
    return registration;
  }
  if (!options.clientMetadataDocuments?.enabled) return null;
  let clientUrl: URL;
  try {
    clientUrl = new URL(clientId);
  } catch {
    return null;
  }
  if (clientUrl.protocol !== "https:" || clientUrl.pathname === "/") return null;
  const raw = await fetchClientMetadataDocument(clientUrl, options.clientMetadataDocuments);
  const record = raw as Record<string, unknown>;
  if (record.client_id !== undefined && record.client_id !== clientId) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client_metadata",
      "Client ID Metadata Document client_id does not match its URL",
    );
  }
  const registration = normalizeMcpClientRegistration({
    clientId,
    source: "client-metadata-document",
    metadata: normalizeClientMetadata({
      ...(record as OAuthClientMetadata),
      token_endpoint_auth_method:
        (record as OAuthClientMetadata).token_endpoint_auth_method ?? "client_secret_basic",
    }, options.redirectPolicy),
    redirectPolicy: options.redirectPolicy,
  });
  assertCompatibleClientRegistration(
    registration,
    options.capabilities?.tokenEndpointAuthMethods ?? ["none"],
    options.supportedScopes,
  );
  return registration;
}

function normalizeClientMetadata(
  value: OAuthClientMetadata,
  redirectPolicy?: McpFnRedirectPolicy,
): OAuthClientMetadata {
  if (!value || typeof value !== "object") {
    throw new McpFnHostedAuthorizationError("invalid_client_metadata", "Client metadata must be an object");
  }
  try {
    return {
      ...value,
      redirect_uris: Array.isArray(value.redirect_uris)
        ? value.redirect_uris.map((redirect) =>
          normalizeMcpRedirectUri(redirect, redirectPolicy))
        : [],
    };
  } catch (error) {
    if (error instanceof McpFnRedirectMismatchError) {
      throw new McpFnHostedAuthorizationError(
        "invalid_client_metadata",
        "redirect_uris contains an unsafe or malformed URI",
      );
    }
    throw error;
  }
}

async function readBoundedJson(
  source: Request | Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const contentLength = source.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(length) || length > maxBytes) {
      throw new McpFnHostedAuthorizationError("invalid_request", "Metadata body is too large", {
        status: 413,
      });
    }
  }
  const text = await readBoundedText(source, maxBytes, signal);
  try {
    return JSON.parse(text);
  } catch {
    throw new McpFnHostedAuthorizationError("invalid_request", "Metadata body is not valid JSON");
  }
}

async function fetchClientMetadataDocument(
  initialUrl: URL,
  options: NonNullable<McpFnAuthorizationCompatibilityOptions["clientMetadataDocuments"]>,
): Promise<unknown> {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (!fetchImplementation) throw new Error("A fetch implementation is required");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 10_000,
  );
  (timeout as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = new URL(initialUrl);
  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      await assertClientMetadataDocumentUrlAllowed(currentUrl, options, controller.signal);
      if (controller.signal.aborted) throw clientMetadataTimeoutError();
      const response = await fetchClientMetadataResponse(
        fetchImplementation,
        currentUrl,
        controller,
      );
      const redirectUrl = await clientMetadataRedirectUrl(
        response,
        currentUrl,
        redirectCount,
        maxRedirects,
      );
      if (redirectUrl) {
        currentUrl = redirectUrl;
        continue;
      }
      await assertClientMetadataResponse(response);
      return await readBoundedJson(
        response,
        options.maxBytes ?? 256_000,
        controller.signal,
      );
    }
  } catch (error) {
    if (controller.signal.aborted) throw clientMetadataTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchClientMetadataResponse(
  fetchImplementation: typeof fetch,
  url: URL,
  controller: AbortController,
): Promise<Response> {
  try {
    return await withAbort(fetchImplementation(url, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    }), controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw clientMetadataTimeoutError();
    throw error;
  }
}

async function clientMetadataRedirectUrl(
  response: Response,
  currentUrl: URL,
  redirectCount: number,
  maxRedirects: number,
): Promise<URL | undefined> {
  if (!isRedirectStatus(response.status)) return undefined;
  const location = response.headers.get("location");
  await response.body?.cancel().catch(() => undefined);
  if (!location || redirectCount >= maxRedirects) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document redirect could not be followed safely",
    );
  }
  try {
    return new URL(location, currentUrl);
  } catch {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document redirect could not be followed safely",
    );
  }
}

async function assertClientMetadataResponse(response: Response): Promise<void> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document could not be loaded",
    );
  }
  const contentType = response.headers.get("content-type")?.toLowerCase();
  if (!contentType?.includes("application/json")) {
    await response.body?.cancel().catch(() => undefined);
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document must use application/json",
    );
  }
}

function clientMetadataTimeoutError(): McpFnHostedAuthorizationError {
  return new McpFnHostedAuthorizationError(
    "invalid_client",
    "Client ID Metadata Document request timed out",
  );
}

async function assertClientMetadataDocumentUrlAllowed(
  url: URL,
  options: NonNullable<McpFnAuthorizationCompatibilityOptions["clientMetadataDocuments"]>,
  signal: AbortSignal,
): Promise<void> {
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    !options.allow ||
    !(await withAbort(Promise.resolve(options.allow(new URL(url))), signal))
  ) {
    throw new McpFnHostedAuthorizationError(
      "invalid_client",
      "Client ID Metadata Document URL is not permitted",
    );
  }
}

async function readBoundedText(
  source: Request | Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!source.body) return "";
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = () => {
    void reader.cancel(new DOMException("aborted", "AbortError")).catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new McpFnHostedAuthorizationError("invalid_request", "Request body is too large", {
          status: 413,
        });
      }
      chunks.push(value);
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException("aborted", "AbortError"));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
  });
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function validateClientMetadataDocumentOptions(
  options: McpFnAuthorizationCompatibilityOptions["clientMetadataDocuments"],
): void {
  if (!options) return;
  for (const [name, value, minimum] of [
    ["maxBytes", options.maxBytes, 1],
    ["timeoutMs", options.timeoutMs, 1],
    ["maxRedirects", options.maxRedirects, 0],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < minimum)) {
      throw new TypeError(`clientMetadataDocuments.${name} must be an integer >= ${minimum}`);
    }
  }
}

function normalizeIssuer(value: string | URL, allowInsecureLoopback: boolean): URL {
  const serialized = value.toString();
  const issuer = new URL(serialized);
  const loopbackHttp =
    allowInsecureLoopback &&
    issuer.protocol === "http:" &&
    (issuer.hostname === "127.0.0.1" || issuer.hostname === "[::1]");
  if (
    (issuer.protocol !== "https:" && !loopbackHttp) ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash ||
    serialized.includes("?") ||
    serialized.includes("#")
  ) {
    throw new TypeError(
      "issuer must use HTTPS without userinfo, a query string, or a fragment",
    );
  }
  return issuer;
}

function normalizeEndpointPrefix(value: string): string {
  if (value === "" || value === "/") return "";
  const canonicalPath = new URL(value, "https://mcpfn.invalid").pathname;
  if (
    !value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("?") ||
    value.includes("#") ||
    canonicalPath !== value
  ) {
    throw new TypeError(
      "endpointPrefix must be a canonical absolute path without a trailing slash",
    );
  }
  return value;
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
  return [...new Set(values)].sort(compareCodeUnits);
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

async function emit(
  options: McpFnAuthorizationCompatibilityOptions,
  phase: string,
  outcome: "succeeded" | "failed",
  code?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await options.diagnostics?.(redactOAuthValue({
      phase,
      outcome,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
    }));
  } catch {
    // Diagnostics are observational and must never change authorization behavior.
  }
}

function inferPhase(route: McpFnHostedRoute | undefined): string {
  if (route === "register") return "client-registration";
  if (route === "authorize") return "authorization-request";
  if (route === "token") return "token-exchange";
  if (route === "revoke") return "token-revocation";
  return "authorization-server-discovery";
}
