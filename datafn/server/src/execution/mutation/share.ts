import type {
  Adapter,
  TransactionAdapter,
  WhereClause,
} from "@superfunctions/db";
import type { DatafnLogger } from "../../logger.js";
import { hasResourceScopeOwnerAccess } from "../../validation/authz.js";
import {
  emitLegacyShareDeprecationWarning,
  getLegacyPermissionsTable,
  getSpv2MigrationRuntimeConfig,
  mirrorGrantToLegacyV1,
  removeLegacyV1Grant,
} from "../migration/spv2.js";
import {
  deleteDatafnPermissionGrant,
  indexDatafnPermissionGrant,
} from "../../plugins/multi-region.js";
import type { DatafnMultiRegionRuntimeConfig } from "../../plugins/multi-region.js";

type ShareableConfig = {
  levels: string[];
  default: "private" | "shared";
  supportsScopeGrants?: boolean;
  crossNsShareable?: boolean;
};

type ShareableEntry = {
  shareable: ShareableConfig;
};

function getShareableConfig(resolvedCapabilities: unknown[]): ShareableConfig | null {
  const entry = resolvedCapabilities.find(
    (capability): capability is ShareableEntry =>
      typeof capability === "object" &&
      capability !== null &&
      "shareable" in (capability as Record<string, unknown>),
  );
  return entry?.shareable ?? null;
}

type ShareScope = "record" | "resource";

type PrincipalCanonicalizationResult =
  | { ok: true; principalId: string }
  | { ok: false; code: "DFQL_PRINCIPAL_INVALID"; message: string; path: string };

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalizePrincipalFromUserId(userId: string): string {
  return userId.includes(":") ? userId : `user:${userId}`;
}

function canonicalizeSharePrincipal(
  shareWith: Record<string, unknown> | undefined,
): PrincipalCanonicalizationResult {
  if (!shareWith) {
    return {
      ok: false,
      code: "DFQL_PRINCIPAL_INVALID",
      message: "Either shareWith.userId or shareWith.principalId is required",
      path: "shareWith",
    };
  }

  const principalId = normalizeNonEmptyString(shareWith.principalId);
  const userId = normalizeNonEmptyString(shareWith.userId);

  if (shareWith.principalId !== undefined && principalId === null) {
    return {
      ok: false,
      code: "DFQL_PRINCIPAL_INVALID",
      message: "principalId must be non-empty string",
      path: "shareWith.principalId",
    };
  }

  if (shareWith.userId !== undefined && userId === null) {
    return {
      ok: false,
      code: "DFQL_PRINCIPAL_INVALID",
      message: "userId must be non-empty string",
      path: "shareWith.userId",
    };
  }

  if (principalId && userId) {
    const canonicalFromUser = canonicalizePrincipalFromUserId(userId);
    if (canonicalFromUser !== principalId) {
      return {
        ok: false,
        code: "DFQL_PRINCIPAL_INVALID",
        message: "Provide only one of shareWith.userId or shareWith.principalId",
        path: "shareWith",
      };
    }
  }

  if (!principalId && !userId) {
    return {
      ok: false,
      code: "DFQL_PRINCIPAL_INVALID",
      message: "Either shareWith.userId or shareWith.principalId is required",
      path: "shareWith",
    };
  }

  return {
    ok: true,
    principalId: principalId ?? canonicalizePrincipalFromUserId(userId as string),
  };
}

function getShareScope(scope: unknown): ShareScope {
  return scope === "resource" ? "resource" : "record";
}

const GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global";

function getPermissionsTableName(): string {
  return GLOBAL_PERMISSIONS_TABLE;
}

function getPermissionEntryId(
  resourceType: string,
  resourceNs: string,
  resourceId: string | null,
  principalId: string,
): string {
  return `${resourceType}:${resourceNs}:${resourceId ?? "*"}:${principalId}`;
}

export interface DatafnPermissionGrantSnapshot {
  permissionId: string;
  resource: string;
  resourceId: string | null;
  principalId: string;
  canonical: Record<string, unknown> | null;
  legacyManaged: boolean;
  legacy: Record<string, unknown> | null;
  /** Canonical row written by the failed share and therefore owned by compensation. */
  compensationExpectedCanonical?: Record<string, unknown>;
}

const FAILED_SHARE_PERMISSION_RECORD = "datafnFailedSharePermissionRecord";

