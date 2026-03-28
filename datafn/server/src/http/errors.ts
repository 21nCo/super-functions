/**
 * HTTP error handling utilities
 * Maps DatafnError to DatafnEnvelope responses
 */

import type { DatafnEnvelope, DatafnError, DatafnErrorCode } from "../core-types.js";
import { jsonResponse } from "./json.js";

/**
 * Convert an error to a DatafnEnvelope response
 */
export function errorToEnvelope<T = never>(
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

/**
 * Create an error Response from a DatafnError
 */
export function errorResponse(
  error: DatafnError,
  status: number = 400
): Response {
  return jsonResponse({ ok: false, error }, status);
}

/**
 * Create a success Response from a result
 */
export function okResponse<T>(result: T): Response {
  return jsonResponse({ ok: true, result });
}
