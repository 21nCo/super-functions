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

  // SRV-012: Step limit check moved to route handler; skip duplicate check here
  // (createTransactHandler validates before calling executeTransaction)

  const results: Array<any> = [];
  const changeTracking = new ChangeTrackingService(db, namespace, sequenceStore);

  // Helper to execute a single step
  const executeStep = async (step: TransactStep, stepDb: Adapter) => {
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
      // Execute mutation
      const mutationResult = await executeMutation(
        step.mutation,
        schema,
        stepDb,
        idempotencyStore,
        changeTracking,
        plugins,
        namespace,
        actorId,
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
    try {
      await (db as any).transaction(async (tx: Adapter) => {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const result = await executeStep(step, tx);
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
      // If we got here, commit happened — TV-REL-006: no rolledBack field
      return { ok: true, result: { ok: true, results } };
    } catch (error: any) {
      if (error && error.__transactionFailed) {
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
      if (isAtomic) return { ok: true, result: { ok: false, results } };
    }
  }

  // Check for any failures in results
  const anyFailed = results.some(r => {
    if (r == null) return false;
    if (typeof r === 'object' && 'ok' in r) return !r.ok;
    return false;
  });

  return { ok: true, result: { ok: !anyFailed, results } };
}
