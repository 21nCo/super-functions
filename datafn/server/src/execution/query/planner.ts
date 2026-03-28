/**
 * DFQL-to-Adapter conversion utilities (Phase 00)
 *
 * Converts DFQL filter expressions and sort terms to the @superfunctions/db
 * adapter's WhereClause[], OrderBy[], and limit/offset format.
 *
 * This module is intentionally a pure-function utility with no side effects.
 * QueryPlanner classification (FULL_PUSHDOWN / PARTIAL_PUSHDOWN / IN_MEMORY)
 * is added in Phase 01.
 */

import type { WhereClause, OrderBy } from "@superfunctions/db";
import { parseSortTerms } from "./sort.js";

// ---------------------------------------------------------------------------
// Extended types
// ---------------------------------------------------------------------------

/**
 * Extended operator type that includes DFQL operators not present in the
 * base WhereClause union (like, ilike). These are forwarded as-is to
 * adapters that support them.
 */
export type PushdownOperator =
  | WhereClause["operator"]
  | "like"
  | "ilike";

/**
 * A WhereClause-compatible object that allows the additional operators
 * supported by DFQL push-down (like, ilike).
 */
export interface PushdownWhereClause {
  field: string;
  operator: PushdownOperator;
  value: unknown;
  connector?: "AND" | "OR";
}

// ---------------------------------------------------------------------------
// Internal operator mapping
// ---------------------------------------------------------------------------

/** Maps DFQL operator strings (with and without $ prefix) to adapter operators. */
const DFQL_TO_ADAPTER_OP: Record<string, PushdownOperator | null> = {
  // $-prefixed DFQL operators
  $eq: "eq",
  $ne: "ne",
  $gt: "gt",
  $gte: "gte",
  $lt: "lt",
  $lte: "lte",
  $in: "in",
  $like: "like",
  $ilike: "ilike",
  // Non-$-prefixed equivalents
  eq: "eq",
  ne: "ne",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  in: "in",
  like: "like",
  ilike: "ilike",
  // Explicitly unpushable — relation quantifiers
  $any: null,
  $all: null,
  $none: null,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert DFQL filter expressions to PushdownWhereClause[].
 *
 * Returns `null` if any part of the filter cannot be pushed down to the
 * adapter. Callers MUST fall back to in-memory execution when null is returned.
 *
 * Non-pushable conditions:
 * - `$or` operator (no OR connector in WhereClause)
 * - Relation quantifiers (`$any` / `$all` / `$none`)
 * - Dot-path filter keys (e.g. `goal.label`)
 * - Unknown or otherwise un-mappable operators
 *
 * @param filters  DFQL filter object (e.g. `{ status: "active", priority: { $gte: 3 } }`)
 * @param resource Resource name (used for schema-based relation detection)
 * @param schema   DatafnSchema (optional; enables relation key detection)
 * @returns        Flat list of PushdownWhereClause, or null if not fully pushable
 */
export function convertDfqlFilters(
  filters: Record<string, unknown>,
  resource?: string,
  schema?: unknown,
): PushdownWhereClause[] | null {
  const result: PushdownWhereClause[] = [];

  for (const [key, value] of Object.entries(filters)) {
    // $or is not pushable — no OR connector in WhereClause
    if (key === "$or") return null;

    // $and: flatten all sub-filters into the result (AND is implied by multiple clauses)
    if (key === "$and") {
      if (!Array.isArray(value)) return null;
      for (const subFilter of value) {
        if (typeof subFilter !== "object" || subFilter === null) return null;
        const subResult = convertDfqlFilters(
          subFilter as Record<string, unknown>,
          resource,
          schema,
        );
        if (subResult === null) return null;
        result.push(...subResult);
      }
      continue;
    }

    // Dot-path filter keys (e.g. "goal.label") cannot be pushed down
    if (key.includes(".")) return null;

    // Relation quantifiers in the value object ($any/$all/$none)
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const ops = value as Record<string, unknown>;
      if ("$any" in ops || "$all" in ops || "$none" in ops) return null;
    }

    // Schema-based relation key detection
    if (schema != null && isRelationKey(key, resource, schema)) {
      return null;
    }

    // Shorthand equality: { status: "active" } → eq
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      result.push({ field: key, operator: "eq", value });
      continue;
    }

    // Operator object: { $gte: 3 }, { $ne: "done" }, etc.
    const ops = value as Record<string, unknown>;
    for (const [op, opVal] of Object.entries(ops)) {
      if (!(op in DFQL_TO_ADAPTER_OP)) {
        // Unknown operator — cannot push down
        return null;
      }
      const adapterOp = DFQL_TO_ADAPTER_OP[op];
      if (adapterOp === null) {
        // Explicitly unpushable
        return null;
      }
      result.push({ field: key, operator: adapterOp, value: opVal });
    }
  }

  return result;
}

