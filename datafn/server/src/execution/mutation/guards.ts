import type { Adapter } from "@superfunctions/db";
import type { DatafnSchema } from "@datafn/core";
import { evaluateFilter } from "../query/filters.js";
import { GuardDataStore } from "./guard-store.js";

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
): Promise<{ match: boolean }> {
  // Fetch current record
  let record: Record<string, unknown> | null = null;
  try {
    record = await adapter.findOne({
      model: resource,
      where: [{ field: "id", operator: "eq", value: id }],
      namespace: "datafn",
    });
  } catch (error) {
    // If error (e.g. not found if adapter throws, or DB error), treat as not found/no match
    // Spec says "Guard on non-existent records (always fails)"
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