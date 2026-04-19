import type { Adapter } from "@superfunctions/db";
import type { DatafnLogger } from "../../logger.js";
import { hasResourceScopeOwnerAccess } from "../../validation/authz.js";
import {
  emitLegacyShareDeprecationWarning,
  mirrorGrantToLegacyV1,
  removeLegacyV1Grant,
} from "../migration/spv2.js";

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
      };

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

export function getPermissionsTable(resource: string): string {
  return getPermissionsTableName();
}
