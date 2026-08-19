import type {
  OAuthClientSecretResolver,
  OAuthResolvedClientSecret,
  OAuthRevocationRequest,
  OAuthSecretResolverContext,
  OAuthTokenAuthMethod,
  OAuthTokenEndpointRequest,
  OAuthTokenEndpointResponse,
  OAuthTokenGrantType,
  OAuthTokenHttpClient
} from "./index.js";
import {
  OAuthHttpError,
  invalidRuntimeConfigError,
  normalizeOAuthErrorBody,
  secretResolutionFailedError,
  unsupportedTokenAuthMethodError
} from "./errors.js";
import { DEFAULT_OAUTH_RETRY_POLICY, decideRetry, type OAuthRetryPolicy } from "./retry-policy.js";

interface HeadersLike {
  get(name: string): string | null;
}

interface ResponseLike {
  ok: boolean;
  status: number;
  headers: HeadersLike;
  text(): Promise<string>;
}

export interface RequestInitLike {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type OAuthFetchLike = (url: string, init: RequestInitLike) => Promise<ResponseLike>;

export interface OAuthTokenClientOptions {
  fetcher?: OAuthFetchLike;
  retryPolicy?: OAuthRetryPolicy;
  sleep?: (delayMs: number) => Promise<void>;
}

export interface DisconnectWithRevokeInput {
  revokeSupported: boolean;
  revokeRequest: OAuthRevocationRequest;
  deleteLocalTokenRecord: () => Promise<void>;
  deleteConnectionRecord: () => Promise<void>;
  onRevocationFailure?: (error: OAuthHttpError) => Promise<void> | void;
}

export interface DisconnectWithRevokeResult {
  remoteRevokeAttempted: boolean;
  localTokenDeleted: boolean;
  connectionDeleted: boolean;
}

interface ResolvedRequestCredentials {
  clientId: string;
  clientSecret: string;
  tokenAuthMethod: OAuthTokenAuthMethod;
}

export class DefaultOAuthTokenHttpClient implements OAuthTokenHttpClient {
  private readonly fetcher: OAuthFetchLike;
  private readonly retryPolicy: OAuthRetryPolicy;
  private readonly sleep: (delayMs: number) => Promise<void>;