export function getFailedSharePermissionRecord(
  error: unknown,
): Record<string, unknown> | null {
  if (typeof error !== "object" || error === null) return null;
  const record = (error as Record<string, unknown>)[FAILED_SHARE_PERMISSION_RECORD];
  return typeof record === "object" && record !== null && !Array.isArray(record)
    ? record as Record<string, unknown>
    : null;
}

function attachFailedSharePermissionRecord(
  error: unknown,
  record: Record<string, unknown>,
): Error {
  const failure = error instanceof Error ? error : new Error(String(error));
  try {
    Object.defineProperty(failure, FAILED_SHARE_PERMISSION_RECORD, {
      configurable: true,
      value: record,
    });
    return failure;
  } catch {
    const wrapped = new Error(String(error));
    (wrapped as Error & { cause?: unknown }).cause = error;
    Object.defineProperty(wrapped, FAILED_SHARE_PERMISSION_RECORD, {
      value: record,
    });
    return wrapped;
  }
}

export async function snapshotDatafnPermissionGrantBeforeShare(
  db: Adapter,
  mutation: {
    resource: string;
    id?: string;
    scope?: "record" | "resource";
    shareWith?: { principalId?: string; userId?: string };
  },
  namespace: string,
): Promise<DatafnPermissionGrantSnapshot> {
  const principal = canonicalizeSharePrincipal(
    mutation.shareWith as Record<string, unknown> | undefined,
  );
  if (!principal.ok) {
    throw new Error("Cannot snapshot a share with an invalid principal");
  }
  const resourceId = getShareScope(mutation.scope) === "resource"
    ? null
    : mutation.id ?? null;
  const permissionId = getPermissionEntryId(
    mutation.resource,
    namespace,
    resourceId,
    principal.principalId,
  );
  const canonical = await db.findOne({
    model: getPermissionsTableName(),
    where: [{ field: "id", operator: "eq", value: permissionId }],
    namespace,
  });
  const legacyManaged = getSpv2MigrationRuntimeConfig().writeMode === "dual";
  const legacyId = `${mutation.resource}:${resourceId ?? "*"}:${principal.principalId}`;
  const legacy = legacyManaged
    ? await db.findOne({
        model: getLegacyPermissionsTable(mutation.resource),
        where: [{ field: "id", operator: "eq", value: legacyId }],
        namespace,
      })
    : null;
  return {
    permissionId,
    resource: mutation.resource,
    resourceId,
    principalId: principal.principalId,
    canonical: canonical as Record<string, unknown> | null,
    legacyManaged,
    legacy: legacy as Record<string, unknown> | null,
  };
}

async function restoreGrantRecord(
  db: Adapter,
  model: string,
  id: string,
  record: Record<string, unknown>,
  namespace: string,
): Promise<void> {
  const update = { ...record };
  delete update.id;
  await db.upsert({
    model,
    where: [{ field: "id", operator: "eq", value: id }],
    create: { ...record, id },
    update,
    namespace,
    conflictTarget: "id",
  });
}

const CANONICAL_GRANT_OWNERSHIP_FIELDS = [
  "id",
  "resourceType",
  "resourceNs",
  "resourceId",
  "principalId",
  "level",
  "grantKind",
  "sourceRef",
  "grantedBy",
  "grantedAt",
  "revokedAt",
  "resourceRegion",
] as const;

const LEGACY_GRANT_OWNERSHIP_FIELDS = [
  "id",
  "resourceId",
  "userId",
  "level",
  "grantedBy",
  "grantedAt",
  "revokedAt",
] as const;

function grantOwnershipWhere(
  record: Record<string, unknown>,
  fields: readonly string[],
): WhereClause[] {
  return fields.map((field) => ({
    field,
    operator: "eq" as const,
    value: record[field] ?? null,
  }));
}

async function conditionallyRestoreGrantRecord(
  db: Adapter | TransactionAdapter,
  model: string,
  expected: Record<string, unknown>,
  desired: Record<string, unknown> | null,
  ownershipFields: readonly string[],
  namespace: string,
): Promise<boolean> {
  const current = await db.findOne({
    model,
    where: [{ field: "id", operator: "eq", value: expected.id }],
    namespace,
  });
  if (!current && !desired) return true;
  if (
    current &&
    desired &&
    ownershipFields.every(
      (field) => (current[field] ?? null) === (desired[field] ?? null),
    )
  ) {
    return true;
  }
  const where = grantOwnershipWhere(expected, ownershipFields);
  if (!desired) {
    return (await db.deleteMany({ model, where, namespace })) > 0;
  }
  const update = { ...desired };
  delete update.id;
  return (await db.updateMany({ model, where, data: update, namespace })) > 0;
}

