import type { OAuthSecretResolverContext } from "./index.js";

export type OAuthHttpErrorCode =
  | "OAUTH_TOKEN_EXCHANGE_FAILED"
  | "OAUTH_TOKEN_REFRESH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "OAUTH_RUNTIME_CONFIG_INVALID"
  | "OAUTH_SECRET_RESOLUTION_FAILED";

export interface OAuthHttpErrorOptions {
  code: OAuthHttpErrorCode;
  status?: number;
  retryable?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class OAuthHttpError extends Error {
  readonly code: OAuthHttpErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(message: string, options: OAuthHttpErrorOptions) {
    super(message);
    this.name = "OAuthHttpError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function unsupportedTokenAuthMethodError(tokenAuthMethod: string): OAuthHttpError {
  return new OAuthHttpError("unsupported token auth method", {
    code: "VALIDATION_ERROR",
    status: 400,
    retryable: false,
    details: { tokenAuthMethod }
  });
}

export function invalidRuntimeConfigError(message: string, details?: Record<string, unknown>): OAuthHttpError {
  return new OAuthHttpError(message, {
    code: "OAUTH_RUNTIME_CONFIG_INVALID",
    status: 500,
    retryable: false,
    details
  });
}

export function secretResolutionFailedError(
  context: OAuthSecretResolverContext,
  cause?: unknown,
  message: string = "failed to resolve OAuth client secret"
): OAuthHttpError {
  return new OAuthHttpError(message, {
    code: "OAUTH_SECRET_RESOLUTION_FAILED",
    status: 500,
    retryable: false,
    cause,
    details: {
      providerId: context.provider.id,
      operation: context.operation,
      grantType: context.grantType,
      hasResolver: true
    }
  });
}

export function normalizeOAuthErrorBody(rawBody: unknown): { message: string; details?: Record<string, unknown> } {
  if (!rawBody || typeof rawBody !== "object") {
    return { message: "OAuth provider request failed" };
  }

  const payload = rawBody as Record<string, unknown>;
  const description =
    asString(payload.error_description) ??
    asString(payload.message) ??
    asString(payload.error) ??
    asString(payload.detail) ??
    "OAuth provider request failed";
  const details = Object.fromEntries(
    Object.entries({
      error: asString(payload.error),
      error_description: asString(payload.error_description),
      error_uri: asString(payload.error_uri),
      detail: asString(payload.detail)
    }).filter(([, value]) => value !== undefined)
  );

  return {
    message: description,
    details: Object.keys(details).length > 0 ? details : undefined
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
