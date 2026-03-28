/**
 * Shared join store key utilities.
 *
 * These functions provide the single canonical derivation of join store names
 * used by both client and server across all sync operations.
 */

import type { DatafnRelationSchema } from "./types.js";

function getRelationKeyName(relation: DatafnRelationSchema, to: string): string {
  return relation.relation ?? relation.inverse ?? relation.joinTable ?? `to_${to}`;
}

/**
 * Derive the logical join store key used by clients and change tracking.
 * Format: join_{fromResource}_{relationName}_{toResource}
 */
export function getJoinStoreKey(
  from: string,
  relation: string,
  to: string,
): string {
  return `join_${from}_${relation}_${to}`;
}

/**
 * Derive the actual DB table name for a join table.
 * Format: __datafn_join_{fromResource}_{relationName}
 * Can be overridden by relation.joinTable in schema.
 */
export function getJoinTableName(
  from: string,
  relation: string,
  joinTable?: string,
): string {
  return joinTable || `__datafn_join_${from}_${relation}`;
}

/**
 * Enumerate all logical join store keys for a schema's many-many relations.
 * Handles multi-resource from/to arrays.
 * Useful for building cursor maps, reconcile payloads, and similar operations.
 *
 * @param relations - Array of relation schema definitions
 * @param resourceFilter - Optional set of resource names; if provided, only
 *   joins whose `from` resource is in this set are included.
 */
export function enumerateJoinStoreKeys(
  relations: DatafnRelationSchema[],
  resourceFilter?: Set<string>,
): string[] {
  const keys: string[] = [];
  for (const rel of relations) {
    if (rel.type !== "many-many") continue;
    const froms = Array.isArray(rel.from) ? rel.from : [rel.from];
    const tos = Array.isArray(rel.to) ? rel.to : [rel.to];
    for (const f of froms) {
      if (resourceFilter && !resourceFilter.has(f)) continue;
      for (const t of tos) {
        keys.push(getJoinStoreKey(f, getRelationKeyName(rel, t), t));
      }
    }
  }
  return keys;
}
