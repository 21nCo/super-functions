import type { Adapter } from "@superfunctions/db";
import { DEMO_WORKSPACES } from "./identity.js";

const DOCUMENTS_MODEL = "documents";
const GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global";
const PRINCIPAL_MEMBERSHIPS_TABLE = "__datafn_principal_memberships";
const PRINCIPAL_HIERARCHY_TABLE = "__datafn_principal_hierarchy";
const LEGACY_PERMISSIONS_TABLE = "__datafn_permissions_documents";

const INTERNAL_TABLES = [
  "__datafn_meta",
  "__datafn_changes",
  "__datafn_idempotency",
  "__datafn_seed",
] as const;

const BASELINE_TS = 1_710_000_000_000;

type WorkspaceNamespace = (typeof DEMO_WORKSPACES)[number]["namespace"];

type BaselineCounts = {
  documentCounts: Record<WorkspaceNamespace, number>;
  membershipCounts: Record<WorkspaceNamespace, number>;
};

type SeedDocument = {
  id: string;
  namespace: WorkspaceNamespace;
  title: string;
  content: string;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

const BASELINE_DOCUMENTS: ReadonlyArray<SeedDocument> = [
  {
    id: "doc:acme-private-alice",
    namespace: "org:acme",
    title: "Acme private notes",
    content: "Owned by Alice in Acme",
    createdBy: "user:alice",
    updatedBy: "user:alice",
    createdAt: BASELINE_TS,
    updatedAt: BASELINE_TS,
  },
  {
    id: "doc:acme-team-brief",
    namespace: "org:acme",
    title: "Acme design brief",
    content: "Shared to the design team",
    createdBy: "user:alice",
    updatedBy: "user:alice",
    createdAt: BASELINE_TS + 1,
    updatedAt: BASELINE_TS + 1,
  },
  {
    id: "doc:globex-private-bob",
    namespace: "org:globex",
    title: "Globex private notes",
    content: "Owned by Bob in Globex",
    createdBy: "user:bob",
    updatedBy: "user:bob",
    createdAt: BASELINE_TS + 2,
    updatedAt: BASELINE_TS + 2,
  },
];

const BASELINE_MEMBERSHIPS: ReadonlyArray<{
  id: string;
  namespace: WorkspaceNamespace;
  actorId: string;
  principalId: string;
  grantedAt: number;
}> = [
  {
    id: "membership:org:acme:user:alice:team:design",
    namespace: "org:acme",
    actorId: "user:alice",
    principalId: "team:design",
    grantedAt: BASELINE_TS,
  },
  {
    id: "membership:org:acme:user:bob:team:design",
    namespace: "org:acme",
    actorId: "user:bob",
    principalId: "team:design",
    grantedAt: BASELINE_TS,
  },
  {
    id: "membership:org:globex:user:bob:team:design",
    namespace: "org:globex",
    actorId: "user:bob",
    principalId: "team:design",
    grantedAt: BASELINE_TS,
  },
  {
    id: "membership:org:globex:user:charlie:team:design",
    namespace: "org:globex",
    actorId: "user:charlie",
    principalId: "team:design",
    grantedAt: BASELINE_TS,
  },
];

function isGrantActive(row: Record<string, unknown>): boolean {
  return row.revokedAt === undefined || row.revokedAt === null;
}

function createGlobalPermissionId(input: {
  resourceType: string;
  resourceNs: string;
  resourceId: string | null;
  principalId: string;
}): string {
  return `${input.resourceType}:${input.resourceNs}:${input.resourceId ?? "*"}:${input.principalId}`;
}

async function clearModel(db: Adapter, model: string): Promise<void> {
  try {
    await db.deleteMany({
      model,
      where: [],
    });
  } catch {
    // ignore missing model/table in clean reset path
  }
}

async function clearInternalTable(db: Adapter, table: string): Promise<void> {
  try {
    await db.internal.delete(table, []);
  } catch {
    // ignore missing table in clean reset path
  }
}

async function clearBaselineData(db: Adapter): Promise<void> {
  await clearModel(db, DOCUMENTS_MODEL);
  await clearModel(db, GLOBAL_PERMISSIONS_TABLE);
  await clearModel(db, PRINCIPAL_MEMBERSHIPS_TABLE);
  await clearModel(db, PRINCIPAL_HIERARCHY_TABLE);
  await clearModel(db, LEGACY_PERMISSIONS_TABLE);

  for (const table of INTERNAL_TABLES) {
    await clearInternalTable(db, table);
  }
}

async function insertBaselineDocuments(db: Adapter): Promise<void> {
  for (const document of BASELINE_DOCUMENTS) {
    await db.create({
      model: DOCUMENTS_MODEL,
      namespace: document.namespace,
      data: {
        id: document.id,
        title: document.title,
        content: document.content,
        createdBy: document.createdBy,
        updatedBy: document.updatedBy,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        __ns: document.namespace,
      },
    });
  }
}

async function insertBaselineMemberships(db: Adapter): Promise<void> {
  for (const membership of BASELINE_MEMBERSHIPS) {
    await db.create({
      model: PRINCIPAL_MEMBERSHIPS_TABLE,
      namespace: membership.namespace,
      data: {
        id: membership.id,
        namespace: membership.namespace,
        actorId: membership.actorId,
        principalId: membership.principalId,
        grantedAt: membership.grantedAt,
        revokedAt: null,
        __ns: membership.namespace,
      },
    });
  }
}

async function insertBaselineGrants(db: Adapter): Promise<void> {
  const resourceType = DOCUMENTS_MODEL;
  const resourceNs: WorkspaceNamespace = "org:acme";
  const resourceId = "doc:acme-team-brief";
  const principalId = "team:design";
  const permissionId = createGlobalPermissionId({
    resourceType,
    resourceNs,
    resourceId,
    principalId,
  });

  await db.create({
    model: GLOBAL_PERMISSIONS_TABLE,
    namespace: resourceNs,
    data: {
      id: permissionId,
      resourceType,
      resourceNs,
      resourceId,
      principalId,
      level: "viewer",
      grantKind: "record",
      sourceRef: null,
      grantedBy: "user:alice",
      grantedAt: BASELINE_TS + 10,
      revokedAt: null,
      __ns: resourceNs,
    },
  });
}

async function countByNamespace(
  db: Adapter,
  model: string,
  namespace: WorkspaceNamespace,
): Promise<number> {
  return db.count({
    model,
    namespace,
    where: [{ field: "__ns", operator: "eq", value: namespace }],
  });
}

export async function resetAndSeedBaseline(db: Adapter): Promise<BaselineCounts> {
  await clearBaselineData(db);
  await insertBaselineDocuments(db);
  await insertBaselineMemberships(db);
  await insertBaselineGrants(db);

  const counts = {
    documentCounts: {
      "org:acme": await countByNamespace(db, DOCUMENTS_MODEL, "org:acme"),
      "org:globex": await countByNamespace(db, DOCUMENTS_MODEL, "org:globex"),
    },
    membershipCounts: {
      "org:acme": await countByNamespace(db, PRINCIPAL_MEMBERSHIPS_TABLE, "org:acme"),
      "org:globex": await countByNamespace(db, PRINCIPAL_MEMBERSHIPS_TABLE, "org:globex"),
    },
  } satisfies BaselineCounts;

  return counts;
}

export async function resolveEffectivePrincipalsForContext(
  db: Adapter,
  namespace: string,
  actorId: string,
): Promise<string[]> {
  const directMembershipRows = await db.findMany({
    model: PRINCIPAL_MEMBERSHIPS_TABLE,
    namespace,
    where: [
      { field: "actorId", operator: "eq", value: actorId },
      { field: "__ns", operator: "eq", value: namespace },
    ],
  });

  const principals = new Set<string>();
  for (const row of directMembershipRows as Array<Record<string, unknown>>) {
    if (!isGrantActive(row)) {
      continue;
    }
    const principalId = row.principalId;
    if (typeof principalId === "string" && principalId.trim().length > 0) {
      principals.add(principalId.trim());
    }
  }

  principals.add(actorId);
  return Array.from(principals).sort((a, b) => a.localeCompare(b));
}
