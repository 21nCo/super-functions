import type { Adapter, IndexedDirectoryRecord, IndexedDirectoryStoreAdapter } from "@superfunctions/db";
import type { Route } from "@superfunctions/http";
import {
  ensureBuiltinPublicLinks,
  resolveCapabilities,
  type DatafnPlugin,
  type DatafnSchema,
} from "@datafn/core";
import { errorResponse, okResponse } from "../http/errors.js";
import {
  executeShare,
  getFailedSharePermissionRecord,
  rollbackDatafnPermissionGrantAfterFailedShare,
  snapshotDatafnPermissionGrantBeforeShare,
  syncDatafnPermissionGrantAfterCommit,
} from "../execution/mutation/share.js";
import type { DataFnAction } from "../events.js";
import type { DatafnMultiRegionRuntimeConfig } from "./multi-region.js";
import {
  drainPermissionDirectorySync,
  deferFailedShareCompensation,
  enqueuePermissionDirectorySync,
  ensurePermissionDirectoryOutbox,
  markPermissionDirectorySyncReady,
} from "../execution/mutation/permission-directory-outbox.js";

export type DatafnPublicLinkShareLevel = "viewer" | "editor" | "owner";
export type DatafnPublicLinkShareScope = "record" | "resource";

export interface DatafnPublicLinkRecord {
  id: string;
  principalId: string;
  resource: string;
  recordId?: string | null;
  scope: DatafnPublicLinkShareScope;
  level: DatafnPublicLinkShareLevel;
  tokenHash: string;
  expiresAt?: number | null;
  revokedAt?: number | null;
  resourceRegion?: string;
  __ns?: string;
  createdAt?: number;
  createdBy?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface DatafnPublicLinkPrincipal {
  linkId: string;
  principalId: string;
  actorId: string;
  namespace: string;
  resourceRegion?: string;
  resource: string;
  recordId?: string | null;
  scope: DatafnPublicLinkShareScope;
  level: DatafnPublicLinkShareLevel;
}

export interface CreateDatafnPublicLinkInput {
  resource: string;
  recordId?: string | null;
  scope?: DatafnPublicLinkShareScope;
  level?: DatafnPublicLinkShareLevel;
  expiresAt?: number | string | null;
}

export interface DatafnPublicLinkGrant {
  id: string;
  token: string;
  principalId: string;
  resource: string;
  recordId: string | null;
  scope: DatafnPublicLinkShareScope;
  level: DatafnPublicLinkShareLevel;
}

/** Authorization input accepted by the public-links plugin. */
export interface DatafnPublicLinkAuthorizationInput {
  action: DataFnAction;
  context: unknown;
  payload: unknown;
}

export interface DatafnPublicLinksPluginConfig<TSession = unknown> {
  authenticateOwner?: (request: Request) => Promise<TSession | null> | TSession | null;
  getOwnerActorId(session: TSession): string | undefined;
  getOwnerNamespace(actorId: string, session: TSession): string | Promise<string>;
  modelName?: string;
  principalPrefix?: string;
  tokenHeader?: string;
  directory?: IndexedDirectoryStoreAdapter;
  resourceRegion?: string;
}

export interface DatafnPublicLinksPlugin<TSession = unknown> extends DatafnPlugin {
  readonly modelName: string;
  readonly tokenHeader: string;
  readonly internalResources: readonly string[];
  readonly permissionDirectoryRuntime?: DatafnMultiRegionRuntimeConfig;
  readToken(request: Request): string | null;
  principalId(linkId: string): string;
  withSchema(schema: DatafnSchema): DatafnSchema;
  resolve(
    database: Adapter,
    token: string | null | undefined
  ): Promise<DatafnPublicLinkPrincipal | null>;
  authorize(input: DatafnPublicLinkAuthorizationInput): boolean | undefined;
  routes(input: {
    database: Adapter;
    crossNamespaceDatabase?: Adapter;
    schema: DatafnSchema;
  }): Route[];
}

export class DatafnPublicLinkInputError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = "DatafnPublicLinkInputError";
    this.path = path;
  }
}

