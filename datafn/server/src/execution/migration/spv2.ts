import type { Adapter } from "@superfunctions/db";
import type { DatafnLogger } from "../../logger.js";
import { DatafnExecutionError } from "../errors.js";

export type Spv2ShareLevel = "viewer" | "editor" | "owner";
export type Spv2ReadMode = "v1" | "v2" | "dual";
export type Spv2WriteMode = "v2" | "dual";

const GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global";

const LEVEL_RANK: Record<Spv2ShareLevel, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

const DEFAULT_RUNTIME_CONFIG: Required<Spv2MigrationRuntimeConfig> = {
  readMode: "v2",
  writeMode: "v2",
  warnOnLegacyApi: true,
};

let runtimeConfig: Required<Spv2MigrationRuntimeConfig> = {
  ...DEFAULT_RUNTIME_CONFIG,
};

export interface Spv2MigrationRuntimeConfig {
  readMode?: Spv2ReadMode;
  writeMode?: Spv2WriteMode;
  warnOnLegacyApi?: boolean;
}

export interface Spv2BackfillInputRow {
  id?: string;
  resourceId: string | null;
  userId: string;
  level: string;
  grantedBy?: string;
  grantedAt?: number;
  revokedAt?: number | null;
}

export interface Spv2CanonicalGrant {
  id: string;
  resourceType: string;
  resourceNs: string;
  resourceId: string | null;
  principalId: string;
  level: Spv2ShareLevel;
  grantKind: "record" | "scope";
  sourceRef: null;
  grantedBy: string;
  grantedAt: number;
  revokedAt: null;
}

function rowBelongsToNamespace(
  row: Record<string, unknown>,
  namespace: string,
): boolean {
  if (row.__ns === undefined) {
    return true;
  }
  return row.__ns === namespace;
}

export interface Spv2BackfillOptions {
  db: Adapter;
  namespace: string;
  resources: string[];
  logger?: DatafnLogger;
  dryRun?: boolean;
}

export interface Spv2BackfillResult {
  scanned: number;
  canonicalized: number;
  migrated: number;
  skipped: number;
  equivalentAccess: boolean;
  v2Rows: Spv2CanonicalGrant[];
}

export interface Spv2DualReadDecision {
  level: Spv2ShareLevel | null;
  equivalentAccess: boolean;
  v1Level: Spv2ShareLevel | null;
  v2Level: Spv2ShareLevel | null;
}

export interface Spv2LegacyWarning {
  code: "DFQL_LEGACY_API_DEPRECATED";
  message: string;
  details: { path: "shareWith.userId"; replacement: "shareWith.principalId" };
}

export function setSpv2MigrationRuntimeConfig(
  config?: Spv2MigrationRuntimeConfig,
): void {
  runtimeConfig = { ...DEFAULT_RUNTIME_CONFIG };
  if (config?.readMode === "v1" || config?.readMode === "v2" || config?.readMode === "dual") {
    runtimeConfig.readMode = config.readMode;
  }
  if (config?.writeMode === "v2" || config?.writeMode === "dual") {
    runtimeConfig.writeMode = config.writeMode;
  }
  if (typeof config?.warnOnLegacyApi === "boolean") {
    runtimeConfig.warnOnLegacyApi = config.warnOnLegacyApi;
  }
}

export function getSpv2MigrationRuntimeConfig(): Required<Spv2MigrationRuntimeConfig> {
  return { ...runtimeConfig };
}

export function getLegacyPermissionsTable(resource: string): string {
  return `__datafn_permissions_${resource}`;
}

