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
import type {
  DatafnPlugin,
  DatafnSchema,
  DatafnTemporalConfig,
  SchemaIndex,
} from "@datafn/core";
import { endpointIncludes, resolveCapabilities } from "@datafn/core";
import { createClientError } from "./errors.js";
import { unwrapRemoteSuccess } from "./remote/unwrap.js";
import { executeLocalQuery } from "./offline/query.js";
import { runBeforeQuery, runAfterQuery } from "./plugins/run-hooks.js";
import { parseQueryResultDates } from "./codecs/date.js";
import {
  assertRemoteQueryAllowedForE2ee,
  type DatafnE2eeConfig,
} from "./e2ee.js";

type QueryMetadata = {
  includeTrashed?: boolean;
  includeArchived?: boolean;
  includeAncestorInactive?: boolean;
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
    ...(metadata.includeAncestorInactive === true ? { includeAncestorInactive: true } : {}),
  };

  return {
    ...query,
    metadata: normalizedMetadata,
  };
}

function mergeAutoFilters(
  existingFilters: Record<string, unknown> | undefined,
  autoFilters: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  if (autoFilters.length === 0) {
    return existingFilters;
  }
  if (!existingFilters || Object.keys(existingFilters).length === 0) {
    return autoFilters.length === 1 ? autoFilters[0] : { $and: autoFilters };
  }
  if (
    Array.isArray(existingFilters.$and) &&
    Object.keys(existingFilters).length === 1
  ) {
    return {
      $and: [
        ...(existingFilters.$and as Record<string, unknown>[]),
        ...autoFilters,
      ],
    };
  }
  return { $and: [existingFilters, ...autoFilters] };
}

