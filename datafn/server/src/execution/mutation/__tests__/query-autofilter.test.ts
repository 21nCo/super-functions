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
      capabilities: ["trash", "archivable"],
      fields: [
        { name: "text", type: "string" as const, required: true },
        { name: "status", type: "string" as const, required: true },
      ],
    },
    {
      name: "notes",
      version: 1,
      idPrefix: "note:",
      fields: [{ name: "text", type: "string" as const, required: true }],
    },
  ],
  relations: [],
} satisfies DatafnSchema;

describe("Query auto-filtering for trash and archive", () => {
  let db: any;
  let server: any;

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
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      db,
      namespaceProvider: {
        getNamespace: () => "ns:1",
      },
    });

    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m1",
      id: "todo:1",
      record: { text: "active", status: "open" },
    });
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m2",
      id: "todo:2",
      record: { text: "trashed", status: "open" },
    });
    await mutation({
      resource: "todos",
      version: 1,
      operation: "insert",
      clientId: "c1",
      mutationId: "m3",
      id: "todo:3",
      record: { text: "archived", status: "closed" },
    });

    // memoryAdapter doesn't apply schema defaults for injected capability fields.
    // Normalize to null/false baseline to emulate persisted capability defaults.
    await db.update({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:1" }],
      data: { trashedAt: null, trashedBy: null, isArchived: false },
      namespace: "ns:1",
    });
    await db.update({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      data: { trashedAt: null, trashedBy: null, isArchived: false },
      namespace: "ns:1",
    });
    await db.update({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:3" }],
      data: { trashedAt: null, trashedBy: null, isArchived: false },
      namespace: "ns:1",
    });

    await mutation({
      resource: "todos",
      version: 1,
      operation: "trash",
      clientId: "c1",
      mutationId: "m4",
      id: "todo:2",
    });

    await mutation({
      resource: "todos",
      version: 1,
      operation: "archive",
      clientId: "c1",
      mutationId: "m5",
      id: "todo:3",
    });

    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m10",
      id: "note:1",
      record: { text: "note one" },
    });
    await mutation({
      resource: "notes",
      version: 1,
      operation: "insert",
      clientId: "c2",
      mutationId: "m11",
      id: "note:2",
      record: { text: "note two" },
    });
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("default query excludes trashed and archived records", async () => {
    const res = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
    });

    expect(res.res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.result.data.map((r: any) => r.id)).toEqual(["todo:1"]);
  });

  it("includeTrashed: true includes trashed records", async () => {
    const res = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
      metadata: { includeTrashed: true },
    });

    expect(res.res.status).toBe(200);
    expect(res.body.result.data.map((r: any) => r.id)).toEqual([
      "todo:1",
      "todo:2",
    ]);
  });

  it("includeArchived: true includes archived records", async () => {
    const res = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
      metadata: { includeArchived: true },
    });

    expect(res.res.status).toBe(200);
    expect(res.body.result.data.map((r: any) => r.id)).toEqual([
      "todo:1",
      "todo:3",
    ]);
  });

  it("includeTrashed + includeArchived returns all records", async () => {
    const res = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
      metadata: { includeTrashed: true, includeArchived: true },
    });

    expect(res.res.status).toBe(200);
    expect(res.body.result.data.map((r: any) => r.id)).toEqual([
      "todo:1",
      "todo:2",
      "todo:3",
    ]);
  });

  it("non-capability resource receives no auto-filters", async () => {
    const res = await query({
      resource: "notes",
      version: 1,
      sort: ["id:asc"],
    });

    expect(res.res.status).toBe(200);
    expect(res.body.result.data.map((r: any) => r.id)).toEqual([
      "note:1",
      "note:2",
    ]);
  });

  it("user filters are preserved alongside auto-filters", async () => {
    const hiddenByArchive = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
      filters: { status: "closed" },
    });

    expect(hiddenByArchive.res.status).toBe(200);
    expect(hiddenByArchive.body.result.data).toEqual([]);

    const includeArchived = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
      filters: { status: "closed" },
      metadata: { includeArchived: true },
    });

    expect(includeArchived.res.status).toBe(200);
    expect(includeArchived.body.result.data.map((r: any) => r.id)).toEqual([
      "todo:3",
    ]);
  });

  it("includeTrashed can be combined with user trashedAt filter", async () => {
    const res = await query({
      resource: "todos",
      version: 1,
      sort: ["id:asc"],
      filters: { trashedAt: { $ne: null } },
      metadata: { includeTrashed: true },
    });

    expect(res.res.status).toBe(200);
    expect(res.body.result.data.map((r: any) => r.id)).toEqual(["todo:2"]);
  });
});