/**
 * Adds the DataFn public-link storage resource to a schema for database codegen.
 */
export function withDatafnPublicLinksSchema(
  schema: DatafnSchema,
  options: { modelName?: string } = {},
): DatafnSchema {
  return ensureBuiltinPublicLinks(schema, options);
}

/**
 * Creates DataFn-native public-link route and principal resolution support.
 */
export function createDatafnPublicLinksPlugin<TSession = unknown>(
  config: DatafnPublicLinksPluginConfig<TSession>
): DatafnPublicLinksPlugin<TSession> {
  const modelName = config.modelName ?? "publicLink";
  const principalPrefix = config.principalPrefix ?? "public_link:";
  const tokenHeader = config.tokenHeader ?? "x-datafn-public-link-token";
  type OwnerRouteState = {
    session: TSession;
    actorId: string;
    namespace: string;
  };
  const ownerRouteState = new WeakMap<Request, OwnerRouteState | null>();
  const resolveOwnerRouteState = async (request: Request): Promise<OwnerRouteState | null> => {
    if (ownerRouteState.has(request)) return ownerRouteState.get(request) ?? null;
    const session = await config.authenticateOwner?.(request) ?? null;
    const actorId = session ? config.getOwnerActorId(session) : undefined;
    if (!session || !actorId) {
      ownerRouteState.set(request, null);
      return null;
    }
    const state = {
      session,
      actorId,
      namespace: await config.getOwnerNamespace(actorId, session),
    };
    ownerRouteState.set(request, state);
    return state;
  };
  const ownerPlacement = {
    resolveNamespace: async (request: Request): Promise<string | Response> => {
      const state = await resolveOwnerRouteState(request);
      return state?.namespace ?? errorResponse(
        { code: "FORBIDDEN", message: "Authenticated session is required" },
        401,
      );
    },
  };
  const publicLinkPlacement = {
    resolveNamespace: async (request: Request): Promise<string | Response> => {
      const token = await readPublicLinkTokenFromRequest(request.clone(), tokenHeader);
      const parsed = parsePublicLinkToken(token);
      if (!parsed) {
        return errorResponse(
          { code: "NOT_FOUND", message: "Public link is invalid or revoked" },
          404,
        );
      }
      if (!config.directory) {
        return errorResponse(
          {
            code: "DATAFN_PLACEMENT_UNAVAILABLE",
            message: "Public-link placement directory is unavailable",
            details: { retryable: true, executionStarted: false },
          },
          503,
        );
      }
      let namespace: string | null;
      try {
        namespace = await resolvePublicLinkNamespaceFromDirectory(
          config.directory,
          `${principalPrefix}${parsed.id}`,
        );
      } catch {
        return errorResponse(
          {
            code: "DATAFN_PLACEMENT_UNAVAILABLE",
            message: "Public-link placement directory is unavailable",
            details: { retryable: true, executionStarted: false },
          },
          503,
        );
      }
      return namespace ?? errorResponse(
        { code: "NOT_FOUND", message: "Public link is invalid or revoked" },
        404,
      );
    },
  };

  const plugin: DatafnPublicLinksPlugin<TSession> = {
    name: "datafn-public-links",
    runsOn: ["server"],
    modelName,
    tokenHeader,
    internalResources: [modelName],
    ...(config.directory && config.resourceRegion
      ? {
          permissionDirectoryRuntime: {
            directory: config.directory,
            regionId: config.resourceRegion,
          },
        }
      : {}),
    authorize(input) {
      const publicLink = resolvePublicLinkFromContext(input.context);
      return publicLink ? authorizePublicLinkAction(input.action, publicLink) : undefined;
    },
    beforeQuery(ctx, query) {
      const publicLink = resolvePublicLinkFromContext(ctx.context);
      return publicLink ? normalizePublicLinkQuery(query, publicLink) : query;
    },
    beforeSearch(ctx, search) {
      const publicLink = resolvePublicLinkFromContext(ctx.context);
      return publicLink ? normalizePublicLinkSearch(search, publicLink) : search;
    },
    readToken(request) {
      return readDatafnPublicLinkToken(request, tokenHeader);
    },
    principalId(linkId) {
      return `${principalPrefix}${linkId}`;
    },
    withSchema(schema) {
      return ensureBuiltinPublicLinks(schema, { modelName });
    },
    resolve(database, token) {
      return resolveDatafnPublicLink(database, token, {
        modelName,
        principalPrefix,
        directory: config.directory
      });
    },
    routes({ database, crossNamespaceDatabase, schema }) {
      return [
        {
          method: "POST",
          path: "/datafn/public-links",
          meta: { datafnPlacement: ownerPlacement },
          handler: async (request) => {
            const owner = await resolveOwnerRouteState(request);
            if (!owner) {
              return errorResponse(
                { code: "FORBIDDEN", message: "Authenticated session is required" },
                401
              );
            }
            const body = await readJsonObject(request);
            if (!body.ok) return body.response;
            try {
              const link = await createDatafnPublicLink({
                database,
                schema,
                modelName,
                principalPrefix,
                directory: config.directory,
                resourceRegion: config.resourceRegion,
                namespace: owner.namespace,
                actorId: owner.actorId,
                input: body.data
              });
              return okResponse(link);
            } catch (error) {
              if (error instanceof DatafnPublicLinkInputError) {
                return errorResponse(
                  {
                    code: "DFQL_INVALID",
                    message: error.message,
                    details: { path: error.path }
                  },
                  400
                );
              }
              throw error;
            }
          }
        },
        {
          method: "POST",
          path: "/datafn/public-links/resolve",
          meta: { datafnPlacement: publicLinkPlacement },
          handler: async (request) => {
            const body = await request.json().catch(() => null);
            const token =
              body &&
              typeof body === "object" &&
              typeof (body as Record<string, unknown>).token === "string"
                ? ((body as Record<string, unknown>).token as string)
                : readDatafnPublicLinkToken(request, tokenHeader);
            const link = await plugin.resolve(
              crossNamespaceDatabase ?? database,
              token,
            );
            if (!link) {
              return errorResponse(
                {
                  code: "NOT_FOUND",
                  message: "Public link is invalid or revoked"
                },
                404
              );
            }
            return okResponse({
              principalId: link.principalId,
              resource: link.resource,
              recordId: link.recordId ?? null,
              scope: link.scope,
              level: link.level
            });
          }
        },
        {
          method: "POST",
          path: "/datafn/public-links/revoke",
          meta: { datafnPlacement: ownerPlacement },
          handler: async (request) => {
            const owner = await resolveOwnerRouteState(request);
            if (!owner) {
              return errorResponse(
                { code: "FORBIDDEN", message: "Authenticated session is required" },
                401
              );
            }
            const body = await readJsonObject(request);
            if (!body.ok) return body.response;
            try {
              const id =
                typeof body.data.id === "string" ? body.data.id : "";
              const revoked = await revokeDatafnPublicLink({
                database,
                modelName,
                directory: config.directory,
                namespace: owner.namespace,
                actorId: owner.actorId,
                id
              });
              if (!revoked) {
                return errorResponse(
                  { code: "NOT_FOUND", message: "Public link not found" },
                  404
                );
              }
              return okResponse({ id, revoked: true });
            } catch (error) {
              if (error instanceof DatafnPublicLinkInputError) {
                return errorResponse(
                  {
                    code: "DFQL_INVALID",
                    message: error.message,
                    details: { path: error.path }
                  },
                  400
                );
              }
              throw error;
            }
          }
        }
      ];
    }
  };

  return plugin;
}

