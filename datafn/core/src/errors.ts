/**
 * DataFn Error Types and Envelopes
 */

export type DatafnErrorCode =
  | "SCHEMA_INVALID"
  | "INVALID_CAPABILITY"
  | "INVALID_CAPABILITY_CONFIG"
  | "CAPABILITY_FIELD_COLLISION"
  | "CAPABILITY_DEPENDENCY"
  | "DFQL_INVALID"
  | "DFQL_UNKNOWN_RESOURCE"
  | "DFQL_UNKNOWN_FIELD"
  | "DFQL_UNKNOWN_RELATION"
  | "DFQL_UNSUPPORTED"
  | "DFQL_ABORTED"
  | "LIMIT_EXCEEDED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL"
  | "TRANSACTION_ROLLED_BACK"
  | "BRIDGE_UNAVAILABLE"
  | "BRIDGE_PROTOCOL_MISMATCH"
  | "BRIDGE_METHOD_UNSUPPORTED"
  | "NATIVE_BRIDGE_UNAVAILABLE"
  | "NATIVE_SEARCH_UNAVAILABLE"
  | "NATIVE_SYNC_CONFLICT"
  | "SEARCH_INDEX_REBUILD_FAILED"
  | "ICLOUD_UNAVAILABLE"
  /** LOW-026: Network/transport-layer errors (timeouts, connection refused, etc.) */
  | "TRANSPORT_ERROR";

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
