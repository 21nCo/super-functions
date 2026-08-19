import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const schema: DatafnSchema = {
  resources: [
    {
      name: "todos",
      version: 1,
      idPrefix: "todo",
      capabilities: ["timestamps", "audit"] as any,
      fields: [{ name: "text", type: "string", required: true }],
    },
    {
      name: "plain",
      version: 1,
      idPrefix: "plain",
      fields: [{ name: "text", type: "string", required: true }],
    },
    {
      name: "archives",
      version: 1,
      idPrefix: "arc",
      capabilities: ["archivable"] as any,
      fields: [{ name: "text", type: "string", required: true }],
    },
  ],
  relations: [],
};

describe("Capability mutation injection", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

  const mutate = async (payload: Record<string, unknown>) => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    return body;
  };

  beforeEach(async () => {
    actorId = "user:alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      schema,
      database: db,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:1",
        getActorId: () => actorId as any,
      },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("insert auto-sets createdAt/updatedAt and createdBy/updatedBy; strips client readonly fields", async () => {
    const start = Date.now();
    await mutate({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "todo:1",
      record: {
        text: "hello",
        createdAt: "fake",
        updatedAt: "fake",
        createdBy: "fake",
        updatedBy: "fake",
      },
    });
    const end = Date.now();

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:1" }],
      namespace: "ns:1",
    });

    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdAt).toBeGreaterThanOrEqual(start);
    expect(row.createdAt).toBeLessThanOrEqual(end + 1000);
    expect(row.updatedAt).toBeGreaterThanOrEqual(start);
    expect(row.updatedAt).toBeLessThanOrEqual(end + 1000);
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
  });

  it("merge updates updatedAt/updatedBy and preserves createdAt/createdBy", async () => {
    await mutate({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m2",
      id: "todo:2",
      record: { text: "before" },
    });

    const before = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      namespace: "ns:1",
    });

    actorId = "user:bob";
    await mutate({
      resource: "todos",
      version: 1,
      operation: "merge",
      clientId: "c1",
      mutationId: "m3",
      id: "todo:2",
      record: {
        text: "after",
        createdAt: 1,
        createdBy: "forged",
      },
    });

    const after = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      namespace: "ns:1",
    });

    expect(after.text).toBe("after");
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.createdBy).toBe("user:alice");
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    expect(after.updatedBy).toBe("user:bob");
  });

  it("replace preserves createdAt/createdBy and updates updatedAt/updatedBy", async () => {
    await mutate({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m4",
      id: "todo:3",
      record: { text: "original" },
    });
    const before = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:3" }],
      namespace: "ns:1",
    });

    actorId = "user:carol";
    await mutate({
      resource: "todos",
      version: 1,
      operation: "replace",
      clientId: "c2",
      mutationId: "m5",
      id: "todo:3",
      record: {
        text: "replaced",
        createdAt: 123,
        createdBy: "forged",
      },
    });

    const after = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:3" }],
      namespace: "ns:1",
    });

    expect(after.text).toBe("replaced");
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.createdBy).toBe(before.createdBy);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    expect(after.updatedBy).toBe("user:carol");
  });

  it("audit capability falls back to null when actorId is unavailable", async () => {
    actorId = undefined;
    await mutate({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c3",
      mutationId: "m6",
      id: "todo:4",
      record: { text: "no actor" },
    });

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:4" }],
      namespace: "ns:1",
    });

    expect(row.createdBy).toBeNull();
    expect(row.updatedBy).toBeNull();
  });

  it("non-capability resources are not injected", async () => {
    await mutate({
      resource: "plain",
      version: 1,
      operation: "insert",
      clientId: "c4",
      mutationId: "m7",
      id: "plain:1",
      record: { text: "plain text" },
    });

    const row = await db.findOne({
      model: "plain",
      where: [{ field: "id", operator: "eq", value: "plain:1" }],
      namespace: "ns:1",
    });

    expect(row.text).toBe("plain text");
    expect(row.createdAt).toBeUndefined();
    expect(row.updatedAt).toBeUndefined();
    expect(row.createdBy).toBeUndefined();
    expect(row.updatedBy).toBeUndefined();
  });

  it("isArchived is not stripped for archivable resources", async () => {
    await mutate({
      resource: "archives",
      version: 1,
      operation: "insert",
      clientId: "c5",
      mutationId: "m8",
      id: "arc:1",
      record: { text: "archive me" },
    });
    await mutate({
      resource: "archives",
      version: 1,
      operation: "merge",
      clientId: "c5",
      mutationId: "m9",
      id: "arc:1",
      record: { isArchived: true },
    });

    const row = await db.findOne({
      model: "archives",
      where: [{ field: "id", operator: "eq", value: "arc:1" }],
      namespace: "ns:1",
    });

    expect(row.isArchived).toBe(true);
  });
});
