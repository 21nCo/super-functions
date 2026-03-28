import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../server.js";

const schema = {
  capabilities: ["timestamps", "audit"],
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo:",
      capabilities: ["trash", "archivable"],
      fields: [
        { name: "text", type: "string" as const, required: true },
        { name: "completed", type: "boolean" as const, required: true, default: false },
      ],
      permissions: {
        read: { fields: ["id", "text", "completed"] },
        write: { fields: ["text", "completed"] },
      },
    },
  ],
  relations: [],
};

describe("capabilities end-to-end lifecycle", () => {
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

  const query = async (payload: Record<string, unknown>) => {
    const req = new Request("http://localhost/datafn/query", {
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
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => "ns:1",
        getActorId: () => actorId as any,
      },
      allowUnknownResources: true,
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("covers timestamps/audit/trash/archivable/delete lifecycle", async () => {
    const insertRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "todo:1",
      record: { text: "first", completed: false },
    });
    expect(insertRes.res.status).toBe(200);
    expect(insertRes.body.result.ok).toBe(true);

    const q1 = await query({ resource: "todos", version: 1, sort: ["id:asc"] });
    expect(q1.res.status).toBe(200);
    expect(q1.body.result.data).toHaveLength(1);
    const inserted = q1.body.result.data[0] as Record<string, unknown>;
    const createdAt = inserted.createdAt as number;
    const updatedAt = inserted.updatedAt as number;
    expect(typeof createdAt).toBe("number");
    expect(typeof updatedAt).toBe("number");
    expect(inserted.createdBy).toBe("user:alice");
    expect(inserted.updatedBy).toBe("user:alice");

    const mergeRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "merge",
      clientId: "c1",
      mutationId: "m2",
      id: "todo:1",
      record: { completed: true },
    });
    expect(mergeRes.body.result.ok).toBe(true);

    const q2 = await query({ resource: "todos", version: 1, sort: ["id:asc"] });
    const merged = q2.body.result.data[0] as Record<string, unknown>;
    expect(merged.createdAt).toBe(createdAt);
    expect((merged.updatedAt as number) >= updatedAt).toBe(true);
    expect(merged.updatedBy).toBe("user:alice");

    const trashRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c1",
      mutationId: "m3",
      id: "todo:1",
    });
    expect(trashRes.body.result.ok).toBe(true);

    const qDefaultAfterTrash = await query({ resource: "todos", version: 1 });
    expect(qDefaultAfterTrash.body.result.data).toHaveLength(0);

    const qWithTrashed = await query({
      resource: "todos",
      version: 1,
      metadata: { includeTrashed: true },
    });
    expect(qWithTrashed.body.result.data).toHaveLength(1);

    const restoreRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "restore",
      clientId: "c1",
      mutationId: "m4",
      id: "todo:1",
    });
    expect(restoreRes.body.result.ok).toBe(true);
    const qAfterRestore = await query({ resource: "todos", version: 1 });
    expect(qAfterRestore.body.result.data).toHaveLength(1);

    const archiveRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "archive",
      clientId: "c1",
      mutationId: "m5",
      id: "todo:1",
    });
    expect(archiveRes.body.result.ok).toBe(true);

    const qDefaultAfterArchive = await query({ resource: "todos", version: 1 });
    expect(qDefaultAfterArchive.body.result.data).toHaveLength(0);

    const qWithArchived = await query({
      resource: "todos",
      version: 1,
      metadata: { includeArchived: true },
    });
    expect(qWithArchived.body.result.data).toHaveLength(1);

    const unarchiveRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "unarchive",
      clientId: "c1",
      mutationId: "m6",
      id: "todo:1",
    });
    expect(unarchiveRes.body.result.ok).toBe(true);
    const qAfterUnarchive = await query({ resource: "todos", version: 1 });
    expect(qAfterUnarchive.body.result.data).toHaveLength(1);

    const deleteRes = await mutation({
      resource: "todos",
      version: 1,
      operation: "delete",
      clientId: "c1",
      mutationId: "m7",
      id: "todo:1",
    });
    expect(deleteRes.body.result.ok).toBe(true);

    const qAfterDelete = await query({
      resource: "todos",
      version: 1,
      metadata: { includeTrashed: true, includeArchived: true },
    });
    expect(qAfterDelete.body.result.data).toHaveLength(0);
  });
});
