/**
 * Transaction execution logic
 */

import type { DatafnErrorCode, DatafnSchema, DatafnPlugin } from "../core-types.js";
import type { Adapter } from "@superfunctions/db";
import type { IdempotencyStore, MutationResult } from "./idempotency.js";
import type { DFQLMutation } from "./mutation/dfql.js";
import type { SequenceStore } from "./sync/sequence-store.js";
import { executeMutation } from "./mutation/execute.js";
import { executeQuery } from "./query/execute.js";
import { DbDataStore } from "./db-store.js";
import { ChangeTrackingService } from "./sync/change-tracking.js";
import type { DatafnLogger } from "../logger.js";
import { getDatafnMultiRegionRuntimeConfig } from "../plugins/multi-region.js";
import {
  drainPermissionDirectorySync,
  enqueuePermissionDirectorySync,
  ensurePermissionDirectoryOutbox,
  markPermissionDirectorySyncReady,
} from "./mutation/permission-directory-outbox.js";

export interface TransactStep {
  query?: any;
  mutation?: DFQLMutation;
}

export interface TransactResult {
  ok: boolean;
  result?: {
    ok: boolean;
    results: Array<any>;
    error?: {
      code: DatafnErrorCode;
      message: string;
    };
  };
  error?: {
    code: DatafnErrorCode;
    message: string;
    details?: any;
  };
}

/**
 * Execute a transaction (sequence of mutations/queries) as an atomic unit
 */