function resolvePublicLinkFromContext(context: unknown): DatafnPublicLinkPrincipal | null {
  if (!context || typeof context !== "object") {
    return null;
  }
  const publicLink = (context as Record<string, unknown>).publicLink;
  if (!publicLink || typeof publicLink !== "object") {
    return null;
  }
  const record = publicLink as Partial<DatafnPublicLinkPrincipal>;
  return typeof record.principalId === "string" &&
    typeof record.actorId === "string" &&
    typeof record.namespace === "string" &&
    typeof record.resource === "string"
    ? record as DatafnPublicLinkPrincipal
    : null;
}

function authorizePublicLinkAction(
  action: DataFnAction,
  publicLink: DatafnPublicLinkPrincipal,
): boolean {
  if (publicLink.scope === "record" && !publicLink.recordId && action !== "status") {
    return false;
  }
  switch (action) {
    case "status":
    case "query":
      return true;
    case "search":
      return publicLink.scope === "resource";
    case "mutation":
    case "transact":
    case "seed":
    case "clone":
    case "pull":
    case "push":
    case "reconcile":
      return false;
  }
  return false;
}

function forbiddenPublicLinkError(message: string, path: string): never {
  throw {
    code: "FORBIDDEN",
    message,
    details: { path },
  };
}

function normalizePublicLinkQuery(
  query: unknown,
  publicLink: DatafnPublicLinkPrincipal,
): unknown {
  if (Array.isArray(query)) {
    return query.map((entry) => normalizePublicLinkQuery(entry, publicLink));
  }
  if (!query || typeof query !== "object") {
    return query;
  }
  const record = query as Record<string, unknown>;
  if (typeof record.resource !== "string") {
    return query;
  }
  if (record.resource !== publicLink.resource) {
    forbiddenPublicLinkError("Public link cannot access this resource", "resource");
  }

  if (publicLink.scope === "record") {
    if (!publicLink.recordId) {
      forbiddenPublicLinkError("Public link is missing its record scope", "recordId");
    }
    if (!filtersTargetRecordId(record.filters, publicLink.recordId)) {
      forbiddenPublicLinkError("Public link query must target the granted record", "filters.id");
    }
  }

  const metadata =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata as Record<string, unknown>
      : {};
  const filters =
    publicLink.scope === "record" && publicLink.recordId
      ? mergeQueryFilters(record.filters, { id: publicLink.recordId })
      : record.filters;

  return {
    ...record,
    ...(filters === undefined ? {} : { filters }),
    metadata: {
      ...metadata,
      accessMode: "sharedWithMe",
      namespaceFilter: [publicLink.namespace],
    },
  };
}