const COMPENSATION_OWNERSHIP_LOST = Symbol("compensation-ownership-lost");

function expectedLegacyGrantFromCanonical(
  snapshot: DatafnPermissionGrantSnapshot,
  canonical: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: `${snapshot.resource}:${snapshot.resourceId ?? "*"}:${snapshot.principalId}`,
    resourceId: snapshot.resourceId,
    userId: snapshot.principalId,
    level: canonical.level,
    grantedBy: canonical.grantedBy,
    grantedAt: canonical.grantedAt,
    revokedAt: canonical.revokedAt ?? null,
  };
}

async function reconcileCompensatedGrantDirectory(
  db: Adapter,
  snapshot: DatafnPermissionGrantSnapshot,
  namespace: string,
  multiRegionRuntime: DatafnMultiRegionRuntimeConfig | null,
): Promise<void> {
  const current = await db.findOne({
    model: getPermissionsTableName(),
    where: [{ field: "id", operator: "eq", value: snapshot.permissionId }],
    namespace,
  });
  if (current) {
    await indexDatafnPermissionGrant(
      current as Record<string, unknown>,
      multiRegionRuntime,
    );
    return;
  }
  await deleteDatafnPermissionGrant({
    id: snapshot.permissionId,
    resourceType: snapshot.resource,
    resourceNs: namespace,
    resourceId: snapshot.resourceId,
    principalId: snapshot.principalId,
  }, multiRegionRuntime);
}

async function removeLegacyGrantWithRetries(input: {
  db: Adapter;
  namespace: string;
  resource: string;
  resourceId: string | null;
  principalId: string;
}): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await removeLegacyV1Grant(input);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function isPrincipalInNamespace(
  principalId: string,
  namespace: string,
): boolean {
  return principalId === namespace || principalId.startsWith(`${namespace}:`);
}

type OwnershipResult =
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; code: string; message: string; path: string };

async function ensureOwnerAccess(
  db: Adapter,
  resource: string,
  recordId: string,
  namespace: string,
  actorId: string | undefined,
): Promise<OwnershipResult> {
  if (!actorId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    };
  }

  const record = await db.findOne({
    model: resource,
    where: [{ field: "id", operator: "eq", value: recordId }],
    namespace,
  });

  if (!record) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: `Record not found: ${recordId}`,
      path: "id",
    };
  }

  const creatorId = (record as Record<string, unknown>).createdBy;
  const actorPrincipal = canonicalizePrincipalFromUserId(actorId);
  const creatorPrincipal = normalizeNonEmptyString(creatorId)
    ? canonicalizePrincipalFromUserId(String(creatorId))
    : null;

  if (creatorId === actorId || creatorPrincipal === actorPrincipal) {
    return { ok: true, record: record as Record<string, unknown> };
  }

  const permissionsTable = getPermissionsTableName();
  const ownerGrants = await db.findMany({
    model: permissionsTable,
    where: [
      { field: "resourceType", operator: "eq", value: resource },
      { field: "resourceNs", operator: "eq", value: namespace },
      { field: "principalId", operator: "eq", value: actorPrincipal },
      { field: "level", operator: "eq", value: "owner" },
    ],
    namespace,
  });
  const ownerPermission = ownerGrants.find(
    (entry) =>
      (entry.revokedAt === undefined || entry.revokedAt === null) &&
      (entry.resourceId === recordId || entry.resourceId === null),
  );

  if (!ownerPermission) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    };
  }

  return { ok: true, record: record as Record<string, unknown> };
}

export async function executeShare(
  db: Adapter,
  mutation: {
    resource: string;
    id?: string;
    scope?: "record" | "resource";
    shareWith?: { principalId?: string; userId?: string; level?: string };
  },
  resolvedCapabilities: unknown[],
  namespace: string,
  actorId?: string,
  logger?: DatafnLogger,
  multiRegionRuntime?: DatafnMultiRegionRuntimeConfig | null,
): Promise<
  | { ok: true; permissionRecord: Record<string, unknown> }
  | { ok: false; code: string; message: string; path: string }
