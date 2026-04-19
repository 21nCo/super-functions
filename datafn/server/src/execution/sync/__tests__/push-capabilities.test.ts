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
      capabilities: ["timestamps", "audit", "trash", "archivable"] as any,
      fields: [{ name: "text", type: "string", required: true }],
    },
  ],
  relations: [],
};

describe("sync push capability injection", () => {
  let db: any;
  let server: any;
  let actorId: string | undefined;

  const push = async (mutations: Array<Record<string, unknown>>) => {
    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:1", mutations }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    return { res, body };
  };

  const pullLegacy = async (cursor = "0") => {
    const req = new Request("http://localhost/datafn/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:2", cursor, limit: 50 }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    return body.result;
  };

  beforeEach(async () => {
    actorId = "user:alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      schema,
      db,
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

  it("push insert injects timestamps and audit fields", async () => {
    const start = Date.now();

    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m1",
        id: "todo:1",
        record: { text: "hello" },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:1" }],
      namespace: "ns:1",
    });

    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdAt).toBeGreaterThanOrEqual(start);
    expect(row.updatedAt).toBeGreaterThanOrEqual(start);
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
  });

  it("push merge creates missing record with insert capability fields", async () => {
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        clientId: "client:1",
        mutationId: "m-merge-create",
        id: "todo:merge-create",
        record: { text: "created by merge" },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.applied).toContain("m-merge-create");
    expect(body.result.errors).toHaveLength(0);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:merge-create" }],
      namespace: "ns:1",
    });

    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
  });

  it("push merge updates existing record and preserves createdAt", async () => {
    await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m-merge-existing-seed",
        id: "todo:merge-existing",
        record: { text: "before" },
      },
    ]);

    const before = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:merge-existing" }],
      namespace: "ns:1",
    });

    await push([
      {
        resource: "todos",
        version: 1,
        operation: "merge",
        clientId: "client:1",
        mutationId: "m-merge-existing",
        id: "todo:merge-existing",
        record: { text: "after" },
      },
    ]);

    const after = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:merge-existing" }],
      namespace: "ns:1",
    });

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    expect(after.text).toBe("after");
  });

  it("push trash executes and records pull-visible merge change with full record", async () => {
    await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m2",
        id: "todo:2",
        record: { text: "trash me" },
      },
    ]);

    actorId = "user:bob";
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "trash",
        clientId: "client:1",
        mutationId: "m3",
        id: "todo:2",
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:2" }],
      namespace: "ns:1",
    });
    expect(typeof row.trashedAt).toBe("number");
    expect(row.trashedBy).toBe("user:bob");

    const pullResult = await pullLegacy("0");
    const mergeChange = pullResult.changes
      .filter((change: any) => change.id === "todo:2" && change.op === "upsert")
      .at(-1);
    expect(mergeChange).toBeDefined();
    expect(mergeChange.record.text).toBe("trash me");
    expect(mergeChange.record.trashedBy).toBe("user:bob");
    expect(mergeChange.record.trashedAt).not.toBeNull();
  });

  it("push archive executes and records merge change", async () => {
    await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m4",
        id: "todo:3",
        record: { text: "archive me" },
      },
    ]);

    actorId = "user:carol";
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "archive",
        clientId: "client:1",
        mutationId: "m5",
        id: "todo:3",
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:3" }],
      namespace: "ns:1",
    });
    expect(row.isArchived).toBe(true);

    const pullResult = await pullLegacy("0");
    const mergeChange = pullResult.changes
      .filter((change: any) => change.id === "todo:3" && change.op === "upsert")
      .at(-1);
    expect(mergeChange).toBeDefined();
    expect(mergeChange.record.isArchived).toBe(true);
    expect(mergeChange.record.text).toBe("archive me");
  });

  it("push with invalid operation is rejected", async () => {
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "invalidOp",
        clientId: "client:1",
        mutationId: "m6",
        id: "todo:4",
      },
    ]);

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNSUPPORTED");
  });

  it("push insert strips client-provided readonly capability fields before validation", async () => {
    const { res, body } = await push([
      {
        resource: "todos",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "m7",
        id: "todo:readonly",
        record: {
          text: "ignore readonly input",
          createdAt: 1,
          updatedAt: 2,
          createdBy: "spoof",
          updatedBy: "spoof",
          trashedAt: 3,
          trashedBy: "spoof",
        },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);

    const row = await db.findOne({
      model: "todos",
      where: [{ field: "id", operator: "eq", value: "todo:readonly" }],
      namespace: "ns:1",
    });
    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
    expect(row.trashedAt).toBeUndefined();
    expect(row.trashedBy).toBeUndefined();
  });

  it("does not strip similarly named fields when capability is not enabled", async () => {
    const noCapabilitySchema: DatafnSchema = {
      resources: [
        {
          name: "plain",
          version: 1,
          fields: [
            { name: "text", type: "string", required: true },
            { name: "createdAt", type: "number", required: false },
          ],
        },
      ],
      relations: [],
    };

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer = await createDatafnServer({
      schema: noCapabilitySchema,
      db: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:plain",
        getActorId: () => "user:plain",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:plain",
          mutations: [
            {
              resource: "plain",
              version: 1,
              operation: "insert",
              clientId: "client:plain",
              mutationId: "m8",
              id: "plain:1",
              record: { text: "ok", createdAt: 42 },
            },
          ],
        }),
      });
      const res = await localServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      const row = await localDb.findOne({
        model: "plain",
        where: [{ field: "id", operator: "eq", value: "plain:1" }],
        namespace: "ns:plain",
      });
      expect(row.createdAt).toBe(42);
    } finally {
      await localServer.close();
    }
  });

  it("push merge does not inject timestamp fields when capability is not enabled", async () => {
    const noCapabilitySchema: DatafnSchema = {
      resources: [
        {
          name: "plainMerge",
          version: 1,
          fields: [{ name: "text", type: "string", required: false }],
        },
      ],
      relations: [],
    };

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer = await createDatafnServer({
      schema: noCapabilitySchema,
      db: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:plain-merge",
        getActorId: () => "user:plain",
      },
    });

    try {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId: "client:plain-merge",
          mutations: [
            {
              resource: "plainMerge",
              version: 1,
              operation: "merge",
              clientId: "client:plain-merge",
              mutationId: "m-plain-merge",
              id: "plainMerge:1",
              record: { text: "ok" },
            },
          ],
        }),
      });
      const res = await localServer.router.handle(req);
      const body = (await res.json()) as any;

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      expect(body.result.errors).toHaveLength(0);

      const row = await localDb.findOne({
        model: "plainMerge",
        where: [{ field: "id", operator: "eq", value: "plainMerge:1" }],
        namespace: "ns:plain-merge",
      });
      expect(row.text).toBe("ok");
      expect(row.createdAt).toBeUndefined();
      expect(row.updatedAt).toBeUndefined();
    } finally {
      await localServer.close();
    }
  });

  it("push executes share and unshare with permissions change tracking semantics", async () => {
    const shareSchema: DatafnSchema = {
      capabilities: ["audit"] as any,
      resources: [
        {
          name: "docs",
          version: 1,
          fields: [{ name: "title", type: "string", required: true }],
          capabilities: [
            {
              shareable: {
                levels: ["viewer", "editor", "owner"],
                default: "private",
              },
            },
          ] as any,
        },
      ],
      relations: [],
    };

    const shareDb = memoryAdapter();
    await shareDb.initialize();
    const shareServer = await createDatafnServer({
      schema: shareSchema,
      db: shareDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:share",
        getActorId: () => "user:owner",
      },
    });

    const pushRequest = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:share", mutations }),
      });
      const res = await shareServer.router.handle(req);
      const body = (await res.json()) as any;
      return { res, body };
    };

    try {
      const inserted = await pushRequest([
        {
          resource: "docs",
          version: 1,
          operation: "insert",
          id: "doc:1",
          clientId: "client:share",
          mutationId: "s1",
          record: { title: "spec" },
        },
      ]);
      expect(inserted.res.status).toBe(200);
      expect(inserted.body.ok).toBe(true);

      const shared = await pushRequest([
        {
          resource: "docs",
          version: 1,
          operation: "share",
          id: "doc:1",
          clientId: "client:share",
          mutationId: "s2",
          shareWith: { userId: "user:viewer", level: "viewer" },
        },
      ]);
      expect(shared.res.status).toBe(200);
      expect(shared.body.ok).toBe(true);
      expect(shared.body.result.ok).toBe(true);
      expect(shared.body.result.errors).toHaveLength(0);

      const permissionAfterShare = await shareDb.findOne({
        model: "__datafn_permissions_global",
        where: [
          {
            field: "id",
            operator: "eq",
            value: "docs:ns:share:doc:1:user:viewer",
          },
        ],
        namespace: "ns:share",
      });
      expect(permissionAfterShare).not.toBeNull();

      const unshared = await pushRequest([
        {
          resource: "docs",
          version: 1,
          operation: "unshare",
          id: "doc:1",
          clientId: "client:share",
          mutationId: "s3",
          shareWith: { userId: "user:viewer" },
        },
      ]);
      expect(unshared.res.status).toBe(200);
      expect(unshared.body.ok).toBe(true);
      expect(unshared.body.result.ok).toBe(true);
      expect(unshared.body.result.errors).toHaveLength(0);

      const permissionAfterUnshare = await shareDb.findOne({
        model: "__datafn_permissions_global",
        where: [
          {
            field: "id",
            operator: "eq",
            value: "docs:ns:share:doc:1:user:viewer",
          },
        ],
        namespace: "ns:share",
      });
      expect(permissionAfterUnshare).toBeNull();
    } finally {
      await shareServer.close();
    }
  });
});
