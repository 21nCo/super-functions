/**
 * POST /datafn/query endpoint
 *
 * FIX-SRV-005: Thin composition layer — delegates to focused modules:
 *   - query/validate.ts   — DFQL structural validation
 *   - query/batch-executor.ts — bounded concurrency
 *   - query/execute.ts    — strategy classification + execution bridge
 */

import type { DatafnSchema, DatafnPlugin } from "../core-types.js";
import type { Adapter } from "@superfunctions/db";
import type { SearchProvider } from "../search-provider.js";
import { getBodyFromContext } from "../http/json.js";
import { errorResponse, okResponse } from "../http/errors.js";
import {
  runBeforeQuery,
  runAfterQuery,
} from "../plugins/run-hooks.js";
import { buildSchemaIndex } from "../validation/index.js";
import { logRequest } from "../logging.js";
import type { DatafnLogger } from "../logger.js";
import { ExecutionTimer, type TimingEmitter } from "../middleware/timing.js";
import {
  isPrivateShareableResource,
  resolveAccessLevel,
  validateQueryAuthz,
} from "../validation/authz.js";
import { runBounded } from "./query/batch-executor.js";
import { executeSingleQuery } from "./query/execute.js";
import { validateQueryBody } from "./query/validate.js";
import { injectCapabilityAutoFilters, type QueryMetadata } from "../execution/query/pushdown.js";
import { mergeSharedWithMeRows } from "../execution/query/execute.js";
import { createAuthResolverCache } from "../execution/auth/cache.js";
import { resolveEffectivePrincipals } from "../execution/auth/principal-resolver.js";
import {
  canonicalizePrincipalFromLegacyUserId,
  getSpv2MigrationRuntimeConfig,
} from "../execution/migration/spv2.js";
import { hasTemporalGrouping } from "@datafn/core";
import {
  getDatafnMultiRegionRuntimeConfig,
  queryDatafnPermissionGrants,
} from "../plugins/multi-region.js";

// Re-export query helpers for direct imports from routes/query.
export { validateQuery, validateFilters } from "./query/validate.js";
export { convertFiltersToWhere } from "./query/execute.js";
export { runBounded } from "./query/batch-executor.js";

/**
 * Options for query handler (VAL-001 through VAL-005, VAL-009)
 */
export interface QueryHandlerOpts {
  maxSelectTokens?: number;
  maxFilterKeysPerLevel?: number;
  maxSortFields?: number;
  maxAggregations?: number;
  /** FIX-SRV-003: Max in-flight query concurrency for batch queries (default 20) */
  maxBatchQueryConcurrency?: number;
  allowUnknownResources?: boolean;
  debug?: boolean;
  hasSearchProviderFallback?: boolean;
}

type QueryEnvelopeMetadata = QueryMetadata;

/**
 * Create query validation + execution route handler
 */