function injectLocalCapabilityAutoFilters(
  query: Record<string, unknown>,
  schema: DatafnSchema,
): Record<string, unknown> {
  const resourceName = query.resource;
  if (typeof resourceName !== "string") {
    return query;
  }

  const resource = schema.resources.find((entry) => entry.name === resourceName);
  if (!resource) {
    return query;
  }

  const capabilities = resolveCapabilities(
    schema.capabilities as any,
    resource.capabilities as any,
  );
  const metadata = query.metadata &&
    typeof query.metadata === "object" &&
    !Array.isArray(query.metadata)
    ? (query.metadata as QueryMetadata)
    : {};
  const autoFilters: Record<string, unknown>[] = [];

  if (
    capabilities.some((capability: unknown) => capability === "trash") &&
    metadata.includeTrashed !== true
  ) {
    autoFilters.push({ trashedAt: { $is_null: true } });
  }

  if (
    capabilities.some((capability: unknown) => capability === "archivable") &&
    metadata.includeArchived !== true
  ) {
    autoFilters.push({ isArchived: { $ne: true } });
  }

  if (
    metadata.includeAncestorInactive !== true &&
    schema.relations?.some((relation) => {
      if (relation.inheritsInactive !== true) return false;
      const dependentEndpoint = relation.type === "many-one" ? relation.from : relation.to;
      return endpointIncludes(dependentEndpoint, resourceName);
    })
  ) {
    autoFilters.push({ isAncestorInactive: { $ne: true } });
  }

  if (autoFilters.length === 0) {
    return query;
  }

  const filters = query.filters &&
    typeof query.filters === "object" &&
    !Array.isArray(query.filters)
    ? (query.filters as Record<string, unknown>)
    : undefined;

  return {
    ...query,
    filters: mergeAutoFilters(filters, autoFilters),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasImpossibleEmptyInFilter(filter: unknown): boolean {
  if (!isPlainRecord(filter)) return false;

  if (Array.isArray(filter.$and)) {
    return filter.$and.some(hasImpossibleEmptyInFilter);
  }

  if (Array.isArray(filter.$or)) {
    return filter.$or.length === 0 || filter.$or.every(hasImpossibleEmptyInFilter);
  }

  for (const [key, value] of Object.entries(filter)) {
    if (key === "$and" || key === "$or") continue;
    if (!isPlainRecord(value)) continue;
    const inValue = value.$in ?? value.in;
    if (Array.isArray(inValue) && inValue.length === 0) {
      return true;
    }
  }

  return false;
}

function resolveEmptyQueryResult(query: unknown): Record<string, unknown> | undefined {
  if (!isPlainRecord(query)) return undefined;
  if (!hasImpossibleEmptyInFilter(query.filters)) return undefined;
  if (query.groupBy) {
    return { groups: [], nextCursor: null };
  }
  return {
    data: [],
    nextCursor: null,
    ...(query.count === true ? { count: 0 } : {}),
  };
}

function mergeQueryDataById(remoteResult: unknown, localResult: unknown): unknown {
  const remoteEnvelope =
    remoteResult && typeof remoteResult === "object" && !Array.isArray(remoteResult)
      ? (remoteResult as Record<string, unknown>)
      : null;
  const localEnvelope =
    localResult && typeof localResult === "object" && !Array.isArray(localResult)
      ? (localResult as Record<string, unknown>)
      : null;
  const remoteData = Array.isArray(remoteEnvelope?.data)
    ? remoteEnvelope.data
    : Array.isArray(remoteResult)
      ? remoteResult
      : null;
  const localData = Array.isArray(localEnvelope?.data)
    ? localEnvelope.data
    : Array.isArray(localResult)
      ? localResult
      : null;

  if (!remoteData || !localData || localData.length === 0) {
    return remoteResult;
  }

  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const record of localData) {
    const id = (record as { id?: unknown } | null)?.id;
    if (typeof id === "string") seen.add(id);
    merged.push(record);
  }
  for (const record of remoteData) {
    const id = (record as { id?: unknown } | null)?.id;
    if (typeof id === "string" && seen.has(id)) continue;
    merged.push(record);
  }

  if (remoteEnvelope && Array.isArray(remoteEnvelope.data)) {
    return {
      ...remoteEnvelope,
      data: merged,
    };
  }
  return merged;
}

async function overlayLocalQueryResult(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  query: Record<string, unknown>,
  remoteResult: unknown,
  schemaIndex?: SchemaIndex,
  temporal?: DatafnTemporalConfig,
): Promise<unknown> {
  try {
    const localQuery = injectLocalCapabilityAutoFilters(query, schema);
    const localResult = await executeLocalQuery(
      storage,
      schema,
      localQuery,
      schemaIndex,
      temporal,
    );
    return mergeQueryDataById(remoteResult, localResult);
  } catch {
    return remoteResult;
  }
}

async function executeLocalBatchQuery(
  storage: DatafnStorageAdapter,
  schema: DatafnSchema,
  queries: unknown[],
  schemaIndex?: SchemaIndex,
  temporal?: DatafnTemporalConfig,
): Promise<unknown[] | undefined> {
  const localQueries: Array<{
    query: Record<string, unknown>;
    resource: string;
  }> = [];

  for (const entry of queries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return undefined;
    }

    const query = entry as Record<string, unknown>;
    const resource = query.resource;
    if (typeof resource !== "string") {
      return undefined;
    }

    const resourceDef = schema.resources.find((item) => item.name === resource);
    if (!resourceDef || resourceDef.isRemoteOnly) {
      return undefined;
    }

    localQueries.push({ query, resource });
  }

  const hydrationStates = await Promise.all(
    localQueries.map(({ resource }) => storage.getHydrationState(resource)),
  );

  if (hydrationStates.some((state) => state !== "ready")) {
    return undefined;
  }

  return Promise.all(
    localQueries.map(async ({ query, resource }) => {
      const localQuery = injectLocalCapabilityAutoFilters(query, schema);
      const result = await executeLocalQuery(
        storage,
        schema,
        localQuery,
        schemaIndex,
        temporal,
      );
      return parseQueryResultDates(schema, resource, result);
    }),
  );
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
  temporal?: DatafnTemporalConfig,
  e2ee?: DatafnE2eeConfig,
): Promise<T | T[]> {
  // Run beforeQuery hooks (fail-closed)
  const transformedQuery = schema
    ? await runBeforeQuery(plugins, schema, q)
    : q;
  const metadataNormalizedQuery = Array.isArray(transformedQuery)
    ? transformedQuery.map((entry) =>
        typeof entry === "object" && entry !== null
          ? normalizeQueryMetadata(entry as Record<string, unknown>)
          : entry,
      )
    : typeof transformedQuery === "object" && transformedQuery !== null
      ? normalizeQueryMetadata(transformedQuery as Record<string, unknown>)
      : transformedQuery;
  const normalizedQuery = metadataNormalizedQuery;
  const runRemoteQuery = async (): Promise<unknown> => {
    assertRemoteQueryAllowedForE2ee(e2ee, normalizedQuery);
    return remote.query(normalizedQuery);
  };

  const emptyResult = resolveEmptyQueryResult(normalizedQuery);
  if (emptyResult) {
    return schema
      ? (runAfterQuery(plugins, schema, normalizedQuery, emptyResult) as Promise<T>)
      : (emptyResult as T);
  }

  // If no storage is configured, always use remote execution.
  if (!storage) {
    const response = await runRemoteQuery();
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

  if (Array.isArray(normalizedQuery)) {
    const emptyResults = normalizedQuery.map(resolveEmptyQueryResult);
    if (emptyResults.every(Boolean)) {
      return schema
        ? (runAfterQuery(plugins, schema, normalizedQuery, emptyResults) as Promise<T[]>)
        : (emptyResults as T[]);
    }

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

    if (schema && nativeRemoteMode !== "icloud") {
      const localResult = await executeLocalBatchQuery(
        storage,
        schema,
        normalizedQuery,
        schemaIndex,
        temporal,
      );

      if (localResult) {
        return runAfterQuery(
          plugins,
          schema,
          normalizedQuery,
          localResult,
        ) as Promise<T[]>;
      }
    }

    const response = await runRemoteQuery();
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
      const response = await runRemoteQuery();
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
      const localQuery = injectLocalCapabilityAutoFilters(query, schema);
      let result = (await executeLocalQuery(
        storage,
        schema,
        localQuery,
        schemaIndex,
        temporal,
      )) as T;
      
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
      const response = await runRemoteQuery();
      let result = unwrapRemoteSuccess<T>(response);
      
      // Apply inbound date codec (CODEC-001)
      if (schema) {
        result = parseQueryResultDates(schema, resource, result) as T;
        result = (await overlayLocalQueryResult(
          storage,
          schema,
          query,
          result,
          schemaIndex,
          temporal,
        )) as T;
      }
      
      return schema
        ? (runAfterQuery(plugins, schema, normalizedQuery, result) as Promise<T>)
        : result;
    }
  }

  // Remote execution for: notStarted or missing resource
  const response = await runRemoteQuery();
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
