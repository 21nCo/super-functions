/**
 * Integration tests for JSY-002: change-tracking, pull and clone parity for
 * many-many relation capability fields.
 *
 * Verifies that after a push relate on a capability-enabled relation:
 *   - The change-tracking entry for the join row includes the injected capability fields.
 *   - A canonical pull (with cursors + includeJoins) returns join rows with capability fields.
 *   - A clone (with includeJoins) returns join rows with capability fields.
 *   - Non-capability relations are unaffected (COMP-001).
 *
 * NOTE: All resource records are seeded via push (not direct db.create) to ensure
 * compatibility with the server's row-level namespace wrapping.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../../server.js";
import type { DatafnSchema } from "../../core-types.js";
import { getJoinStoreKey } from "@datafn/core";

// Schema with capability-enabled many-many relation
const schema: DatafnSchema = {
  resources: [
    { name: "users", version: 1, fields: [{ name: "name", type: "string", required: true }] },
    { name: "tags", version: 1, fields: [{ name: "label", type: "string", required: true }] },
  ],
  relations: [
    {
      from: "users",
      to: "tags",
      type: "many-many",
      relation: "tags",
      capabilities: ["timestamps", "audit"] as any,
      metadata: [{ name: "addedOrder", type: "number" }],
    },
  ],
};

// Schema without relation capabilities for COMP-001 verification
const noCapSchema: DatafnSchema = {
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
      metadata: [{ name: "weight", type: "number" }],
    },
  ],
};

describe("relation capabilities sync integration (JSY-002)", () => {
  let db: any;
  let server: any;
  let actorId: string;

  const push = async (mutations: Array<Record<string, unknown>>) => {
    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:sync", mutations }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    return body.result;
  };

  // Legacy pull (global cursor) — returns change entries with full record
  const pullLegacy = async (cursor = "0") => {
    const req = new Request("http://localhost/datafn/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:observer", cursor, limit: 100 }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result.ok).toBe(true);
    return body.result;
  };

  // Canonical pull (per-resource cursors + includeJoins)
  const pullCanonical = async (cursors: Record<string, string> = {}, includeJoins = true) => {
    const req = new Request("http://localhost/datafn/pull", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "client:observer",
        cursors,
        limit: 100,
        includeJoins,
      }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result.ok).toBe(true);
    return body.result;
  };

  // Clone with includeJoins
  const cloneAll = async (includeJoins = true) => {
    const req = new Request("http://localhost/datafn/clone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "client:clone", includeJoins }),
    });
    const res = await server.router.handle(req, {});
    const body = await res.json();
    expect(res.status).toBe(200);
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
        getNamespace: () => "ns:sync",
        getActorId: () => actorId,
      },
    });

    // Seed resource records via push (ensures namespace wrapping is correct)
    const seedResult = await push([
      {
        resource: "users",
        version: 1,
        operation: "insert",
        clientId: "client:sync",
        mutationId: "seed-user",
        id: "user:1",
        record: { name: "Alice" },
      },
      {
        resource: "tags",
        version: 1,
        operation: "insert",
        clientId: "client:sync",
        mutationId: "seed-tag",
        id: "tag:1",
        record: { label: "Work" },
      },
    ]);
    expect(seedResult.errors).toHaveLength(0);
  });

  afterEach(async () => {
    await server?.close?.();
  });

  it("change-tracking entry for join row includes injected capability fields (JSY-002)", async () => {
    const start = Date.now();

    // Get cursor before relate so we only look at join changes
    const cursorBefore = (await pullLegacy("0")).nextCursor || "0";

    await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:sync",
        mutationId: "m-jsy002-ct",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 1 }] },
      },
    ]);

    // Legacy pull to get raw change entries including join changes
    const pullResult = await pullLegacy(cursorBefore);

    // Find the join row change entry
    const joinStoreKey = getJoinStoreKey("users", "tags", "tags");
    const joinChange = pullResult.changes.find(
      (ch: any) => ch.resource === joinStoreKey && ch.id === "user:1:tag:1",
    );

    expect(joinChange).toBeDefined();
    expect(joinChange.op).toBe("upsert");
    // The change record must include server-injected capability fields
    expect(typeof joinChange.record.createdAt).toBe("number");
    expect(typeof joinChange.record.updatedAt).toBe("number");
    expect(joinChange.record.createdAt).toBeGreaterThanOrEqual(start);
    expect(joinChange.record.createdBy).toBe("user:alice");
    expect(joinChange.record.updatedBy).toBe("user:alice");
    // Non-capability metadata should also be present
    expect(joinChange.record.addedOrder).toBe(1);
    // Structural fields
    expect(joinChange.record.from).toBe("user:1");
    expect(joinChange.record.to).toBe("tag:1");
  });

  it("legacy pull returns join row change with capability fields after push relate (JSY-002)", async () => {
    const cursorBefore = (await pullLegacy("0")).nextCursor || "0";

    await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:sync",
        mutationId: "m-legacy-pull",
        id: "user:1",
        relations: { tags: ["tag:1"] },
      },
    ]);

    const pullResult = await pullLegacy(cursorBefore);
    const joinStoreKey = getJoinStoreKey("users", "tags", "tags");

    const joinChange = pullResult.changes.find(
      (ch: any) => ch.resource === joinStoreKey,
    );

    expect(joinChange).toBeDefined();
    expect(joinChange.record).not.toBeNull();
    expect(typeof joinChange.record.createdAt).toBe("number");
    expect(typeof joinChange.record.updatedAt).toBe("number");
    expect(joinChange.record.createdBy).toBe("user:alice");
    expect(joinChange.record.updatedBy).toBe("user:alice");
  });

  it("canonical pull with includeJoins returns join row with capability fields (JSY-002)", async () => {
    await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:sync",
        mutationId: "m-canonical-pull",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 3 }] },
      },
    ]);

    // Canonical pull — start with cursor "0" for all resources + join store key
    const joinStoreKey = getJoinStoreKey("users", "tags", "tags");
    const pullResult = await pullCanonical(
      { users: "0", tags: "0", [joinStoreKey]: "0" },
      true,
    );

    expect(pullResult.joins).toBeDefined();
    const joinData = pullResult.joins[joinStoreKey];
    expect(joinData).toBeDefined();
    expect(joinData.upsert.length).toBeGreaterThan(0);

    // Find the join row for user:1 → tag:1
    const joinRow = joinData.upsert.find((r: any) => r.id === "user:1:tag:1");
    expect(joinRow).toBeDefined();
    expect(typeof joinRow.createdAt).toBe("number");
    expect(typeof joinRow.updatedAt).toBe("number");
    expect(joinRow.createdBy).toBe("user:alice");
    expect(joinRow.updatedBy).toBe("user:alice");
    expect(joinRow.addedOrder).toBe(3);
    expect(joinRow.from).toBe("user:1");
    expect(joinRow.to).toBe("tag:1");
  });

  it("clone with includeJoins returns join row with capability fields (JSY-002)", async () => {
    const start = Date.now();

    await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:sync",
        mutationId: "m-clone",
        id: "user:1",
        relations: { tags: ["tag:1"] },
      },
    ]);

    const cloneResult = await cloneAll(true);

    expect(cloneResult.joins).toBeDefined();
    const joinStoreKey = getJoinStoreKey("users", "tags", "tags");
    const joinRows = cloneResult.joins[joinStoreKey];
    expect(Array.isArray(joinRows)).toBe(true);
    expect(joinRows.length).toBeGreaterThan(0);

    const joinRow = joinRows.find((r: any) => r.from === "user:1" && r.to === "tag:1");
    expect(joinRow).toBeDefined();
    expect(typeof joinRow.createdAt).toBe("number");
    expect(joinRow.createdAt).toBeGreaterThanOrEqual(start);
    expect(typeof joinRow.updatedAt).toBe("number");
    expect(joinRow.createdBy).toBe("user:alice");
    expect(joinRow.updatedBy).toBe("user:alice");
  });

  it("modifyRelation change entry includes updated updatedAt and updatedBy (JSY-002)", async () => {
    // Create join row first
    const firstPush = await push([
      {
        resource: "users",
        version: 1,
        operation: "relate",
        clientId: "client:sync",
        mutationId: "m-seed-for-modify",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 1 }] },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2));
    actorId = "user:bob";

    // Get cursor before modify so we only look at modify changes
    const cursorBeforeModify = firstPush.cursor;

    await push([
      {
        resource: "users",
        version: 1,
        operation: "modifyRelation",
        clientId: "client:sync",
        mutationId: "m-modify-ct",
        id: "user:1",
        relations: { tags: [{ $ref: "tag:1", addedOrder: 99 }] },
      },
    ]);

    const pullResult = await pullLegacy(cursorBeforeModify);
    const joinStoreKey = getJoinStoreKey("users", "tags", "tags");

    const joinChange = pullResult.changes.find(
      (ch: any) => ch.resource === joinStoreKey && ch.id === "user:1:tag:1",
    );

    expect(joinChange).toBeDefined();
    expect(joinChange.record).not.toBeNull();
    // updatedBy should reflect the new actor (user:bob)
    expect(joinChange.record.updatedBy).toBe("user:bob");
    // updatedAt should be a valid timestamp
    expect(typeof joinChange.record.updatedAt).toBe("number");
    // createdBy should be preserved from original create (user:alice)
    expect(joinChange.record.createdBy).toBe("user:alice");
    // Metadata should be the new value
    expect(joinChange.record.addedOrder).toBe(99);
  });
});

describe("relation capabilities sync backward compatibility (COMP-001 via JSY-002)", () => {
  it("non-capability relation join rows in pull/clone do not contain capability fields", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const server: any = await createDatafnServer({
      schema: noCapSchema,
      db,
      allowUnknownResources: true,
      namespaceProvider: {
        getNamespace: () => "ns:compat",
        getActorId: () => "user:x",
      },
    });

    const pushReq = async (mutations: Array<Record<string, unknown>>) => {
      const req = new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:compat", mutations }),
      });
      const res = await server.router.handle(req, {});
      return res.json() as any;
    };

    try {
      // Seed resources via push
      const seedBody = await pushReq([
        { resource: "items", version: 1, operation: "insert", clientId: "client:compat", mutationId: "seed-item", id: "item:1", record: { label: "x" } },
        { resource: "labels", version: 1, operation: "insert", clientId: "client:compat", mutationId: "seed-label", id: "label:1", record: { text: "y" } },
      ]);
      expect(seedBody.result.errors).toHaveLength(0);

      // Get cursor before relate
      const prePullReq = new Request("http://localhost/datafn/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:obs2", cursor: "0", limit: 100 }),
      });
      const prePullRes = await server.router.handle(prePullReq, {});
      const prePullBody = (await prePullRes.json()) as any;
      const cursorBefore = prePullBody.result.nextCursor || "0";

      // Push relate without capabilities
      const relateBody = await pushReq([
        {
          resource: "items",
          version: 1,
          operation: "relate",
          clientId: "client:compat",
          mutationId: "m-compat-sync",
          id: "item:1",
          relations: { labels: [{ $ref: "label:1", weight: 5 }] },
        },
      ]);
      expect(relateBody.result.ok).toBe(true);
      expect(relateBody.result.errors).toHaveLength(0);

      // Legacy pull — verify change entry has no capability fields
      const pullReq = new Request("http://localhost/datafn/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: "client:obs", cursor: cursorBefore, limit: 100 }),
      });
      const pullRes = await server.router.handle(pullReq, {});
      const pullBody = (await pullRes.json()) as any;
      expect(pullBody.result.ok).toBe(true);

      const joinStoreKey = getJoinStoreKey("items", "labels", "labels");
      const joinChange = pullBody.result.changes.find(
        (ch: any) => ch.resource === joinStoreKey,
      );

      expect(joinChange).toBeDefined();
      // Metadata should be present
      expect(joinChange.record.weight).toBe(5);
      // Capability fields must NOT be present (no capabilities on this relation)
      expect(joinChange.record.createdAt).toBeUndefined();
      expect(joinChange.record.updatedAt).toBeUndefined();
      expect(joinChange.record.createdBy).toBeUndefined();
      expect(joinChange.record.updatedBy).toBeUndefined();
    } finally {
      await server.close();
    }
  });
});