function normalizePublicLinkSearch(
  search: unknown,
  publicLink: DatafnPublicLinkPrincipal,
): unknown {
  if (publicLink.scope === "record") {
    forbiddenPublicLinkError("Public link search is not available for record links", "$");
  }
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return search;
  }

  const record = search as Record<string, unknown>;
  if (Array.isArray(record.resources)) {
    for (let i = 0; i < record.resources.length; i++) {
      if (record.resources[i] !== publicLink.resource) {
        forbiddenPublicLinkError("Public link cannot search this resource", `resources[${i}]`);
      }
    }
  }

  const filters =
    record.filters && typeof record.filters === "object" && !Array.isArray(record.filters)
      ? record.filters as Record<string, unknown>
      : undefined;
  const resourceFilter = filters?.[publicLink.resource];
  if (filters) {
    for (const resource of Object.keys(filters)) {
      if (resource !== publicLink.resource) {
        forbiddenPublicLinkError("Public link cannot search this resource", `filters.${resource}`);
      }
    }
  }
  if (
    resourceFilter !== undefined &&
    (typeof resourceFilter !== "object" || resourceFilter === null || Array.isArray(resourceFilter))
  ) {
    forbiddenPublicLinkError("Public link search filter must be an object", `filters.${publicLink.resource}`);
  }

  return {
    ...record,
    resources: [publicLink.resource],
    ...(resourceFilter ? { filters: { [publicLink.resource]: resourceFilter } } : {}),
  };
}

function filtersTargetRecordId(filters: unknown, recordId: string): boolean {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return false;
  }
  const record = filters as Record<string, unknown>;
  if (matchesExactIdFilter(record.id, recordId)) {
    return true;
  }
  const andFilters = record.$and;
  return Array.isArray(andFilters) &&
    andFilters.some((entry) => filtersTargetRecordId(entry, recordId));
}

