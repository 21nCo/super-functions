import type { AdminOperationError } from "./types.js";

export type AdminErrorCode =
  | "invalid_argument"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "precondition_failed"
  | "dependency_unavailable"
  | "internal";

const STATUS_BY_CODE: Record<AdminErrorCode, number> = {
  invalid_argument: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  precondition_failed: 412,
  rate_limited: 429,
  dependency_unavailable: 503,
  internal: 500,
};

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    code: AdminErrorCode,
    message: string,
    options: { status?: number; details?: unknown; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AdminError";
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryable = options.retryable ?? (code === "rate_limited" || code === "dependency_unavailable");
  }
}

export function normalizeAdminError(
  error: unknown,
  identity: { requestId?: string; correlationId?: string } = {},
): AdminOperationError {
  const normalized = error instanceof AdminError
    ? error
    : new AdminError("internal", "The administration operation could not be completed.", { cause: error });
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      status: normalized.status,
      ...(normalized.details === undefined ? {} : { details: normalized.details }),
      retryable: normalized.retryable,
    },
    ...identity,
  };
}
