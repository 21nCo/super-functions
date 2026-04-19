import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const schema = {
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo:",
      capabilities: ["timestamps", "audit", "trash"],
      fields: [{ name: "text", type: "string" as const, required: true }],
    },
    {
      name: "logs",
      version: 1,
      idPrefix: "log:",
      fields: [{ name: "message", type: "string" as const, required: true }],
    },
  ],
  relations: [],
} satisfies DatafnSchema;

describe("Trash and restore operations", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

  const mutation = async (payload: Record<string, unknown>) => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    return { res, body };
  };

  beforeEach(async () => {
    actorId = "user:alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => "ns:1",
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("trash sets trashedAt/trashedBy and restore clears them", async () => {
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "todo:1",
      record: { text: "hello" },
    });

    const trash = await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c1",
      mutationId: "m2",
      id: "todo:1",
    });

    expect(trash.res.status).toBe(200);
    expect(trash.body.ok).toBe(true);
    expect(trash.body.result.ok).toBe(true);
    expect(trash.body.result.affectedIds).toEqual(["todo:1"]);

    const trashed = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:1" }],
      namespace: "ns:1",
    });
    expect(typeof trashed.trashedAt).toBe("number");
    expect(trashed.trashedBy).toBe("user:alice");

    actorId = "user:bob";
    const restore = await mutation({
      resource: "todos",
      version: 1,
      operation: "restore",
      clientId: "c1",
      mutationId: "m3",
      id: "todo:1",
    });
    expect(restore.res.status).toBe(200);
    expect(restore.body.ok).toBe(true);
    expect(restore.body.result.ok).toBe(true);

    const restored = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:1" }],
      namespace: "ns:1",
    });
    expect(restored.trashedAt).toBeNull();
    expect(restored.trashedBy).toBeNull();
  });

  it("trash/restore on non-trash resource returns DFQL_UNSUPPORTED", async () => {
    await mutation({
      resource: "logs",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m10",
      id: "log:1",
      record: { message: "m" },
    });

    const trash = await mutation({
      resource: "logs",
      version: 1,
      operation: "trash",
      clientId: "c2",
      mutationId: "m11",
      id: "log:1",
    });
    expect(trash.res.status).toBe(400);
    expect(trash.body.ok).toBe(false);
    expect(trash.body.error.code).toBe("DFQL_UNSUPPORTED");

    const restore = await mutation({
      resource: "logs",
      version: 1,
      operation: "restore",
      clientId: "c2",
      mutationId: "m12",
      id: "log:1",
    });
    expect(restore.res.status).toBe(400);
    expect(restore.body.ok).toBe(false);
    expect(restore.body.error.code).toBe("DFQL_UNSUPPORTED");
  });

  it("double trash is idempotent and updates trash metadata", async () => {
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c3",
      mutationId: "m20",
      id: "todo:2",
      record: { text: "idempotent" },
    });

    await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c3",
      mutationId: "m21",
      id: "todo:2",
    });
    const first = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      namespace: "ns:1",
    });
    actorId = "user:bob";
    await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c3",
      mutationId: "m22",
      id: "todo:2",
    });
    const second = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      namespace: "ns:1",
    });

    expect(second.trashedAt).toBeGreaterThanOrEqual(first.trashedAt);
    expect(second.trashedBy).toBe("user:bob");
  });

  it("restore non-trashed is idempotent (ok:true) and hard delete on trashed works", async () => {
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c4",
      mutationId: "m30",
      id: "todo:3",
      record: { text: "delete me" },
    });

    const restore = await mutation({
      resource: "todos",
      version: 1,
      operation: "restore",
      clientId: "c4",
      mutationId: "m31",
      id: "todo:3",
    });
    expect(restore.res.status).toBe(200);
    expect(restore.body.ok).toBe(true);
    expect(restore.body.result.ok).toBe(true);

    await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c4",
      mutationId: "m32",
      id: "todo:3",
    });
    const del = await mutation({
      resource: "todos",
      version: 1,
      operation: "delete",
      clientId: "c4",
      mutationId: "m33",
      id: "todo:3",
    });
    expect(del.res.status).toBe(200);
    expect(del.body.ok).toBe(true);
    expect(del.body.result.ok).toBe(true);

    const missing = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:3" }],
      namespace: "ns:1",
    });
    expect(missing).toBeNull();
  });

  it("trash/restore record change tracking entries with full record state", async () => {
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c5",
      mutationId: "m40",
      id: "todo:4",
      record: { text: "track me" },
    });

    await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c5",
      mutationId: "m41",
      id: "todo:4",
    });
    await mutation({
      resource: "todos",
      version: 1,
      operation: "restore",
      clientId: "c5",
      mutationId: "m42",
      id: "todo:4",
    });

    const changes = await db.internal.findMany(
      "__datafn_changes",
      [{ field: "resource", op: "eq", value: "todos" }],
      { orderBy: "server_seq" },
    );

    expect(changes.length).toBeGreaterThanOrEqual(3);
    const [insertChange, trashChange, restoreChange] = changes.slice(-3);
    const parseRecord = (change: any): Record<string, unknown> => {
      if (typeof change.record === "string") {
        return JSON.parse(change.record) as Record<string, unknown>;
      }
      return (change.record ?? {}) as Record<string, unknown>;
    };
    const trashRecord = parseRecord(trashChange);
    const restoreRecord = parseRecord(restoreChange);

    expect(insertChange.op).toBe("insert");
    expect(trashChange.op).toBe("merge");
    expect(restoreChange.op).toBe("merge");

    expect(trashRecord).toBeTruthy();
    expect(trashRecord.id).toBe("todo:4");
    expect(trashRecord.trashedAt).not.toBeNull();
    expect(trashRecord.trashedBy).toBeTruthy();

    expect(restoreRecord).toBeTruthy();
    expect(restoreRecord.id).toBe("todo:4");
    expect(restoreRecord.trashedAt).toBeNull();
    expect(restoreRecord.trashedBy).toBeNull();
  });
});
