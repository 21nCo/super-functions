/**
 * DataFn Error Types and Envelopes
 */

export type DatafnErrorCode =
  | "SCHEMA_INVALID"
  | "DFQL_INVALID"
  | "DFQL_UNKNOWN_RESOURCE"
  | "DFQL_UNKNOWN_FIELD"
  | "DFQL_UNKNOWN_RELATION"
  | "DFQL_UNSUPPORTED"
  | "LIMIT_EXCEEDED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export type DatafnError = {
  code: DatafnErrorCode;
  message: string;
  details?: unknown;
};

export type DatafnEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: DatafnError };

/**
 * Helper functions for creating envelopes
 */

export function ok<T>(result: T): DatafnEnvelope<T> {
  return { ok: true, result };
}

export function err<T = never>(
  code: DatafnErrorCode,
  message: string,
  details?: unknown
): DatafnEnvelope<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      details: details ?? { path: "$" },
    },
  };
}
