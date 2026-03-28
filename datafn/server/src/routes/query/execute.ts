/**
 * FIX-SRV-005: Query execution bridge module
 * Extracted from routes/query.ts — single responsibility: strategy classification + data store + execution
 */

import type { DatafnSchema } from "../../core-types.js";
import type { Adapter, WhereClause } from "@superfunctions/db";
import type { SearchProvider } from "../../search-provider.js";
import type { DatafnLogger } from "../../logger.js";
import { executeQuery } from "../../execution/query/execute.js";
import { DbDataStore } from "../../execution/db-store.js";
import { classifyQuery, extractPushableFilters } from "../../execution/query/planner.js";
import { executePushdownQuery, executePartialPushdownQuery } from "../../execution/query/pushdown.js";
import { executeSearchQuery } from "../../execution/query/search.js";
import { DatafnExecutionError } from "../../execution/errors.js";
import {
  executeDbNativeResourceSearch,
  hasDbNativeSearchSupport,
  NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
} from "../../execution/search/native-fallback.js";
import type { ExecutionTimer } from "../../middleware/timing.js";

/**
 * Execute a single DFQL query using the optimal strategy.
 * Returns the query result (data + nextCursor + count).
 */
export async function executeSingleQuery(
  query: Record<string, unknown>,
  schema: DatafnSchema,
  db: Adapter,
  namespace: string,
  actorId: string | undefined,
  searchProvider: SearchProvider | undefined,
  logger?: DatafnLogger,
  timer?: ExecutionTimer | null,
): Promise<unknown> {
  const strategy = classifyQuery(query, schema);

  timer?.startPhase("fetch");

  if (strategy === "FULL_PUSHDOWN") {
    return executePushdownQuery(query as any, schema, db, namespace);
  }

  if (strategy === "PARTIAL_PUSHDOWN") {
    return executePartialPushdownQuery(
      query as any,
      schema,
      db,
      namespace,
      actorId,
    );
  }

  // IN_MEMORY: load records via DbDataStore.
  // Extract base-field (pushable) filters to pre-filter the primary
  // resource at the adapter level before in-memory evaluation (SCALE-004).
  // Skip pre-filtering for HTREE queries — HTREE expansion needs all
  // ancestor/descendant records, not just the one matching the filter.
  const selectHasHtree = Array.isArray(query.select) &&
    (query.select as string[]).some(
      (t: string) => typeof t === "string" && (t.startsWith("parent.") || t.startsWith("children."))
    );
  let preFilterWhere: WhereClause[] | undefined;
  if (!selectHasHtree && query.filters && typeof query.filters === "object") {
    const { pushable } = extractPushableFilters(
      query.filters as Record<string, unknown>,
      query.resource as string,
      schema,
    );
    if (pushable.length > 0) {
      preFilterWhere = pushable as WhereClause[];
    }
  }

  const store = await DbDataStore.forQuery(
    db,
    query as { resource: string; select?: string[] },
    schema,
    namespace,
    preFilterWhere,
    logger,
    actorId,
  );

  // Execute search query or regular query
  if (query.search) {
    if (searchProvider) {
      return executeSearchQuery(query as any, schema, store, searchProvider, undefined, logger);
    }
    if (!hasDbNativeSearchSupport(db)) {
      throw new DatafnExecutionError(
        "DFQL_UNSUPPORTED",
        NO_PROVIDER_NATIVE_UNSUPPORTED_MESSAGE,
        "search",
      );
    }
    return executeSearchQuery(
      query as any,
      schema,
      store,
      undefined,
      async ({
        resource,
        query: searchQuery,
        fields,
        limit,
        prefix,
        fuzzy,
        fieldBoosts,
        signal,
      }) =>
        executeDbNativeResourceSearch(db, schema, namespace, {
          resource,
          query: searchQuery,
          fields,
          limit,
          prefix,
          fuzzy,
          fieldBoosts,
          signal,
        } as any),
      logger,
    );
  }

  return executeQuery(query as any, schema, store);
}

/**
 * Convert DFQL filters to @superfunctions/db WhereClause format
 */
export function convertFiltersToWhere(
  filters?: Record<string, unknown>,
): WhereClause[] {
  if (!filters || typeof filters !== "object") {
    return [];
  }

  const whereClauses: WhereClause[] = [];

  for (const [key, value] of Object.entries(filters)) {
    // Handle $and logical operator
    if (key === "$and" && Array.isArray(value)) {
      for (const subFilter of value) {
        if (typeof subFilter === "object" && subFilter !== null) {
          const subClauses = convertFiltersToWhere(
            subFilter as Record<string, unknown>,
          );
          whereClauses.push(...subClauses);
        }
      }
      continue;
    }

    // Skip $or for now (not supported by WhereClause)
    if (key === "$or") {
      continue;
    }

    // Simple equality: { id: "task:1" }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      whereClauses.push({
        field: key,
        operator: "eq",
        value: value,
      });
      continue;
    }

    // Array value = IN operator: { status: ["active", "pending"] }
    if (Array.isArray(value)) {
      whereClauses.push({
        field: key,
        operator: "in",
        value: value,
      });
      continue;
    }

    // Object value = operator object: { age: { $gt: 18 } }
    if (typeof value === "object" && value !== null) {
      const operators = value as Record<string, unknown>;
      for (const [op, opValue] of Object.entries(operators)) {
        let dbOperator: WhereClause["operator"] = "eq";

        switch (op) {
          case "eq":
          case "$eq":
            dbOperator = "eq";
            break;
          case "ne":
          case "$ne":
            dbOperator = "ne";
            break;
          case "gt":
          case "$gt":
            dbOperator = "gt";
            break;
          case "gte":
          case "$gte":
            dbOperator = "gte";
            break;
          case "lt":
          case "$lt":
            dbOperator = "lt";
            break;
          case "lte":
          case "$lte":
            dbOperator = "lte";
            break;
          case "in":
          case "$in":
            dbOperator = "in";
            break;
          case "like":
          case "$like":
            dbOperator = "contains";
            break;
          default:
            // Unknown operator, skip
            continue;
        }

        whereClauses.push({
          field: key,
          operator: dbOperator,
          value: opValue,
        });
      }
    }
  }

  return whereClauses;
}
