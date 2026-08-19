import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../server.js";
import type { DatafnSchema } from "../../core-types.js";

const NAMESPACE = "ns:spv2";
const GLOBAL_PERMISSIONS_TABLE = "__datafn_permissions_global";

type ActorRef = { current: string | undefined };

type SyncPhase = "clone" | "pull" | "push" | "reconcile";

type Harness = {
  db: any;
  server: any;
  actor: ActorRef;
  syncActorByPhase: Partial<Record<SyncPhase, string | undefined>>;
};

const schema: DatafnSchema = {
  resources: [
    {
      name: "notes",
      version: 1,
      idPrefix: "note:",
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ] as any,
      fields: [{ name: "title", type: "string", required: true }],
      permissions: {
        read: { fields: ["id", "title"] },
        write: { fields: ["title"] },
      },
    },
    {
      name: "collections",
      version: 1,
      idPrefix: "col_",
      fields: [{ name: "name", type: "string", required: true }],
      permissions: {
        read: { fields: ["id", "name"] },
        write: { fields: ["name"] },
      },
    },
    {
      name: "items",
      version: 1,
      idPrefix: "n",
      capabilities: [
        "timestamps",
        "audit",
        { shareable: { levels: ["viewer", "editor", "owner"], default: "private" } },
      ] as any,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "secretField", type: "string", required: true },
        { name: "collectionId", type: "string", required: true },
      ],
      permissions: {
        read: { fields: ["id", "title", "collectionId"] },
        write: { fields: ["title", "secretField", "collectionId"] },
      },
    },
  ],
  relations: [
    {
      from: "items",
      to: "collections",
      type: "many-one",
      relation: "collection",
      inverse: "items",
      fkField: "collectionId",
    },
  ],
};

function installMemoryTransactionShim(db: any): void {
  db.transaction = async <T>(callback: (trx: any) => Promise<T>): Promise<T> => {
    const rowSnapshots = new Map<
      string,
      { model: string; namespace: string | undefined; rows: Array<Record<string, unknown>> }
    >();
    const internalSnapshots = new Map<
      string,
      { table: string; rows: Array<Record<string, unknown>> }
    >();

    const rowKey = (model: string, namespace: string | undefined) =>
      `${namespace ?? ""}::${model}`;

    const ensureRowSnapshot = async (model: string, namespace: string | undefined) => {
      const key = rowKey(model, namespace);
      if (rowSnapshots.has(key)) {
        return;
      }
      const rows = await db.findMany({ model, where: [], namespace });
      rowSnapshots.set(key, {
        model,
        namespace,
        rows: rows.map((row: Record<string, unknown>) => ({ ...row })),
      });
    };

    const ensureInternalSnapshot = async (table: string) => {
      if (internalSnapshots.has(table)) {
        return;
      }
      const rows = await db.internal.findMany(table, []);
      internalSnapshots.set(table, {
        table,
        rows: rows.map((row: Record<string, unknown>) => ({ ...row })),
      });
    };

    const tx = {
      ...db,
      create: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.create(params);
      },
      update: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.update(params);
      },
      delete: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.delete(params);
      },
      createMany: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.createMany(params);
      },
      updateMany: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.updateMany(params);
      },
      deleteMany: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.deleteMany(params);
      },
      upsert: async (params: any) => {
        await ensureRowSnapshot(params.model, params.namespace);
        return db.upsert(params);
      },
      internal: {
        ...db.internal,
        create: async (table: string, data: Record<string, unknown>) => {
          await ensureInternalSnapshot(table);
          return db.internal.create(table, data);
        },
        update: async (
          table: string,
          where: Array<{ field: string; op: string; value: unknown }>,
          data: Record<string, unknown>,
        ) => {
          await ensureInternalSnapshot(table);
          return db.internal.update(table, where, data);
        },
        delete: async (
          table: string,
          where: Array<{ field: string; op: string; value: unknown }>,
        ) => {
          await ensureInternalSnapshot(table);
          return db.internal.delete(table, where);
        },
        createMany: async (table: string, data: Record<string, unknown>[]) => {
          await ensureInternalSnapshot(table);
          return db.internal.createMany(table, data);
        },
      },
    };

    try {
      return await callback(tx);
    } catch (error) {
      for (const entry of rowSnapshots.values()) {
        const currentRows = await db.findMany({
          model: entry.model,
          where: [],
          namespace: entry.namespace,
        });
        for (const row of currentRows) {
          if (typeof row.id !== "string") {
            continue;
          }
          await db.delete({
            model: entry.model,
            where: [{ field: "id", operator: "eq", value: row.id }],
            namespace: entry.namespace,
          });
        }

        const restoreRows = [...entry.rows].sort((a, b) =>
          String(a.id ?? "").localeCompare(String(b.id ?? "")),
        );
        for (const row of restoreRows) {
          await db.create({ model: entry.model, data: { ...row }, namespace: entry.namespace });
        }
      }

      for (const entry of internalSnapshots.values()) {
        const currentRows = await db.internal.findMany(entry.table, []);
        for (const row of currentRows) {
          if (typeof row.id !== "string") {
            continue;
          }
          await db.internal.delete(entry.table, [{ field: "id", op: "eq", value: row.id }]);
        }

        const restoreRows = [...entry.rows].sort((a, b) =>
          String(a.id ?? "").localeCompare(String(b.id ?? "")),
        );
        for (const row of restoreRows) {
          await db.internal.create(entry.table, { ...row });
        }
      }

      throw error;
    }
  };
}

