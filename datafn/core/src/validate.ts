/**
 * Shared validation primitives for DataFn.
 * - Prototype pollution key checking (recursive)
 * - Field value type validation against schema types
 */

import { isDatafnE2eeEnvelope } from "./e2ee.js";

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * ISO 8601 date-time regex (simplified — covers common formats).
 * Matches: YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ssZ, YYYY-MM-DDTHH:mm:ss±HH:MM
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Recursively checks a value for prototype pollution keys.
 * Returns `{ ok: true }` if clean, or `{ ok: false, key }` with the first offending key found.
 */
export function checkPrototypePollution(obj: unknown): { ok: boolean; key?: string } {
  const visited = new WeakSet<object>();

  const check = (value: unknown): { ok: boolean; key?: string } => {
    if (typeof value !== "object" || value === null) {
      return { ok: true };
    }

    const objectValue = value as object;
    if (visited.has(objectValue)) {
      return { ok: true };
    }
    visited.add(objectValue);

    if (Array.isArray(value)) {
      for (const element of value) {
        const nestedResult = check(element);
        if (!nestedResult.ok) return nestedResult;
      }
      return { ok: true };
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (DISALLOWED_KEYS.has(key)) {
        return { ok: false, key };
      }
      const nestedResult = check((value as Record<string, unknown>)[key]);
      if (!nestedResult.ok) {
        return nestedResult;
      }
    }

    return { ok: true };
  };

  return check(obj);
}

/**
 * Validates a field value against its declared schema type.
 * Returns `{ ok: true }` if valid, or `{ ok: false, error }` with a descriptive message.
 */
export function validateFieldValue(
  schemaType: string,
  value: unknown,
  nullable: boolean,
): { ok: boolean; error?: string } {
  if (isDatafnE2eeEnvelope(value)) {
    return { ok: true };
  }

  // Null handling
  if (value === null) {
    if (nullable) return { ok: true };
    return { ok: false, error: `expected ${schemaType}, got null` };
  }

  switch (schemaType) {
    case "string":
      if (typeof value !== "string") {
        return { ok: false, error: `expected string, got ${typeof value}` };
      }
      return { ok: true };

    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        const actual = typeof value === "number" ? "NaN" : typeof value;
        return { ok: false, error: `expected number, got ${actual}` };
      }
      return { ok: true };

    case "boolean":
      if (typeof value !== "boolean") {
        return { ok: false, error: `expected boolean, got ${typeof value}` };
      }
      return { ok: true };

    case "date":
      // Accept ISO 8601 strings or epoch numbers
      if (typeof value === "string") {
        if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
          return { ok: false, error: `expected date (ISO 8601 string or epoch number), got invalid date string` };
        }
        return { ok: true };
      }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) {
          return { ok: false, error: `expected date (ISO 8601 string or epoch number), got invalid epoch number` };
        }
        return { ok: true };
      }
      return { ok: false, error: `expected date (ISO 8601 string or epoch number), got ${typeof value}` };

    case "object":
      // Plain object only — not null (already handled), not array
      if (typeof value !== "object" || Array.isArray(value)) {
        const actual = Array.isArray(value) ? "array" : typeof value;
        return { ok: false, error: `expected object, got ${actual}` };
      }
      return { ok: true };

    case "array":
      if (!Array.isArray(value)) {
        return { ok: false, error: `expected array, got ${typeof value}` };
      }
      return { ok: true };

    case "file":
      if (typeof value !== "string") {
        return { ok: false, error: `expected file (string), got ${typeof value}` };
      }
      return { ok: true };

    case "json":
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return { ok: true };
      }
      if (typeof value === "object") {
        return { ok: true }; // object or array — both valid JSON
      }
      return { ok: false, error: `expected json, got ${typeof value}` };

    default:
      return { ok: false, error: `unknown schema type: ${schemaType}` };
  }
}
