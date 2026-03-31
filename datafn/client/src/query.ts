/**
 * Query Execution Utilities
 *
 * Handles query execution via remote adapter or local storage based on hydration state.
 */

import type {
  DatafnNativeRemoteMode,
  DatafnRemoteAdapter,
} from "./client.js";
import type { DatafnStorageAdapter } from "./storage.js";
import type { DatafnPlugin, DatafnSchema, SchemaIndex } from "@datafn/core";
import { createClientError } from "./errors.js";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { executeLocalQuery } from "./offline/query.js";
import { runBeforeQuery, runAfterQuery } from "./plugins/run-hooks.js";
import { parseQueryResultDates } from "./codecs/date.js";

type QueryMetadata = {
  includeTrashed?: boolean;
  includeArchived?: boolean;
};

export type PermissionEntry = {
  userId: string;
  level: string;
  grantedBy: string;
  grantedAt: number;
};

export function buildGetPermissionsQuery(
  resource: string,
  version: number,
  id: string,
): Record<string, unknown> {
  return {
    resource,
    version,
    operation: "getPermissions",
    id,
  };
}

function normalizeQueryMetadata(
  query: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !query.metadata ||
    typeof query.metadata !== "object" ||
    Array.isArray(query.metadata)
  ) {
    return query;
  }

  const metadata = query.metadata as Record<string, unknown>;
  const normalizedMetadata: QueryMetadata = {
    ...(metadata.includeTrashed === true ? { includeTrashed: true } : {}),
    ...(metadata.includeArchived === true ? { includeArchived: true } : {}),
  };

  return {
    ...query,
    metadata: normalizedMetadata,
  };
}

