import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnServer } from "../../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../../core-types.js";
import { applyLimitOffset } from "../pagination.js";

// Schema for testing
const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      idPrefix: "task",
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "createdAt", type: "string" as const, required: false },
      ],
    },
  ],
  relations: [],
};

describe("PAGE-001: nextCursor Emission", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    
    // Seed 15 tasks
    for (let i = 1; i <= 15; i++) {
        const id = `task-${i}`;
        const createdAt = `2026-01-${String(i).padStart(2, '0')}T00:00:00Z`;
        await db.create({
            model: "tasks",
            data: { id, title: `Task ${i}`, createdAt },
            namespace: "datafn"
        });
    }

    server = await createDatafnServer({ allowUnknownResources: true,
      schema,
      database: db,
    });
  });

  it("TV-PAGE-NEXTCURSOR-PRESENT-001: nextCursor present when more pages exist", async () => {
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        sort: ["id:asc"], // task-1 to task-9, then task-10... sort string: 1, 10, 11... wait.
        // String sort: "task-1", "task-10", "task-11" ... "task-15", "task-2".
        // Let's use createdAt sort for predictable numeric order
        // OR rely on id string sort.
        // task-1 < task-10.
        // List: 1, 10, 11, 12, 13, 14, 15, 2, 3, 4, 5, 6, 7, 8, 9.
        // Total 15.
        // Limit 10.
        // Result: 1, 10, 11, 12, 13, 14, 15, 2, 3, 4.
        // Last item: 4.
        // Next page: 5, 6, 7, 8, 9. (5 items).
        // So nextCursor should be present.
        limit: 10
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toHaveLength(10);
    expect(body.result.nextCursor).not.toBeNull();
    // Verify cursor contains sort keys
    expect(body.result.nextCursor).toHaveProperty("id");
  });

  it("TV-PAGE-NEXTCURSOR-NULL-001: nextCursor null when no more pages", async () => {
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        sort: ["id:asc"],
        limit: 20 // More than total
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toHaveLength(15);
    expect(body.result.nextCursor).toBeNull();
  });

  it("TV-PAGE-NEXTCURSOR-VALUES-001: nextCursor contains sort key values", async () => {
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        sort: ["createdAt:asc", "id:asc"], // 1..15
        limit: 10
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.data).toHaveLength(10);
    // 10th item is task-10
    const lastItem = body.result.data[9];
    expect(lastItem.id).toBe("task-10");
    
    expect(body.result.nextCursor).toEqual({
        createdAt: "2026-01-10T00:00:00Z",
        id: "task-10"
    });
  });
});

describe("PAGE-002: Cursor Backwards Pagination", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    
    // Seed 20 tasks, sorted by ID cleanly (task-01 ... task-20)
    for (let i = 1; i <= 20; i++) {
        const id = `task-${String(i).padStart(2, '0')}`; // task-01, task-02...
        await db.create({
            model: "tasks",
            data: { id, title: `Task ${i}` },
            namespace: "datafn"
        });
    }

    server = await createDatafnServer({ allowUnknownResources: true,
      schema,
      database: db,
    });
  });

  it("TV-PAGE-BEFORE-001: Cursor backwards pagination", async () => {
    // We want items BEFORE task-11.
    // Sorted id:asc.
    // List: 01, 02 ... 10, [11], 12...
    // Before 11 is 10, 09, ...
    // Limit 10.
    // Result should be 01...10.
    
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        sort: ["id:asc"],
        cursor: {
            before: { id: "task-11" }
        },
        limit: 10
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.data).toHaveLength(10);
    
    // First item should be task-01
    expect(body.result.data[0].id).toBe("task-01");
    // Last item should be task-10
    expect(body.result.data[9].id).toBe("task-10");
    
    // nextCursor should point to task-10 (continuation forward from this page)
    expect(body.result.nextCursor).toEqual({ id: "task-10" });
  });

  it("TV-PAGE-BEFORE-EDGES-001: Before cursor at edges", async () => {
    // Before task-01. Should be empty.
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        sort: ["id:asc"],
        cursor: {
            before: { id: "task-01" }
        },
        limit: 10
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result.data).toHaveLength(0);
    expect(body.result.nextCursor).toBeNull();
  });
});

describe("DETERM-003: Cursor Sort Validation", () => {
    let server: any;
    let db: any;
  
    beforeEach(async () => {
      db = memoryAdapter();
      await db.initialize();
      server = await createDatafnServer({ allowUnknownResources: true, schema, database: db });
    });

    it("TV-CURSOR-SORT-VALID-001: Valid cursor with id tie-breaker", async () => {
        const req = new Request("http://localhost/datafn/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resource: "tasks",
              version: "1",
              sort: ["createdAt:asc", "id:asc"],
              cursor: { after: { createdAt: "...", id: "..." } }
            }),
          });
          const res = await server.router.handle(req);
          expect(res.status).toBe(200);
    });

    it("TV-CURSOR-SORT-INVALID-001: Cursor without id in sort", async () => {
        const req = new Request("http://localhost/datafn/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resource: "tasks",
              version: "1",
              sort: ["createdAt:asc"], // Missing id
              cursor: { after: { createdAt: "..." } }
            }),
          });
          const res = await server.router.handle(req);
          const body = await res.json();
          
          expect(res.status).toBe(400);
          expect(body.error.code).toBe("DFQL_INVALID");
          expect(body.error.message).toContain("id");
    });

    it("TV-CURSOR-SORT-DEFAULT-001: Cursor without sort defaults to id:asc", async () => {
        // Seed
        await db.create({ model: "tasks", data: { id: "task-1", title: "T1" }, namespace: "datafn" });
        await db.create({ model: "tasks", data: { id: "task-2", title: "T2" }, namespace: "datafn" });

        const req = new Request("http://localhost/datafn/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resource: "tasks",
              version: "1",
              // sort omitted
              cursor: { after: { id: "task-1" } }
            }),
          });
          const res = await server.router.handle(req);
          const body = await res.json();
          
          expect(res.status).toBe(200);
          expect(body.result.data).toHaveLength(1);
          expect(body.result.data[0].id).toBe("task-2");
    });
});

describe("applyLimitOffset", () => {
  it("returns an empty page when limit is zero", () => {
    expect(applyLimitOffset([{ id: "a" }], 0, 0)).toEqual([]);
  });
});
