/**
 * Sync Facade
 *
 * Client-side sync methods that delegate to remote adapter.
 * When storage is configured, clone/pull results are applied to local storage.
 * Implements HOOK-001 and EVT-003: beforeSync/afterSync hooks and sync lifecycle events
 */

import type { DatafnRemoteAdapter } from "./client.js";
import type { DatafnStorageAdapter } from "./storage.js";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { createClientError } from "./errors.js";
import { applyCloneResult, applyPullResult } from "./sync/apply.js";
import type { CloneResult, PullResult } from "./sync/apply.js";
import { cloneUp as executeCloneUp } from "./sync/cloneUp.js";
import type { CloneUpOptions, CloneUpResult, CloneUpDeps } from "./sync/cloneUp.js";
import type { DatafnPlugin, DatafnSchema } from "@datafn/core";
import type { EventBus } from "./events/bus.js";
import { runBeforeSync, runAfterSync } from "./plugins/run-hooks.js";

export interface SyncFacade {
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
  cloneUp(options?: CloneUpOptions): Promise<CloneUpResult>;
}

export interface SyncControlMethods {
  start(): Promise<void>;
  stop(): void;
  pullNow(): Promise<void>;
  cloneNow(): Promise<void>;
  reconcileNow(): Promise<void>;
  schedulePush(): Promise<void>;
}

/**
 * Create sync facade that delegates to remote adapter
 * Wraps all sync phases with beforeSync/afterSync hooks (HOOK-001)
 * Emits sync_applied/sync_failed events (EVT-003)
 */
export function createSyncFacade(
  remote: DatafnRemoteAdapter,
  storage?: DatafnStorageAdapter,
  cloneUpDeps?: CloneUpDeps,
  plugins: DatafnPlugin[] = [],
  schema?: DatafnSchema,
  eventBus?: EventBus,
  getTimestamp?: () => number,
): SyncFacade {
  // Helper to get current timestamp
  const timestamp = getTimestamp || (() => Date.now());

  /**
   * Wraps a sync method with hooks and event emission
   * Phase-specific logic for each sync method
   */
  const wrapSyncMethod = async <T>(
    phase: "seed" | "clone" | "pull" | "push" | "cloneUp" | "reconcile",
    methodName: keyof DatafnRemoteAdapter,
    payload: unknown,
    applyFn?: (result: T) => Promise<void>,
  ): Promise<T> => {
    try {
      // Run beforeSync hooks (fail-closed) (HOOK-001)
      const transformedPayload = schema
        ? await runBeforeSync(plugins, schema, phase, payload)
        : payload;

      // Check if method exists
      const method = remote[methodName];
      if (typeof method !== "function") {
        throw createClientError(
          "TRANSPORT_ERROR",
          `Transport error: remote method missing: ${methodName}`,
          { path: `sync.${methodName}` },
        );
      }

      // Call remote method and unwrap
      const response = await method.call(remote, transformedPayload);
      const result = unwrapRemoteSuccess(response) as T;

      // Apply to storage if configured
      if (applyFn) {
        await applyFn(result);
      }

      // Run afterSync hooks (fail-open) (HOOK-001)
      if (schema) {
        await runAfterSync(plugins, schema, phase, transformedPayload, result);
      }

      // Emit sync_applied event (EVT-003)
      if (eventBus) {
        eventBus.emit({
          type: "sync_applied",
          timestampMs: timestamp(),
          context: createSyncEventContext(phase, result),
        });
      }

      return result;
    } catch (error: any) {
      // Emit sync_failed event (EVT-003)
      if (eventBus) {
        eventBus.emit({
          type: "sync_failed",
          timestampMs: timestamp(),
          context: {
            phase,
            error: {
              code: error.code || "INTERNAL",
              message: error.message || "Sync failed",
            },
          },
        });
      }

      throw error;
    }
  };

  /**
   * Create deterministic sync event context (EVT-003)
   * Ensures stable key ordering
   */
  const createSyncEventContext = (phase: string, result: any): Record<string, unknown> => {
    const context: Record<string, unknown> = { phase };

    // Add phase-specific context with stable key ordering
    if (phase === "clone" && result) {
      if (result.cursors) {
        context.cursors = result.cursors;
      }
      if (result.data) {
        const resources = Object.keys(result.data).sort();
        context.resources = resources;
      }
    }

    if (phase === "pull" && result) {
      if (result.cursors) {
        context.cursors = result.cursors;
      }
      if (result.records) {
        const resources = Object.keys(result.records).sort();
        context.resources = resources;
      }
      // Calculate cursor delta (difference between new and old cursors)
      if (result.cursors) {
        const cursorDeltas: Record<string, number> = {};
        for (const [resource, newCursor] of Object.entries(result.cursors as Record<string, string>)) {
          cursorDeltas[resource] = parseInt(newCursor, 10);
        }
        context.cursorDelta = cursorDeltas;
      }
    }

    if (phase === "push" && result) {
      if (result.cursor) {
        context.cursor = result.cursor;
      }
      if (result.applied) {
        context.appliedCount = (result.applied as unknown[]).length;
      }
    }

    if (phase === "reconcile" && result) {
      if (result.reclonedResources) {
        context.reclonedResources = result.reclonedResources;
      }
    }

    if (phase === "cloneUp" && result) {
      if ((result as CloneUpResult).uploadedCount !== undefined) {
        context.uploadedCount = (result as CloneUpResult).uploadedCount;
      }
    }

    return context;
  };

  return {
    async seed(payload: unknown) {
      return wrapSyncMethod("seed", "seed", payload);
    },

    async clone(payload: unknown) {
      return wrapSyncMethod("clone", "clone", payload, async (result) => {
        if (storage) {
          await applyCloneResult(storage, result as CloneResult);
        }
      });
    },

    async pull(payload: unknown) {
      return wrapSyncMethod("pull", "pull", payload, async (result) => {
        if (storage) {
          await applyPullResult(storage, result as PullResult);
        }
      });
    },

    async push(payload: unknown) {
      return wrapSyncMethod("push", "push", payload);
    },

    async cloneUp(options?: CloneUpOptions): Promise<CloneUpResult> {
      if (!cloneUpDeps) {
        throw createClientError(
          "INTERNAL",
          "Invalid cloneUp: dependencies not configured",
          { path: "sync.cloneUp" },
        );
      }

      try {
        // Run beforeSync hooks (fail-closed) (HOOK-001)
        const transformedOptions = schema
          ? await runBeforeSync(plugins, schema, "cloneUp", options || {})
          : options;

        // Execute cloneUp (note: cloneUp emits its own sync_applied/sync_failed events)
        const result = await executeCloneUp(cloneUpDeps, transformedOptions as CloneUpOptions);

        // Run afterSync hooks (fail-open) (HOOK-001)
        if (schema) {
          await runAfterSync(plugins, schema, "cloneUp", transformedOptions, result);
        }

        // Note: Do NOT emit sync_applied here - executeCloneUp already emits
        // sync_applied (on success) or sync_failed (on errors)

        return result;
      } catch (error: any) {
        // Emit sync_failed event only for exceptions (EVT-003)
        // Note: Normal error cases (result.ok = false) are handled by executeCloneUp
        if (eventBus) {
          eventBus.emit({
            type: "sync_failed",
            timestampMs: timestamp(),
            context: {
              phase: "cloneUp",
              error: {
                code: error.code || "INTERNAL",
                message: error.message || "CloneUp failed",
              },
            },
          });
        }

        throw error;
      }
    },
  };
}