/**
 * Partial filter extraction for IN_MEMORY queries (SCALE-004).
 *
 * Separates base-field filters that CAN be pushed to the adapter from
 * relation/complex filters that MUST remain in-memory. This enables
 * pre-filtering at the DB level even for IN_MEMORY-classified queries,
 * reducing the in-memory working set.
 *
 * @param filters  DFQL filter object
 * @param resource Resource name
 * @param schema   DatafnSchema (for relation key detection)
 * @returns        `{ pushable, remaining }` — remaining is null if everything was pushable
 */
export function extractPushableFilters(
  filters: Record<string, unknown>,
  resource?: string,
  schema?: unknown,
): { pushable: PushdownWhereClause[]; remaining: Record<string, unknown> | null } {
  const pushable: PushdownWhereClause[] = [];
  const remaining: Record<string, unknown> = {};
  let hasRemaining = false;

  for (const [key, value] of Object.entries(filters)) {
    // $and: try to split sub-filters
    if (key === "$and") {
      if (!Array.isArray(value)) {
        remaining[key] = value;
        hasRemaining = true;
        continue;
      }
      const andPushable: PushdownWhereClause[] = [];
      const andRemaining: Record<string, unknown>[] = [];
      for (const subFilter of value) {
        if (typeof subFilter !== "object" || subFilter === null) {
          andRemaining.push(subFilter as Record<string, unknown>);
          continue;
        }
        const sub = subFilter as Record<string, unknown>;
        const subResult = convertDfqlFilters(sub, resource, schema);
        if (subResult !== null) {
          andPushable.push(...subResult);
        } else {
          andRemaining.push(sub);
        }
      }
      pushable.push(...andPushable);
      if (andRemaining.length > 0) {
        remaining["$and"] = andRemaining;
        hasRemaining = true;
      }
      continue;
    }

    // $or is always remaining
    if (key === "$or") {
      remaining[key] = value;
      hasRemaining = true;
      continue;
    }

    // Dot-path filters are always remaining
    if (key.includes(".")) {
      remaining[key] = value;
      hasRemaining = true;
      continue;
    }

    // Relation quantifiers ($any/$all/$none) are always remaining
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const ops = value as Record<string, unknown>;
      if ("$any" in ops || "$all" in ops || "$none" in ops) {
        remaining[key] = value;
        hasRemaining = true;
        continue;
      }
    }

    // Schema-based relation key detection
    if (schema != null && isRelationKey(key, resource, schema)) {
      remaining[key] = value;
      hasRemaining = true;
      continue;
    }

    // Attempt single-filter push
    const singleResult = convertSingleFilter(key, value);
    if (singleResult !== null) {
      pushable.push(...singleResult);
    } else {
      remaining[key] = value;
      hasRemaining = true;
    }
  }

  return {
    pushable,
    remaining: hasRemaining ? remaining : null,
  };
}

