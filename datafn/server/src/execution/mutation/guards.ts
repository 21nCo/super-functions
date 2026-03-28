import type { Adapter } from "@superfunctions/db";
import type { DatafnSchema } from "../../core-types.js";
import { evaluateFilter } from "../query/filters.js";
import { GuardDataStore } from "./guard-store.js";
import type { DatafnLogger } from "../../logger.js";

/**
 * Evaluate an if guard against a record
 * Returns { match: true } if the guard passes (mutation should proceed)
 * Returns { match: false } if the guard fails or record not found
 */
export async function evaluateGuard(
  adapter: Adapter,
  resource: string,
  id: string,
  guard: Record<string, unknown>,
  schema: DatafnSchema,
  namespace: string,
  logger?: DatafnLogger,
): Promise<{ match: boolean }> {
  // Fetch current record
  let record: Record<string, unknown> | null = null;
  try {
    record = await adapter.findOne({
      model: resource,
      where: [{ field: "id", operator: "eq", value: id }],
      namespace,
    });
  } catch (error) {
    // LOW-014: This is a DB/adapter error (not a "not found" — adapters return null for that).
    // Log for observability and fail-closed (guard fails = mutation does not proceed).
    logger?.error("Guard evaluation DB error", { error: String(error), operation: "evaluateGuard", resource, id });
    return { match: false };
  }

  if (!record) {
    return { match: false };
  }

  // Create store with this record
  const store = new GuardDataStore(resource, record);

  // Evaluate filter
  // evaluateFilter returns boolean
  const match = evaluateFilter(record, guard, resource, schema, store);

  return { match };
}

/**
 * DI-002: Evaluate a guard within a transaction scope when the adapter supports it.
 *
 * When a transaction is available, the guard read and the subsequent mutation
 * MUST occur within the SAME transaction to prevent TOCTOU races.
 *
 * Usage: call this function with the adapter that will be used for the mutation.
 * If the adapter is already a transaction adapter (e.g. passed from transact.ts),
 * the guard evaluation is automatically in the correct scope.
 *
 * For callers outside a transaction (e.g. push.ts → execute.ts), pass the outer
 * adapter. The executeMutation wrapper in execute.ts will ensure both guard and
 * mutation run inside a transaction when db.transaction() is available.
 */
export { evaluateGuard as evaluateGuardInTransactionScope };