> {
  const shareableConfig = getShareableConfig(resolvedCapabilities);
  if (!shareableConfig) {
    return {
      ok: false,
      code: "DFQL_UNSUPPORTED",
      message: "Unsupported DFQL feature: mutation.operation.share",
      path: "operation",
    };
  }

  const shareScope = getShareScope(mutation.scope);
  if (shareScope === "resource" && shareableConfig.supportsScopeGrants === false) {
    return {
      ok: false,
      code: "DFQL_UNSUPPORTED",
      message: "Unsupported DFQL feature: mutation.scope.resource",
      path: "scope",
    };
  }

  let ownerCheck: OwnershipResult | null = null;
  if (shareScope === "record") {
    if (!mutation.id) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: "Invalid DFQL: id must be string",
        path: "id",
      };
    }
    ownerCheck = await ensureOwnerAccess(
      db,
      mutation.resource,
      mutation.id,
      namespace,
      actorId,
    );
    if (!ownerCheck.ok) {
      return ownerCheck;
    }
  } else if (
    !(await hasResourceScopeOwnerAccess(
      db,
      mutation.resource,
      actorId,
      namespace,
    ))
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    };
  }

  const canonicalPrincipalResult = canonicalizeSharePrincipal(
    mutation.shareWith as Record<string, unknown> | undefined,
  );
  if (!canonicalPrincipalResult.ok) {
    return canonicalPrincipalResult;
  }
  if (
    mutation.shareWith?.userId !== undefined
  ) {
    emitLegacyShareDeprecationWarning(logger, "share");
  }
  const sharePrincipalId = canonicalPrincipalResult.principalId;

  if (
    shareableConfig.crossNsShareable === false &&
    !isPrincipalInNamespace(sharePrincipalId, namespace)
  ) {
    return {
      ok: false,
      code: "DFQL_CROSS_NS_SHARE_FORBIDDEN",
      message: "Cross-namespace sharing is disabled for this resource",
      path: "shareWith.principalId",
    };
  }

  const requestedLevel = mutation.shareWith?.level ?? "viewer";
  if (!shareableConfig.levels.includes(requestedLevel)) {
    return {
      ok: false,
      code: "DFQL_INVALID",
      message: `Invalid DFQL: shareWith.level must be one of [${shareableConfig.levels.join(", ")}]`,
      path: "shareWith.level",
    };
  }

  const resourceId = shareScope === "resource" ? null : (mutation.id as string);
  const grantKind = shareScope === "resource" ? "scope" : "record";
  const permissionEntryId = getPermissionEntryId(
    mutation.resource,
    namespace,
    resourceId,
    sharePrincipalId,
  );
  const permissionsTable = getPermissionsTableName();
  const now = Date.now();
  const existingPermission = await db.findOne({
    model: permissionsTable,
    where: [{ field: "id", operator: "eq", value: permissionEntryId }],
    namespace,
  });

  const permissionRecord: Record<string, unknown> = existingPermission
    ? {
        ...(existingPermission as Record<string, unknown>),
        resourceType: mutation.resource,
        resourceNs: namespace,
        resourceId,
        principalId: sharePrincipalId,
        level: requestedLevel,
        grantKind,
        sourceRef: null,
        grantedBy: actorId ?? "system",
        grantedAt: now,
        revokedAt: null,
        ...(multiRegionRuntime ? { resourceRegion: multiRegionRuntime.regionId } : {}),
      }
    : {
        id: permissionEntryId,
        resourceType: mutation.resource,
        resourceNs: namespace,
        resourceId,
        principalId: sharePrincipalId,
        level: requestedLevel,
        grantKind,
        sourceRef: null,
        grantedBy: actorId ?? "system",
        grantedAt: now,
        revokedAt: null,
        ...(multiRegionRuntime ? { resourceRegion: multiRegionRuntime.regionId } : {}),
      };

  try {
    if (existingPermission) {
      await db.update({
        model: permissionsTable,
        where: [{ field: "id", operator: "eq", value: permissionRecord.id }],
        data: {
          resourceType: permissionRecord.resourceType,
          resourceNs: permissionRecord.resourceNs,
          resourceId: permissionRecord.resourceId,
          principalId: permissionRecord.principalId,
          level: permissionRecord.level,
          grantKind: permissionRecord.grantKind,
          sourceRef: permissionRecord.sourceRef,
          grantedBy: permissionRecord.grantedBy,
          grantedAt: permissionRecord.grantedAt,
          revokedAt: permissionRecord.revokedAt,
          ...(multiRegionRuntime ? { resourceRegion: permissionRecord.resourceRegion } : {}),
        },
        namespace,
      });
    } else {
      await db.create({
        model: permissionsTable,
        data: permissionRecord,
        namespace,
      });
    }

    const mirrorLevel =
      requestedLevel === "viewer" ||
      requestedLevel === "editor" ||
      requestedLevel === "owner"
        ? requestedLevel
        : null;
    if (mirrorLevel) {
      await mirrorGrantToLegacyV1({
        db,
        namespace,
        resource: mutation.resource,
        resourceId,
        principalId: sharePrincipalId,
        level: mirrorLevel,
        grantedBy: actorId ?? "system",
        grantedAt: now,
      });
    }
  } catch (error) {
    throw attachFailedSharePermissionRecord(error, permissionRecord);
  }

  return { ok: true, permissionRecord };
}

