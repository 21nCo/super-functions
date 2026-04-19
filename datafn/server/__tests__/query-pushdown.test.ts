/**
 * Push-down query execution tests — Phase 02 / Phase 03
 *
 * Tests TV-PUSHDOWN-001, TV-PUSHDOWN-002, TV-PUSHDOWN-003 (Phase 02)
 * and TV-PARTIAL-001, TV-PARTIAL-002, TV-INMEM-001 (Phase 03).
 *
 * Phase 02 uses a simple task schema (no relations) so classifyQuery()
 * always returns FULL_PUSHDOWN and the push-down path is exercised.
 *
 * Phase 03 adds schemas with relations to exercise PARTIAL_PUSHDOWN
 * and the IN_MEMORY base-field pre-filter optimisation.
 */

import { describe, it, expect, vi } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";
import { createDatafnServer } from "../src/server.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PUSHDOWN_SCHEMA: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string", required: true },
        { name: "priority", type: "number", required: true },
      ],
    },
  ],
};

/** Seed data from TEST_VECTORS.md TV-PUSHDOWN-001 */
const SEED_TASKS = [
  { id: "t1", title: "Low", status: "active", priority: 1 },
  { id: "t2", title: "High", status: "active", priority: 3 },
  { id: "t3", title: "Mid", status: "done", priority: 2 },
  { id: "t4", title: "Med", status: "active", priority: 2 },
];

async function createPushdownServer() {
  const db = memoryAdapter();
  await db.initialize();
  for (const task of SEED_TASKS) {
    await db.create({ model: "task", data: task, namespace: "datafn" });
  }
  const server = await createDatafnServer({ allowUnknownResources: true,
    schema: PUSHDOWN_SCHEMA,
    limits: { maxLimit: 100 },
    db,
  });
  return { db, server };
}

