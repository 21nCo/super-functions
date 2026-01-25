/**
 * DataFn Envelope Utilities
 */

import type { DatafnEnvelope, DatafnError } from "./errors.js";

/**
 * Unwraps a DatafnEnvelope, returning the result for ok:true
 * or throwing the exact error object for ok:false.
 *
 * This provides deterministic error handling for envelope-returning functions.
 *
 * @param env - The envelope to unwrap
 * @returns The result value for success envelopes
 * @throws The exact DatafnError object for failure envelopes
 */
export function unwrapEnvelope<T>(env: DatafnEnvelope<T>): T {
  if (env.ok) {
    return env.result;
  }
  // Throw the exact error object (code/message/details.path match)
  throw env.error;
}