export async function executeUnshare(
  db: Adapter,
  mutation: {
    resource: string;
    id?: string;
    scope?: "record" | "resource";
    shareWith?: { principalId?: string; userId?: string };
  },
  resolvedCapabilities: unknown[],
  namespace: string,
  actorId?: string,
  logger?: DatafnLogger,
  multiRegionRuntime?: DatafnMultiRegionRuntimeConfig | null,
): Promise<
  | { ok: true; deleted: boolean; changeId: string }
  | { ok: false; code: string; message: string; path: string }
> {
  const shareableConfig = getShareableConfig(resolvedCapabilities);
  if (!shareableConfig) {
    return {
      ok: false,
      code: "DFQL_UNSUPPORTED",
      message: "Unsupported DFQL feature: mutation.operation.unshare",
      path: "operation",
    };
  }

  const shareScope = getShareScope(mutation.scope);
  if (shareScope === "resource" && shareableConfig.supportsScopeGrants === false) {
    return {
      ok: false,
      code: "DFQL_UNSUPPORTED",
      message: "Unsupported DFQL feature: mutation.scope.resource",
      path: "scope",
    };
  }

  let ownerCheck: OwnershipResult | null = null;
  if (shareScope === "record") {
    if (!mutation.id) {
      return {
        ok: false,
        code: "DFQL_INVALID",
        message: "Invalid DFQL: id must be string",
        path: "id",
      };
    }
    ownerCheck = await ensureOwnerAccess(
      db,
      mutation.resource,
      mutation.id,
      namespace,
      actorId,
    );
    if (!ownerCheck.ok) {
      return ownerCheck;
    }
  } else if (
    !(await hasResourceScopeOwnerAccess(
      db,
      mutation.resource,
      actorId,
      namespace,
    ))
  ) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    };
  }

  const canonicalPrincipalResult = canonicalizeSharePrincipal(
    mutation.shareWith as Record<string, unknown> | undefined,
  );
  if (!canonicalPrincipalResult.ok) {
    return canonicalPrincipalResult;
  }
  if (
    mutation.shareWith?.userId !== undefined
  ) {
    emitLegacyShareDeprecationWarning(logger, "unshare");
  }
  const unsharePrincipalId = canonicalPrincipalResult.principalId;

  if (shareScope === "record") {
    const creatorId = ownerCheck?.record.createdBy;
    const creatorPrincipal = normalizeNonEmptyString(creatorId)
      ? canonicalizePrincipalFromUserId(String(creatorId))
      : null;
    if (creatorPrincipal === unsharePrincipalId) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "Cannot unshare the record creator",
        path: "shareWith.principalId",
      };
    }
  }

  const resourceId = shareScope === "resource" ? null : (mutation.id as string);
  const changeId = getPermissionEntryId(
    mutation.resource,
    namespace,
    resourceId,
    unsharePrincipalId,
  );
  const permissionsTable = getPermissionsTableName();
  const existingPermission = await db.findOne({
    model: permissionsTable,
    where: [{ field: "id", operator: "eq", value: changeId }],
    namespace,
  });

  // Invalidate the distributed authorization entry before deleting the
  // authoritative grant. If invalidation fails, the database grant remains
  // active, preventing a revoked-database/stale-directory authorization gap.
  // Share indexing is deliberately post-commit; unshare invalidation is
  // deliberately fail-closed before the database delete.
  await deleteDatafnPermissionGrant({
    id: changeId,
    resourceType: mutation.resource,
    resourceNs: namespace,
    resourceId,
    principalId: unsharePrincipalId,
  }, multiRegionRuntime ?? null);

  if (!existingPermission) {
    return {
      ok: true,
      deleted: false,
      changeId,
    };
  }

  await db.delete({
    model: permissionsTable,
    where: [{ field: "id", operator: "eq", value: changeId }],
    namespace,
  });
  await removeLegacyV1Grant({
    db,
    namespace,
    resource: mutation.resource,
    resourceId,
    principalId: unsharePrincipalId,
  });
  return {
    ok: true,
    deleted: true,
    changeId,
  };
}

