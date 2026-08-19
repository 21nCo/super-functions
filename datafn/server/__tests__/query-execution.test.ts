import { memoryAdapter } from "@superfunctions/db/adapters";
/**
 * Query execution tests - Phase 02
 * Tests TV-QUERY-001, TV-QUERY-003, TV-QUERY-004, TV-QUERY-005, TV-QUERY-006,
 * TV-QUERY-007, TV-QUERY-008, TV-QUERY-009 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { getJoinTableName, type DatafnSchema } from "@datafn/core";
import { createDatafnServer } from "../src/server.js";
import { fixtureF1Schema, fixtureF1Data } from "./fixtures/f1.js";
import { seedFixture } from "./helpers/seed-fixture.js";

describe("/datafn/query execution", () => {
  // Helper to create server with fixture F1
  async function createF1Server() {
    const db = memoryAdapter();
    await seedFixture(db, fixtureF1Data);

    return await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
      database: db,
    });
  }

  it("TV-QUERY-001: Many-one relation expansion with goal.*", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "label", "goal.*"],
        filters: { id: "task:t1" },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.data).toHaveLength(1);
    expect(body.result.data[0]).toEqual({
      id: "task:t1",
      label: "Task 1",
      goal: {
        id: "goal:g1",
        label: "Goal 1",
        status: "open",
        isArchived: false,
      },
    });
  });

  it("TV-QUERY-003: Default deterministic ordering (id:asc)", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "goal",
        version: 1,
        select: ["id"],
        filters: { isArchived: false },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([{ id: "goal:g1" }, { id: "goal:g2" }]);
  });

  it("TV-QUERY-007: Omitted select returns all schema fields", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "goal",
        version: 1,
        filters: { id: "goal:g1" },
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data[0]).toEqual({
      id: "goal:g1",
      label: "Goal 1",
      status: "open",
      isArchived: false,
    });
  });

  it("TV-QUERY-007: many-many with tags.# returns join rows", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "tags.#"],
        filters: { id: "task:t1" },
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data[0].tags).toEqual([
      { from: "task:t1", to: "tag:home", order: 1, addedAt: "2026-01-02" },
      { from: "task:t1", to: "tag:urgent", order: 2, addedAt: "2026-01-01" },
    ]);
  });

  it("TV-QUERY-007: many-many with tags.*# returns records with $relation_metadata", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "tags.*#"],
        filters: { id: "task:t1" },
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data[0].tags).toEqual([
      {
        id: "tag:home",
        label: "home",
        $relation_metadata: { order: 1, addedAt: "2026-01-02" },
      },
      {
        id: "tag:urgent",
        label: "urgent",
        $relation_metadata: { order: 2, addedAt: "2026-01-01" },
      },
    ]);
  });

  it("expands polymorphic many-many inverse records from multiple concrete resources", async () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "node",
          version: 1,
          fields: [{ name: "label", type: "string", required: false }],
        },
        {
          name: "objective",
          version: 1,
          fields: [{ name: "label", type: "string", required: false }],
        },
        {
          name: "collection",
          version: 1,
          fields: [{ name: "label", type: "string", required: false }],
        },
      ],
      relations: [
        {
          from: ["node", "objective"],
          to: "collection",
          type: "many-many",
          relation: "collections",
          inverse: "items",
          joinTable: "collection_items",
          metadata: [{ name: "sortOrder", type: "number" }],
        },
      ],
    };
    const db = memoryAdapter();
    const namespace = "datafn";
    await db.create({ model: "node", data: { id: "node:1", label: "Node 1" }, namespace });
    await db.create({
      model: "objective",
      data: { id: "objective:1", label: "Objective 1" },
      namespace,
    });
    await db.create({
      model: "collection",
      data: { id: "collection:1", label: "Collection 1" },
      namespace,
    });
    const joinTable = getJoinTableName("node", "collections", "collection_items");
    await db.create({
      model: joinTable,
      data: {
        id: "node:1:collection:1",
        from: "node:1",
        to: "collection:1",
        sortOrder: 1,
      },
      namespace,
    });
    await db.create({
      model: joinTable,
      data: {
        id: "objective:1:collection:1",
        from: "objective:1",
        to: "collection:1",
        sortOrder: 2,
      },
      namespace,
    });

    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      limits: { maxLimit: 100 },
      database: db,
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "collection",
        version: 1,
        select: ["id", "items.*#"],
        filters: { id: "collection:1" },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data[0].items).toEqual([
      {
        id: "node:1",
        label: "Node 1",
        $relation_metadata: { sortOrder: 1 },
      },
      {
        id: "objective:1",
        label: "Objective 1",
        $relation_metadata: { sortOrder: 2 },
      },
    ]);
    await server.close?.();
  });

  it("TV-QUERY-009: Pagination with limit/offset", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id"],
        filters: { isArchived: false },
        sort: ["updatedAt:desc", "id:asc"],
        limit: 2,
        offset: 0,
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([{ id: "task:t3" }, { id: "task:t2" }]);
  });

  it("TV-QUERY-009: Cursor pagination with cursor.after", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id"],
        filters: { isArchived: false },
        sort: ["updatedAt:desc", "id:asc"],
        limit: 2,
        cursor: { after: { updatedAt: "2026-01-11", id: "task:t2" } },
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([{ id: "task:t1" }]);
  });

  it("TV-QUERY-005: Filter operators (gt, and)", async () => {
    const server = await createF1Server();

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "priority"],
        filters: {
          $and: [{ priority: { gt: 2 } }, { isArchived: false }],
        },
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data).toHaveLength(2); // t1 (priority: 5), t3 (priority: 3)
    expect(body.result.data.map((d: any) => d.id)).toContain("task:t1");
    expect(body.result.data.map((d: any) => d.id)).toContain("task:t3");
  });

  it("Phase 01 compatibility: Returns empty results when no store provided", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        filters: { id: "task:t1" },
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([]); // Empty for Phase 01
  });
});