/**
 * Convert DFQL sort terms to OrderBy[] format compatible with the adapter's
 * `findMany.orderBy` parameter.
 *
 * Delegates to the server's `parseSortTerms` (which adds the `id:asc` default
 * when sort is undefined or empty). `SortTerm` is structurally identical to
 * `OrderBy`, so the cast is safe.
 *
 * @param sort  Optional DFQL sort array (e.g. `["name:asc", "-priority", "id"]`)
 * @returns     OrderBy[] — never empty (defaults to `[{ field: "id", direction: "asc" }]`)
 */
export function convertDfqlSort(sort?: string[]): OrderBy[] {
  // parseSortTerms from sort.ts already applies the id:asc default.
  // SortTerm = { field: string; direction: "asc" | "desc" } is structurally
  // identical to OrderBy, so the cast is safe.
  return parseSortTerms(sort) as OrderBy[];
}

// ---------------------------------------------------------------------------
// QueryPlanner classification (Phase 01)
// ---------------------------------------------------------------------------

/**
 * The three execution strategies a DFQL query can be classified into.
 *
 * - FULL_PUSHDOWN  : No relation selects, no relation filters, no groupBy, no search,
 *                   no HTREE tokens. Entire query (filters, sort, limit, offset) is
 *                   delegated to the adapter's findMany. DbDataStore is NOT used.
 * - PARTIAL_PUSHDOWN: Has relation select tokens (e.g. `tags.*`) but no relation-based
 *                   filters. Base resource records are fetched via push-down; related
 *                   resources are loaded on-demand for materialization.
 * - IN_MEMORY       : Has relation-based filters (`$any`/`$all`/`$none`), groupBy,
 *                   search, having, or HTREE tokens. Falls back to DbDataStore
 *                   pre-loading with optional base-field pre-filtering (SCALE-004).
 */
export type QueryStrategy = "FULL_PUSHDOWN" | "PARTIAL_PUSHDOWN" | "IN_MEMORY";

/**
 * Classify a DFQL query into an execution strategy.
 *
 * Rules (evaluated in order — first match wins):
 *   1. `search` present                          → IN_MEMORY
 *   2. `groupBy` or `having` present             → IN_MEMORY
 *   3. Filters contain `$any`/`$all`/`$none`
 *      or dot-path keys (e.g. "goal.label")      → IN_MEMORY
 *   4. Select contains HTREE token
 *      (`parent.*`, `children.*`, `children.**`) → IN_MEMORY
 *   5. Select contains a token with `.` notation
 *      (e.g. `tags.*`, `category.*`,
 *       `tasks.tags.*`)                          → PARTIAL_PUSHDOWN
 *   6. Select contains a bare relation name
 *      (ids-only, e.g. `tags` when schema knows
 *       `tags` is a relation)                    → PARTIAL_PUSHDOWN
 *   7. Otherwise                                 → FULL_PUSHDOWN
 *
 * The function is a pure classifier — it never executes queries.
 *
 * @param query  DFQL query object (or a partial shape for classification)
 * @param schema DatafnSchema (optional; enables bare-relation-name detection)
 * @returns      QueryStrategy
 */
