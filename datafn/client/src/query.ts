/**
 * Query Execution Utilities
 *
 * Handles query execution via remote adapter or local storage based on hydration state.
 */

import type { DatafnRemoteAdapter } from "./client.js";
import type { DatafnStorageAdapter } from "./storage.js";
import type { DatafnPlugin, DatafnSchema } from "@datafn/core";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { executeLocalQuery } from "./offline/query.js";
import { runBeforeQuery, runAfterQuery } from "./plugins/run-hooks.js";

/**
 * Execute a query (single or batch) via the remote adapter or local storage.
 *
 * When storage is configured and table hydration state is 'ready', queries execute locally.
 * Otherwise, queries use remote fallback.
 *
 * @param remote - Remote adapter for server queries
 * @param q - Query or array of queries
 * @param storage - Optional storage adapter for local-first execution
 * @param plugins - Optional plugins for hook execution
 * @returns Query result(s)
 */
export async function executeQuery<T = unknown>(
  remote: DatafnRemoteAdapter,
  q: unknown | unknown[],
  storage?: DatafnStorageAdapter,
  plugins: DatafnPlugin[] = [],
  schema?: DatafnSchema,
): Promise<T | T[]> {
  // Run beforeQuery hooks (fail-closed)
  const transformedQuery = schema
    ? await runBeforeQuery(plugins, schema, q)
    : q;

  // If no storage configured, always use remote (backward compatible)
  if (!storage) {
    const response = await remote.query(transformedQuery);
    const result = unwrapRemoteSuccess<T | T[]>(response);
    // Run afterQuery hooks (fail-open)
    return schema
      ? (runAfterQuery(plugins, schema, transformedQuery, result) as Promise<
          T | T[]
        >)
      : result;
  }

  // For batch queries, always use remote fallback (simplification for Phase 20)
  if (Array.isArray(transformedQuery)) {
    const response = await remote.query(transformedQuery);
    const result = unwrapRemoteSuccess<T | T[]>(response);
    return schema
      ? (runAfterQuery(plugins, schema, transformedQuery, result) as Promise<
          T | T[]
        >)
      : result;
  }

  // Single query: check hydration state for local-first routing
  const query = transformedQuery as Record<string, unknown>;
  const resource = query.resource as string;

  if (resource) {
    // Check if table is remote-only
    const resourceDef = schema?.resources.find((r) => r.name === resource);
    if (resourceDef?.isRemoteOnly) {
      // Force remote execution for remote-only tables (SYNC-003)
      const response = await remote.query(transformedQuery);
      const result = unwrapRemoteSuccess<T>(response);
      return schema
        ? (runAfterQuery(plugins, schema, transformedQuery, result) as Promise<T>)
        : result;
    }

    const hydrationState = await storage.getHydrationState(resource);

    // Local-first: execute against storage when table is ready
    if (hydrationState === "ready") {
      const result = (await executeLocalQuery(storage, query)) as T;
      return schema
        ? (runAfterQuery(plugins, schema, query, result) as Promise<T>)
        : result;
    }
  }

  // Remote fallback for: notStarted, hydrating, or missing resource
  const response = await remote.query(transformedQuery);
  const result = unwrapRemoteSuccess<T>(response);
  return schema
    ? (runAfterQuery(plugins, schema, transformedQuery, result) as Promise<T>)
    : result;
}
