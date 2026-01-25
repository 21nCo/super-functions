/**
 * Sync Facade
 *
 * Client-side sync methods that delegate to remote adapter.
 * When storage is configured, clone/pull results are applied to local storage.
 */

import type { DatafnRemoteAdapter } from "./client.js";
import type { DatafnStorageAdapter } from "./storage.js";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { createClientError } from "./errors.js";
import { applyCloneResult, applyPullResult } from "./sync/apply.js";
import type { CloneResult, PullResult } from "./sync/apply.js";

export interface SyncFacade {
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
}

/**
 * Create sync facade that delegates to remote adapter
 */
export function createSyncFacade(
  remote: DatafnRemoteAdapter,
  storage?: DatafnStorageAdapter,
): SyncFacade {
  const callSyncMethod = async (
    methodName: keyof DatafnRemoteAdapter,
    payload: unknown,
  ): Promise<unknown> => {
    const method = remote[methodName];

    // Check if method exists
    if (typeof method !== "function") {
      throw createClientError(
        "TRANSPORT_ERROR",
        `Transport error: remote method missing: ${methodName}`,
        { path: `sync.${methodName}` },
      );
    }

    // Call remote method and unwrap
    const response = await method.call(remote, payload);
    return unwrapRemoteSuccess(response);
  };

  return {
    async seed(payload: unknown) {
      return callSyncMethod("seed", payload);
    },

    async clone(payload: unknown) {
      const result = await callSyncMethod("clone", payload);

      // Apply to storage if configured (CLIENT-SYNC-APPLY-001, CLIENT-HYDRATION-001)
      if (storage) {
        await applyCloneResult(storage, result as CloneResult);
      }

      return result;
    },

    async pull(payload: unknown) {
      const result = await callSyncMethod("pull", payload);

      // Apply to storage if configured (CLIENT-SYNC-APPLY-001)
      if (storage) {
        await applyPullResult(storage, result as PullResult);
      }

      return result;
    },

    async push(payload: unknown) {
      return callSyncMethod("push", payload);
    },
  };
}
