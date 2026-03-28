/**
 * DFQL Normalization
 *
 * Produces canonical JSON for DFQL objects to enable stable cache keys
 * and deterministic comparisons.
 */

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function createSafeRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Recursively normalizes a value:
 * - Sorts object keys alphabetically
 * - Removes undefined values
 * - Preserves arrays, primitives, and null as-is
 *
 * LOW-023: undefined vs null semantics:
 * - `null` is preserved as `null` (explicit absence of a value — serialisable to JSON)
 * - `undefined` is stripped from the output (non-serialisable; treated as "not set")
 * This mirrors JSON.stringify behavior and ensures stable cache keys across environments.
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

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }

  if (!isPlainObject(value)) {
    const toJSON = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === "function") {
      return normalizeDfql(toJSON.call(value));
    }
    return value;
  }

  // Object: sort keys, remove undefined values, recursively normalize
  const normalized = createSafeRecord();
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const key of keys) {
    if (DISALLOWED_KEYS.has(key)) {
      continue;
    }
    const val = (value as Record<string, unknown>)[key];
    if (val !== undefined) {
      normalized[key] = normalizeDfql(val);
    }
  }

  return normalized;
}

/**
 * Returns a stable string key for a DFQL value.
 * This is the canonical form used for caching and comparison.
 */
export function dfqlKey(value: unknown): string {
  return JSON.stringify(normalizeDfql(value)) ?? "undefined";
}