  constructor(options: OAuthTokenClientOptions = {}) {
    this.fetcher = options.fetcher ?? getGlobalFetch();
    this.retryPolicy = options.retryPolicy ?? DEFAULT_OAUTH_RETRY_POLICY;
    this.sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  async exchangeToken(input: OAuthTokenEndpointRequest): Promise<OAuthTokenEndpointResponse> {
    const credentials = await resolveRequestCredentials(input, {
      provider: input.provider,
      operation: "exchange",
      clientId: input.clientId,
      grantType: input.grantType,
      redirectUri: input.redirectUri,
      scopes: input.scopes
    });
    const endpointRequest = createTokenRequest(input, credentials);
    const response = await this.executeWithRetry(input.provider.tokenUrl, endpointRequest);
    const contentType = response.headers.get("content-type");
    const rawBodyText = await response.text();
    const parsedBody = parseResponseBody(rawBodyText, contentType);

    if (!response.ok) {
      throw createTokenEndpointError({
        status: response.status,
        grantType: input.grantType,
        providerId: input.provider.id,
        parsedBody
      });
    }

    return normalizeTokenResponse(parsedBody);
  }

  async revokeToken(input: OAuthRevocationRequest): Promise<void> {
    if (!input.provider.revocationUrl) {
      return;
    }

    const credentials = await resolveRequestCredentials(input, {
      provider: input.provider,
      operation: "revoke",
      clientId: input.clientId,
      tokenTypeHint: input.tokenTypeHint
    });
    const revocationUrl = resolveRevocationUrl(input.provider.revocationUrl, credentials.clientId);
    const endpointRequest = createRevokeRequest(input, credentials, revocationUrl);
    const response = await this.executeWithRetry(revocationUrl, endpointRequest);
    if (response.ok) {
      return;
    }

    const contentType = response.headers.get("content-type");
    const rawBodyText = await response.text();
    const parsedBody = parseResponseBody(rawBodyText, contentType);
    const normalized = normalizeOAuthErrorBody(parsedBody);
    const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
    throw new OAuthHttpError(normalized.message, {
      code: response.status === 429 ? "PROVIDER_RATE_LIMITED" : "INTERNAL_ERROR",
      status: response.status,
      retryable,
      details: {
        providerId: input.provider.id,
        operation: "revoke",
        ...normalized.details
      }
    });
  }

  private async executeWithRetry(url: string, init: RequestInitLike): Promise<ResponseLike> {
    let attempt = 1;
    while (true) {
      let response: ResponseLike;
      try {
        response = await this.fetcher(url, init);
      } catch (error) {
        const decision = decideRetry(
          {
            attempt,
            status: 503
          },
          this.retryPolicy
        );

        if (!decision.retry) {
          throw new OAuthHttpError("OAuth provider request failed", {
            code: "OAUTH_TOKEN_EXCHANGE_FAILED",
            status: 502,
            retryable: false,
            cause: error,
            details: {
              transportFailure: true
            }
          });
        }

        await this.sleep(decision.delayMs);
        attempt += 1;
        continue;
      }

      const decision = decideRetry(
        {
          attempt,
          status: response.status,
          retryAfterHeader: response.headers.get("retry-after")
        },
        this.retryPolicy
      );

      if (!decision.retry) {
        return response;
      }

      await this.sleep(decision.delayMs);
      attempt += 1;
    }
  }
}

export async function disconnectWithRevoke(
  client: OAuthTokenHttpClient,
  input: DisconnectWithRevokeInput
): Promise<DisconnectWithRevokeResult> {
  let revokeError: OAuthHttpError | null = null;
  let localTokenDeleted = false;
  let connectionDeleted = false;

  if (input.revokeSupported) {
    try {
      await client.revokeToken(input.revokeRequest);
    } catch (error) {
      revokeError = ensureOAuthHttpError(error);
      if (input.onRevocationFailure) {
        await input.onRevocationFailure(revokeError);
      }
    }
  }

  await input.deleteLocalTokenRecord();
  localTokenDeleted = true;
  await input.deleteConnectionRecord();
  connectionDeleted = true;

  if (revokeError) {
    throw new OAuthHttpError("provider revoke failed after local cleanup", {
      code: "INTERNAL_ERROR",
      status: 502,
      retryable: false,
      cause: revokeError,
      details: {
        remoteRevokeAttempted: true,
        localTokenDeleted,
        connectionDeleted,
        revokeErrorCode: revokeError.code
      }
    });
  }

  return {
    remoteRevokeAttempted: input.revokeSupported,
    localTokenDeleted,
    connectionDeleted
  };
}

async function resolveRequestCredentials(
  input: Pick<OAuthTokenEndpointRequest | OAuthRevocationRequest, "clientId" | "clientSecret" | "clientSecretResolver" | "provider">,
  context: OAuthSecretResolverContext
): Promise<ResolvedRequestCredentials> {
  if (!input.clientId) {
    throw invalidRuntimeConfigError("OAuth runtime config missing clientId", {
      providerId: input.provider.id,
      operation: context.operation
    });
  }

  const tokenAuthMethod = getTokenAuthMethod(input.provider.tokenAuthMethod);
  if (input.clientSecret) {
    return {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      tokenAuthMethod
    };
  }

  const resolvedSecret = await resolveClientSecret(input.clientSecretResolver, context);
  return {
    clientId: input.clientId,
    clientSecret: resolvedSecret.clientSecret,
    tokenAuthMethod: resolvedSecret.tokenAuthMethod ?? tokenAuthMethod
  };
}

async function resolveClientSecret(
  resolver: OAuthClientSecretResolver | undefined,
  context: OAuthSecretResolverContext
): Promise<OAuthResolvedClientSecret> {
  if (!resolver) {
    throw invalidRuntimeConfigError("OAuth runtime config missing clientSecret or clientSecretResolver", {
      providerId: context.provider.id,
      operation: context.operation
    });
  }

  let resolved: OAuthResolvedClientSecret;
  try {
    resolved = await resolver(context);
  } catch (error) {
    throw secretResolutionFailedError(context, error);
  }

  if (!resolved?.clientSecret) {
    throw secretResolutionFailedError(context, undefined, "resolved OAuth client secret is empty");
  }

  return resolved;
}

function createTokenRequest(
  input: OAuthTokenEndpointRequest,
  credentials: ResolvedRequestCredentials
): RequestInitLike {
  const params = new URLSearchParams();
  params.set("grant_type", input.grantType);

  if (input.grantType === "authorization_code") {
    if (!input.code) {
      throw new OAuthHttpError("authorization code is required", {
        code: "VALIDATION_ERROR",
        status: 400
      });
    }

    params.set("code", input.code);
    if (input.redirectUri) {
      params.set("redirect_uri", input.redirectUri);
    }

    if (input.codeVerifier) {
      params.set("code_verifier", input.codeVerifier);
    }
  } else if (input.grantType === "refresh_token") {
    if (!input.refreshToken) {
      throw new OAuthHttpError("refresh token is required", {
        code: "VALIDATION_ERROR",
        status: 400
      });
    }

    params.set("refresh_token", input.refreshToken);
    if (input.redirectUri) {
      params.set("redirect_uri", input.redirectUri);
    }
  }

  if (input.scopes && input.scopes.length > 0) {
    params.set("scope", input.scopes.join(input.provider.scopeSeparator ?? " "));
  }

  return {
    method: "POST",
    headers: createAuthHeaders(credentials, params),
    body: params.toString()
  };
}

function resolveRevocationUrl(revocationUrl: string | undefined, clientId: string): string {
  if (!revocationUrl) {
    return "";
  }

  if (!revocationUrl.includes("{client_id}")) {
    return revocationUrl;
  }

  return revocationUrl.replace("{client_id}", encodeURIComponent(clientId));
}

function isGitHubApplicationRevokeUrl(revocationUrl: string | undefined): boolean {
  return !!revocationUrl && revocationUrl.includes("/applications/") && revocationUrl.includes("/token");
}

function createRevokeRequest(
  input: OAuthRevocationRequest,
  credentials: ResolvedRequestCredentials,
  revocationUrl: string
): RequestInitLike {
  if (isGitHubApplicationRevokeUrl(revocationUrl)) {
    const authUser = encodeURIComponent(credentials.clientId);
    const authPassword = encodeURIComponent(credentials.clientSecret);
    const auth = encodeBasicCredentials(authUser, authPassword);

    return {
      method: "DELETE",
      headers: {
        accept: "application/json",
        authorization: `Basic ${auth}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ access_token: input.token })
    };
  }

  const params = new URLSearchParams();
  params.set("token", input.token);
  if (input.tokenTypeHint) {
    params.set("token_type_hint", input.tokenTypeHint);
  }

  return {
    method: "POST",
    headers: createAuthHeaders(credentials, params),
    body: params.toString()
  };
}

function createAuthHeaders(
  credentials: ResolvedRequestCredentials,
  params: URLSearchParams
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json, application/x-www-form-urlencoded, text/plain"
  };

  if (credentials.tokenAuthMethod === "client_secret_post") {
    params.set("client_id", credentials.clientId);
    params.set("client_secret", credentials.clientSecret);
  } else {
    const authUser = encodeURIComponent(credentials.clientId);
    const authPassword = encodeURIComponent(credentials.clientSecret);
    const auth = encodeBasicCredentials(authUser, authPassword);
    headers.authorization = `Basic ${auth}`;
  }

  return headers;
}

function encodeBasicCredentials(username: string, password: string): string {
  return base64EncodeAscii(`${username}:${password}`);
}

function base64EncodeAscii(value: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index);
    const second = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
    const third = index + 2 < value.length ? value.charCodeAt(index + 2) : 0;
    const combined = (first << 16) | (second << 8) | third;

    output += alphabet[(combined >> 18) & 63];
    output += alphabet[(combined >> 12) & 63];
    output += index + 1 < value.length ? alphabet[(combined >> 6) & 63] : "=";
    output += index + 2 < value.length ? alphabet[combined & 63] : "=";
  }

  return output;
}

function parseResponseBody(rawBodyText: string, contentType: string | null): unknown {
  if (rawBodyText.length === 0) {
    return {};
  }

  const normalizedContentType = contentType?.toLowerCase() ?? "";
  if (normalizedContentType.includes("application/json")) {
    return safeParseJson(rawBodyText);
  }

  if (
    normalizedContentType.includes("application/x-www-form-urlencoded") ||
    normalizedContentType.includes("text/plain")
  ) {
    return parseFormBody(rawBodyText);
  }

  const maybeJson = safeParseJson(rawBodyText);
  if (maybeJson !== null) {
    return maybeJson;
  }

  return parseFormBody(rawBodyText);
}

function normalizeTokenResponse(parsedBody: unknown): OAuthTokenEndpointResponse {
  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    throw new OAuthHttpError("OAuth token response body must be a JSON object", {
      code: "OAUTH_TOKEN_EXCHANGE_FAILED",
      status: 502,
      retryable: false,
      details: { parsedBodyKeys: [] }
    });
  }

  const payload = parsedBody as Record<string, unknown>;
  const accessToken = asString(payload.access_token);
  if (!accessToken) {
    throw new OAuthHttpError("OAuth token response missing access_token", {
      code: "OAUTH_TOKEN_EXCHANGE_FAILED",
      status: 502,
      retryable: false,
      details: { parsedBodyKeys: Object.keys(payload).slice(0, 10) }
    });
  }

  const result: OAuthTokenEndpointResponse = {
    accessToken,
    refreshToken: asString(payload.refresh_token),
    tokenType: asString(payload.token_type),
    scope: asString(payload.scope),
    idToken: asString(payload.id_token),
    raw: payload
  };

  const expiresIn = asNumber(payload.expires_in);
  if (expiresIn !== undefined) {
    result.expiresIn = expiresIn;
  }

  return result;
}

function createTokenEndpointError(input: {
  status: number;
  grantType: OAuthTokenGrantType;
  providerId: string;
  parsedBody: unknown;
}): OAuthHttpError {
  const normalized = normalizeOAuthErrorBody(input.parsedBody);
  const retryable = input.status === 429 || (input.status >= 500 && input.status <= 599);
  if (input.status === 429) {
    return new OAuthHttpError(normalized.message, {
      code: "PROVIDER_RATE_LIMITED",
      status: input.status,
      retryable: true,
      details: {
        providerId: input.providerId,
        grantType: input.grantType,
        ...normalized.details
      }
    });
  }

  return new OAuthHttpError(normalized.message, {
    code: input.grantType === "refresh_token" ? "OAUTH_TOKEN_REFRESH_FAILED" : "OAUTH_TOKEN_EXCHANGE_FAILED",
    status: input.status,
    retryable,
    details: {
      providerId: input.providerId,
      grantType: input.grantType,
      ...normalized.details
    }
  });
}

function getTokenAuthMethod(tokenAuthMethod: string | undefined): OAuthTokenAuthMethod {
  if (!tokenAuthMethod) {
    return "client_secret_post";
  }

  if (tokenAuthMethod === "client_secret_post" || tokenAuthMethod === "client_secret_basic") {
    return tokenAuthMethod;
  }

  throw unsupportedTokenAuthMethodError(tokenAuthMethod);
}

function parseFormBody(rawBodyText: string): Record<string, string> {
  const params = new URLSearchParams(rawBodyText);
  const result: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

function safeParseJson(rawBodyText: string): unknown {
  try {
    return JSON.parse(rawBodyText) as unknown;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function ensureOAuthHttpError(error: unknown): OAuthHttpError {
  if (error instanceof OAuthHttpError) {
    return error;
  }

  return new OAuthHttpError(error instanceof Error ? error.message : "OAuth HTTP request failed", {
    code: "INTERNAL_ERROR",
    status: 500,
    retryable: false,
    cause: error
  });
}

function getGlobalFetch(): OAuthFetchLike {
  const fetcher = globalThis.fetch;
  if (!fetcher) {
    throw new OAuthHttpError("global fetch is not available", {
      code: "INTERNAL_ERROR",
      status: 500,
      retryable: false
    });
  }

  return async (url, init) => {
    const response = await fetcher(url, {
      method: init.method,
      headers: init.headers,
      body: init.body
    });

    return {
      ok: response.ok,
      status: response.status,
      headers: {
        get(name: string) {
          return response.headers.get(name);
        }
      },
      text: () => response.text()
    };
  };
}