async function createHarness(options?: { transactionShim?: boolean }): Promise<Harness> {
  const actor: ActorRef = { current: "owner" };
  const syncActorByPhase: Partial<Record<SyncPhase, string | undefined>> = {};

  const db = memoryAdapter();
  await db.initialize();

  if (options?.transactionShim) {
    installMemoryTransactionShim(db);
  }

  const server = await createDatafnServer({
    schema,
    database: db,
    allowUnknownResources: true,
    plugins: [
      {
        name: "spv2-sync-actor-observer",
        runsOn: ["server"],
        beforeSync: (_ctx, phase, payload) => {
          if (
            phase === "clone" ||
            phase === "pull" ||
            phase === "push" ||
            phase === "reconcile"
          ) {
            const candidate = payload as Record<string, unknown>;
            syncActorByPhase[phase] =
              typeof candidate.actorId === "string" ? candidate.actorId : undefined;
          }
          return payload;
        },
      },
    ],
    namespaceProvider: {
      getNamespace: () => NAMESPACE,
      getActorId: () => actor.current as any,
    },
  });

  return { db, server, actor, syncActorByPhase };
}

async function callEndpoint(server: any, path: string, payload: Record<string, unknown>) {
  const req = new Request(`http://localhost/datafn/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await server.router.handle(req, {});
  const body = await res.json();
  return { res, body };
}

describe("SPV2 parity integration (PHASE_06)", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness?.server?.close?.();
  });

  it("TV-AUTH-001-P: actor context is observed across mutation/transact/push/pull/clone/reconcile", async () => {
    harness.actor.current = "bob";

    const mutationRes = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth1",
      mutationId: "m-auth1",
      id: "note:auth1-m",
      record: { title: "mutation" },
    });
    expect(mutationRes.res.status).toBe(200);
    expect(mutationRes.body.result.ok).toBe(true);

    const transactRes = await callEndpoint(harness.server, "transact", {
      steps: [
        {
          mutation: {
            resource: "notes",
            version: 1,
            operation: "insert",
            clientId: "c-auth1",
            mutationId: "t-auth1",
            id: "note:auth1-t",
            record: { title: "transact" },
          },
        },
      ],
    });
    expect(transactRes.res.status).toBe(200);
    expect(transactRes.body.result.ok).toBe(true);

    const pushRes = await callEndpoint(harness.server, "push", {
      clientId: "c-auth1",
      mutations: [
        {
          resource: "notes",
          version: 1,
          operation: "insert",
          clientId: "c-auth1",
          mutationId: "p-auth1",
          id: "note:auth1-p",
          record: { title: "push" },
        },
      ],
    });
    expect(pushRes.res.status).toBe(200);
    expect(pushRes.body.result.ok).toBe(true);

    const pullRes = await callEndpoint(harness.server, "pull", {
      clientId: "c-auth1",
      cursor: "0",
      limit: 50,
    });
    expect(pullRes.res.status).toBe(200);
    expect(pullRes.body.result.ok).toBe(true);

    const cloneRes = await callEndpoint(harness.server, "clone", {
      clientId: "c-auth1",
      tables: ["notes"],
    });
    expect(cloneRes.res.status).toBe(200);
    expect(cloneRes.body.result.ok).toBe(true);

    const reconcileRes = await callEndpoint(harness.server, "reconcile", {
      clientId: "c-auth1",
      resources: ["notes"],
    });
    expect(reconcileRes.res.status).toBe(200);
    expect(reconcileRes.body.result.ok).toBe(true);

    const mutationRow = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth1-m" }],
      namespace: NAMESPACE,
    });
    const transactRow = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth1-t" }],
      namespace: NAMESPACE,
    });
    const pushRow = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth1-p" }],
      namespace: NAMESPACE,
    });

    expect(mutationRow.createdBy).toBe("bob");
    expect(transactRow.createdBy).toBe("bob");
    expect(pushRow.createdBy).toBe("bob");
  });

  it("TV-AUTH-001-N: push without actor is denied for private shareable mutation", async () => {
    harness.actor.current = "owner";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth1n",
      mutationId: "seed-auth1n",
      id: "note:auth1n",
      record: { title: "before" },
    });

    harness.actor.current = undefined;

    const pushRes = await callEndpoint(harness.server, "push", {
      clientId: "c-auth1n",
      mutations: [
        {
          resource: "notes",
          version: 1,
          operation: "merge",
          clientId: "c-auth1n",
          mutationId: "p-auth1n",
          id: "note:auth1n",
          record: { title: "after" },
        },
      ],
    });

    expect(pushRes.res.status).toBe(400);
    expect(pushRes.body.ok).toBe(false);
    expect(pushRes.body.result.ok).toBe(false);
    expect(pushRes.body.result.errors).toHaveLength(1);
    expect(pushRes.body.result.errors[0]).toMatchObject({
      code: "FORBIDDEN",
      message: "Actor required for private shareable operation",
      path: "operation",
    });

    const row = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth1n" }],
      namespace: NAMESPACE,
    });
    expect(row.title).toBe("before");
  });

  it("TV-AUTH-002-P/N: mutation/push enforce the same shareable operation matrix", async () => {
    harness.actor.current = "owner";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth2",
      mutationId: "seed-auth2",
      id: "note:auth2",
      record: { title: "seed" },
    });

    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-auth2",
      mutationId: "share-editor",
      id: "note:auth2",
      shareWith: { principalId: "user:bob", level: "editor" },
    });

    harness.actor.current = "bob";
    const mutationMerge = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "merge",
      clientId: "c-auth2",
      mutationId: "m-auth2-merge",
      id: "note:auth2",
      record: { title: "editor-merge" },
    });
    const pushMerge = await callEndpoint(harness.server, "push", {
      clientId: "c-auth2",
      mutations: [
        {
          resource: "notes",
          version: 1,
          operation: "merge",
          clientId: "c-auth2",
          mutationId: "p-auth2-merge",
          id: "note:auth2",
          record: { title: "editor-merge-2" },
        },
      ],
    });

    expect(mutationMerge.body.result.ok).toBe(true);
    expect(pushMerge.body.result.ok).toBe(true);

    harness.actor.current = "owner";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-auth2",
      mutationId: "share-viewer",
      id: "note:auth2",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });

    harness.actor.current = "bob";
    const mutationDelete = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "delete",
      clientId: "c-auth2",
      mutationId: "m-auth2-delete",
      id: "note:auth2",
    });
    const pushDelete = await callEndpoint(harness.server, "push", {
      clientId: "c-auth2",
      mutations: [
        {
          resource: "notes",
          version: 1,
          operation: "delete",
          clientId: "c-auth2",
          mutationId: "p-auth2-delete",
          id: "note:auth2",
        },
      ],
    });

    expect(mutationDelete.body.result.ok).toBe(false);
    expect(pushDelete.body.result.errors).toHaveLength(1);

    const mutationError = mutationDelete.body.result.errors[0];
    const pushError = pushDelete.body.result.errors[0];
    expect({ code: mutationError.code, message: mutationError.message, path: mutationError.path }).toEqual({
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    });
    expect({ code: pushError.code, message: pushError.message, path: pushError.path }).toEqual({
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    });
  });

  it("TV-AUTH-003-P: transact allowed sequence matches standalone mutation sequence", async () => {
    harness.actor.current = "owner";

    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth3",
      mutationId: "seed-auth3-seq",
      id: "note:auth3-seq",
      record: { title: "before" },
    });
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth3",
      mutationId: "seed-auth3-tx",
      id: "note:auth3-tx",
      record: { title: "before" },
    });

    const standaloneMerge = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "merge",
      clientId: "c-auth3",
      mutationId: "m-auth3-merge",
      id: "note:auth3-seq",
      record: { title: "A" },
    });
    const standaloneShare = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-auth3",
      mutationId: "m-auth3-share",
      id: "note:auth3-seq",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });

    const transact = await callEndpoint(harness.server, "transact", {
      steps: [
        {
          mutation: {
            resource: "notes",
            version: 1,
            operation: "merge",
            clientId: "c-auth3",
            mutationId: "t-auth3-merge",
            id: "note:auth3-tx",
            record: { title: "A" },
          },
        },
        {
          mutation: {
            resource: "notes",
            version: 1,
            operation: "share",
            clientId: "c-auth3",
            mutationId: "t-auth3-share",
            id: "note:auth3-tx",
            shareWith: { principalId: "user:bob", level: "viewer" },
          },
        },
      ],
    });

    expect(standaloneMerge.body.result.ok).toBe(true);
    expect(standaloneShare.body.result.ok).toBe(true);
    expect(transact.res.status).toBe(200);
    expect(transact.body.result.ok).toBe(true);

    const seqRow = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth3-seq" }],
      namespace: NAMESPACE,
    });
    const txRow = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth3-tx" }],
      namespace: NAMESPACE,
    });
    expect(seqRow.title).toBe("A");
    expect(txRow.title).toBe("A");

    const seqGrant = await harness.db.findOne({
      model: GLOBAL_PERMISSIONS_TABLE,
      where: [{ field: "id", operator: "eq", value: `notes:${NAMESPACE}:note:auth3-seq:user:bob` }],
      namespace: NAMESPACE,
    });
    const txGrant = await harness.db.findOne({
      model: GLOBAL_PERMISSIONS_TABLE,
      where: [{ field: "id", operator: "eq", value: `notes:${NAMESPACE}:note:auth3-tx:user:bob` }],
      namespace: NAMESPACE,
    });

    expect(seqGrant.level).toBe("viewer");
    expect(txGrant.level).toBe("viewer");
  });

  it("TV-AUTH-003-N: transaction aborts on first forbidden step without partial state", async () => {
    await harness.server?.close?.();
    harness = await createHarness({ transactionShim: true });

    harness.actor.current = "owner";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-auth3n",
      mutationId: "seed-auth3n",
      id: "note:auth3n",
      record: { title: "before" },
    });
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-auth3n",
      mutationId: "share-auth3n",
      id: "note:auth3n",
      shareWith: { principalId: "user:editor", level: "editor" },
    });

    harness.actor.current = "editor";
    const transactRes = await callEndpoint(harness.server, "transact", {
      steps: [
        {
          mutation: {
            resource: "notes",
            version: 1,
            operation: "merge",
            clientId: "c-auth3n",
            mutationId: "t-auth3n-merge",
            id: "note:auth3n",
            record: { title: "B" },
          },
        },
        {
          mutation: {
            resource: "notes",
            version: 1,
            operation: "share",
            clientId: "c-auth3n",
            mutationId: "t-auth3n-share",
            id: "note:auth3n",
            shareWith: { principalId: "user:x", level: "viewer" },
          },
        },
      ],
    });

    expect(transactRes.res.status).toBe(200);
    expect(transactRes.body.result.ok).toBe(false);
    expect(transactRes.body.result.results[1].error).toMatchObject({
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    });

    const row = await harness.db.findOne({
      model: "notes",
      where: [{ field: "id", operator: "eq", value: "note:auth3n" }],
      namespace: NAMESPACE,
    });
    expect(row.title).toBe("before");

    const forbiddenGrant = await harness.db.findOne({
      model: GLOBAL_PERMISSIONS_TABLE,
      where: [{ field: "id", operator: "eq", value: `notes:${NAMESPACE}:note:auth3n:user:x` }],
      namespace: NAMESPACE,
    });
    expect(forbiddenGrant).toBeNull();
  });

  it("TV-AUTH-005-P/N: relation expansion enforces target authz and nested field policy", async () => {
    harness.actor.current = "owner";

    await callEndpoint(harness.server, "mutation", {
      resource: "collections",
      version: 1,
      operation: "insert",
      clientId: "c-auth5",
      mutationId: "seed-col",
      id: "col_1",
      record: { name: "Collection" },
    });

    await callEndpoint(harness.server, "mutation", {
      resource: "items",
      version: 1,
      operation: "insert",
      clientId: "c-auth5",
      mutationId: "seed-item-1",
      id: "n1",
      record: { title: "allowed", secretField: "s1", collectionId: "col_1" },
    });
    await callEndpoint(harness.server, "mutation", {
      resource: "items",
      version: 1,
      operation: "insert",
      clientId: "c-auth5",
      mutationId: "seed-item-2",
      id: "n2",
      record: { title: "blocked", secretField: "s2", collectionId: "col_1" },
    });

    await callEndpoint(harness.server, "mutation", {
      resource: "items",
      version: 1,
      operation: "share",
      clientId: "c-auth5",
      mutationId: "share-item-1",
      id: "n1",
      shareWith: { principalId: "user:bob", level: "viewer" },
    });

    harness.actor.current = "bob";

    const queryAllowed = await callEndpoint(harness.server, "query", {
      resource: "collections",
      version: 1,
      operation: "find",
      select: ["id", "items.id", "items.title"],
      filters: { id: "col_1" },
    });

    expect(queryAllowed.res.status).toBe(200);
    expect(queryAllowed.body.result.data).toEqual([
      {
        id: "col_1",
        items: [{ id: "n1", title: "allowed" }],
      },
    ]);

    const queryDenied = await callEndpoint(harness.server, "query", {
      resource: "collections",
      version: 1,
      operation: "find",
      select: ["id", "items.secretField"],
      filters: { id: "col_1" },
    });

    expect(queryDenied.res.status).toBe(403);
    expect(queryDenied.body.error).toMatchObject({
      code: "FORBIDDEN",
      message: "Read access denied",
      details: { path: "select[1]" },
    });
  });

  it("manual parity check: equivalent deny decision across /mutation, /push, /transact", async () => {
    await harness.server?.close?.();
    harness = await createHarness({ transactionShim: true });

    harness.actor.current = "owner";
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c-parity",
      mutationId: "seed-parity",
      id: "note:parity",
      record: { title: "parity" },
    });
    await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "share",
      clientId: "c-parity",
      mutationId: "share-parity",
      id: "note:parity",
      shareWith: { principalId: "user:viewer", level: "viewer" },
    });

    harness.actor.current = "viewer";

    const mutationDelete = await callEndpoint(harness.server, "mutation", {
      resource: "notes",
      version: 1,
      operation: "delete",
      clientId: "c-parity",
      mutationId: "m-parity-delete",
      id: "note:parity",
    });

    const pushDelete = await callEndpoint(harness.server, "push", {
      clientId: "c-parity",
      mutations: [
        {
          resource: "notes",
          version: 1,
          operation: "delete",
          clientId: "c-parity",
          mutationId: "p-parity-delete",
          id: "note:parity",
        },
      ],
    });

    const transactDelete = await callEndpoint(harness.server, "transact", {
      steps: [
        {
          mutation: {
            resource: "notes",
            version: 1,
            operation: "delete",
            clientId: "c-parity",
            mutationId: "t-parity-delete",
            id: "note:parity",
          },
        },
      ],
    });

    const mutationError = mutationDelete.body.result.errors[0];
    const pushError = pushDelete.body.result.errors[0];
    const transactError = transactDelete.body.result.results[0].error;

    const expected = {
      code: "FORBIDDEN",
      message: "Authorization denied",
      path: "operation",
    };

    expect({ code: mutationError.code, message: mutationError.message, path: mutationError.path }).toEqual(expected);
    expect({ code: pushError.code, message: pushError.message, path: pushError.path }).toEqual(expected);
    expect({ code: transactError.code, message: transactError.message, path: transactError.path }).toEqual(expected);
  });
});
