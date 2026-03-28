import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";

const schema = {
  resources: [
    {
      name: "archives",
      version: 1,
      idPrefix: "arc:",
      capabilities: ["timestamps", "audit", "archivable"],
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
};

describe("Archive and unarchive operations", () => {
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

  it("archive sets isArchived:true and unarchive sets isArchived:false", async () => {
    await mutation({
      resource: "archives",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "arc:1",
      record: { text: "hello" },
    });

    const archive = await mutation({
      resource: "archives",
      version: 1,
      operation: "archive",
      clientId: "c1",
      mutationId: "m2",
      id: "arc:1",
    });
    expect(archive.res.status).toBe(200);
    expect(archive.body.ok).toBe(true);
    expect(archive.body.result.ok).toBe(true);

    const archived = await db.findOne({
      model: "archives",
      where: [{ field: "id", operator: "eq", value: "arc:1" }],
      namespace: "ns:1",
    });
    expect(archived.isArchived).toBe(true);

    actorId = "user:bob";
    const unarchive = await mutation({
      resource: "archives",
      version: 1,
      operation: "unarchive",
      clientId: "c1",
      mutationId: "m3",
      id: "arc:1",
    });
    expect(unarchive.res.status).toBe(200);
    expect(unarchive.body.ok).toBe(true);
    expect(unarchive.body.result.ok).toBe(true);

    const unarchived = await db.findOne({
      model: "archives",
      where: [{ field: "id", operator: "eq", value: "arc:1" }],
      namespace: "ns:1",
    });
    expect(unarchived.isArchived).toBe(false);
    expect(unarchived.updatedBy).toBe("user:bob");
  });

  it("archive/unarchive on non-archivable resource returns DFQL_UNSUPPORTED", async () => {
    await mutation({
      resource: "logs",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m10",
      id: "log:1",
      record: { message: "m" },
    });

    const archive = await mutation({
      resource: "logs",
      version: 1,
      operation: "archive",
      clientId: "c2",
      mutationId: "m11",
      id: "log:1",
    });
    expect(archive.res.status).toBe(400);
    expect(archive.body.ok).toBe(false);
    expect(archive.body.error.code).toBe("DFQL_UNSUPPORTED");

    const unarchive = await mutation({
      resource: "logs",
      version: 1,
      operation: "unarchive",
      clientId: "c2",
      mutationId: "m12",
      id: "log:1",
    });
    expect(unarchive.res.status).toBe(400);
    expect(unarchive.body.ok).toBe(false);
    expect(unarchive.body.error.code).toBe("DFQL_UNSUPPORTED");
  });

  it("direct merge can set isArchived on archivable resources", async () => {
    await mutation({
      resource: "archives",
      version: 1,
      operation: "insert",
      clientId: "c3",
      mutationId: "m20",
      id: "arc:2",
      record: { text: "merge me" },
    });

    const merge = await mutation({
      resource: "archives",
      version: 1,
      operation: "merge",
      clientId: "c3",
      mutationId: "m21",
      id: "arc:2",
      record: { isArchived: true },
    });

    expect(merge.res.status).toBe(200);
    expect(merge.body.ok).toBe(true);

    const row = await db.findOne({
      model: "archives",
      where: [{ field: "id", operator: "eq", value: "arc:2" }],
      namespace: "ns:1",
    });
    expect(row.isArchived).toBe(true);
  });

  it("archive/unarchive produce change tracking entries with full record state", async () => {
    await mutation({
      resource: "archives",
      version: 1,
      operation: "insert",
      clientId: "c4",
      mutationId: "m30",
      id: "arc:3",
      record: { text: "track me" },
    });

    await mutation({
      resource: "archives",
      version: 1,
      operation: "archive",
      clientId: "c4",
      mutationId: "m31",
      id: "arc:3",
    });

    await mutation({
      resource: "archives",
      version: 1,
      operation: "unarchive",
      clientId: "c4",
      mutationId: "m32",
      id: "arc:3",
    });

    const changes = await db.internal.findMany(
      "__datafn_changes",
      [{ field: "resource", op: "eq", value: "archives" }],
      { orderBy: "server_seq" },
    );

    expect(changes.length).toBeGreaterThanOrEqual(3);
    const [insertChange, archiveChange, unarchiveChange] = changes.slice(-3);

    const parseRecord = (change: any): Record<string, unknown> => {
      if (typeof change.record === "string") {
        return JSON.parse(change.record) as Record<string, unknown>;
      }
      return (change.record ?? {}) as Record<string, unknown>;
    };

    const archiveRecord = parseRecord(archiveChange);
    const unarchiveRecord = parseRecord(unarchiveChange);

    expect(insertChange.op).toBe("insert");
    expect(archiveChange.op).toBe("merge");
    expect(unarchiveChange.op).toBe("merge");

    expect(archiveRecord.id).toBe("arc:3");
    expect(archiveRecord.isArchived).toBe(true);
    expect(typeof archiveRecord.updatedAt).toBe("number");

    expect(unarchiveRecord.id).toBe("arc:3");
    expect(unarchiveRecord.isArchived).toBe(false);
    expect(typeof unarchiveRecord.updatedAt).toBe("number");
  });
});