/**
 * Removes every grant representation that may have been written before a
 * share operation threw. This deliberately bypasses owner re-validation: the
 * caller is compensating a grant that never became a successful operation.
 */
export async function rollbackDatafnPermissionGrantAfterFailedShare(
  db: Adapter,
  mutation: {
    resource: string;
    id?: string;
    scope?: "record" | "resource";
    shareWith?: { principalId?: string; userId?: string };
  },
  namespace: string,
  multiRegionRuntime?: DatafnMultiRegionRuntimeConfig | null,
  priorSnapshot?: DatafnPermissionGrantSnapshot,
): Promise<void> {
  const principal = canonicalizeSharePrincipal(
    mutation.shareWith as Record<string, unknown> | undefined,
  );
  if (!principal.ok) {
    throw new Error("Cannot compensate a failed share with an invalid principal");
  }
  const resourceId = getShareScope(mutation.scope) === "resource"
    ? null
    : mutation.id ?? null;
  const permissionId = getPermissionEntryId(
    mutation.resource,
    namespace,
    resourceId,
    principal.principalId,
  );
  const snapshot = priorSnapshot ?? {
    permissionId,
    resource: mutation.resource,
    resourceId,
    principalId: principal.principalId,
    canonical: null,
    legacyManaged: getSpv2MigrationRuntimeConfig().writeMode === "dual",
    legacy: null,
  };
  if (
    snapshot.permissionId !== permissionId ||
    snapshot.resource !== mutation.resource ||
    snapshot.resourceId !== resourceId ||
    snapshot.principalId !== principal.principalId
  ) {
    throw new Error("Cannot compensate a failed share with a mismatched snapshot");
  }

  if (snapshot.compensationExpectedCanonical) {
    try {
      await db.transaction(async (trx) => {
        if (snapshot.legacyManaged) {
          const expectedLegacy = expectedLegacyGrantFromCanonical(
            snapshot,
            snapshot.compensationExpectedCanonical!,
          );
          const legacyRestored = await conditionallyRestoreGrantRecord(
            trx,
            getLegacyPermissionsTable(mutation.resource),
            expectedLegacy,
            snapshot.legacy,
            LEGACY_GRANT_OWNERSHIP_FIELDS,
            namespace,
          );
          if (!legacyRestored) throw COMPENSATION_OWNERSHIP_LOST;
        }
        const canonicalRestored = await conditionallyRestoreGrantRecord(
          trx,
          getPermissionsTableName(),
          snapshot.compensationExpectedCanonical!,
          snapshot.canonical,
          CANONICAL_GRANT_OWNERSHIP_FIELDS,
          namespace,
        );
        if (!canonicalRestored) throw COMPENSATION_OWNERSHIP_LOST;
      });
    } catch (error) {
      if (error !== COMPENSATION_OWNERSHIP_LOST) throw error;
      // A newer share or unshare owns at least one representation. The
      // transaction rolls back every partial restore before the directory is
      // reconciled from the current authoritative canonical row.
    }
    await reconcileCompensatedGrantDirectory(
      db,
      snapshot,
      namespace,
      multiRegionRuntime ?? null,
    );
    return;
  }

  if (snapshot.legacyManaged) {
    const legacyId = `${mutation.resource}:${resourceId ?? "*"}:${principal.principalId}`;
    if (snapshot.legacy) {
      await restoreGrantRecord(
        db,
        getLegacyPermissionsTable(mutation.resource),
        legacyId,
        snapshot.legacy,
        namespace,
      );
    } else {
      // A failed dual-write share must not leave its legacy representation
      // active. Immediate retries handle transient failures; a caller-owned
      // durable compensation task can retry this idempotent routine later.
      await removeLegacyGrantWithRetries({
        db,
        namespace,
        resource: mutation.resource,
        resourceId,
        principalId: principal.principalId,
      });
    }
  }

  if (snapshot.canonical) {
    await restoreGrantRecord(
      db,
      getPermissionsTableName(),
      permissionId,
      snapshot.canonical,
      namespace,
    );
  } else {
    await db.delete({
      model: getPermissionsTableName(),
      where: [{ field: "id", operator: "eq", value: permissionId }],
      namespace,
    });
  }

  if (snapshot.canonical) {
    await indexDatafnPermissionGrant(
      snapshot.canonical,
      multiRegionRuntime ?? null,
    );
  } else {
    await deleteDatafnPermissionGrant({
      id: permissionId,
      resourceType: mutation.resource,
      resourceNs: namespace,
      resourceId,
      principalId: principal.principalId,
    }, multiRegionRuntime ?? null);
  }
}