export function classifyQuery(
  query: Record<string, unknown>,
  schema?: unknown,
): QueryStrategy {
  // --- Rule 1: search ---
  if (query.search) return "IN_MEMORY";

  // --- Rule 2: groupBy / having ---
  if (query.groupBy || query.having) return "IN_MEMORY";

  // --- Rule 3: IN_MEMORY filter patterns ---
  if (query.filters != null && typeof query.filters === "object") {
    if (hasInMemoryFilterPatterns(query.filters as Record<string, unknown>)) {
      return "IN_MEMORY";
    }
  }

  // --- Rules 4-6: select token analysis ---
  if (Array.isArray(query.select)) {
    const relationNames = buildRelationNames(
      query.resource as string | undefined,
      schema,
    );

    for (const token of query.select as unknown[]) {
      if (typeof token !== "string") continue;

      // Bare wildcard selects all base fields — not a relation token
      if (token === "*") continue;

      const parts = token.split(".");
      const baseName = parts[0];

      // Rule 4: HTREE tokens → IN_MEMORY
      if (baseName === "parent" || baseName === "children") return "IN_MEMORY";

      // Rule 5: dot-notation token (rel.*, rel.#, tasks.tags.*, …) → PARTIAL_PUSHDOWN
      // In validated DFQL, any token with a dot whose base is not a system keyword
      // is a relation expansion token.
      if (parts.length > 1) return "PARTIAL_PUSHDOWN";

      // Rule 6: bare relation name (ids-only, e.g. `tags`) → PARTIAL_PUSHDOWN
      if (relationNames.has(baseName)) return "PARTIAL_PUSHDOWN";
    }
  }

  // --- Default ---
  return "FULL_PUSHDOWN";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the filter object contains patterns that require in-memory
 * execution: relation quantifiers ($any/$all/$none) or dot-path keys.
 * Recursively checks $and/$or sub-arrays.
 */
function hasInMemoryFilterPatterns(
  filters: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (key === "$or") return true;

    // Dot-path key (e.g. "goal.label") — requires relation traversal
    if (key.includes(".")) return true;

    // Operator object: check for non-pushable operators
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      // Relation quantifiers ($any/$all/$none) → always IN_MEMORY
      if ("$any" in ops || "$all" in ops || "$none" in ops) return true;
      // Any operator not in DFQL_TO_ADAPTER_OP (or mapped to null) → IN_MEMORY
      // e.g. between, not_ilike, is_empty, is_null, before, after, etc.
      for (const op of Object.keys(ops)) {
        if (!(op in DFQL_TO_ADAPTER_OP) || DFQL_TO_ADAPTER_OP[op] === null) {
          return true;
        }
      }
    }

    // Recurse into $and / $or sub-filters
    if ((key === "$and" || key === "$or") && Array.isArray(value)) {
      for (const sub of value) {
        if (
          typeof sub === "object" &&
          sub !== null &&
          !Array.isArray(sub) &&
          hasInMemoryFilterPatterns(sub as Record<string, unknown>)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Build the set of relation names (forward + inverse) for a given resource
 * from the schema. Used for bare-relation-name detection in select tokens.
 */
function buildRelationNames(
  resource: string | undefined,
  schema: unknown,
): Set<string> {
  const names = new Set<string>();
  if (!resource) return names;
  const s = schema as
    | { relations?: Array<{ from: string; to: string; relation: string; inverse?: string }> }
    | null
    | undefined;
  if (!s?.relations) return names;
  for (const rel of s.relations) {
    if (rel.from === resource && rel.relation) names.add(rel.relation);
    if (rel.to === resource && rel.inverse) names.add(rel.inverse);
  }
  return names;
}

/**
 * Convert a single key-value filter pair to PushdownWhereClause[].
 * Returns null if the value contains unpushable operators.
 */
function convertSingleFilter(
  key: string,
  value: unknown,
): PushdownWhereClause[] | null {
  // Shorthand equality
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return [{ field: key, operator: "eq", value }];
  }

  const ops = value as Record<string, unknown>;
  const result: PushdownWhereClause[] = [];

  for (const [op, opVal] of Object.entries(ops)) {
    if (!(op in DFQL_TO_ADAPTER_OP)) return null;
    const adapterOp = DFQL_TO_ADAPTER_OP[op];
    if (adapterOp === null) return null;
    result.push({ field: key, operator: adapterOp, value: opVal });
  }

  return result.length > 0 ? result : null;
}

/**
 * Checks whether `key` refers to a relation name in the schema for `resource`.
 */
function isRelationKey(
  key: string,
  resource: string | undefined,
  schema: unknown,
): boolean {
  const s = schema as { relations?: Array<{ from: string; to: string; relation: string; inverse?: string }> };
  if (!s?.relations || !resource) return false;
  return s.relations.some(
    (r) =>
      (r.from === resource && r.relation === key) ||
      (r.to === resource && r.inverse === key),
  );
}