function queryReq(body: unknown): Request {
  return new Request("http://localhost/datafn/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Full push-down query execution", () => {
  it("TV-PUSHDOWN-001: filter + sort + limit returns correct data, nextCursor, and calls findMany with limit+1", async () => {
    const { db, server } = await createPushdownServer();
    const findManySpy = vi.spyOn(db, "findMany");

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "active" } },
        sort: ["priority:desc", "id:asc"],
        limit: 2,
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Correct page: t2 (priority=3) then t4 (priority=2)
    expect(body.result.data).toEqual([
      { id: "t2", title: "High", status: "active", priority: 3 },
      { id: "t4", title: "Med", status: "active", priority: 2 },
    ]);
    expect(body.result.nextCursor).toEqual({ priority: 2, id: "t4" });

    // Adapter must have been called with filter + sort + limit+1
    const taskCalls = findManySpy.mock.calls.filter(
      ([params]) => params.model === "task",
    );
    expect(taskCalls.length).toBeGreaterThanOrEqual(1);
    const params = taskCalls[0][0];
    expect(params.where).toContainEqual({
      field: "status",
      operator: "eq",
      value: "active",
    });
    expect(params.orderBy).toEqual([
      { field: "priority", direction: "desc" },
      { field: "id", direction: "asc" },
    ]);
    expect(params.limit).toBe(3); // limit + 1
  });

  it("TV-PUSHDOWN-002: offset is passed through to adapter", async () => {
    const { server } = await createPushdownServer();

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        sort: ["id:asc"],
        limit: 2,
        offset: 1,
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // All tasks sorted by id: t1, t2, t3, t4 → skip 1 → t2, t3, t4
    // limit=2 → page is [t2, t3], nextCursor = {id:"t3"}
    expect(body.result.data).toEqual([
      { id: "t2", title: "High", status: "active", priority: 3 },
      { id: "t3", title: "Mid", status: "done", priority: 2 },
    ]);
    expect(body.result.nextCursor).toEqual({ id: "t3" });
  });

  it("TV-PUSHDOWN-003: empty result set returns data:[] and nextCursor:null", async () => {
    const { server } = await createPushdownServer();

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "nonexistent" } },
        limit: 10,
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([]);
    expect(body.result.nextCursor).toBeNull();
  });

  it("cursor.after push-down returns next page with correct nextCursor", async () => {
    const { server } = await createPushdownServer();

    // cursor after {priority:2, id:"t4"} → only t1 remains (priority=1 < 2)
    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "active" } },
        sort: ["priority:desc", "id:asc"],
        limit: 2,
        cursor: { after: { priority: 2, id: "t4" } },
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([
      { id: "t1", title: "Low", status: "active", priority: 1 },
    ]);
    expect(body.result.nextCursor).toBeNull();
  });

  it("cursor.before push-down returns previous page with correct nextCursor", async () => {
    const { server } = await createPushdownServer();

    // cursor before {priority:1, id:"t1"} → page should be [t2, t4]
    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "active" } },
        sort: ["priority:desc", "id:asc"],
        limit: 2,
        cursor: { before: { priority: 1, id: "t1" } },
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([
      { id: "t2", title: "High", status: "active", priority: 3 },
      { id: "t4", title: "Med", status: "active", priority: 2 },
    ]);
    // nextCursor points to last item of the page
    expect(body.result.nextCursor).toEqual({ priority: 2, id: "t4" });
  });

  it("select projection in push-down: only requested fields returned", async () => {
    const { server } = await createPushdownServer();

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        select: ["id", "priority"],
        filters: { status: { $eq: "active" } },
        sort: ["priority:desc", "id:asc"],
        limit: 2,
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([
      { id: "t2", priority: 3 },
      { id: "t4", priority: 2 },
    ]);
  });

  it("count:true in push-down returns total matching count", async () => {
    const { server } = await createPushdownServer();

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "active" } },
        sort: ["id:asc"],
        limit: 1,
        count: true,
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // 3 active tasks in total
    expect(body.result.count).toBe(3);
    // page has 1 record
    expect(body.result.data).toHaveLength(1);
  });

  it("TV-PUSHDOWN-008: full pagination sequence: page 1 → cursor.after → page 2 → cursor.after → page 3 (empty)", async () => {
    const { server } = await createPushdownServer();

    // Page 1
    const res1 = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        sort: ["id:asc"],
        limit: 2,
      }),
      {},
    );
    const body1 = await res1.json();
    expect(body1.result.data.map((r: any) => r.id)).toEqual(["t1", "t2"]);
    expect(body1.result.nextCursor).toEqual({ id: "t2" });

    // Page 2 using cursor.after from page 1
    const res2 = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        sort: ["id:asc"],
        limit: 2,
        cursor: { after: body1.result.nextCursor },
      }),
      {},
    );
    const body2 = await res2.json();
    expect(body2.result.data.map((r: any) => r.id)).toEqual(["t3", "t4"]);
    expect(body2.result.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Phase 03 fixtures
// ---------------------------------------------------------------------------

/** Schema with task + tag (many-many) — used for TV-PARTIAL-001 and TV-INMEM-001 */
const TASK_TAG_SCHEMA: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title",  type: "string", required: true },
        { name: "status", type: "string", required: true },
      ],
    },
    {
      name: "tag",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from:     "task",
      to:       "tag",
      type:     "many-many",
      relation: "tags",
      inverse:  "tasks",
    },
  ],
};

/** Schema with task + category (many-one) — used for TV-PARTIAL-002 */
const TASK_CATEGORY_SCHEMA: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title",  type: "string", required: true },
        { name: "status", type: "string", required: true },
      ],
    },
    {
      name: "category",
      version: 1,
      fields: [{ name: "name", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from:     "task",
      to:       "category",
      type:     "many-one",
      relation: "category",
      fkField:  "categoryId",
    },
  ],
};

async function createTaskTagServer() {
  const db = memoryAdapter();
  await db.initialize();

  // Tasks
  await db.create({ model: "task", data: { id: "t1", title: "Alpha", status: "active" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "t2", title: "Beta",  status: "active" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "t3", title: "Gamma", status: "done"   }, namespace: "datafn" });

  // Tags
  await db.create({ model: "tag", data: { id: "tag-a", label: "urgent"   }, namespace: "datafn" });
  await db.create({ model: "tag", data: { id: "tag-b", label: "review"   }, namespace: "datafn" });
  await db.create({ model: "tag", data: { id: "tag-c", label: "obsolete" }, namespace: "datafn" });

  // Join rows seeded via db.create so they live in the main store
  await db.create({ model: "__datafn_join_task_tags", data: { id: "jr1", from: "t1", to: "tag-a" }, namespace: "datafn" });
  await db.create({ model: "__datafn_join_task_tags", data: { id: "jr2", from: "t2", to: "tag-b" }, namespace: "datafn" });
  await db.create({ model: "__datafn_join_task_tags", data: { id: "jr3", from: "t3", to: "tag-c" }, namespace: "datafn" });

  const server = await createDatafnServer({ allowUnknownResources: true,
    schema: TASK_TAG_SCHEMA,
    limits: { maxLimit: 100 },
    db,
  });
  return { db, server };
}

