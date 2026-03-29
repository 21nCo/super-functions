export type Spv2ShareLevel = "viewer" | "editor" | "owner";

export interface LegacyPermissionRow {
  resourceId: string | null;
  userId: string;
  level: string;
  grantedBy?: string;
  grantedAt?: number;
  revokedAt?: number | null;
}

export interface Spv2CanonicalPermissionRow {
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

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLevel(value: unknown): Spv2ShareLevel | null {
  if (value === "viewer" || value === "editor" || value === "owner") {
    return value;
  }
  return null;
}

export function canonicalizeLegacyPrincipal(userId: string): string {
  return userId.includes(":") ? userId : `user:${userId}`;
}

export function canonicalizeLegacyPermissionRows(input: {
  resourceType: string;
  resourceNs: string;
  rows: LegacyPermissionRow[];
}): Spv2CanonicalPermissionRow[] {
  const out = new Map<string, Spv2CanonicalPermissionRow>();

  for (const row of input.rows) {
    if (row.revokedAt !== null && row.revokedAt !== undefined) {
      continue;
    }

    const userId = normalizeNonEmptyString(row.userId);
    const level = normalizeLevel(row.level);
    if (!userId || !level) {
      continue;
    }

    const resourceId =
      row.resourceId === null || row.resourceId === undefined
        ? null
        : normalizeNonEmptyString(row.resourceId);
    const principalId = canonicalizeLegacyPrincipal(userId);
    const id = `${input.resourceType}:${input.resourceNs}:${resourceId ?? "*"}:${principalId}`;

    const existing = out.get(id);
    if (existing && existing.level !== level) {
      throw new Error("Conflicting duplicate grants");
    }

    const candidate: Spv2CanonicalPermissionRow = {
      id,
      resourceType: input.resourceType,
      resourceNs: input.resourceNs,
      resourceId,
      principalId,
      level,
      grantKind: resourceId === null ? "scope" : "record",
      sourceRef: null,
      grantedBy: normalizeNonEmptyString(row.grantedBy) ?? "migration:spv2",
      grantedAt:
        typeof row.grantedAt === "number" && Number.isFinite(row.grantedAt)
          ? row.grantedAt
          : 0,
      revokedAt: null,
    };

    if (!existing || candidate.grantedAt >= existing.grantedAt) {
      out.set(id, candidate);
    }
  }

  return Array.from(out.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function buildSpv2RollbackSql(resourceTypes: string[]): string[] {
  const uniqueResources = Array.from(
    new Set(resourceTypes.map((resource) => resource.trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const assertResourceIdentifier = (resource: string): string => {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(resource)) {
      throw new Error(`Invalid resource identifier: ${resource}`);
    }
    return resource;
  };

  const escapeSqlLiteral = (value: string): string =>
    `'${value.replace(/'/g, "''")}'`;

  return uniqueResources.map(
    (resource) => {
      const safeResource = assertResourceIdentifier(resource);
      return (
      `INSERT INTO "__datafn_permissions_${safeResource}" (id, resourceId, userId, level, grantedBy, grantedAt, revokedAt)\n` +
      `SELECT resourceType || ':' || COALESCE(resourceId, '*') || ':' || principalId, resourceId, principalId, level, grantedBy, grantedAt, revokedAt\n` +
      `FROM __datafn_permissions_global\n` +
      `WHERE resourceType = ${escapeSqlLiteral(safeResource)};`
      );
    },
  );
}

export function createSpv2MigrationSummary(input: {
  resourceType: string;
  resourceNs: string;
  rows: LegacyPermissionRow[];
}): {
  migratedRows: number;
  canonicalRows: Spv2CanonicalPermissionRow[];
} {
  const canonicalRows = canonicalizeLegacyPermissionRows(input);
  return {
    migratedRows: canonicalRows.length,
    canonicalRows,
  };
}
