/**
 * Push path parity tests for many-many relation capabilities (JSY-001, COMP-001).
 *
 * Verifies that /datafn/push executed relate/modifyRelation operations apply
 * the same capability stripping and injection semantics as direct mutation execution.
 *
 * NOTE: All resource records are seeded via push (not direct db.create) to ensure
 * compatibility with the server's row-level namespace wrapping.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";
import { getJoinTableName, getRelationJoinTableName } from "@datafn/core";

// Schema with two resources and a capability-enabled many-many relation
const capabilitySchema: DatafnSchema = {
  resources: [
    {
      name: "users",
      version: 1,
      fields: [{ name: "name", type: "string", required: true }],
    },
    {
      name: "tags",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "users",
      to: "tags",
      type: "many-many",
      relation: "tags",
      // Both timestamps and audit enabled
      capabilities: ["timestamps", "audit"] as any,
      metadata: [{ name: "addedOrder", type: "number" }],
    },
  ],
};

// Schema without relation capabilities for COMP-001 verification
const noCapabilitySchema: DatafnSchema = {
  resources: [
    {
      name: "items",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
    {
      name: "labels",
      version: 1,
      fields: [{ name: "text", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "items",
      to: "labels",
      type: "many-many",
      relation: "labels",
      // No capabilities
      metadata: [{ name: "weight", type: "number" }],
    },
  ],
};

describe("push relate relation capabilities (JSY-001)", () => {
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

  beforeEach(async () => {
    actorId = "user:alice";
    db = memoryAdapter();
    await db.initialize();
    server = await createDatafnServer({
      schema: capabilitySchema,
      database: db,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:1",
        getActorId: () => actorId as any,
      },
    });

    // Seed resources via push so namespace wrapping is applied correctly
    const seedResult = await push([
      {
        resource: "users",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "seed-user-1",
        id: "user:1",
        record: { name: "Alice" },
      },
      {
        resource: "tags",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "seed-tag-1",
        id: "tag:1",
        record: { label: "Work" },
      },
      {
        resource: "tags",
        version: 1,
        operation: "insert",
        clientId: "client:1",
        mutationId: "seed-tag-2",
        id: "tag:2",
        record: { label: "Personal" },
      },
    ]);
    expect(seedResult.body.result.errors).toHaveLength(0);
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("push relate injects createdAt, updatedAt, createdBy, updatedBy on capability-enabled relation", async () => {
    const start = Date.now();

    const { res, body } = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-relate-1",
        id: "user:1",
        relations: { tags: ["tag:1"] },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.errors).toHaveLength(0);

    // Read join row back via direct DB (original adapter — reads without __ns filter)
    const joinTableName = getJoinTableName("users", "tags", undefined);
    const rows = await db.findMany({
      model: joinTableName,
      where: [],
      namespace: "ns:1",
    });
    const row = rows.find((r: any) => r.id === "user:1:tag:1");

    expect(row).toBeDefined();
    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
    expect(row.createdAt).toBeGreaterThanOrEqual(start);
    expect(row.updatedAt).toBeGreaterThanOrEqual(start);
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
  });

  it("push relate strips client-provided readonly capability fields — validation rejects unknown relation metadata", async () => {
    // The push validator rejects unknown relation metadata keys (including capability fields)
    // This is the push-path security boundary: stricter than the direct mutation path's stripping
    const { res, body } = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-strip-1",
        id: "user:1",
        // Client tries to forge capability fields in metadata — validator rejects these
        relations: {
          tags: [{ $ref: "tag:1", createdBy: "evil-actor", addedOrder: 5 }],
        },
      },
    ]);

    // Push validates relation metadata keys — unknown keys are rejected
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
  });

  it("push relate with only allowed metadata fields writes correct capability fields", async () => {
    const start = Date.now();

    const { res, body } = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-allowed-1",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 5 }] },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.result.ok).toBe(true);
    expect(body.result.errors).toHaveLength(0);

    const joinTableName = getJoinTableName("users", "tags", undefined);
    const rows = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });
    const row = rows.find((r: any) => r.id === "user:1:tag:1");

    expect(row).toBeDefined();
    // Capability fields should be server-set
    expect(typeof row.createdAt).toBe("number");
    expect(row.createdAt).toBeGreaterThanOrEqual(start);
    expect(row.createdBy).toBe("user:alice");
    expect(row.updatedBy).toBe("user:alice");
    // Non-capability metadata should be preserved
    expect(row.addedOrder).toBe(5);
  });

  it("push relate with null actorId stores null for audit fields (SEC-001 null fallback)", async () => {
    actorId = undefined; // no authenticated actor

    const { res, body } = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-null-actor-1",
        id: "user:1",
        relations: { tags: ["tag:1"] },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.result.ok).toBe(true);
    expect(body.result.errors).toHaveLength(0);

    const joinTableName = getJoinTableName("users", "tags", undefined);
    const rows = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });
    const row = rows.find((r: any) => r.id === "user:1:tag:1");

    expect(row).toBeDefined();
    expect(row.createdBy).toBeNull();
    expect(row.updatedBy).toBeNull();
    expect(typeof row.createdAt).toBe("number");
    expect(typeof row.updatedAt).toBe("number");
  });

  it("push re-relate updates updatedAt/updatedBy and preserves createdAt/createdBy (JRT-003 via push)", async () => {
    // First relate — creates the join row
    await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-first-relate",
        id: "user:1",
        relations: { tags: ["tag:1"] },
      },
    ]);

    const joinTableName = getJoinTableName("users", "tags", undefined);
    const rowsAfterFirst = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });
    const rowAfterFirst = rowsAfterFirst.find((r: any) => r.id === "user:1:tag:1");
    expect(rowAfterFirst).toBeDefined();

    // Wait a tick so updatedAt is measurably different
    await new Promise((resolve) => setTimeout(resolve, 2));

    // Second relate (re-relate) — should update updatedAt/updatedBy but preserve createdAt/createdBy
    actorId = "user:bob";
    const { res: res2, body: body2 } = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-second-relate",
        id: "user:1",
        relations: { tags: ["tag:1"] },
      },
    ]);

    expect(res2.status).toBe(200);
    expect(body2.result.ok).toBe(true);
    expect(body2.result.errors).toHaveLength(0);

    const rowsAfterSecond = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });
    const rowAfterSecond = rowsAfterSecond.find((r: any) => r.id === "user:1:tag:1");
    expect(rowAfterSecond).toBeDefined();

    // Immutable fields must NOT change
    expect(rowAfterSecond.createdAt).toBe(rowAfterFirst.createdAt);
    expect(rowAfterSecond.createdBy).toBe("user:alice");
    // Mutable fields should be updated
    expect(rowAfterSecond.updatedAt).toBeGreaterThanOrEqual(rowAfterFirst.updatedAt);
    expect(rowAfterSecond.updatedBy).toBe("user:bob");
  });

  it("push modifyRelation updates updatedAt/updatedBy for capability-enabled relation (JRT-004 via push)", async () => {
    // First create the join row
    await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-seed-modify",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 1 }] },
      },
    ]);

    const joinTableName = getJoinTableName("users", "tags", undefined);
    const rowsBefore = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });
    const rowBefore = rowsBefore.find((r: any) => r.id === "user:1:tag:1");
    expect(rowBefore).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 2));
    actorId = "user:bob";

    const { res, body } = await push([
      {
        resource: "users",
        version: 1,
        operation: "modifyRelation",
        clientId: "client:1",
        mutationId: "m-modify-1",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 99 }] },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.result.ok).toBe(true);
    expect(body.result.errors).toHaveLength(0);

    const rowsAfter = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });
    const rowAfter = rowsAfter.find((r: any) => r.id === "user:1:tag:1");
    expect(rowAfter).toBeDefined();

    expect(rowAfter.addedOrder).toBe(99);
    // updatedAt and updatedBy should be updated
    expect(rowAfter.updatedAt).toBeGreaterThanOrEqual(rowBefore.updatedAt);
    expect(rowAfter.updatedBy).toBe("user:bob");
    // createdAt and createdBy are immutable — must NOT change
    expect(rowAfter.createdAt).toBe(rowBefore.createdAt);
    expect(rowAfter.createdBy).toBe("user:alice");
  });

  it("push relate on a batch of join rows injects capability fields for all rows", async () => {
    const start = Date.now();

    const { res, body } = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:1",
        mutationId: "m-batch-1",
        id: "user:1",
        relations: { tags: ["tag:1", "tag:2"] },
      },
    ]);

    expect(res.status).toBe(200);
    expect(body.result.ok).toBe(true);
    expect(body.result.errors).toHaveLength(0);

    const joinTableName = getJoinTableName("users", "tags", undefined);
    const rows = await db.findMany({ model: joinTableName, where: [], namespace: "ns:1" });

    for (const tagId of ["tag:1", "tag:2"]) {
      const row = rows.find((r: any) => r.id === `user:1:${tagId}`);
      expect(row).toBeDefined();
      expect(typeof row.createdAt).toBe("number");
      expect(row.createdAt).toBeGreaterThanOrEqual(start);
      expect(row.createdBy).toBe("user:alice");
    }
  });
});

describe("push relate multi-resource relation targets", () => {
  it("validates relation targets against the resource encoded in each target id", async () => {
    const schema: DatafnSchema = {
      resources: [
        { name: "node", version: 1, fields: [{ name: "label", type: "string", required: false }] },
        { name: "objective", version: 1, fields: [{ name: "label", type: "string", required: false }] },
        { name: "task", version: 1, fields: [{ name: "label", type: "string", required: false }] },
      ],
      relations: [
        {
          from: ["node", "objective", "task"],
          to: ["node", "objective", "task"],
          type: "many-many",
          relation: "links",
          inverse: "backlinks",
        },
      ],
    };

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer: any = await createDatafnServer({
      schema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:multi-target",
        getActorId: () => "user:multi",
      },
    });

    const pushReq = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:multi-target", mutations }),
      });
      const res = await localServer.router.handle(req, {});
      return res.json() as any;
    };

    try {
      const seedBody = await pushReq([
        {
          resource: "node",
          version: 1,
          operation: "insert",
          clientId: "client:multi-target",
          mutationId: "seed-node",
          id: "node:1",
          record: { label: "Source" },
        },
        {
          resource: "objective",
          version: 1,
          operation: "insert",
          clientId: "client:multi-target",
          mutationId: "seed-objective",
          id: "objective:1",
          record: { label: "Target" },
        },
      ]);
      expect(seedBody.result.errors).toHaveLength(0);

      const body = await pushReq([
        {
          resource: "node",
          version: 1,
          operation: "relate",
          clientId: "client:multi-target",
          mutationId: "relate-node-objective",
          id: "node:1",
          relations: { links: ["objective:1"] },
        },
      ]);

      expect(body.result.ok).toBe(true);
      expect(body.result.errors).toHaveLength(0);

      const joinTableName = getJoinTableName("node", "links", undefined);
      const rows = await localDb.findMany({
        model: joinTableName,
        where: [],
        namespace: "ns:multi-target",
      });
      expect(rows.some((row: any) => row.id === "node:1:objective:1")).toBe(true);
    } finally {
      await localServer.close();
    }
  });

  it("writes inverse polymorphic many-many relations into shared discriminator join tables", async () => {
    const schema: DatafnSchema = {
      resources: [
        { name: "collection", version: 1, fields: [{ name: "label", type: "string", required: false }] },
        { name: "node", version: 1, fields: [{ name: "label", type: "string", required: false }] },
        { name: "objective", version: 1, fields: [{ name: "label", type: "string", required: false }] },
      ],
      relations: [
        {
          from: ["node", "objective"],
          to: "collection",
          type: "many-many",
          relation: "collections",
          inverse: "items",
          metadata: [{ name: "order", type: "number" }],
        },
      ],
    };
    const itemRelation = schema.relations![0]!;

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer: any = await createDatafnServer({
      schema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:inverse-poly",
        getActorId: () => "user:inverse-poly",
      },
    });

    const pushReq = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:inverse-poly", mutations }),
      });
      const res = await localServer.router.handle(req, {});
      return res.json() as any;
    };

    try {
      const seedBody = await pushReq([
        {
          resource: "collection",
          version: 1,
          operation: "insert",
          clientId: "client:inverse-poly",
          mutationId: "seed-collection",
          id: "collection:1",
          record: { label: "Collection" },
        },
        {
          resource: "node",
          version: 1,
          operation: "insert",
          clientId: "client:inverse-poly",
          mutationId: "seed-node",
          id: "node:1",
          record: { label: "Node" },
        },
        {
          resource: "objective",
          version: 1,
          operation: "insert",
          clientId: "client:inverse-poly",
          mutationId: "seed-objective",
          id: "objective:1",
          record: { label: "Objective" },
        },
      ]);
      expect(seedBody.result.errors).toHaveLength(0);

      const relateBody = await pushReq([
        {
          resource: "collection",
          version: 1,
          operation: "relate",
          clientId: "client:inverse-poly",
          mutationId: "relate-inverse-poly",
          id: "collection:1",
          relations: { items: [{ $ref: "node:1", order: 1 }, { $ref: "objective:1", order: 2 }] },
        },
      ]);

      expect(relateBody.result.ok).toBe(true);
      expect(relateBody.result.errors).toHaveLength(0);

      const nodeRows = await localDb.findMany({
        model: getRelationJoinTableName(itemRelation),
        where: [],
        namespace: "ns:inverse-poly",
      });
      const objectiveRows = await localDb.findMany({
        model: getRelationJoinTableName(itemRelation),
        where: [],
        namespace: "ns:inverse-poly",
      });

      expect(nodeRows).toContainEqual(
        expect.objectContaining({
          id: "node:1:collection:1",
          from: "node:1",
          fromResource: "node",
          to: "collection:1",
        }),
      );
      expect(objectiveRows).toContainEqual(
        expect.objectContaining({
          id: "objective:1:collection:1",
          from: "objective:1",
          fromResource: "objective",
          to: "collection:1",
          order: 2,
        }),
      );

      const modifyBody = await pushReq([
        {
          resource: "collection",
          version: 1,
          operation: "modifyRelation",
          clientId: "client:inverse-poly",
          mutationId: "modify-inverse-poly",
          id: "collection:1",
          relations: { items: [{ $ref: "node:1", order: 7 }] },
        },
      ]);
      expect(modifyBody.result.ok).toBe(true);
      expect(modifyBody.result.errors).toHaveLength(0);

      const modifiedNodeRows = await localDb.findMany({
        model: getRelationJoinTableName(itemRelation),
        where: [],
        namespace: "ns:inverse-poly",
      });
      expect(modifiedNodeRows).toContainEqual(
        expect.objectContaining({
          id: "node:1:collection:1",
          order: 7,
        }),
      );

      const unrelateBody = await pushReq([
        {
          resource: "collection",
          version: 1,
          operation: "unrelate",
          clientId: "client:inverse-poly",
          mutationId: "unrelate-inverse-poly",
          id: "collection:1",
          relations: { items: ["node:1"] },
        },
      ]);
      expect(unrelateBody.result.ok).toBe(true);
      expect(unrelateBody.result.errors).toHaveLength(0);

      const nodeRowsAfterUnrelate = await localDb.findMany({
        model: getRelationJoinTableName(itemRelation),
        where: [],
        namespace: "ns:inverse-poly",
      });
      const objectiveRowsAfterUnrelate = await localDb.findMany({
        model: getRelationJoinTableName(itemRelation),
        where: [],
        namespace: "ns:inverse-poly",
      });
      expect(nodeRowsAfterUnrelate.some((row: any) => row.id === "node:1:collection:1")).toBe(false);
      expect(objectiveRowsAfterUnrelate.some((row: any) => row.id === "objective:1:collection:1")).toBe(true);
    } finally {
      await localServer.close();
    }
  });
});

describe("push relate backward compatibility (COMP-001 via push)", () => {
  it("push relate without relation capabilities does NOT inject createdAt/updatedAt/createdBy/updatedBy", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer: any = await createDatafnServer({
      schema: noCapabilitySchema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:compat",
        getActorId: () => "user:compat",
      },
    });

    const pushRequest = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:compat", mutations }),
      });
      const res = await localServer.router.handle(req, {});
      return res.json() as any;
    };

    try {
      // Seed resources via push
      const seedBody = await pushRequest([
        { resource: "items", version: 1, operation: "insert", clientId: "client:compat", mutationId: "seed-item", id: "item:1", record: { label: "x" } },
        { resource: "labels", version: 1, operation: "insert", clientId: "client:compat", mutationId: "seed-label", id: "label:1", record: { text: "y" } },
      ]);
      expect(seedBody.result.errors).toHaveLength(0);

      // Push relate without capabilities
      const relateBody = await pushRequest([
        {
          resource: "items",
          version: 1,
          operation: "relate",
          clientId: "client:compat",
          mutationId: "m-compat-1",
          id: "item:1",
          relations: { labels: [{ $ref: "label:1", weight: 7 }] },
        },
      ]);

      expect(relateBody.result.ok).toBe(true);
      expect(relateBody.result.errors).toHaveLength(0);

      const joinTableName = getJoinTableName("items", "labels", undefined);
      const rows = await localDb.findMany({ model: joinTableName, where: [], namespace: "ns:compat" });
      const row = rows.find((r: any) => r.id === "item:1:label:1");

      expect(row).toBeDefined();
      // Metadata should be present
      expect(row.weight).toBe(7);
      // Capability fields must NOT be present when capabilities are disabled
      expect(row.createdAt).toBeUndefined();
      expect(row.updatedAt).toBeUndefined();
      expect(row.createdBy).toBeUndefined();
      expect(row.updatedBy).toBeUndefined();
    } finally {
      await localServer.close();
    }
  });

  it("push relate without relation capabilities preserves user-provided metadata named same as capability fields", async () => {
    // Schema with no capabilities but a metadata field named addedAt
    const customSchema: DatafnSchema = {
      resources: [
        { name: "items", version: 1, fields: [{ name: "label", type: "string", required: true }] },
        { name: "labels", version: 1, fields: [{ name: "text", type: "string", required: true }] },
      ],
      relations: [
        {
          from: "items",
          to: "labels",
          type: "many-many",
          relation: "labels",
          // No capabilities — user-defined metadata field named addedAt should NOT be stripped
          metadata: [{ name: "addedAt", type: "number" }],
        },
      ],
    };

    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer: any = await createDatafnServer({
      schema: customSchema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:compat2",
        getActorId: () => "user:x",
      },
    });

    const pushReq = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:compat2", mutations }),
      });
      const res = await localServer.router.handle(req, {});
      return res.json() as any;
    };

    try {
      const seedBody = await pushReq([
        { resource: "items", version: 1, operation: "insert", clientId: "client:compat2", mutationId: "seed-item", id: "item:1", record: { label: "x" } },
        { resource: "labels", version: 1, operation: "insert", clientId: "client:compat2", mutationId: "seed-label", id: "label:1", record: { text: "y" } },
      ]);
      expect(seedBody.result.errors).toHaveLength(0);

      const body = await pushReq([
        {
          resource: "items",
          version: 1,
          operation: "relate",
          clientId: "client:compat2",
          mutationId: "m-compat2",
          id: "item:1",
          relations: { labels: [{ $ref: "label:1", addedAt: 42 }] },
        },
      ]);

      expect(body.result.ok).toBe(true);
      expect(body.result.errors).toHaveLength(0);

      const joinTableName = getJoinTableName("items", "labels", undefined);
      const rows = await localDb.findMany({ model: joinTableName, where: [], namespace: "ns:compat2" });
      const row = rows.find((r: any) => r.id === "item:1:label:1");

      // addedAt should be preserved as user-defined metadata (not stripped)
      expect(row).toBeDefined();
      expect(row.addedAt).toBe(42);
    } finally {
      await localServer.close();
    }
  });
});

describe("push delete relation-policy parity", () => {
  const relationSchema: DatafnSchema = {
    resources: [
      { name: "projects", version: 1, fields: [{ name: "name", type: "string", required: true }] },
      {
        name: "tasks",
        version: 1,
        fields: [
          { name: "name", type: "string", required: true },
          { name: "projectId", type: "string", required: false },
        ],
      },
    ],
    relations: [
      {
        from: "tasks",
        to: "projects",
        type: "many-one",
        relation: "project",
        fkField: "projectId",
        onDelete: { to: "setNull" },
      },
    ],
  };

  it("applies setNull and emits the dependent change on sync push", async () => {
    const localDb = memoryAdapter();
    await localDb.initialize();
    const localServer: any = await createDatafnServer({
      schema: relationSchema,
      database: localDb,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:delete-policy",
        getActorId: () => "user:delete-policy",
      },
    });
    const pushReq = async (mutations: Array<Record<string, unknown>>) => {
      const response = await localServer.router.handle(new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:delete-policy", mutations }),
      }));
      return response.json() as any;
    };

    try {
      const seed = await pushReq([
        {
          resource: "projects",
          version: 1,
          operation: "insert",
          clientId: "client:delete-policy",
          mutationId: "seed-project",
          id: "project:1",
          record: { name: "Project" },
        },
        {
          resource: "tasks",
          version: 1,
          operation: "insert",
          clientId: "client:delete-policy",
          mutationId: "seed-task",
          id: "task:1",
          record: { name: "Task", projectId: "project:1" },
        },
      ]);
      expect(seed.result.errors).toHaveLength(0);

      const deleted = await pushReq([{
        resource: "projects",
        version: 1,
        operation: "delete",
        clientId: "client:delete-policy",
        mutationId: "delete-project",
        id: "project:1",
      }]);
      expect(deleted.result.ok).toBe(true);

      const task = await localDb.findOne({
        model: "tasks",
        where: [{ field: "id", operator: "eq", value: "task:1" }],
        namespace: "ns:delete-policy",
      });
      expect(task?.projectId).toBeNull();

      const changes = await localDb.internal.findMany("__datafn_changes", [], {
        orderBy: "server_seq",
      });
      expect(changes.slice(-2).map((change: any) => change.resource)).toEqual([
        "projects",
        "tasks",
      ]);
    } finally {
      await localServer.close();
    }
  });
});