async function createTaskCategoryServer() {
  const db = memoryAdapter();
  await db.initialize();

  // Tasks (categoryId stored as a raw FK field in the record)
  await db.create({ model: "task", data: { id: "t1", title: "Alpha", status: "active", categoryId: "c1" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "t2", title: "Beta",  status: "active", categoryId: "c2" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "t3", title: "Gamma", status: "done",   categoryId: "c3" }, namespace: "datafn" });

  // Categories — c3 exists but should NOT be fetched (t3 is filtered by push-down)
  await db.create({ model: "category", data: { id: "c1", name: "Alpha" }, namespace: "datafn" });
  await db.create({ model: "category", data: { id: "c2", name: "Beta"  }, namespace: "datafn" });
  await db.create({ model: "category", data: { id: "c3", name: "Gamma" }, namespace: "datafn" });

  const server = await createDatafnServer({ allowUnknownResources: true,
    schema: TASK_CATEGORY_SCHEMA,
    limits: { maxLimit: 100 },
    db,
  });
  return { db, server };
}

// ---------------------------------------------------------------------------
// Phase 03 tests
// ---------------------------------------------------------------------------

describe("Partial push-down query execution", () => {
  it("TV-PARTIAL-001: many-many — only join rows and tags for active tasks are fetched", async () => {
    const { db, server } = await createTaskTagServer();
    const findManySpy = vi.spyOn(db, "findMany");

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "active" } },
        select: ["title", "tags.*"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Correct data: t1 and t2 with their expanded tags
    expect(body.result.data).toEqual([
      { id: "t1", title: "Alpha", tags: [{ id: "tag-a", label: "urgent"   }] },
      { id: "t2", title: "Beta",  tags: [{ id: "tag-b", label: "review"   }] },
    ]);
    expect(body.result.nextCursor).toBeNull();

    // Join table must be fetched with a targeted IN filter (only active task IDs)
    const joinCalls = findManySpy.mock.calls.filter(
      ([p]) => p.model === "__datafn_join_task_tags",
    );
    expect(joinCalls.length).toBeGreaterThanOrEqual(1);
    const joinWhere = joinCalls[0][0].where;
    expect(joinWhere).toHaveLength(1);
    expect(joinWhere[0].field).toBe("from");
    expect(joinWhere[0].operator).toBe("in");
    // Only t1 and t2 — NOT t3 (done)
    expect((joinWhere[0].value as string[]).sort()).toEqual(["t1", "t2"]);

    // Tag fetch must be scoped to referenced tag IDs only (not tag-c)
    const tagCalls = findManySpy.mock.calls.filter(([p]) => p.model === "tag");
    expect(tagCalls.length).toBeGreaterThanOrEqual(1);
    const tagWhere = tagCalls[0][0].where;
    expect(tagWhere).toHaveLength(1);
    expect(tagWhere[0].field).toBe("id");
    expect(tagWhere[0].operator).toBe("in");
    // Only tag-a and tag-b — NOT tag-c (belongs to done task)
    expect((tagWhere[0].value as string[]).sort()).toEqual(["tag-a", "tag-b"]);
  });

  it("TV-PARTIAL-002: many-one — only categories referenced by active tasks are fetched", async () => {
    const { db, server } = await createTaskCategoryServer();
    const findManySpy = vi.spyOn(db, "findMany");

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: { status: { $eq: "active" } },
        select: ["title", "category.*"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // categoryId auto-omitted by materializeSelect (it is the FK field)
    expect(body.result.data).toEqual([
      { id: "t1", title: "Alpha", category: { id: "c1", name: "Alpha" } },
      { id: "t2", title: "Beta",  category: { id: "c2", name: "Beta"  } },
    ]);
    expect(body.result.nextCursor).toBeNull();

    // Category fetch must be scoped to referenced IDs only (c1, c2 — not c3)
    const catCalls = findManySpy.mock.calls.filter(([p]) => p.model === "category");
    expect(catCalls.length).toBeGreaterThanOrEqual(1);
    const catWhere = catCalls[0][0].where;
    expect(catWhere).toHaveLength(1);
    expect(catWhere[0].field).toBe("id");
    expect(catWhere[0].operator).toBe("in");
    // Only c1 and c2 — NOT c3 (task t3 is done, filtered by push-down)
    expect((catWhere[0].value as string[]).sort()).toEqual(["c1", "c2"]);
  });
});