/** Reconciles the distributed permission directory from committed database state. */
export async function syncDatafnPermissionGrantAfterCommit(
  db: Adapter,
  mutation: {
    operation: string;
    resource: string;
    id?: string;
    scope?: "record" | "resource";
    shareWith?: { principalId?: string; userId?: string };
    compensationSnapshot?: DatafnPermissionGrantSnapshot;
  },
  namespace: string,
  multiRegionRuntime: DatafnMultiRegionRuntimeConfig | null,
): Promise<void> {
  if (
    mutation.operation === "compensate-failed-share" &&
    mutation.compensationSnapshot
  ) {
    await rollbackDatafnPermissionGrantAfterFailedShare(
      db,
      mutation,
      namespace,
      multiRegionRuntime,
      mutation.compensationSnapshot,
    );
    return;
  }
  if (
    !multiRegionRuntime ||
    (mutation.operation !== "share" && mutation.operation !== "unshare")
  ) {
    return;
  }
  const principal = canonicalizeSharePrincipal(
    mutation.shareWith as Record<string, unknown> | undefined,
  );
  if (!principal.ok) return;
  const resourceId = getShareScope(mutation.scope) === "resource"
    ? null
    : mutation.id ?? null;
  const id = getPermissionEntryId(
    mutation.resource,
    namespace,
    resourceId,
    principal.principalId,
  );
  let permission = await db.findOne({
    model: getPermissionsTableName(),
    where: [{ field: "id", operator: "eq", value: id }],
    namespace,
  });
  if (permission) {
    // Fence delayed retries against both revocation and a newer grant update.
    // Once the post-write read matches what was indexed, any later mutation
    // owns its own post-commit reconciliation. Repeated churn keeps the outbox
    // task pending instead of acknowledging an unstable snapshot.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await indexDatafnPermissionGrant(
        permission as Record<string, unknown>,
        multiRegionRuntime,
      );
      const currentPermission = await db.findOne({
        model: getPermissionsTableName(),
        where: [{ field: "id", operator: "eq", value: id }],
        namespace,
      });
      if (!currentPermission) {
        await deleteDatafnPermissionGrant({
          id,
          resourceType: mutation.resource,
          resourceNs: namespace,
          resourceId,
          principalId: principal.principalId,
        }, multiRegionRuntime);
        return;
      }
      if (permissionDirectoryGrantSignature(currentPermission) ===
        permissionDirectoryGrantSignature(permission)) {
        return;
      }
      permission = currentPermission;
    }
    throw new Error("Permission grant changed repeatedly during directory reconciliation");
  }
  await deleteDatafnPermissionGrant({
    id,
    resourceType: mutation.resource,
    resourceNs: namespace,
    resourceId,
    principalId: principal.principalId,
  }, multiRegionRuntime);
}

function permissionDirectoryGrantSignature(grant: Record<string, unknown>): string {
  return JSON.stringify([
    grant.id,
    grant.resourceType,
    grant.resourceNs,
    grant.resourceId ?? null,
    grant.principalId,
    grant.level,
    grant.grantKind,
    grant.sourceRef,
    grant.grantedBy,
    grant.grantedAt,
    grant.revokedAt ?? null,
  ]);
}

export function getPermissionsTable(resource: string): string {
  return getPermissionsTableName();
}