function matchesExactIdFilter(value: unknown, recordId: string): boolean {
  if (value === recordId) {
    return true;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.eq === recordId || record.$eq === recordId) {
    return true;
  }
  const inValue = record.in ?? record.$in;
  return Array.isArray(inValue) &&
    inValue.length === 1 &&
    inValue[0] === recordId;
}

function mergeQueryFilters(existing: unknown, next: Record<string, unknown>): Record<string, unknown> {
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    return next;
  }
  const existingFilters = existing as Record<string, unknown>;
  if (Object.keys(existingFilters).length === 0) {
    return next;
  }
  if (
    Array.isArray(existingFilters.$and) &&
    Object.keys(existingFilters).length === 1
  ) {
    return {
      $and: [...(existingFilters.$and as Record<string, unknown>[]), next],
    };
  }
  return {
    $and: [existingFilters, next],
  };
}

function publicLinkDirectoryRecord(record: DatafnPublicLinkRecord): IndexedDirectoryRecord {
  return {
    key: publicLinkDirectoryKey(record.id),
    value: JSON.stringify(record),
    indexes: {
      "datafn.publicLink.principal": record.principalId,
      "datafn.publicLink.namespace": record.__ns,
      ...(record.resourceRegion ? { "datafn.publicLink.region": record.resourceRegion } : {})
    }
  };
}

function publicLinkDirectoryKey(id: string): string {
  return `datafn:publicLink:${id}`;
}

/**
 * Reads the DataFn public-link credential from a request.
 */
export function readDatafnPublicLinkToken(
  request: Request,
  tokenHeader = "x-datafn-public-link-token"
): string | null {
  const header = request.headers.get(tokenHeader);
  if (header?.trim()) return header.trim();
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("publiclink ")) return null;
  return authorization.slice("publiclink ".length).trim();
}

async function readPublicLinkTokenFromRequest(
  request: Request,
  tokenHeader: string,
): Promise<string | null> {
  const body = await request.json().catch(() => null);
  return body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).token === "string"
    ? String((body as Record<string, unknown>).token)
    : readDatafnPublicLinkToken(request, tokenHeader);
}

async function resolvePublicLinkNamespaceFromDirectory(
  directory: IndexedDirectoryStoreAdapter,
  principalId: string,
): Promise<string | null> {
  const namespaces = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await directory.query({
      index: "datafn.permission.principal",
      value: principalId,
      ...(cursor ? { cursor } : {}),
    });
    for (const record of page.records) {
      try {
        const grant = JSON.parse(record.value) as Record<string, unknown>;
        if (
          grant.principalId === principalId &&
          typeof grant.resourceNs === "string" &&
          grant.resourceNs.length > 0 &&
          (grant.revokedAt === null || grant.revokedAt === undefined)
        ) {
          namespaces.add(grant.resourceNs);
        }
      } catch {
      }
    }
    cursor = page.cursor;
    if (cursor && cursors.has(cursor)) break;
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return namespaces.size === 1 ? [...namespaces][0] : null;
}

/**
 * Resolves a DataFn public-link token to its principal and namespace.
 */
export async function resolveDatafnPublicLink(
  database: Adapter,
  token: string | null | undefined,
  options: {
    modelName?: string;
    principalPrefix?: string;
    directory?: IndexedDirectoryStoreAdapter;
  } = {}
): Promise<DatafnPublicLinkPrincipal | null> {
  const parsed = parsePublicLinkToken(token);
  if (!parsed) return null;
  // The database is authoritative for authorization state. A directory entry
  // can remain stale when invalidation fails after a successful revocation.
  const record = await database.findOne<DatafnPublicLinkRecord>({
    model: options.modelName ?? "publicLink",
    where: [{ field: "id", operator: "eq", value: parsed.id }]
  });
  if (!record || record.revokedAt || isExpired(record.expiresAt)) return null;
  if (record.tokenHash !== await hashPublicLinkToken(parsed.token)) return null;
  if (typeof record.__ns !== "string" || record.__ns.length === 0) return null;
  if (!isPublicLinkScope(record.scope) || !isPublicLinkLevel(record.level)) {
    return null;
  }

  return {
    linkId: record.id,
    principalId:
      record.principalId ??
      `${options.principalPrefix ?? "public_link:"}${record.id}`,
    actorId:
      record.principalId ??
      `${options.principalPrefix ?? "public_link:"}${record.id}`,
    namespace: record.__ns,
    resourceRegion: typeof record.resourceRegion === "string" ? record.resourceRegion : undefined,
    resource: record.resource,
    recordId: record.recordId ?? null,
    scope: record.scope,
    level: record.level
  };
}

