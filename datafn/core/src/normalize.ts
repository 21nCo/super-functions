/**
 * DFQL Normalization
 *
 * Produces canonical JSON for DFQL objects to enable stable cache keys
 * and deterministic comparisons.
 */

/**
 * Recursively normalizes a value:
 * - Sorts object keys alphabetically
 * - Removes undefined values
 * - Preserves arrays, primitives, and null as-is
 */
export function normalizeDfql(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value === null ? null : undefined;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeDfql(item));
  }

  // Object: sort keys, remove undefined values, recursively normalize
  const normalized: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const key of keys) {
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      normalized[key] = normalizeDfql(val);
    }
  }

  return normalized;
}

/**
 * Returns a stable string key for a  DFQL value.
 * This is the canonical form used for caching and comparison.
 */
export function dfqlKey(value: unknown): string {
  return JSON.stringify(normalizeDfql(value));
}
