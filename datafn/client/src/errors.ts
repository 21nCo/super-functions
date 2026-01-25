/**
 * DataFn Client Error Types
 */

import type { DatafnErrorCode } from "@datafn/core";

export type DatafnClientError = {
  code: DatafnErrorCode | "TRANSPORT_ERROR";
  message: string;
  details: { path: string; [key: string]: unknown };
};

/**
 * Create a DataFnClientError and throw it
 */
export function createClientError(
  code: DatafnClientError["code"],
  message: string,
  details: { path: string; [key: string]: unknown },
): never {
  const error: DatafnClientError = {
    code,
    message,
    details,
  };
  throw error;
}
/**
 * Check if an error is a transport/retriable error.
 * Returns true for network errors, timeouts, or explicit TRANSPORT_ERROR code.
 * Returns false for logic errors (validation, auth, missing resource, etc).
 */
export function isTransportError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const err = error as any;

  // Explicit DataFn code
  if (err.code === "TRANSPORT_ERROR") return true;

  // Network/Fetch errors match common patterns
  // 1. fetch() throws TypeError on network failure
  // 2. AbortError on timeout
  if (err.name === "TypeError" && err.message.includes("fetch")) return true;
  if (err.name === "AbortError") return true; // Timeout

  // Check failure status if available (e.g. 503, 504)
  // Note: DataFnRemoteAdapter usually unwraps to DataFnError, so status might not be here directly
  // unless wrapped.

  return false;
}
