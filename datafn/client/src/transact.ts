/**
 * Transaction Execution Utilities
 *
 * Handles transaction execution via remote adapter with response unwrapping.
 */

import type { DatafnRemoteAdapter } from "./client.js";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";

/**
 * Execute a transaction via the remote adapter.
 * Unwraps response and returns transaction result.
 */
export async function executeTransact(
  remote: DatafnRemoteAdapter,
  payload: unknown,
  beforeExecute?: () => Promise<void>,
): Promise<unknown> {
  if (beforeExecute) {
    await beforeExecute();
  }
  const response = await remote.transact(payload);
  return unwrapRemoteSuccess(response);
}
