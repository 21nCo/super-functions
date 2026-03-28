/**
 * Remote Response Unwrapping Utilities
 *
 * Handles both wrapped (DatafnEnvelope) and unwrapped server responses.
 */

import { createClientError } from "../errors.js";

/**
 * Unwrap a remote response that may be wrapped in DatafnEnvelope or unwrapped.
 *
 * - If wrapped success `{ ok: true, result }`, return `result`
 * - If wrapped error `{ ok: false, error }`, throw DatafnClientError
 * - If unwrapped query result `{ data, nextCursor }`, return as-is
 * - If unwrapped aggregate result `{ groups, nextCursor }`, return as-is
 * - Otherwise throw TRANSPORT_ERROR
 */
export function unwrapRemoteSuccess<T>(response: unknown): T {
  if (typeof response !== "object" || response === null) {
    createClientError(
      "TRANSPORT_ERROR",
      "Transport error: unexpected response shape",
      { path: "$" }
    );
  }

  const resp = response as Record<string, unknown>;

  // Check for wrapped envelope
  if ("ok" in resp) {
    if (resp.ok === true && "result" in resp) {
      // Wrapped success
      return resp.result as T;
    } else if (resp.ok === false && "error" in resp) {
      // Wrapped error
      const error = resp.error as {
        code?: string;
        message?: string;
        details?: { path?: string; [key: string]: unknown };
      };

      createClientError(
        (error.code as any) || "INTERNAL",
        error.message || "Unknown error",
        (error.details as any) || { path: "$" }
      );
    }
  }

  // Check for unwrapped query result
  if ("data" in resp && "nextCursor" in resp) {
    return response as T;
  }

  // Check for unwrapped aggregate result
  if ("groups" in resp && "nextCursor" in resp) {
    return response as T;
  }

  // Unknown shape
  createClientError(
    "TRANSPORT_ERROR",
    "Transport error: unexpected response shape",
    { path: "$" }
  );
}