/**
 * Execute a query (single or batch) via the remote adapter or local storage.
 *
 * When storage is configured and table hydration state is 'ready', queries execute locally.
 * Otherwise, queries execute via the remote adapter.
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
  schemaIndex?: SchemaIndex,
  nativeRemoteMode?: DatafnNativeRemoteMode,
): Promise<T | T[]> {
  // Run beforeQuery hooks (fail-closed)
  const transformedQuery = schema
    ? await runBeforeQuery(plugins, schema, q)
    : q;
  const normalizedQuery = Array.isArray(transformedQuery)
    ? transformedQuery.map((entry) =>
        typeof entry === "object" && entry !== null
          ? normalizeQueryMetadata(entry as Record<string, unknown>)
          : entry,
      )
    : typeof transformedQuery === "object" && transformedQuery !== null
      ? normalizeQueryMetadata(transformedQuery as Record<string, unknown>)
      : transformedQuery;

  // If no storage is configured, always use remote execution.
  if (!storage) {
    const response = await remote.query(normalizedQuery);
    let result = unwrapRemoteSuccess<T | T[]>(response);

    if (schema && Array.isArray(normalizedQuery)) {
      // REL-013: Apply inbound date codec per-query for batch queries (no-storage path)
      if (Array.isArray(result)) {
        result = (result as any[]).map((queryResult, i) => {
          const query = (normalizedQuery as any[])[i] as Record<string, unknown>;
          const resource = query?.resource as string;
          if (resource) {
            return parseQueryResultDates(schema, resource, queryResult);
          }
          return queryResult;
        }) as any;
      }
    } else if (schema && !Array.isArray(normalizedQuery)) {
      // Apply inbound date codec (CODEC-001)
      const query = normalizedQuery as Record<string, unknown>;
      const resource = query.resource as string;
      if (resource) {
        result = parseQueryResultDates(schema, resource, result) as T | T[];
      }
    }

    // Run afterQuery hooks (fail-open)
    return schema
      ? (runAfterQuery(plugins, schema, normalizedQuery, result) as Promise<
          T | T[]
        >)
      : result;
  }

  // For batch queries, always use remote execution.
  if (Array.isArray(normalizedQuery)) {
    if (nativeRemoteMode === "icloud" && schema) {
      const remoteOnlyResource = normalizedQuery
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return undefined;
          }
          const resource = (entry as { resource?: unknown }).resource;
          return typeof resource === "string" ? resource : undefined;
        })
        .find((name) =>
          name &&
          schema.resources.some(
            (resourceDef) =>
              resourceDef.name === name && resourceDef.isRemoteOnly,
          ),
        );

      if (remoteOnlyResource) {
        throw createClientError(
          "DFQL_UNSUPPORTED",
          "Remote-only resource is unsupported in icloud mode",
          { path: "query.resource", resource: remoteOnlyResource },
        );
      }
    }

    const response = await remote.query(normalizedQuery);
    let result = unwrapRemoteSuccess<T | T[]>(response);

    // REL-013: Apply inbound date codec per-query in batch path
    if (schema && Array.isArray(result)) {
      result = (result as any[]).map((queryResult, i) => {
        const query = (normalizedQuery as any[])[i] as Record<string, unknown>;
        const resource = query?.resource as string;
        if (resource) {
          return parseQueryResultDates(schema, resource, queryResult);
        }
        return queryResult;
      }) as any;
    }

    return schema
      ? (runAfterQuery(plugins, schema, normalizedQuery, result) as Promise<
          T | T[]
        >)
      : result;
  }

  // Single query: check hydration state for local-first routing
  const query = normalizedQuery as Record<string, unknown>;
  const resource = query.resource as string;

  if (resource) {
    // Check if table is remote-only
    const resourceDef = schema?.resources.find((r) => r.name === resource);
    if (resourceDef?.isRemoteOnly) {
      if (nativeRemoteMode === "icloud") {
        throw createClientError(
          "DFQL_UNSUPPORTED",
          "Remote-only resource is unsupported in icloud mode",
          { path: "query.resource", resource },
        );
      }

      // Force remote execution for remote-only tables (SYNC-003)
      const response = await remote.query(normalizedQuery);
      let result = unwrapRemoteSuccess<T>(response);
      
      // Apply inbound date codec (CODEC-001)
      if (schema) {
        result = parseQueryResultDates(schema, resource, result) as T;
      }
      
      return schema
        ? (runAfterQuery(
            plugins,
            schema,
            normalizedQuery,
            result,
          ) as Promise<T>)
        : result;
    }

    const hydrationState = await storage.getHydrationState(resource);

    // Local-first: execute against storage when table is ready
    if (hydrationState === "ready" && schema) {
      let result = (await executeLocalQuery(storage, schema, query, schemaIndex)) as T;
      
      // Apply inbound date codec for local query results (CODEC-001)
      result = parseQueryResultDates(schema, resource, result) as T;
      
      return schema
        ? (runAfterQuery(plugins, schema, query, result) as Promise<T>)
        : result;
    }
    
    // If table is hydrating, route to remote when available (SYNC-002, TV-SYNC-002N)
    // In local-only mode (no remote), we'd use local even if hydrating
    // But since storage is present and we're here, we have a remote, so use it
    if (hydrationState === "hydrating") {
      const response = await remote.query(normalizedQuery);
      let result = unwrapRemoteSuccess<T>(response);
      
      // Apply inbound date codec (CODEC-001)
      if (schema) {
        result = parseQueryResultDates(schema, resource, result) as T;
      }
      
      return schema
        ? (runAfterQuery(plugins, schema, normalizedQuery, result) as Promise<T>)
        : result;
    }
  }

  // Remote execution for: notStarted or missing resource
  const response = await remote.query(normalizedQuery);
  let result = unwrapRemoteSuccess<T>(response);
  
  // Apply inbound date codec (CODEC-001)
  if (schema && !Array.isArray(normalizedQuery)) {
    const query = normalizedQuery as Record<string, unknown>;
    const resource = query.resource as string;
    if (resource) {
      result = parseQueryResultDates(schema, resource, result) as T;
    }
  }
  
  return schema
    ? (runAfterQuery(plugins, schema, normalizedQuery, result) as Promise<T>)
    : result;
}