export function canonicalizePrincipalFromLegacyUserId(userId: string): string {
  return userId.includes(":") ? userId : `user:${userId}`;
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeShareLevel(value: unknown): Spv2ShareLevel | null {
  if (value === "viewer" || value === "editor" || value === "owner") {
    return value;
  }
  return null;
}

function selectHigherLevel(
  left: Spv2ShareLevel | null,
  right: Spv2ShareLevel | null,
): Spv2ShareLevel | null {
  if (!left) return right;
  if (!right) return left;
  return LEVEL_RANK[right] > LEVEL_RANK[left] ? right : left;
}

function isGrantActive(row: Record<string, unknown>): boolean {
  return row.revokedAt === null || row.revokedAt === undefined;
}

function buildGlobalGrantId(
  resourceType: string,
  resourceNs: string,
  resourceId: string | null,
  principalId: string,
): string {
  return `${resourceType}:${resourceNs}:${resourceId ?? "*"}:${principalId}`;
}

export function emitLegacyShareDeprecationWarning(
  logger: DatafnLogger | undefined,
  operation: "share" | "unshare",
): Spv2LegacyWarning | null {
  if (!getSpv2MigrationRuntimeConfig().warnOnLegacyApi) {
    return null;
  }

  const warning: Spv2LegacyWarning = {
    code: "DFQL_LEGACY_API_DEPRECATED",
    message:
      "Deprecated shareWith.userId is accepted for compatibility; use shareWith.principalId",
    details: {
      path: "shareWith.userId",
      replacement: "shareWith.principalId",
    },
  };

  logger?.warn(warning.message, {
    code: warning.code,
    operation,
    path: warning.details.path,
    replacement: warning.details.replacement,
  });

  return warning;
}

function canonicalizeLegacyRowsToSpv2(params: {
  resource: string;
  namespace: string;
  rows: Record<string, unknown>[];
}): Spv2CanonicalGrant[] {
  const byGrantKey = new Map<string, Spv2CanonicalGrant>();

  for (const row of params.rows) {
    if (!isGrantActive(row)) {
      continue;
    }

    const userId = normalizeNonEmptyString(row.userId);
    const level = normalizeShareLevel(row.level);
    if (!userId || !level) {
      continue;
    }

    const rawResourceId = row.resourceId;
    const resourceId =
      rawResourceId === null || rawResourceId === undefined
        ? null
        : normalizeNonEmptyString(rawResourceId);

    const principalId = canonicalizePrincipalFromLegacyUserId(userId);
    const grantId = buildGlobalGrantId(
      params.resource,
      params.namespace,
      resourceId,
      principalId,
    );

    const grantedBy =
      normalizeNonEmptyString(row.grantedBy) ?? "migration:spv2";
    const grantedAt =
      typeof row.grantedAt === "number" && Number.isFinite(row.grantedAt)
        ? row.grantedAt
        : 0;

    const existing = byGrantKey.get(grantId);
    if (existing && existing.level !== level) {
      throw new DatafnExecutionError(
        "CONFLICT",
        "Conflicting duplicate grants",
        "migration.v1Rows",
      );
    }

    const candidate: Spv2CanonicalGrant = {
      id: grantId,
      resourceType: params.resource,
      resourceNs: params.namespace,
      resourceId,
      principalId,
      level,
      grantKind: resourceId === null ? "scope" : "record",
      sourceRef: null,
      grantedBy,
      grantedAt,
      revokedAt: null,
    };

    if (!existing || candidate.grantedAt >= existing.grantedAt) {
      byGrantKey.set(grantId, candidate);
    }
  }

  return Array.from(byGrantKey.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
}

function grantsEqual(
  left: Record<string, unknown> | null,
  right: Spv2CanonicalGrant,
): boolean {
  if (!left) {
    return false;
  }

  return (
    left.resourceType === right.resourceType &&
    left.resourceNs === right.resourceNs &&
    left.resourceId === right.resourceId &&
    left.principalId === right.principalId &&
    left.level === right.level &&
    left.grantKind === right.grantKind &&
    left.revokedAt === null
  );
}

export async function backfillLegacyPermissionsToSpv2(
  options: Spv2BackfillOptions,
): Promise<Spv2BackfillResult> {
  const resources = Array.from(
    new Set(options.resources.map((resource) => resource.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const v2Rows: Spv2CanonicalGrant[] = [];
  let scanned = 0;
  let canonicalized = 0;
  let migrated = 0;
  let skipped = 0;

  for (const resource of resources) {
    const legacyTable = getLegacyPermissionsTable(resource);
    let legacyRows: Record<string, unknown>[];
    try {
      legacyRows = (await options.db.findMany({
        model: legacyTable,
        where: [],
        namespace: options.namespace,
      })) as Record<string, unknown>[];
    } catch (error) {
      options.logger?.debug(
        "SPV2 backfill skipped resource without legacy table",
        {
          operation: "spv2-backfill",
          resource,
          table: legacyTable,
          reason: String(error),
        },
      );
      continue;
    }

    const namespaceRows = legacyRows.filter((row) =>
      rowBelongsToNamespace(row, options.namespace),
    );

    scanned += namespaceRows.length;
    const canonicalRows = canonicalizeLegacyRowsToSpv2({
      resource,
      namespace: options.namespace,
      rows: namespaceRows,
    });
    canonicalized += canonicalRows.length;
    v2Rows.push(...canonicalRows);

    if (options.dryRun) {
      continue;
    }

    for (const row of canonicalRows) {
      const existing = (await options.db.findOne({
        model: GLOBAL_PERMISSIONS_TABLE,
        where: [{ field: "id", operator: "eq", value: row.id }],
        namespace: options.namespace,
      })) as Record<string, unknown> | null;

      if (grantsEqual(existing, row)) {
        skipped += 1;
        continue;
      }

      await options.db.upsert({
        model: GLOBAL_PERMISSIONS_TABLE,
        where: [{ field: "id", operator: "eq", value: row.id }],
        create: {
          ...row,
          __ns: options.namespace,
        },
        update: {
          resourceType: row.resourceType,
          resourceNs: row.resourceNs,
          resourceId: row.resourceId,
          principalId: row.principalId,
          level: row.level,
          grantKind: row.grantKind,
          sourceRef: row.sourceRef,
          grantedBy: row.grantedBy,
          grantedAt: row.grantedAt,
          revokedAt: null,
          __ns: options.namespace,
        },
        namespace: options.namespace,
        conflictTarget: "id",
      });
      migrated += 1;
    }
  }

  return {
    scanned,
    canonicalized,
    migrated,
    skipped,
    equivalentAccess: true,
    v2Rows: v2Rows.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export async function mirrorGrantToLegacyV1(params: {
  db: Adapter;
  namespace: string;
  resource: string;
  resourceId: string | null;
  principalId: string;
  level: Spv2ShareLevel;
  grantedBy: string;
  grantedAt: number;
}): Promise<void> {
  if (getSpv2MigrationRuntimeConfig().writeMode !== "dual") {
    return;
  }

  const legacyTable = getLegacyPermissionsTable(params.resource);
  const legacyId = `${params.resource}:${params.resourceId ?? "*"}:${params.principalId}`;

  await params.db.upsert({
    model: legacyTable,
    where: [{ field: "id", operator: "eq", value: legacyId }],
    create: {
      id: legacyId,
      resourceId: params.resourceId,
      userId: params.principalId,
      level: params.level,
      grantedBy: params.grantedBy,
      grantedAt: params.grantedAt,
      revokedAt: null,
    },
    update: {
      level: params.level,
      grantedBy: params.grantedBy,
      grantedAt: params.grantedAt,
      revokedAt: null,
    },
    namespace: params.namespace,
    conflictTarget: "id",
  });
}

export async function removeLegacyV1Grant(params: {
  db: Adapter;
  namespace: string;
  resource: string;
  resourceId: string | null;
  principalId: string;
}): Promise<void> {
  if (getSpv2MigrationRuntimeConfig().writeMode !== "dual") {
    return;
  }

  const legacyTable = getLegacyPermissionsTable(params.resource);
  const legacyId = `${params.resource}:${params.resourceId ?? "*"}:${params.principalId}`;

  await params.db.delete({
    model: legacyTable,
    where: [{ field: "id", operator: "eq", value: legacyId }],
    namespace: params.namespace,
  });
}

export async function resolveAccessLevelFromLegacyV1(params: {
  db: Adapter;
  namespace: string;
  resource: string;
  recordId: string;
  actorId: string | undefined;
}): Promise<Spv2ShareLevel | null> {
  if (!params.actorId) {
    return null;
  }

  const legacyTable = getLegacyPermissionsTable(params.resource);
  const actorPrincipal = canonicalizePrincipalFromLegacyUserId(params.actorId);
  const actorCandidates = new Set([params.actorId, actorPrincipal]);

  let rows: Record<string, unknown>[];
  try {
    rows = (await params.db.findMany({
      model: legacyTable,
      where: [],
      namespace: params.namespace,
    })) as Record<string, unknown>[];
  } catch {
    return null;
  }

  let level: Spv2ShareLevel | null = null;
  for (const row of rows) {
    if (!isGrantActive(row)) {
      continue;
    }

    const userId = normalizeNonEmptyString(row.userId);
    if (!userId || !actorCandidates.has(userId)) {
      continue;
    }

    const resourceId =
      row.resourceId === null || row.resourceId === undefined
        ? null
        : normalizeNonEmptyString(row.resourceId);
    if (resourceId !== null && resourceId !== params.recordId) {
      continue;
    }

    const rowLevel = normalizeShareLevel(row.level);
    if (!rowLevel) {
      continue;
    }
    level = selectHigherLevel(level, rowLevel);
  }

  return level;
}

export function resolveDualReadAccessDecision(params: {
  v1Level: Spv2ShareLevel | null;
  v2Level: Spv2ShareLevel | null;
}): Spv2DualReadDecision {
  const v1Allowed = params.v1Level !== null;
  const v2Allowed = params.v2Level !== null;
  return {
    level: selectHigherLevel(params.v1Level, params.v2Level),
    equivalentAccess: v1Allowed === v2Allowed,
    v1Level: params.v1Level,
    v2Level: params.v2Level,
  };
}