describe("IN_MEMORY pre-filter optimisation", () => {
  it("TV-INMEM-001: base-field filter pushed to adapter even when relation filter makes query IN_MEMORY", async () => {
    const db = memoryAdapter();
    await db.initialize();

    // Tasks
    await db.create({ model: "task", data: { id: "t1", title: "Alpha", status: "active" }, namespace: "datafn" });
    await db.create({ model: "task", data: { id: "t2", title: "Beta",  status: "active" }, namespace: "datafn" });
    await db.create({ model: "task", data: { id: "t3", title: "Gamma", status: "done"   }, namespace: "datafn" });

    // Tags
    await db.create({ model: "tag", data: { id: "tag-a", label: "urgent" }, namespace: "datafn" });
    await db.create({ model: "tag", data: { id: "tag-b", label: "review" }, namespace: "datafn" });

    // Join rows: t1→urgent, t2→review, t3→urgent (t3 should be pre-filtered)
    await db.create({ model: "__datafn_join_task_tags", data: { id: "jr1", from: "t1", to: "tag-a" }, namespace: "datafn" });
    await db.create({ model: "__datafn_join_task_tags", data: { id: "jr2", from: "t2", to: "tag-b" }, namespace: "datafn" });
    await db.create({ model: "__datafn_join_task_tags", data: { id: "jr3", from: "t3", to: "tag-a" }, namespace: "datafn" });

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: TASK_TAG_SCHEMA,
      limits: { maxLimit: 100 },
      db,
    });

    const findManySpy = vi.spyOn(db, "findMany");

    // Query has a relation quantifier → IN_MEMORY strategy
    // But status:active is a base-field filter → should be pre-filtered
    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: {
          status: { $eq: "active" },
          tags:   { $any: { label: { $eq: "urgent" } } },
        },
        select: ["title"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Only t1 is active AND has an urgent tag
    expect(body.result.data).toEqual([{ id: "t1", title: "Alpha" }]);

    // The task findMany call must include the base-field pre-filter
    const taskCalls = findManySpy.mock.calls.filter(([p]) => p.model === "task");
    expect(taskCalls.length).toBeGreaterThanOrEqual(1);
    expect(taskCalls[0][0].where).toContainEqual({
      field: "status",
      operator: "eq",
      value: "active",
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 03 additional fixtures for TV-INMEM-SEC-001..006
// ---------------------------------------------------------------------------

/** Schema with project (one) → task (many) for one-many targeted loading */
const PROJECT_TASK_SCHEMA: DatafnSchema = {
  resources: [
    {
      name: "project",
      version: 1,
      fields: [
        { name: "name",   type: "string",  required: true },
        { name: "active", type: "boolean", required: true },
      ],
    },
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title",     type: "string", required: true },
        { name: "projectId", type: "string", required: false },
      ],
    },
  ],
  relations: [
    {
      from:     "project",
      to:       "task",
      type:     "one-many",
      relation: "tasks",
      fkField:  "projectId",
    },
  ],
};

async function createProjectTaskServer() {
  const db = memoryAdapter();
  await db.initialize();

  await db.create({ model: "project", data: { id: "p1", name: "Active A", active: true  }, namespace: "datafn" });
  await db.create({ model: "project", data: { id: "p2", name: "Active B", active: true  }, namespace: "datafn" });
  await db.create({ model: "project", data: { id: "p3", name: "Inactive", active: false }, namespace: "datafn" });

  await db.create({ model: "task", data: { id: "task-1", title: "T1", projectId: "p1" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "task-2", title: "T2", projectId: "p1" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "task-3", title: "T3", projectId: "p2" }, namespace: "datafn" });
  await db.create({ model: "task", data: { id: "task-4", title: "T4", projectId: "p3" }, namespace: "datafn" });

  const server = await createDatafnServer({ allowUnknownResources: true,
    schema: PROJECT_TASK_SCHEMA,
    limits: { maxLimit: 100 },
    db,
  });
  return { db, server };
}

// ---------------------------------------------------------------------------
// TV-INMEM-SEC tests (INMEM-001..004)
// ---------------------------------------------------------------------------

describe("IN_MEMORY targeted secondary loading", () => {
  it("TV-INMEM-SEC-001: many-many — secondary tag loaded with IN filter on join-referenced IDs only", async () => {
    const { db, server } = await createTaskTagServer();

    // Add bulk tags that must NOT be fetched
    for (let i = 0; i < 10; i++) {
      await db.create({ model: "tag", data: { id: `bulk-${i}`, label: "bulk" }, namespace: "datafn" });
    }

    const findManySpy = vi.spyOn(db, "findMany");

    // $any filter → IN_MEMORY; status=active → pre-filter narrows primary to t1, t2
    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: {
          status: { $eq: "active" },
          tags:   { $any: { label: { $eq: "urgent" } } },
        },
        select: ["title"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([{ id: "t1", title: "Alpha" }]);

    // Join table must be fetched with from IN [t1, t2]
    const joinCalls = findManySpy.mock.calls.filter(
      ([p]) => p.model === "__datafn_join_task_tags",
    );
    expect(joinCalls.length).toBeGreaterThanOrEqual(1);
    const joinWhere = joinCalls[0][0].where;
    expect(joinWhere[0].operator).toBe("in");
    expect((joinWhere[0].value as string[]).sort()).toEqual(["t1", "t2"]);

    // Tag must be fetched with id IN [tag-a, tag-b] — NOT all 13 tags
    const tagCalls = findManySpy.mock.calls.filter(([p]) => p.model === "tag");
    expect(tagCalls.length).toBe(1);
    const tagWhere = tagCalls[0][0].where;
    expect(tagWhere).toHaveLength(1);
    expect(tagWhere[0].field).toBe("id");
    expect(tagWhere[0].operator).toBe("in");
    expect((tagWhere[0].value as string[]).sort()).toEqual(["tag-a", "tag-b"]);
  });

  it("TV-INMEM-SEC-002: many-one — secondary category loaded with IN filter on FK values from active tasks", async () => {
    const { db, server } = await createTaskCategoryServer();
    const findManySpy = vi.spyOn(db, "findMany");

    // $any on category forces IN_MEMORY; status=active pre-filters primary to t1, t2
    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: {
          status:   { $eq: "active" },
          category: { $any: { name: { $eq: "Alpha" } } },
        },
        select: ["title"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // t1 has category Alpha and status=active
    expect(body.result.data).toEqual([{ id: "t1", title: "Alpha" }]);

    // Category must be fetched with id IN [c1, c2] (FK values from t1, t2)
    const catCalls = findManySpy.mock.calls.filter(([p]) => p.model === "category");
    expect(catCalls.length).toBe(1);
    const catWhere = catCalls[0][0].where;
    expect(catWhere).toHaveLength(1);
    expect(catWhere[0].field).toBe("id");
    expect(catWhere[0].operator).toBe("in");
    // c1 and c2, NOT c3 (task t3 is done → excluded by pre-filter)
    expect((catWhere[0].value as string[]).sort()).toEqual(["c1", "c2"]);
  });

  it("TV-INMEM-SEC-003: one-many — secondary tasks loaded with IN filter on primary project IDs", async () => {
    const { db, server } = await createProjectTaskServer();
    const findManySpy = vi.spyOn(db, "findMany");

    // $any on tasks forces IN_MEMORY; active=true pre-filters projects to p1, p2
    const res = await server.router.handle(
      queryReq({
        resource: "project",
        version: 1,
        filters: {
          active: { $eq: true },
          tasks:  { $any: { title: { $eq: "T1" } } },
        },
        select: ["name"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // p1 is active AND has a task titled "T1"
    expect(body.result.data).toEqual([{ id: "p1", name: "Active A" }]);

    // Task must be fetched with projectId IN [p1, p2] — NOT p3 (inactive)
    const taskCalls = findManySpy.mock.calls.filter(([p]) => p.model === "task");
    expect(taskCalls.length).toBe(1);
    const taskWhere = taskCalls[0][0].where;
    expect(taskWhere).toHaveLength(1);
    expect(taskWhere[0].field).toBe("projectId");
    expect(taskWhere[0].operator).toBe("in");
    expect((taskWhere[0].value as string[]).sort()).toEqual(["p1", "p2"]);
  });

  it("TV-INMEM-SEC-004: secondary needed by both filter and select — loaded exactly once", async () => {
    const { db, server } = await createTaskTagServer();
    const findManySpy = vi.spyOn(db, "findMany");

    // $any filter AND tags.* select both reference tags — must be loaded only once
    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: {
          status: { $eq: "active" },
          tags:   { $any: { label: { $eq: "urgent" } } },
        },
        select: ["title", "tags.*"],
        sort: ["id:asc"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([
      { id: "t1", title: "Alpha", tags: [{ id: "tag-a", label: "urgent" }] },
    ]);

    // tag findMany must be called exactly once
    const tagCalls = findManySpy.mock.calls.filter(([p]) => p.model === "tag");
    expect(tagCalls).toHaveLength(1);
  });

  it("TV-INMEM-SEC-005: empty primary after pre-filter — no secondary findMany calls", async () => {
    const db = memoryAdapter();
    await db.initialize();

    // All tasks have status=done — active pre-filter produces empty primary set
    await db.create({ model: "task", data: { id: "t1", title: "Alpha", status: "done" }, namespace: "datafn" });
    await db.create({ model: "task", data: { id: "t2", title: "Beta",  status: "done" }, namespace: "datafn" });
    await db.create({ model: "tag",  data: { id: "tag-a", label: "urgent"  }, namespace: "datafn" });
    await db.create({ model: "tag",  data: { id: "tag-b", label: "review"  }, namespace: "datafn" });
    await db.create({ model: "__datafn_join_task_tags", data: { id: "jr1", from: "t1", to: "tag-a" }, namespace: "datafn" });

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: TASK_TAG_SCHEMA,
      limits: { maxLimit: 100 },
      db,
    });

    const findManySpy = vi.spyOn(db, "findMany");

    const res = await server.router.handle(
      queryReq({
        resource: "task",
        version: 1,
        filters: {
          status: { $eq: "active" },        // pre-filter → empty primary
          tags:   { $any: { label: { $eq: "urgent" } } },
        },
        select: ["title"],
      }),
      {},
    );

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toEqual([]);

    // Primary (task) must have been fetched with pre-filter
    const taskCalls = findManySpy.mock.calls.filter(([p]) => p.model === "task");
    expect(taskCalls.length).toBeGreaterThanOrEqual(1);

    // Secondary (tag) and join table must NOT have been fetched at all
    const tagCalls = findManySpy.mock.calls.filter(([p]) => p.model === "tag");
    expect(tagCalls).toHaveLength(0);
    const joinCalls = findManySpy.mock.calls.filter(
      ([p]) => p.model === "__datafn_join_task_tags",
    );
    expect(joinCalls).toHaveLength(0);
  });

  it("TV-INMEM-SEC-006: unknown relation type is rejected during schema validation", async () => {
    // Invalid relation types are rejected before query execution.
    const unknownRelSchema = {
      resources: [
        { name: "task",    version: 1, fields: [{ name: "title", type: "string", required: true }, { name: "status", type: "string", required: true }] },
        { name: "mystery", version: 1, fields: [{ name: "data",  type: "string", required: true }] },
      ],
      relations: [
        {
          from:     "task",
          to:       "mystery",
          type:     "custom" as any,   // unsupported — triggers INMEM-004 else branch
          relation: "mystery",
        },
      ],
    } as DatafnSchema;

    const db = memoryAdapter();
    await db.initialize();

    await db.create({ model: "task",    data: { id: "t1", title: "Alpha", status: "active" }, namespace: "datafn" });
    await db.create({ model: "mystery", data: { id: "m1", data: "secret" },                  namespace: "datafn" });
    await db.create({ model: "mystery", data: { id: "m2", data: "other"  },                  namespace: "datafn" });

    const warnLogs: string[] = [];
    const mockLogger = {
      info: () => {},
      warn: (msg: string) => warnLogs.push(msg),
      error: () => {},
      debug: () => {},
    };

    await expect(
      createDatafnServer({ allowUnknownResources: true,
        schema: unknownRelSchema,
        limits: { maxLimit: 100 },
        db,
        logger: mockLogger,
      }),
    ).rejects.toThrow(/relation\.type must be one of one-many, many-one, many-many, htree/i);
    expect(warnLogs).toHaveLength(0);
  });
});