export function createQueryHandler(
  validatedSchema: DatafnSchema,
  maxLimit: number,
  extractNamespace: (ctx: any) => Promise<string>,
  extractActorId: ((ctx: any) => Promise<string | undefined>) | undefined,
  db?: Adapter,
  plugins: DatafnPlugin[] = [],
  searchProvider?: SearchProvider,
  timingEmitter?: TimingEmitter | null,
  handlerOpts?: QueryHandlerOpts,
  logger?: DatafnLogger,
  /** Unwrapped adapter used only to discover grants in explicitly requested source namespaces. */
  crossNamespaceDb?: Adapter,
) {
  const multiRegionRuntime = getDatafnMultiRegionRuntimeConfig(plugins);
  // Build schema index once for efficient validation
  const schemaIndex = buildSchemaIndex(validatedSchema);

  const getPermissionsTable = (resource: string) => `__datafn_permissions_${resource}`;
  const globalPermissionsTable = "__datafn_permissions_global";
  const principalMembershipsTable = "__datafn_principal_memberships";
  const principalHierarchyTable = "__datafn_principal_hierarchy";
  const principalResolverCache = createAuthResolverCache();

  const resolveShareableAccessIds = async (
    resource: string,
    namespace: string,
    actorId: string | undefined,
  ): Promise<{ shareableAccessIds: string[]; hasShareableScopeAccess?: boolean } | undefined> => {
    if (!db || !isPrivateShareableResource(validatedSchema, resource)) {
      return undefined;
    }
    if (!actorId) {
      return { shareableAccessIds: [] };
    }

    const ids = new Set<string>();
    const readMode = getSpv2MigrationRuntimeConfig().readMode;

    const ownedRows = await db.findMany({
      model: resource,
      where: [{ field: "createdBy", operator: "eq", value: actorId }],
      namespace,
    });
    for (const row of ownedRows) {
      if (typeof row.id === "string") {
        ids.add(row.id);
      }
    }

    if (readMode !== "v2") {
      const actorPrincipal = canonicalizePrincipalFromLegacyUserId(actorId);
      const legacySubjects = new Set<string>([actorId, actorPrincipal]);
      for (const legacySubject of legacySubjects) {
        try {
          const permissionRows = await db.findMany({
            model: getPermissionsTable(resource),
            where: [{ field: "userId", operator: "eq", value: legacySubject }],
            namespace,
          });
          for (const row of permissionRows) {
            if (typeof row.resourceId === "string") {
              ids.add(row.resourceId);
            }
          }
        } catch {
          // Legacy table may not exist in SPV2-only deployments.
        }
      }
    }

    if (readMode !== "v1") {
      const principals = await resolveActorPrincipals(namespace, actorId);
      let hasScopeGrant = false;
      for (const principalId of principals) {
        const permissionRows = await db.findMany({
          model: globalPermissionsTable,
          where: [
            { field: "resourceType", operator: "eq", value: resource },
            { field: "resourceNs", operator: "eq", value: namespace },
            { field: "principalId", operator: "eq", value: principalId },
          ],
          namespace,
        });
        for (const row of permissionRows) {
          const grant = row as Record<string, unknown>;
          if (!isGrantActive(grant)) {
            continue;
          }
          if (grant.resourceId === null || grant.grantKind === "scope") {
            hasScopeGrant = true;
            continue;
          }
          if (typeof grant.resourceId === "string") {
            ids.add(grant.resourceId);
          }
        }
      }

      if (hasScopeGrant) {
        return {
          shareableAccessIds: [...ids].sort((a, b) => a.localeCompare(b)),
          hasShareableScopeAccess: true,
        };
      }
    }

    return {
      shareableAccessIds: [...ids].sort((a, b) => a.localeCompare(b)),
    };
  };

  const mergeFilters = (
    existingFilters: Record<string, unknown> | undefined,
    nextFilter: Record<string, unknown>,
  ): Record<string, unknown> => {
    if (!existingFilters || Object.keys(existingFilters).length === 0) {
      return nextFilter;
    }
    if (
      Array.isArray(existingFilters.$and) &&
      Object.keys(existingFilters).length === 1
    ) {
      return {
        $and: [...(existingFilters.$and as Record<string, unknown>[]), nextFilter],
      };
    }
    return {
      $and: [existingFilters, nextFilter],
    };
  };

  const isGrantActive = (row: Record<string, unknown>): boolean =>
    row.revokedAt === undefined || row.revokedAt === null;

  const normalizePermissionGrantRow = (
    row: Record<string, unknown>,
  ): Record<string, unknown> => ({
    ...row,
    resourceType: row.resourceType ?? row.resource_type,
    resourceNs: row.resourceNs ?? row.resource_ns,
    resourceId: row.resourceId ?? row.resource_id,
    principalId: row.principalId ?? row.principal_id,
    grantKind: row.grantKind ?? row.grant_kind,
    sourceRef: row.sourceRef ?? row.source_ref,
    grantedBy: row.grantedBy ?? row.granted_by,
    grantedAt: row.grantedAt ?? row.granted_at,
    revokedAt: row.revokedAt ?? row.revoked_at,
  });

  const resolveActorPrincipals = async (
    namespace: string,
    actorId: string,
  ): Promise<string[]> => {
    if (!db) {
      return [];
    }
    const result = await resolveEffectivePrincipals({
      namespace,
      actorId,
      cache: principalResolverCache,
      store: {
        getDirectMemberships: async ({ namespace: actorNamespace, actorId: actor }) => {
          const rows = await db.findMany({
            model: principalMembershipsTable,
            where: [{ field: "actorId", operator: "eq", value: actor }],
            namespace: actorNamespace,
          });
          return rows
            .filter((row) => isGrantActive(row as Record<string, unknown>))
            .map((row) => (typeof row.principalId === "string" ? row.principalId : ""))
            .filter((principalId) => principalId.length > 0);
        },
        getHierarchyParents: async ({ namespace: actorNamespace, principalIds }) => {
          const edges: Array<{ principalId: string; parentPrincipalId: string }> = [];
          for (const principalId of principalIds) {
            const rows = await db.findMany({
              model: principalHierarchyTable,
              where: [{ field: "principalId", operator: "eq", value: principalId }],
              namespace: actorNamespace,
            });
            for (const row of rows) {
              const candidate = row as Record<string, unknown>;
              if (!isGrantActive(candidate)) {
                continue;
              }
              if (
                typeof candidate.principalId === "string" &&
                typeof candidate.parentPrincipalId === "string"
              ) {
                edges.push({
                  principalId: candidate.principalId,
                  parentPrincipalId: candidate.parentPrincipalId,
                });
              }
            }
          }
          return edges;
        },
      },
    });
    return result.effectivePrincipals;
  };

  const resolveSharedWithMeNamespaceAccess = async (
    resource: string,
    namespace: string,
    actorId: string | undefined,
    metadata?: QueryEnvelopeMetadata,
  ): Promise<Map<string, { scope: boolean; recordIds: Set<string> }>> => {
    const access = new Map<string, { scope: boolean; recordIds: Set<string> }>();
    if (!db || !actorId) {
      return access;
    }

    const namespaceFilterSet =
      Array.isArray(metadata?.namespaceFilter) && metadata.namespaceFilter.length > 0
        ? new Set(metadata.namespaceFilter.filter((value) => typeof value === "string"))
        : undefined;

    const principals = await resolveActorPrincipals(namespace, actorId);
    const readPermissionRows = async (
      principalId: string,
    ): Promise<Record<string, unknown>[]> => {
      const directoryRows = await queryDatafnPermissionGrants({
        principalId,
        resourceType: resource,
      }, multiRegionRuntime);
      const rows: Record<string, unknown>[] = directoryRows.map((grant) => ({
        id: grant.id,
        resourceType: grant.resourceType,
        resourceNs: grant.resourceNs,
        resourceId: grant.resourceId,
        principalId: grant.principalId,
        level: grant.level,
        grantKind: grant.grantKind,
        sourceRef: grant.sourceRef,
        grantedBy: grant.grantedBy,
        grantedAt: grant.grantedAt,
        revokedAt: grant.revokedAt,
        resourceRegion: grant.resourceRegion,
      }));
      if (rows.length > 0) {
        return rows;
      }
      try {
        rows.push(
          ...(
            await db.internal.findMany(globalPermissionsTable, [
              { field: "resourceType", op: "eq", value: resource },
              { field: "principalId", op: "eq", value: principalId },
            ])
          ).map((row) => normalizePermissionGrantRow(row)),
        );
      } catch {
      }
      try {
        rows.push(
          ...(
            await db.internal.findMany(globalPermissionsTable, [
              { field: "resource_type", op: "eq", value: resource },
              { field: "principal_id", op: "eq", value: principalId },
            ])
          ).map((row) => normalizePermissionGrantRow(row)),
        );
      } catch {
      }
      const permissionDb = crossNamespaceDb ?? db;
      const candidateNamespaces = namespaceFilterSet ?? new Set([namespace]);
      for (const sourceNamespace of candidateNamespaces) {
        rows.push(
          ...(
            await permissionDb.findMany({
              model: globalPermissionsTable,
              where: [
                { field: "resourceType", operator: "eq", value: resource },
                { field: "principalId", operator: "eq", value: principalId },
                { field: "resourceNs", operator: "eq", value: sourceNamespace },
              ],
              namespace: sourceNamespace,
            })
          ).map((row) => normalizePermissionGrantRow(row as Record<string, unknown>)),
        );
      }
      return rows;
    };
    const seenGrantIds = new Set<string>();
    for (const principalId of principals) {
      const rows = await readPermissionRows(principalId);

      for (const row of rows) {
        const grant = row as Record<string, unknown>;
        if (
          typeof grant.__ns === "string" &&
          typeof grant.resourceNs === "string" &&
          grant.__ns !== grant.resourceNs
        ) {
          continue;
        }
        const grantId =
          typeof grant.id === "string"
            ? grant.id
            : `${String(grant.resourceType)}:${String(grant.resourceNs)}:${String(grant.resourceId ?? "*")}:${String(grant.principalId)}`;
        if (seenGrantIds.has(grantId)) {
          continue;
        }
        seenGrantIds.add(grantId);
        if (!isGrantActive(grant)) {
          continue;
        }
        if (typeof grant.resourceNs !== "string" || grant.resourceNs.length === 0) {
          continue;
        }
        if (namespaceFilterSet && !namespaceFilterSet.has(grant.resourceNs)) {
          continue;
        }

        const entry = access.get(grant.resourceNs) ?? {
          scope: false,
          recordIds: new Set<string>(),
        };
        const grantKind =
          typeof grant.grantKind === "string" ? grant.grantKind : "record";
        const isScopeGrant = grantKind === "scope" || grant.resourceId === null;
        if (isScopeGrant) {
          entry.scope = true;
        } else if (typeof grant.resourceId === "string") {
          entry.recordIds.add(grant.resourceId);
        }
        access.set(grant.resourceNs, entry);
      }
    }

    return access;
  };

  const executeSharedWithMeQuery = async (
    query: Record<string, unknown>,
    metadata: QueryEnvelopeMetadata | undefined,
    namespace: string,
    actorId: string | undefined,
    timer?: ExecutionTimer | null,
  ): Promise<unknown> => {
    if (query.groupBy) {
      return { groups: [], nextCursor: null };
    }
    const namespaceAccess = await resolveSharedWithMeNamespaceAccess(
      String(query.resource),
      namespace,
      actorId,
      metadata,
    );

    if (namespaceAccess.size === 0) {
      return {
        data: [],
        nextCursor: null,
        ...(query.count === true ? { count: 0 } : {}),
      };
    }

    const perNamespaceRows: Array<{ namespace: string; data: Record<string, unknown>[] }> = [];
    const namespaces = Array.from(namespaceAccess.keys()).sort((a, b) => a.localeCompare(b));

    for (const sourceNamespace of namespaces) {
      const access = namespaceAccess.get(sourceNamespace);
      if (!access) {
        continue;
      }
      if (!access.scope && access.recordIds.size === 0) {
        continue;
      }

      const existingFilters =
        query.filters &&
        typeof query.filters === "object" &&
        !Array.isArray(query.filters)
          ? (query.filters as Record<string, unknown>)
          : undefined;

      const idFilter =
        access.scope
          ? undefined
          : { id: { $in: Array.from(access.recordIds).sort((a, b) => a.localeCompare(b)) } };
      const queryWithScopeFilters = {
        ...query,
        ...(idFilter ? { filters: mergeFilters(existingFilters, idFilter) } : {}),
        metadata: {
          ...(metadata ?? {}),
          accessMode: "sharedWithMe",
          namespaceFilter: undefined,
          shareableAccessIds: undefined,
        } satisfies QueryEnvelopeMetadata,
      };

      const queryWithAutoFilters = injectCapabilityAutoFilters(
        queryWithScopeFilters as any,
        validatedSchema,
      );
      const result = await executeSingleQuery(
        queryWithAutoFilters as unknown as Record<string, unknown>,
        validatedSchema,
        db as Adapter,
        sourceNamespace,
        actorId,
        searchProvider,
        logger,
        timer,
        multiRegionRuntime,
      );
      if (
        result &&
        typeof result === "object" &&
        "data" in (result as Record<string, unknown>) &&
        Array.isArray((result as Record<string, unknown>).data)
      ) {
        perNamespaceRows.push({
          namespace: sourceNamespace,
          data: (result as { data: Record<string, unknown>[] }).data,
        });
      }
    }

    return mergeSharedWithMeRows(perNamespaceRows, query as any);
  };

  const listPermissionsForInspection = async (
    resource: string,
    recordId: string,
    namespace: string,
  ): Promise<Record<string, unknown>[]> => {
    if (!db) {
      return [];
    }

    const grantKindOrder: Record<string, number> = {
      record: 0,
      scope: 1,
      relation_inherited: 2,
    };

    const globalRows = await db.findMany({
      model: globalPermissionsTable,
      where: [
        { field: "resourceType", operator: "eq", value: resource },
        { field: "resourceNs", operator: "eq", value: namespace },
      ],
      namespace,
    });
    const activeGlobalRows = globalRows
      .map((row) => row as Record<string, unknown>)
      .filter((row) => isGrantActive(row))
      .filter(
        (row) =>
          row.resourceId === null ||
          row.resourceId === recordId ||
          row.grantKind === "scope",
      );

    const normalizedGlobalRows = activeGlobalRows.map((row) => {
      const principalId =
        typeof row.principalId === "string"
          ? row.principalId
          : typeof row.userId === "string"
            ? row.userId
            : "";
      const grantKind =
        typeof row.grantKind === "string"
          ? row.grantKind
          : row.resourceId === null
            ? "scope"
            : "record";
      return {
        principalId,
        userId: principalId,
        level: row.level,
        grantKind,
        sourceRef: row.sourceRef ?? null,
        grantedBy: row.grantedBy ?? null,
        grantedAt: row.grantedAt ?? null,
      } as Record<string, unknown>;
    });

    const outputRows =
      normalizedGlobalRows.length > 0
        ? normalizedGlobalRows
        : (
            await db.findMany({
              model: getPermissionsTable(resource),
              where: [{ field: "resourceId", operator: "eq", value: recordId }],
              namespace,
            })
          ).map((row) => {
            const principalId =
              typeof row.userId === "string"
                ? row.userId
                : typeof row.principalId === "string"
                  ? row.principalId
                  : "";
            return {
              principalId,
              userId: principalId,
              level: row.level,
              grantKind: "record",
              sourceRef: null,
              grantedBy: row.grantedBy ?? null,
              grantedAt: row.grantedAt ?? null,
            } as Record<string, unknown>;
          });

    return outputRows.sort((a, b) => {
      const aGrant = typeof a.grantKind === "string" ? a.grantKind : "";
      const bGrant = typeof b.grantKind === "string" ? b.grantKind : "";
      const grantCompare =
        (grantKindOrder[aGrant] ?? Number.MAX_SAFE_INTEGER) -
        (grantKindOrder[bGrant] ?? Number.MAX_SAFE_INTEGER);
      if (grantCompare !== 0) {
        return grantCompare;
      }
      const principalCompare = String(a.principalId ?? "").localeCompare(
        String(b.principalId ?? ""),
      );
      if (principalCompare !== 0) {
        return principalCompare;
      }
      return String(a.level ?? "").localeCompare(String(b.level ?? ""));
    });
  };

    return async (req: Request, ctx?: { parsedBody?: unknown }): Promise<Response> => {
      const startTime = Date.now();
      let resource: string | undefined;
      const timer = timingEmitter ? new ExecutionTimer() : null;
      // SRV-006: Per-query durations (populated inside if(db) block)
      const queryDurations: number[] = [];

      try {
        timer?.startPhase("validate");
        // Get body from context (pre-parsed by withAuth) or parse from request
        const parseResult = await getBodyFromContext(req, ctx);
        if (!parseResult.ok) {
          return errorResponse(parseResult.error);
        }
        const body = parseResult.data;

        // Check if it's object or array
        if (typeof body !== "object" || body === null) {
          return errorResponse({
            code: "DFQL_INVALID",
            message: "Invalid DFQL: expected object or array",
            details: { path: "$" },
          });
        }

        const q = body as Record<string, unknown>;
        resource = typeof q.resource === "string" ? q.resource : undefined;

        // Run beforeQuery hooks
        const hookCtx = { plugins, schema: validatedSchema, context: ctx };
        const beforeHookResult = await runBeforeQuery(body, hookCtx, plugins);
        if (!beforeHookResult.ok) {
          return errorResponse(
            beforeHookResult.error as any,
            beforeHookResult.error.code === "FORBIDDEN" ? 403 : 400,
          );
        }
        // Use potentially transformed query from hooks
        const transformedBody = beforeHookResult.query;

        // Validate queries against schema using validation module
        const validationResult = validateQueryBody(transformedBody, schemaIndex, {
          maxLimit,
          hasSearchProvider: !!searchProvider || !!handlerOpts?.hasSearchProviderFallback,
          maxSelectTokens: handlerOpts?.maxSelectTokens,
          maxFilterKeysPerLevel: handlerOpts?.maxFilterKeysPerLevel,
          maxSortFields: handlerOpts?.maxSortFields,
          maxAggregations: handlerOpts?.maxAggregations,
          debug: handlerOpts?.debug,
        });
        if (!validationResult.ok) {
          // VAL-009: In production (debug: false), strip field/schema details from messages
          const debug = handlerOpts?.debug ?? true;
          const message = debug ? validationResult.error.message : "Validation error";
          return errorResponse({
            code: validationResult.error.code,
            message,
            details: { path: validationResult.error.path, ...(validationResult.error.details || {}) },
          });
        }

        const { isBatch, queries: transformedQueries } = validationResult.result;

        // PHASE_11: Enforce read permissions for each query (VAL-001: deny-by-default)
        for (let i = 0; i < transformedQueries.length; i++) {
          const query = transformedQueries[i] as Record<string, unknown>;
          const metadata =
            query.metadata &&
            typeof query.metadata === "object" &&
            !Array.isArray(query.metadata)
              ? (query.metadata as QueryEnvelopeMetadata)
              : undefined;
          if (metadata?.accessMode !== undefined) {
            if (
              metadata.accessMode !== "namespace" &&
              metadata.accessMode !== "sharedWithMe"
            ) {
              return errorResponse(
                {
                  code: "DFQL_INVALID",
                  message:
                    "Invalid DFQL: metadata.accessMode must be one of [namespace, sharedWithMe]",
                  details: {
                    path: isBatch
                      ? `[${i}].metadata.accessMode`
                      : "metadata.accessMode",
                  },
                },
                400,
              );
            }
          }
          if (metadata?.namespaceFilter !== undefined) {
            if (!Array.isArray(metadata.namespaceFilter)) {
              return errorResponse(
                {
                  code: "DFQL_INVALID",
                  message: "Invalid DFQL: metadata.namespaceFilter must be array",
                  details: {
                    path: isBatch
                      ? `[${i}].metadata.namespaceFilter`
                      : "metadata.namespaceFilter",
                  },
                },
                400,
              );
            }
            if (metadata.accessMode !== "sharedWithMe") {
              return errorResponse(
                {
                  code: "DFQL_INVALID",
                  message:
                    'Invalid DFQL: metadata.namespaceFilter requires metadata.accessMode="sharedWithMe"',
                  details: {
                    path: isBatch
                      ? `[${i}].metadata.namespaceFilter`
                      : "metadata.namespaceFilter",
                  },
                },
                400,
              );
            }
            for (let idx = 0; idx < metadata.namespaceFilter.length; idx++) {
              const namespaceFilterValue = metadata.namespaceFilter[idx];
              if (
                typeof namespaceFilterValue !== "string" ||
                namespaceFilterValue.trim().length === 0
              ) {
                return errorResponse(
                  {
                    code: "DFQL_INVALID",
                    message:
                      "Invalid DFQL: metadata.namespaceFilter entries must be non-empty strings",
                    details: {
                      path: isBatch
                        ? `[${i}].metadata.namespaceFilter[${idx}]`
                        : `metadata.namespaceFilter[${idx}]`,
                    },
                  },
                  400,
                );
              }
            }
          }
          const authzResult = validateQueryAuthz(query, validatedSchema, {
            allowUnknownResources: handlerOpts?.allowUnknownResources,
            debug: handlerOpts?.debug,
          });
          if (!authzResult.ok) {
            return errorResponse({
              code: authzResult.code,
              message: authzResult.message,
              details: { path: isBatch ? `[${i}].${authzResult.path}` : authzResult.path },
            }, 403);
          }
        }

        // Execute queries
        if (db) {
          const namespace = await extractNamespace(ctx);
          const actorId = extractActorId ? await extractActorId(ctx) : undefined;

          timer?.startPhase("plan");
          // FIX-SRV-003: Bounded concurrency — queue excess queries instead of rejecting
          const concurrency = handlerOpts?.maxBatchQueryConcurrency ?? 20;
          const queryTasks = transformedQueries.map((q) => () => {
              const queryStart = Date.now();
              const query = q as Record<string, unknown>;
              const metadata =
                query.metadata &&
                typeof query.metadata === "object" &&
                !Array.isArray(query.metadata)
                  ? (query.metadata as QueryEnvelopeMetadata)
                  : undefined;
              const accessMode =
                metadata?.accessMode === "sharedWithMe" ? "sharedWithMe" : "namespace";
              if (query.operation === "getPermissions") {
                return (async () => {
                  if (typeof query.id !== "string") {
                    throw new Error("Invalid DFQL: id must be string");
                  }
                  const accessLevel = await resolveAccessLevel(
                    db,
                    validatedSchema,
                    String(query.resource),
                    query.id,
                    actorId,
                    namespace,
                  );
                  if (accessLevel !== "owner") {
                    throw new Error("FORBIDDEN:getPermissions");
                  }
                  return listPermissionsForInspection(
                    String(query.resource),
                    query.id,
                    namespace,
                  );
                })().then((result) => {
                  queryDurations.push(Date.now() - queryStart);
                  return result;
                });
              }

              if (accessMode === "sharedWithMe") {
                return executeSharedWithMeQuery(
                  query,
                  metadata,
                  namespace,
                  actorId,
                  timer,
                ).then((result) => {
                  queryDurations.push(Date.now() - queryStart);
                  return result;
                });
              }

              return resolveShareableAccessIds(
                String(query.resource),
                namespace,
                actorId,
              ).then((shareableAccess) => {
                const queryWithMetadata = {
                  ...query,
                  metadata: {
                    ...(metadata ?? {}),
                    ...(shareableAccess ?? {}),
                  } satisfies QueryEnvelopeMetadata,
                };
                const queryWithAutoFilters = injectCapabilityAutoFilters(
                  queryWithMetadata as any,
                  validatedSchema,
                );
                return executeSingleQuery(
                  queryWithAutoFilters as unknown as Record<string, unknown>,
                  validatedSchema,
                  db,
                  namespace,
                  actorId,
                  searchProvider,
                  logger,
                  timer,
                  multiRegionRuntime,
                );
              }).then((result) => {
                queryDurations.push(Date.now() - queryStart);
                return result;
              });
          });
          let results: unknown[];
          try {
            results = await runBounded(queryTasks, concurrency);
          } catch (error) {
            if (error instanceof Error && error.message === "FORBIDDEN:getPermissions") {
              return errorResponse({
                code: "FORBIDDEN",
                message: "Authorization denied",
                details: { path: "operation" },
              }, 403);
            }
            if (error instanceof Error && error.message === "Invalid DFQL: id must be string") {
              return errorResponse({
                code: "DFQL_INVALID",
                message: "Invalid DFQL: id must be string",
                details: { path: "id" },
              });
            }
            throw error;
          }

          timer?.startPhase("materialize");
          let result = isBatch ? results : results[0];

          // Run afterQuery hooks (fail-open)
          result = await runAfterQuery(transformedBody, result, hookCtx, plugins);

          if (timingEmitter && timer) {
            timingEmitter(timer.build("/datafn/query", resource, "query"));
          }

          return okResponse(result);
        } else {
          // Phase 01: Return empty results if no DB provided
          const emptyResult = isBatch
            ? transformedQueries.map((q) => {
                const query = q as Record<string, unknown>;
                if (query.groupBy || hasTemporalGrouping(query)) {
                    return { groups: [], nextCursor: null };
                }
                return { data: [], nextCursor: null };
            })
            : (() => {
                const query = transformedQueries[0] as Record<string, unknown>;
                if (query.groupBy || hasTemporalGrouping(query)) {
                    return { groups: [], nextCursor: null };
                }
                return { data: [], nextCursor: null };
            })();
          return okResponse(emptyResult);
        }
      } catch (error) {
        logger?.error("Query execution failed", { error: String(error), operation: "query" });
        return errorResponse({
            code: "INTERNAL",
            message: "Internal error",
            details: { path: "$" }
        });
      } finally {
          logRequest({
              timestamp: new Date().toISOString(),
              endpoint: "/datafn/query",
              resource: resource,
              operation: "query",
              duration_ms: Date.now() - startTime,
              // SRV-006: Include per-query timings when available
              ...(queryDurations.length > 0 ? { queryDurations } : {}),
          }, logger);
      }
    };}
