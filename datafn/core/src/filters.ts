import type { DatafnError } from "./errors.js";

/** Map non-$-prefixed operator names to core's $-prefixed equivalents. */
export const OP_REMAP: Record<string, string> = {
  eq: "$eq", ne: "$ne", gt: "$gt", gte: "$gte", lt: "$lt", lte: "$lte",
  in: "$in", not_in: "$nin",
  contains: "$contains", startsWith: "$startsWith", endsWith: "$endsWith",
  like: "$like", ilike: "$ilike", not_like: "$not_like", not_ilike: "$not_ilike",
  is_null: "$is_null", is_not_null: "$is_not_null",
  is_empty: "$is_empty", is_not_empty: "$is_not_empty",
  before: "$before", after: "$after", between: "$between", not_between: "$not_between",
};

const DISALLOWED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function createSafeRecord(): Record<string, unknown> {
  return Object.create(null) as Record<string, unknown>;
}

function assertSafeKey(key: string, context: string): void {
  if (DISALLOWED_KEYS.has(key)) {
    dfqlError("DFQL_INVALID", `Unsafe ${context}: ${key}`);
  }
}

/** Recursively remap non-$-prefixed operator names to core's $-prefixed form. */
export function normalizeFilterOps(filters: Record<string, unknown>): Record<string, unknown> {
  const out = createSafeRecord();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    assertSafeKey(key, "filter key");
    if ((key === "$and" || key === "$or") && Array.isArray(value)) {
      out[key] = (value as Record<string, unknown>[]).map(normalizeFilterOps);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      const normalized = createSafeRecord();
      for (const [op, opVal] of Object.entries(ops)) {
        if (opVal === undefined) continue;
        const mappedOp = OP_REMAP[op] ?? op;
        assertSafeKey(mappedOp, "filter operator");
        normalized[mappedOp] = opVal;
      }
      if (Object.keys(normalized).length > 0) {
        out[key] = normalized;
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface FilterEvalOptions {
  resolveRelation?: (resource: string, recordId: string, relationName: string) => Record<string, unknown>[];
  resource?: string;
}

function dfqlError(code: DatafnError["code"], message: string): never {
  const err: DatafnError & { [k: string]: unknown } = { code, message };
  throw err;
}

/**
 * Match a SQL-like LIKE pattern (% = any sequence, _ = single char) without regex backtracking.
 */
function likeMatches(pattern: string, candidate: string, caseInsensitive: boolean): boolean {
  const source = caseInsensitive ? pattern.toLowerCase() : pattern;
  const target = caseInsensitive ? candidate.toLowerCase() : candidate;

  let patternIndex = 0;
  let targetIndex = 0;
  let wildcardIndex = -1;
  let matchIndex = 0;

  while (targetIndex < target.length) {
    const token = source[patternIndex];
    if (token === "%") {
      wildcardIndex = patternIndex;
      patternIndex += 1;
      matchIndex = targetIndex;
      continue;
    }
    if (token === "_" || token === target[targetIndex]) {
      patternIndex += 1;
      targetIndex += 1;
      continue;
    }
    if (wildcardIndex !== -1) {
      patternIndex = wildcardIndex + 1;
      matchIndex += 1;
      targetIndex = matchIndex;
      continue;
    }
    return false;
  }

  while (source[patternIndex] === "%") {
    patternIndex += 1;
  }

  return patternIndex === source.length;
}

/**
 * Resolve a dot-path on a plain object. Returns `undefined` if path cannot be resolved.
 */
function resolvePath(record: Record<string, unknown>, parts: string[]): unknown {
  let current: unknown = record;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Evaluate a single field value against an operator object.
 * All operators must be $-prefixed.
 */
function evaluateOperators(fieldValue: unknown, ops: Record<string, unknown>): boolean {
  for (const [op, opVal] of Object.entries(ops)) {
    switch (op) {
      case "$eq":
        if (fieldValue !== opVal) return false;
        break;
      case "$ne":
        if (fieldValue === opVal) return false;
        break;
      case "$gt":
        if (!((fieldValue as number) > (opVal as number))) return false;
        break;
      case "$gte":
        if (!((fieldValue as number) >= (opVal as number))) return false;
        break;
      case "$lt":
        if (!((fieldValue as number) < (opVal as number))) return false;
        break;
      case "$lte":
        if (!((fieldValue as number) <= (opVal as number))) return false;
        break;
      case "$in":
        if (!Array.isArray(opVal)) dfqlError("DFQL_INVALID", `$in requires array`);
        if (!(opVal as unknown[]).includes(fieldValue)) return false;
        break;
      case "$nin":
        if (!Array.isArray(opVal)) dfqlError("DFQL_INVALID", `$nin requires array`);
        if ((opVal as unknown[]).includes(fieldValue)) return false;
        break;
      case "$contains":
        if (typeof fieldValue === "string") {
          if (!(fieldValue as string).includes(opVal as string)) return false;
        } else if (Array.isArray(fieldValue)) {
          if (!(fieldValue as unknown[]).includes(opVal)) return false;
        } else {
          return false;
        }
        break;
      case "$startsWith":
        if (typeof fieldValue !== "string") return false;
        if (!(fieldValue as string).startsWith(opVal as string)) return false;
        break;
      case "$endsWith":
        if (typeof fieldValue !== "string") return false;
        if (!(fieldValue as string).endsWith(opVal as string)) return false;
        break;
      case "$like":
        if (typeof fieldValue !== "string" || typeof opVal !== "string") return false;
        if (!likeMatches(opVal, fieldValue, false)) return false;
        break;
      case "$ilike":
        if (typeof fieldValue !== "string" || typeof opVal !== "string") return false;
        if (!likeMatches(opVal, fieldValue, true)) return false;
        break;
      case "$not_like":
        if (typeof opVal !== "string") return false;
        if (typeof fieldValue !== "string") break;
        if (likeMatches(opVal, fieldValue, false)) return false;
        break;
      case "$not_ilike":
        if (typeof opVal !== "string") return false;
        if (typeof fieldValue !== "string") break;
        if (likeMatches(opVal, fieldValue, true)) return false;
        break;
      case "$is_null":
        if (opVal === true && fieldValue !== null && fieldValue !== undefined) return false;
        if (opVal === false && (fieldValue === null || fieldValue === undefined)) return false;
        break;
      case "$is_not_null":
        if (opVal === true && (fieldValue === null || fieldValue === undefined)) return false;
        if (opVal === false && fieldValue !== null && fieldValue !== undefined) return false;
        break;
      case "$is_empty": {
        const isEmpty =
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === "" ||
          (Array.isArray(fieldValue) && (fieldValue as unknown[]).length === 0);
        if (opVal === true && !isEmpty) return false;
        if (opVal === false && isEmpty) return false;
        break;
      }
      case "$is_not_empty": {
        const isEmpty =
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === "" ||
          (Array.isArray(fieldValue) && (fieldValue as unknown[]).length === 0);
        if (opVal === true && isEmpty) return false;
        if (opVal === false && !isEmpty) return false;
        break;
      }
      case "$before":
        if (!((fieldValue as number | string) < (opVal as number | string))) return false;
        break;
      case "$after":
        if (!((fieldValue as number | string) > (opVal as number | string))) return false;
        break;
      case "$between": {
        if (!Array.isArray(opVal) || (opVal as unknown[]).length !== 2)
          dfqlError("DFQL_INVALID", `$between requires [low, high] array`);
        const [low, high] = opVal as [unknown, unknown];
        const fv = fieldValue as number;
        if (!((fv as number) >= (low as number) && (fv as number) <= (high as number))) return false;
        break;
      }
      case "$not_between": {
        if (!Array.isArray(opVal) || (opVal as unknown[]).length !== 2)
          dfqlError("DFQL_INVALID", `$not_between requires [low, high] array`);
        const [low, high] = opVal as [unknown, unknown];
        const fv = fieldValue as number;
        if (!((fv as number) < (low as number) || (fv as number) > (high as number))) return false;
        break;
      }
      default:
        dfqlError("DFQL_UNSUPPORTED", `Unsupported DFQL operator: ${op}`);
    }
  }
  return true;
}

/** CLI-009: Maximum allowed nesting depth for evaluateFilter recursion. */
const MAX_FILTER_DEPTH = 10;

/**
 * Evaluate a DFQL filter against a single record.
 * Supports: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $contains, $startsWith, $endsWith,
 *           $like, $ilike, $not_like, $not_ilike, $is_null, $is_not_null, $is_empty, $is_not_empty,
 *           $before, $after, $between, $not_between, $and, $or.
 * Returns true if the record matches all filter conditions.
 */
export function evaluateFilter(
  record: Record<string, unknown>,
  filters: Record<string, unknown>,
  opts?: FilterEvalOptions,
  _depth = 0,
): boolean {
  // CLI-009: Guard against malicious deeply-nested filters
  if (_depth > MAX_FILTER_DEPTH) {
    dfqlError("DFQL_INVALID", `Filter nesting depth exceeds maximum of ${MAX_FILTER_DEPTH}`);
  }

  for (const [key, value] of Object.entries(filters)) {
    if (key === "$and") {
      if (!Array.isArray(value)) dfqlError("DFQL_INVALID", "$and must be array");
      for (const sub of value as Record<string, unknown>[]) {
        if (!evaluateFilter(record, sub, opts, _depth + 1)) return false;
      }
      continue;
    }

    if (key === "$or") {
      if (!Array.isArray(value)) dfqlError("DFQL_INVALID", "$or must be array");
      let matched = false;
      for (const sub of value as Record<string, unknown>[]) {
        if (evaluateFilter(record, sub, opts, _depth + 1)) { matched = true; break; }
      }
      if (!matched) return false;
      continue;
    }

    // Dot-path traversal
    if (key.includes(".")) {
      const parts = key.split(".");
      const firstSeg = parts[0];
      const firstVal = record[firstSeg];

      if (firstVal !== undefined && firstVal !== null) {
        // Nested object path: traverse normally
        const resolved = resolvePath(record, parts);
        if (!evaluateFieldValue(resolved, value)) return false;
      } else if (opts?.resolveRelation) {
        // Possibly a relation path: call resolver
        const resource = opts.resource ?? "";
        const recordId = record.id as string;
        const related = opts.resolveRelation(resource, recordId, firstSeg);
        if (related.length === 0) return false;
        const subPath = parts.slice(1).join(".");
        assertSafeKey(subPath, "relation filter path");
        const subFilter = createSafeRecord();
        subFilter[subPath] = value;
        const anyMatch = related.some((r) =>
          evaluateFilter(r, subFilter, opts, _depth + 1),
        );
        if (!anyMatch) return false;
      } else {
        // No resolver: path not found on record → false
        return false;
      }
      continue;
    }

    // Direct field filter
    const fieldValue = record[key];
    if (!evaluateFieldValue(fieldValue, value)) return false;
  }
  return true;
}

function evaluateFieldValue(fieldValue: unknown, value: unknown): boolean {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return evaluateOperators(fieldValue, value as Record<string, unknown>);
  }
  // Direct equality
  return fieldValue === value;
}
