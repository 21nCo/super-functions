import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";
import type { DatafnLogger } from "../../../logger.js";
import {
  backfillLegacyPermissionsToSpv2,
  getLegacyPermissionsTable,
  setSpv2MigrationRuntimeConfig,
} from "../spv2.js";
import { DatafnExecutionError } from "../../errors.js";

const NAMESPACE = "user:alice";
const GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global";

const schema = {
  resources: [
    {
      name: "notes",
      version: 1,
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ] as any,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
  relations: [],
} satisfies DatafnSchema;

type Harness = {
  db: any;
  server: any;
  actor: { current: string | undefined };
  warnings: Array<{ message: string; context?: Record<string, unknown> }>;
};

function createLoggerCollector(
  warnings: Array<{ message: string; context?: Record<string, unknown> }>,
): DatafnLogger {
  return {
    info: () => {},
    warn: (message, context) => warnings.push({ message, context }),
    error: () => {},
    debug: () => {},
  };
}

async function callEndpoint(
  server: any,
  path: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const req = new Request(`http://localhost/datafn/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await server.router.handle(req, {});
  const body = await res.json();
  return { status: res.status, body };
}

async function createHarness(config?: {
  readMode?: "v1" | "v2" | "dual";
  writeMode?: "v2" | "dual";
  warnOnLegacyApi?: boolean;
}): Promise<Harness> {
  const actor = { current: "alice" as string | undefined };
  const db = memoryAdapter();
  await db.initialize();
  const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];
  const spv2Migration: {
    readMode?: "v1" | "v2" | "dual";
    writeMode?: "v2" | "dual";
    warnOnLegacyApi?: boolean;
  } = {};
  if (config?.readMode !== undefined) {
    spv2Migration.readMode = config.readMode;
  }
  if (config?.writeMode !== undefined) {
    spv2Migration.writeMode = config.writeMode;
  }
  if (config?.warnOnLegacyApi !== undefined) {
    spv2Migration.warnOnLegacyApi = config.warnOnLegacyApi;
  }

  const server = await createDatafnServer({
    allowUnknownResources: true,
    schema,
    database: db,
    observability: {
      logger: createLoggerCollector(warnings),
    },
    spv2Migration,
    namespaceProvider: {
      getNamespace: () => NAMESPACE,
      getActorId: () => actor.current as any,
    },
  });

  return { db, server, actor, warnings };
}

describe("SPV2 migration compatibility (PHASE_10)", () => {
  let harness: Harness;

  beforeEach(async () => {
    setSpv2MigrationRuntimeConfig({ readMode: "v2", writeMode: "v2", warnOnLegacyApi: true });
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness?.server?.close?.();
    setSpv2MigrationRuntimeConfig({ readMode: "v2", writeMode: "v2", warnOnLegacyApi: true });
  });

  it("TV-COMP-001-P: idempotent backfill canonicalizes active legacy grants and preserves decisions across read modes", async () => {
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-comp1",
      mutationId: "m-comp1-seed",
      id: "n1",
      record: { title: "Legacy shared" },
    });

    const legacyTable = getLegacyPermissionsTable("notes");
    await harness.db.create({
      model: legacyTable,
      data: {
        id: "legacy:n1:bob",
        __ns: NAMESPACE,
        resourceId: "n1",
        userId: "bob",
        level: "viewer",
        grantedBy: "alice",
        grantedAt: 1,
        revokedAt: null,
      },
      namespace: NAMESPACE,
    });

    harness.actor.current = "bob";
    setSpv2MigrationRuntimeConfig({ readMode: "v1", writeMode: "v2", warnOnLegacyApi: true });
    const beforeBackfill = await callEndpoint(harness.server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      sort: ["id:asc"],
    });
    expect(beforeBackfill.status).toBe(200);
    expect(beforeBackfill.body.result.data.map((row: any) => row.id)).toEqual(["n1"]);

    const firstBackfill = await backfillLegacyPermissionsToSpv2({
      db: harness.db,
      namespace: NAMESPACE,
      resources: ["notes"],
    });
    expect(firstBackfill.equivalentAccess).toBe(true);
    expect(firstBackfill.migrated).toBe(1);
    expect(firstBackfill.v2Rows).toEqual([
      expect.objectContaining({
        resourceType: "notes",
        resourceNs: NAMESPACE,
        resourceId: "n1",
        principalId: "user:bob",
        level: "viewer",
      }),
    ]);

    const secondBackfill = await backfillLegacyPermissionsToSpv2({
      db: harness.db,
      namespace: NAMESPACE,
      resources: ["notes"],
    });
    expect(secondBackfill.migrated).toBe(0);

    const v2Rows = await harness.db.findMany({
      model: GLOBAL_PERMISSIONS_TABLE,
      where: [],
      namespace: NAMESPACE,
    });
    expect(v2Rows).toHaveLength(1);
    expect(v2Rows[0].principalId).toBe("user:bob");

    setSpv2MigrationRuntimeConfig({ readMode: "v2", writeMode: "v2", warnOnLegacyApi: true });
    const afterBackfill = await callEndpoint(harness.server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      sort: ["id:asc"],
    });
    expect(afterBackfill.status).toBe(200);
    expect(afterBackfill.body.result.data.map((row: any) => row.id)).toEqual(["n1"]);
  });

  it("TV-COMP-001-N: conflicting duplicate legacy grants fail migration deterministically", async () => {
    const legacyTable = getLegacyPermissionsTable("notes");
    await harness.db.create({
      model: legacyTable,
      data: {
        id: "legacy:viewer",
        __ns: NAMESPACE,
        resourceId: "n1",
        userId: "bob",
        level: "viewer",
        grantedBy: "alice",
        grantedAt: 1,
        revokedAt: null,
      },
      namespace: NAMESPACE,
    });
    await harness.db.create({
      model: legacyTable,
      data: {
        id: "legacy:owner",
        __ns: NAMESPACE,
        resourceId: "n1",
        userId: "bob",
        level: "owner",
        grantedBy: "alice",
        grantedAt: 2,
        revokedAt: null,
      },
      namespace: NAMESPACE,
    });

    let thrown: unknown;
    try {
      await backfillLegacyPermissionsToSpv2({
        db: harness.db,
        namespace: NAMESPACE,
        resources: ["notes"],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DatafnExecutionError);
    const migrationError = thrown as DatafnExecutionError;
    expect(migrationError.code).toBe("CONFLICT");
    expect(migrationError.message).toBe("Conflicting duplicate grants");
    expect(migrationError.details.path).toBe("migration.v1Rows");
  });

  it("dual-write mirrors legacy rows and rollback read mode can switch back to v1 decisions", async () => {
    await harness.server.close();
    harness = await createHarness({ readMode: "dual", writeMode: "dual", warnOnLegacyApi: true });

    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-comp1-dw",
      mutationId: "m-comp1-dw-seed",
      id: "n2",
      record: { title: "Dual write note" },
    });

    const shared = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-comp1-dw",
      mutationId: "m-comp1-dw-share",
      id: "n2",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });
    expect(shared.status).toBe(200);
    expect(shared.body.result.ok).toBe(true);

    const legacyTable = getLegacyPermissionsTable("notes");
    const [legacyRows, v2Rows] = await Promise.all([
      harness.db.findMany({ model: legacyTable, where: [], namespace: NAMESPACE }),
      harness.db.findMany({ model: GLOBAL_PERMISSIONS_TABLE, where: [], namespace: NAMESPACE }),
    ]);

    expect(legacyRows).toHaveLength(1);
    expect(legacyRows[0].resourceId).toBe("n2");
    expect(legacyRows[0].userId).toBe("user:bob");
    expect(v2Rows).toHaveLength(1);
    expect(v2Rows[0].principalId).toBe("user:bob");

    harness.actor.current = "bob";
    setSpv2MigrationRuntimeConfig({ readMode: "v1", writeMode: "dual", warnOnLegacyApi: true });
    const rollbackRead = await callEndpoint(harness.server, "query", {
      resource: "notes",
      version: 1,
      operation: "find",
      sort: ["id:asc"],
    });
    expect(rollbackRead.body.result.data.map((row: any) => row.id)).toEqual(["n2"]);

    harness.actor.current = "alice";
    const unshared = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "unshare",
      clientId: "c-comp1-dw",
      mutationId: "m-comp1-dw-unshare",
      id: "n2",
      shareWith: { principalId: "user:bob" },
    });
    expect(unshared.status).toBe(200);
    expect(unshared.body.result.ok).toBe(true);

    const [legacyAfterUnshare, v2AfterUnshare] = await Promise.all([
      harness.db.findMany({ model: legacyTable, where: [], namespace: NAMESPACE }),
      harness.db.findMany({ model: GLOBAL_PERMISSIONS_TABLE, where: [], namespace: NAMESPACE }),
    ]);
    expect(legacyAfterUnshare).toHaveLength(0);
    expect(v2AfterUnshare).toHaveLength(0);
  });

  it("TV-COMP-002-P/N: legacy share API stays compatible and emits deterministic warnings", async () => {
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-comp2",
      mutationId: "m-comp2-seed",
      id: "n3",
      record: { title: "Compatibility note" },
    });

    const legacyShare = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-comp2",
      mutationId: "m-comp2-legacy",
      id: "n3",
      shareWith: { userId: "bob", level: "viewer" },
    });

    expect(legacyShare.status).toBe(200);
    expect(legacyShare.body.result.ok).toBe(true);
    const grants = await harness.db.findMany({
      model: GLOBAL_PERMISSIONS_TABLE,
      where: [],
      namespace: NAMESPACE,
    });
    expect(grants).toEqual([
      expect.objectContaining({
        principalId: "user:bob",
        level: "viewer",
      }),
    ]);

    const warning = harness.warnings.find(
      (entry) =>
        entry.message ===
        "Deprecated shareWith.userId is accepted for compatibility; use shareWith.principalId",
    );
    expect(warning).toBeDefined();
    expect(warning?.context).toMatchObject({
      code: "DFQL_LEGACY_API_DEPRECATED",
      operation: "share",
      path: "shareWith.userId",
      replacement: "shareWith.principalId",
    });

    const invalidLegacyLevel = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-comp2",
      mutationId: "m-comp2-invalid-level",
      id: "n3",
      shareWith: { userId: "bob", level: "admin" },
    });
    expect(invalidLegacyLevel.status).toBe(400);
    expect(invalidLegacyLevel.body.error.code).toBe("DFQL_INVALID");
    expect(invalidLegacyLevel.body.error.message).toBe(
      "Invalid DFQL: shareWith.level must be one of [viewer, editor, owner]",
    );
    expect(invalidLegacyLevel.body.error.details.path).toMatch(/shareWith\.level$/);
  });
});
