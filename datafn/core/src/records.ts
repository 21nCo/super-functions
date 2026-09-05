/**
 * Record read-path normalization helpers.
 */

import type { DatafnResourceSchema } from "./types.js";

/**
 * Removes `null` values for fields the schema declares as non-nullable.
 *
 * Storage can legitimately hold `null` for a non-nullable field: optional
 * fields map to nullable columns on SQL adapters, and `replace` clears
 * omitted fields with `null` because that is the only clear representation
 * every supported adapter persists (Drizzle and Prisma ignore `undefined`)
 * and the only one that survives JSON change tracking. Normalizing on read
 * exposes those fields as `undefined` again, matching `DatafnResourceRecord`.
 *
 * Fields with `nullable: true` keep their `null`, and fields not declared in
 * the resource schema (capability fields, `__ns`, ...) are left untouched.
 * Returns the original record when nothing had to be stripped.
 */
export function stripNullsForNonNullableFields(
  record: Record<string, unknown>,
  resource: DatafnResourceSchema | undefined,
): Record<string, unknown> {
  if (!resource) return record;
  let copy: Record<string, unknown> | undefined;
  for (const field of resource.fields) {
    if (field.nullable === true) continue;
    if (record[field.name] !== null) continue;
    copy ??= { ...record };
    delete copy[field.name];
  }
  return copy ?? record;
}