export async function executeTransaction(
  request: { atomic?: boolean; steps: TransactStep[] },
  schema: DatafnSchema,
  db: Adapter,
  idempotencyStore: IdempotencyStore,
  limits: { maxTransactSteps?: number } | undefined,
  namespace: string,
  actorId: string | undefined,
  sequenceStore: SequenceStore | undefined,
  plugins: DatafnPlugin[] = [],
  logger?: DatafnLogger,
): Promise<TransactResult> {
  const steps = request.steps;
  const isAtomic = request.atomic !== false; // Default true
  const hasMutations = steps.some((step) => Boolean(step.mutation));
  const multiRegionRuntime = getDatafnMultiRegionRuntimeConfig(plugins);
  const needsPermissionDirectoryOutbox = Boolean(
    hasMutations &&
    multiRegionRuntime &&
    steps.some((step) =>
      step.mutation?.operation === "share" ||
      step.mutation?.operation === "unshare"
    ),
  );
  const prequeuedUnshareTaskIds: string[] = [];
  const prequeuedUnshareTasks = new Map<DFQLMutation, string>();
  const prequeuedUnshareMutationsByTaskId = new Map<string, DFQLMutation>();
  try {
    if (needsPermissionDirectoryOutbox) {
      // Sequential steps are marked insideTransaction to avoid nested database
      // transactions, so durable DDL must also be initialized up front there.
      await ensurePermissionDirectoryOutbox(db);
    }
    if (multiRegionRuntime) {
      for (const step of steps) {
        if (step.mutation?.operation !== "unshare") continue;
        // Atomic unshare removes the external grant before its transaction
        // settles. Queue repair on the outer adapter before entering the
        // transaction so enqueue failure aborts before invalidation.
        const taskId = await enqueuePermissionDirectorySync(
          db,
          step.mutation,
          namespace,
          multiRegionRuntime.regionId,
          { pending: true },
        );
        prequeuedUnshareTaskIds.push(taskId);
        prequeuedUnshareTasks.set(step.mutation, taskId);
        prequeuedUnshareMutationsByTaskId.set(taskId, step.mutation);
      }
    }
  } catch (error: any) {
    if (multiRegionRuntime) {
      // A later enqueue can fail after earlier pending tasks started renewable
      // owner leases. Release every task already created without waiting on an
      // external directory. They remain durable and immediately eligible for
      // the regular background reconciler.
      const releases = await Promise.allSettled(prequeuedUnshareTaskIds.map(async (taskId) => {
        const release = await markPermissionDirectorySyncReady(db, taskId);
        if (release === "ownership-lost") {
          await enqueuePermissionDirectorySync(
            db,
            prequeuedUnshareMutationsByTaskId.get(taskId)!,
            namespace,
            multiRegionRuntime.regionId,
          );
        }
      }));
      releases.forEach((release, index) => {
        if (release.status === "rejected") {
          logger?.error("Permission directory task release deferred", {
            error: String(release.reason),
            operation: "permission-directory",
            taskId: prequeuedUnshareTaskIds[index],
          });
        }
      });
    }
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Transaction setup failed: ${error?.message || String(error)}`,
        details: { path: "$" },
      },
    };
  }

  // SRV-012: Step limit check moved to route handler; skip duplicate check here
  // (createTransactHandler validates before calling executeTransaction)

  const results: Array<any> = [];
  const changeTracking = new ChangeTrackingService(db, namespace, sequenceStore);
  type DeferredPermissionDirectorySync = (
    committedDb: Adapter,
  ) => Promise<void>;
  const drainPrequeuedUnshareTasks = async () => {
    if (!multiRegionRuntime) return;
    for (const taskId of prequeuedUnshareTaskIds) {
      try {
        await drainPermissionDirectorySync(
          db,
          taskId,
          multiRegionRuntime,
          logger,
        );
      } catch (error) {
        // The task is already durable. Startup/interval draining owns retry.
        logger?.error("Prequeued unshare reconciliation deferred", {
          error: String(error),
          operation: "permission-directory",
          taskId,
        });
      }
    }
  };

  // Helper to execute a single step
  const executeStep = async (
    step: TransactStep,
    stepDb: Adapter,
    deferredPermissionDirectorySyncs?: DeferredPermissionDirectorySync[],
    insideDatabaseTransaction = false,
  ) => {
    if (step.query) {
      // Create store for query
      const store = await DbDataStore.forQuery(
        stepDb,
        step.query,
        schema,
        namespace,
        undefined,
        logger,
        actorId,
      );
      // Execute query
      const queryResult = executeQuery(step.query, schema, store);
      return queryResult;
    } else if (step.mutation) {
      const stepIdempotencyStore =
        idempotencyStore.withDb?.(stepDb) ?? idempotencyStore;
      // Execute mutation
      const mutationResult = await executeMutation(
        step.mutation,
        schema,
        stepDb,
        stepIdempotencyStore,
        changeTracking,
        plugins,
        namespace,
        actorId,
        logger,
        undefined,
        insideDatabaseTransaction,
        insideDatabaseTransaction && deferredPermissionDirectorySyncs
          ? (sync) => deferredPermissionDirectorySyncs.push(sync)
          : undefined,
        prequeuedUnshareTasks.get(step.mutation),
      );
      // Expose the first error as a top-level `.error` property so that
      // transact callers can access result.results[i].error.code directly
      // (in addition to the standard errors[] array).
      if (!mutationResult.ok && mutationResult.errors?.length > 0) {
        const e = mutationResult.errors[0];
        return {
          ...mutationResult,
          error: { code: e.code, message: e.message, path: e.path },
        };
      }
      return mutationResult;
    }
    return null; // Should not happen due to validation
  };

  if (isAtomic && typeof (db as any).transaction === "function") {
    // REL-001: Atomic execution with DB transaction support
    const deferredPermissionDirectorySyncs: DeferredPermissionDirectorySync[] = [];
    const reconcilePermissionDirectoryAfterSettlement = async () => {
      await drainPrequeuedUnshareTasks();
      for (const sync of deferredPermissionDirectorySyncs) {
        try {
          await sync(db);
        } catch (error) {
          logger?.error("Permission directory reconciliation failed after settlement", {
            error: String(error),
            operation: "permission-directory",
          });
        }
      }
    };
    try {
      if (hasMutations) {
        // Initialize durable mutation storage on the outer adapter. Some
        // databases implicitly commit DDL, so table creation must never occur
        // after the atomic transaction has begun. Read-only transactions do
        // not need these tables and must not perform mutation-side DDL.
        await idempotencyStore.ensureReady?.();
        await changeTracking.ensureReady();
      }
      await (db as any).transaction(async (tx: Adapter) => {
        deferredPermissionDirectorySyncs.length = 0;
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const result = await executeStep(
            step,
            tx,
            deferredPermissionDirectorySyncs,
            true,
          );
          results.push(result);

          if (step.mutation) {
            const mutRes = result as MutationResult;
            if (!mutRes.ok) {
              // REL-003: Annotate all prior ok results as rolled back
              const failedStepIndex = i;
              for (let j = 0; j < failedStepIndex; j++) {
                const priorResult = results[j];
                if (priorResult && typeof priorResult === "object" && priorResult.ok) {
                  results[j] = {
                    ok: false,
                    rolledBack: true,
                    result: priorResult,
                  };
                }
              }
              // Rollback by throwing — the transaction callback will abort
              throw { __transactionFailed: true, stepIndex: failedStepIndex };
            }
          }
        }
      });
      await reconcilePermissionDirectoryAfterSettlement();
      // If we got here, commit happened — TV-REL-006: no rolledBack field
      return { ok: true, result: { ok: true, results } };
    } catch (error: any) {
      if (error && error.__transactionFailed) {
        // Unshare invalidates the external directory before deleting the
        // database grant. A rollback restores the database row, so reconcile
        // again against settled state to compensate the external deletion.
        await reconcilePermissionDirectoryAfterSettlement();
        // REL-003: Application-level step failure — results already annotated
        return {
          ok: true,
          result: {
            ok: false,
            results,
            error: {
              code: "TRANSACTION_ROLLED_BACK",
              message: `Step ${error.stepIndex} failed; all steps rolled back`,
            },
          },
        };
      }
      // REL-001: Check if the adapter's transaction method signals "not supported"
      // (e.g., memory adapter has transaction() but it throws "not supported")
      // In that case, fall through to sequential execution
      const msg = error?.message || "";
      if (msg.includes("not supported") || msg.includes("not implemented")) {
        results.length = 0; // Clear any partial results
        // Fall through to sequential execution below
      } else {
        await reconcilePermissionDirectoryAfterSettlement();
        // DB-level error (serialization, timeout, constraint) → INTERNAL error
        // NEVER fall through to sequential execution when adapter HAS transaction support
        return {
          ok: false,
          error: {
            code: "INTERNAL",
            message: `Transaction failed: ${msg || "unknown error"}`,
            details: { path: "$" },
          },
        };
      }
    }
  }

  // Sequential execution: ONLY when db.transaction is undefined (memory adapter)
  // REL-001: This branch is selected only when transactional adapters are unavailable
  // EXE-004: Query result cache within transaction scope (invalidated on mutation)
  const queryCache = new Map<string, any>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      let result: any;
      if (step.query) {
        // EXE-004: Check cache before executing query
        const cacheKey = JSON.stringify(step.query);
        if (queryCache.has(cacheKey)) {
          result = queryCache.get(cacheKey);
        } else {
          result = await executeStep(step, db);
          queryCache.set(cacheKey, result);
        }
      } else {
        result = await executeStep(step, db);
        // EXE-004: Invalidate query cache on mutation (resource-specific)
        if (step.mutation?.resource) {
          for (const key of queryCache.keys()) {
            if (key.includes(`"${step.mutation.resource}"`)) {
              queryCache.delete(key);
            }
          }
        }
      }
      results.push(result);

      if (isAtomic && step.mutation) {
        const mutRes = result as any;
        if (mutRes?.ok === false) {
          // Stop on first failure if atomic (even without rollback support we stop)
          await drainPrequeuedUnshareTasks();
          return { ok: true, result: { ok: false, results } };
        }
      }
    } catch (e: any) {
      // EXE-003: Include step context in error log
      logger?.error("Transact step error", {
        step: i,
        operation: step.mutation ? `mutation:${step.mutation.operation}` : "query",
        resource: step.mutation?.resource ?? step.query?.resource ?? "?",
        error: String(e?.message || e),
      });
      // Map to an error result
      const errorCode =
        typeof e?.code === "string" && e.code.length > 0 ? e.code : "INTERNAL";
      results.push({
        ok: false,
        error: { code: errorCode, message: e?.message || String(e) }
      });
      if (isAtomic) {
        await drainPrequeuedUnshareTasks();
        return { ok: true, result: { ok: false, results } };
      }
    }
  }

  // Check for any failures in results
  const anyFailed = results.some(r => {
    if (r == null) return false;
    if (typeof r === 'object' && 'ok' in r) return !r.ok;
    return false;
  });

  await drainPrequeuedUnshareTasks();
  return { ok: true, result: { ok: !anyFailed, results } };
}