async function createDatafnPublicLink(input: {
  database: Adapter;
  schema: DatafnSchema;
  modelName: string;
  principalPrefix: string;
  directory?: IndexedDirectoryStoreAdapter;
  resourceRegion?: string;
  namespace: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<DatafnPublicLinkGrant> {
  const validation = validatePublicLinkGrant(input.schema, input.input);
  if (!validation.ok) {
    throw new DatafnPublicLinkInputError(validation.message, validation.path);
  }
  const permissionDirectoryRuntime = input.directory && input.resourceRegion
    ? { directory: input.directory, regionId: input.resourceRegion }
    : null;
  if (permissionDirectoryRuntime) {
    await ensurePermissionDirectoryOutbox(input.database);
  }

  const id = `plink:${crypto.randomUUID()}`;
  const secret = randomSecret();
  const token = `${id}.${secret}`;
  const principalId = `${input.principalPrefix}${id}`;
  const now = Date.now();
  const record: DatafnPublicLinkRecord = {
    id,
    principalId,
    resource: validation.resource,
    recordId: validation.recordId,
    scope: validation.scope,
    level: validation.level,
    tokenHash: await hashPublicLinkToken(token),
    expiresAt: validation.expiresAt,
    revokedAt: null,
    __ns: input.namespace,
    ...(input.resourceRegion ? { resourceRegion: input.resourceRegion } : {}),
    createdAt: now,
    createdBy: input.actorId,
    updatedAt: now,
    updatedBy: input.actorId
  };
  const permissionMutation = {
    operation: "share",
    resource: validation.resource,
    id: validation.recordId ?? undefined,
    scope: validation.scope,
    shareWith: { principalId },
  } as const;
  const permissionSnapshot = await snapshotDatafnPermissionGrantBeforeShare(
    input.database,
    permissionMutation,
    input.namespace,
  );
  let permissionDirectoryTaskId = permissionDirectoryRuntime
    ? await enqueuePermissionDirectorySync(
        input.database,
        permissionMutation,
        input.namespace,
        permissionDirectoryRuntime.regionId,
        { pending: true },
      )
    : null;

  const settlePermissionDirectoryTask = async () => {
    if (!permissionDirectoryRuntime || !permissionDirectoryTaskId) return;
    try {
      const release = await markPermissionDirectorySyncReady(
        input.database,
        permissionDirectoryTaskId,
      );
      if (release === "ownership-lost") {
        permissionDirectoryTaskId = await enqueuePermissionDirectorySync(
          input.database,
          permissionMutation,
          input.namespace,
          permissionDirectoryRuntime.regionId,
        );
      }
      await drainPermissionDirectorySync(
        input.database,
        permissionDirectoryTaskId,
        permissionDirectoryRuntime,
      );
    } catch (error) {
      // The task remains durable. A failed release stops its owner heartbeat,
      // so the last lease eventually expires into the scheduled retry queue.
      console.warn("Public-link permission directory reconciliation deferred", {
        error: String(error),
        operation: "public-link-permission-directory",
        taskId: permissionDirectoryTaskId,
      });
    }
  };

  let shareResult: Awaited<ReturnType<typeof executeShare>>;
  try {
    await input.database.create({
      model: input.modelName,
      data: record as unknown as Record<string, unknown>,
      namespace: input.namespace
    });

    shareResult = await executeShare(
      input.database,
      {
        resource: validation.resource,
        id: validation.recordId ?? undefined,
        scope: validation.scope,
        shareWith: {
          principalId,
          level: validation.level
        }
      },
      validation.capabilities,
      input.namespace,
      input.actorId,
      undefined,
      permissionDirectoryRuntime,
    );
  } catch (error) {
    const failedPermissionRecord = getFailedSharePermissionRecord(error);
    const compensationSnapshot = failedPermissionRecord
      ? {
          ...permissionSnapshot,
          compensationExpectedCanonical: failedPermissionRecord,
        }
      : null;
    let compensationError: unknown;
    if (compensationSnapshot) {
      try {
        await rollbackDatafnPermissionGrantAfterFailedShare(
          input.database,
          {
            resource: validation.resource,
            id: validation.recordId ?? undefined,
            scope: validation.scope,
            shareWith: { principalId },
          },
          input.namespace,
          permissionDirectoryRuntime,
          compensationSnapshot,
        );
      } catch (cleanupError) {
        compensationError = cleanupError;
      }
    }
    if (compensationError && permissionDirectoryTaskId && compensationSnapshot) {
      try {
        await deferFailedShareCompensation(
          input.database,
          permissionDirectoryTaskId,
          permissionMutation,
          compensationSnapshot,
          compensationError,
          input.namespace,
          permissionDirectoryRuntime!.regionId,
        );
      } catch (schedulingError) {
        const combined = new Error(
          `Permission compensation failed and could not be made durable: ${String(schedulingError)}`,
        );
        (combined as Error & { causes?: unknown[] }).causes = [
          compensationError,
          schedulingError,
        ];
        compensationError = combined;
      }
    }
    try {
      // The public-link row is created before its permission grant. If grant
      // creation throws, roll the token back just as we do for an explicit
      // unsuccessful result so it can never resolve without authority.
      await input.database.delete({
        model: input.modelName,
        where: [{ field: "id", operator: "eq", value: id }],
        namespace: input.namespace
      });
    } finally {
      if (!compensationError) {
        await settlePermissionDirectoryTask();
      }
    }
    if (compensationError) {
      const cleanupFailure = new Error(
        `Public-link share failed and permission compensation was incomplete: ${String(compensationError)}`,
      );
      (cleanupFailure as Error & { cause?: unknown }).cause = error;
      throw cleanupFailure;
    }
    throw error;
  }
  if (!shareResult.ok) {
    try {
      await input.database.delete({
        model: input.modelName,
        where: [{ field: "id", operator: "eq", value: id }],
        namespace: input.namespace
      });
    } finally {
      await settlePermissionDirectoryTask();
    }
    throw new DatafnPublicLinkInputError(shareResult.message, shareResult.path);
  }
  if (permissionDirectoryRuntime) {
    await settlePermissionDirectoryTask();
  } else {
    await syncDatafnPermissionGrantAfterCommit(
      input.database,
      {
        operation: "share",
        resource: validation.resource,
        id: validation.recordId ?? undefined,
        scope: validation.scope,
        shareWith: { principalId },
      },
      input.namespace,
      null,
    );
  }
  await input.directory?.put(publicLinkDirectoryRecord(record));

  return {
    id,
    token,
    principalId,
    resource: validation.resource,
    recordId: validation.recordId,
    scope: validation.scope,
    level: validation.level
  };
}

async function revokeDatafnPublicLink(input: {
  database: Adapter;
  modelName: string;
  directory?: IndexedDirectoryStoreAdapter;
  namespace: string;
  actorId: string;
  id: string;
}): Promise<boolean> {
  const id = input.id.trim();
  if (!id) {
    throw new DatafnPublicLinkInputError("id must be a non-empty string", "id");
  }
  const existing = await input.database.findOne<DatafnPublicLinkRecord>({
    model: input.modelName,
    where: [{ field: "id", operator: "eq", value: id }],
    namespace: input.namespace
  });
  if (!existing) return false;
  await input.database.update({
    model: input.modelName,
    where: [{ field: "id", operator: "eq", value: id }],
    data: {
      revokedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: input.actorId
    },
    namespace: input.namespace
  });
  await input.directory?.delete(publicLinkDirectoryKey(id));
  return true;
}

function validatePublicLinkGrant(
  schema: DatafnSchema,
  input: Record<string, unknown>
):
  | {
      ok: true;
      resource: string;
      recordId: string | null;
      scope: DatafnPublicLinkShareScope;
      level: DatafnPublicLinkShareLevel;
      expiresAt: number | null;
      capabilities: unknown[];
    }
  | { ok: false; message: string; path: string } {
  const resource = typeof input.resource === "string" ? input.resource.trim() : "";
  const resourceSchema = schema.resources.find((entry) => entry.name === resource);
  if (!resourceSchema) {
    return {
      ok: false,
      message: "resource is not a DataFn resource",
      path: "resource"
    };
  }

  const capabilities = resolveCapabilities(
    schema.capabilities as any,
    resourceSchema.capabilities as any
  );
  const shareable = resolveShareableCapability(capabilities);
  if (!shareable) {
    return {
      ok: false,
      message: "resource does not support sharing",
      path: "resource"
    };
  }

  const scope = input.scope ?? "record";
  if (!isPublicLinkScope(scope)) {
    return {
      ok: false,
      message: "scope must be either record or resource",
      path: "scope"
    };
  }
  if (scope === "resource" && shareable.supportsScopeGrants === false) {
    return {
      ok: false,
      message: "resource does not support scope grants",
      path: "scope"
    };
  }

  const level = input.level ?? "viewer";
  if (!isPublicLinkLevel(level) || !shareable.levels?.includes(level)) {
    return {
      ok: false,
      message: "level must be viewer, editor, or owner",
      path: "level"
    };
  }

  const recordId = typeof input.recordId === "string" ? input.recordId.trim() : "";
  if (scope === "record" && !recordId) {
    return {
      ok: false,
      message: "recordId is required for record links",
      path: "recordId"
    };
  }

  const expiresAt = normalizeExpiresAt(input.expiresAt);
  if (expiresAt === undefined) {
    return {
      ok: false,
      message: "expiresAt must be a timestamp when provided",
      path: "expiresAt"
    };
  }

  return {
    ok: true,
    resource,
    recordId: scope === "resource" ? null : recordId,
    scope,
    level,
    expiresAt,
    capabilities
  };
}

function resolveShareableCapability(capabilities: unknown[]): {
  levels?: string[];
  supportsScopeGrants?: boolean;
} | null {
  const entry = capabilities.find(
    (capability) =>
      typeof capability === "object" &&
      capability !== null &&
      "shareable" in (capability as Record<string, unknown>)
  ) as { shareable?: { levels?: string[]; supportsScopeGrants?: boolean } } | undefined;
  return entry?.shareable ?? null;
}

async function readJsonObject(
  request: Request
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: Response }
> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      response: errorResponse(
        {
          code: "DFQL_INVALID",
          message: "JSON body is required",
          details: { path: "$" }
        },
        400
      )
    };
  }
  return { ok: true, data: body as Record<string, unknown> };
}

function parsePublicLinkToken(
  token: string | null | undefined
): { id: string; token: string } | null {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  const separatorIndex = trimmed.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) return null;
  return {
    id: trimmed.slice(0, separatorIndex),
    token: trimmed
  };
}

function normalizeExpiresAt(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(numeric) && numeric > Date.now() ? numeric : undefined;
}

function isExpired(value: number | null | undefined): boolean {
  return typeof value === "number" && value <= Date.now();
}

function isPublicLinkScope(value: unknown): value is DatafnPublicLinkShareScope {
  return value === "record" || value === "resource";
}

function isPublicLinkLevel(value: unknown): value is DatafnPublicLinkShareLevel {
  return value === "viewer" || value === "editor" || value === "owner";
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashPublicLinkToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(`datafn-public-link-v1:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
