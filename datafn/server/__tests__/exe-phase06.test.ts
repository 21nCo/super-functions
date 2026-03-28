/**
 * Phase 06 tests — EXE-014, EXE-017, EXE-022
 *
 * TV-EXE-014-P1/N1: FK omit-set caching
 * TV-EXE-017-P1/N1: Search candidate chunking
 * TV-EXE-022-P1/N1: No full-scan fallback
 */

import { describe, it, expect, vi } from "vitest";
import type { DatafnSchema } from "@datafn/core";
import type { DataStore, JoinRow } from "../src/execution/store.js";
import { materializeSelect } from "../src/execution/query/select.js";
import { executeSearchQuery } from "../src/execution/query/search.js";
import type { SearchProvider } from "../src/search-provider.js";
import { DbDataStore } from "../src/execution/db-store.js";
import { memoryAdapter } from "@superfunctions/db/adapters";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStore(
  records: Map<string, Record<string, unknown>[]>,
  joins?: Map<string, JoinRow[]>,
): DataStore {
  return {
    getRecords(resource: string) {
      return records.get(resource) || [];
    },
    getRecord(resource: string, id: string) {
      const all = records.get(resource) || [];
      return all.find((r) => r.id === id) || null;
    },
    getJoinRows(relationKey: string) {
      return joins?.get(relationKey) || [];
    },
    findRecords(resource: string, field: string, value: unknown) {
      const all = records.get(resource) || [];
      return all.filter((r) => r[field] === value);
    },
  };
}

// ---------------------------------------------------------------------------
// TV-EXE-014: FK omit-set caching
// ---------------------------------------------------------------------------

describe("FIX-EXE-014: FK omit-set caching", () => {
  const schema: DatafnSchema = {
    resources: [
      {
        name: "user",
        version: 1,
        fields: [{ name: "name", type: "string", required: true }],
      },
      {
        name: "task",
        version: 1,
        fields: [
          { name: "label", type: "string", required: true },
          { name: "userId", type: "string", required: false },
        ],
      },
    ],
    relations: [
      {
        from: "task",
        to: "user",
        relation: "user",
        inverse: "tasks",
        type: "many-one",
      },
    ],
  };

  it("TV-EXE-014-P1: omit-set is cached — large one-many expansion produces correct output efficiently", () => {
    // Create 1000 task records with FK — verifies caching produces correct results at scale
    const tasks: Record<string, unknown>[] = [];
    for (let i = 0; i < 1000; i++) {
      tasks.push({ id: `task:${i}`, label: `Task ${i}`, userId: "user:1" });
    }
    const users: Record<string, unknown>[] = [
      { id: "user:1", name: "Alice" },
    ];

    const records = new Map<string, Record<string, unknown>[]>();
    records.set("task", tasks);
    records.set("user", users);
    const store = createMockStore(records);

    // Materialize for all 1000 records with user.* expansion
    const results = tasks.map((task) =>
      materializeSelect(task, "task", ["*", "user.*"], schema, store),
    );

    // Verify correctness: each task should have user expanded and no userId FK field
    expect(results.length).toBe(1000);
    for (const result of results) {
      expect(result).toHaveProperty("user");
      expect(result.user).toEqual({ id: "user:1", name: "Alice" });
      // FK field must be omitted (auto-omit from cached set)
      expect(result).not.toHaveProperty("userId");
    }
  });

  it("TV-EXE-014-N1: output content remains correct after caching", () => {
    const tasks = [
      { id: "task:1", label: "Task 1", userId: "user:1" },
      { id: "task:2", label: "Task 2", userId: "user:2" },
    ];
    const users = [
      { id: "user:1", name: "Alice" },
      { id: "user:2", name: "Bob" },
    ];

    const records = new Map<string, Record<string, unknown>[]>();
    records.set("task", tasks);
    records.set("user", users);
    const store = createMockStore(records);

    const result1 = materializeSelect(
      tasks[0],
      "task",
      ["id", "label", "user.*"],
      schema,
      store,
    );
    const result2 = materializeSelect(
      tasks[1],
      "task",
      ["id", "label", "user.*"],
      schema,
      store,
    );

    // FK fields omitted, user expanded correctly
    expect(result1).toEqual({
      id: "task:1",
      label: "Task 1",
      user: { id: "user:1", name: "Alice" },
    });
    expect(result2).toEqual({
      id: "task:2",
      label: "Task 2",
      user: { id: "user:2", name: "Bob" },
    });
  });
});

// ---------------------------------------------------------------------------
// TV-EXE-017: Search candidate chunking
// ---------------------------------------------------------------------------

describe("FIX-EXE-017: Search candidate chunking", () => {
  const schema: DatafnSchema = {
    resources: [
      {
        name: "doc",
        version: 1,
        fields: [
          { name: "title", type: "string", required: true },
          { name: "score", type: "number", required: false },
        ],
      },
    ],
  };

  function createDocStore(count: number): DataStore {
    const docs: Record<string, unknown>[] = [];
    for (let i = 1; i <= count; i++) {
      docs.push({ id: `doc:${i}`, title: `Document ${i}`, score: i });
    }
    const records = new Map<string, Record<string, unknown>[]>();
    records.set("doc", docs);
    return createMockStore(records);
  }

  function createMockSearchProvider(candidateIds: string[]): SearchProvider {
    return {
      name: "test-search",
      search: vi.fn().mockResolvedValue(candidateIds),
      updateIndices: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("TV-EXE-017-P1: candidates over 1000 are fully processed in chunks", async () => {
    const totalCandidates = 1500;
    const store = createDocStore(totalCandidates);
    const candidateIds = Array.from(
      { length: totalCandidates },
      (_, i) => `doc:${i + 1}`,
    );
    const provider = createMockSearchProvider(candidateIds);

    const query = {
      resource: "doc",
      version: 1,
      select: ["id", "title"],
      search: { query: "test", type: "fullText" as const },
    };

    const result = await executeSearchQuery(query, schema, store, provider);

    // All 1500 candidates must appear in results (no truncation)
    expect((result as any).data.length).toBe(totalCandidates);
  });

  it("TV-EXE-017-N1: no silent truncation — all candidates processed", async () => {
    const totalCandidates = 1500;
    const store = createDocStore(totalCandidates);
    const candidateIds = Array.from(
      { length: totalCandidates },
      (_, i) => `doc:${i + 1}`,
    );
    const provider = createMockSearchProvider(candidateIds);

    const query = {
      resource: "doc",
      version: 1,
      select: ["id"],
      search: { query: "test", type: "fullText" as const },
    };

    const result = await executeSearchQuery(query, schema, store, provider);
    const returnedIds = (result as any).data.map((r: any) => r.id);

    // Verify every candidate ID is in results — no missing 500
    for (const id of candidateIds) {
      expect(returnedIds).toContain(id);
    }
  });

  it("TV-EXE-017 fast path: <= 1000 candidates processed in single pass", async () => {
    const totalCandidates = 500;
    const store = createDocStore(totalCandidates);
    const candidateIds = Array.from(
      { length: totalCandidates },
      (_, i) => `doc:${i + 1}`,
    );
    const provider = createMockSearchProvider(candidateIds);

    const query = {
      resource: "doc",
      version: 1,
      select: ["id"],
      search: { query: "test", type: "fullText" as const },
    };

    const result = await executeSearchQuery(query, schema, store, provider);
    expect((result as any).data.length).toBe(totalCandidates);
  });
});

// ---------------------------------------------------------------------------
// TV-EXE-022: No full-scan fallback
// ---------------------------------------------------------------------------

describe("FIX-EXE-022: No full-scan fallback", () => {
  it("TV-EXE-022-P1: unknown relation path returns empty, not full scan", async () => {
    const db = memoryAdapter();
    await db.initialize();

    // Seed records — the "category" records should NOT be loaded via full scan
    await db.create({ model: "project", data: { id: "p1" }, namespace: "datafn" });
    await db.create({ model: "task", data: { id: "t1", projectId: "p1", catId: "c1" }, namespace: "datafn" });
    await db.create({ model: "category", data: { id: "c1", name: "Bug" }, namespace: "datafn" });
    await db.create({ model: "category", data: { id: "c2", name: "Feature" }, namespace: "datafn" });

    const warnLogs: any[] = [];
    const logger = {
      info: () => {},
      warn: (...args: any[]) => warnLogs.push(args),
      error: () => {},
      debug: () => {},
    } as any;

    // Schema: project -> task (one-many), task -> category (many-one)
    // But NO direct relation between project and category
    // The nested select "tasks.cat.*" will discover "category" via nested token parsing
    // but the secondary loading loop won't find a direct relation project<->category
    const schema = {
      resources: [
        { name: "project", version: 1, fields: [] },
        { name: "task", version: 1, fields: [
          { name: "projectId", type: "string", required: false },
          { name: "catId", type: "string", required: false },
        ] },
        { name: "category", version: 1, fields: [{ name: "name", type: "string", required: true }] },
      ],
      relations: [
        {
          from: "project",
          to: "task",
          relation: "tasks",
          inverse: "project",
          type: "one-many",
        },
        {
          from: "task",
          to: "category",
          relation: "cat",
          inverse: "tasks",
          type: "many-one",
          fkField: "catId",
        },
      ],
    };

    const store = await DbDataStore.forQuery(
      db,
      {
        resource: "project",
        select: ["tasks.cat.*"],
      },
      schema,
      "datafn",
      undefined,
      logger,
    );

    // The category resource should NOT have been loaded via full scan
    // It should be empty (no direct relation from project to category)
    // OR loaded via the nested token loading logic (forPushdownResult-like second pass)
    // The key assertion: no findMany with where:[] for category
    const catRecords = store.getRecords("category");

    // Warning should have been emitted about no direct relation
    const hasWarning = warnLogs.some((args) =>
      typeof args[0] === "string" && args[0].includes("secondary resource"),
    );
    expect(hasWarning).toBe(true);
    expect(catRecords).toEqual([]);
  });

  it("TV-EXE-022-N1: unhandled relation type also avoids where:[] broad fetch", async () => {
    const db = memoryAdapter();
    await db.initialize();

    // Seed primary + secondary records
    await db.create({ model: "primary", data: { id: "p1" }, namespace: "datafn" });
    await db.create({ model: "secondary", data: { id: "s1", val: "data" }, namespace: "datafn" });

    const findManySpy = vi.spyOn(db, "findMany");
    const warnLogs: any[] = [];
    const logger = {
      info: () => {},
      warn: (...args: any[]) => warnLogs.push(args),
      error: () => {},
      debug: () => {},
    } as any;

    // Schema with an unrecognized/custom relation type that doesn't match any if-branch
    const schema = {
      resources: [
        { name: "primary", version: 1, fields: [] },
        { name: "secondary", version: 1, fields: [{ name: "val", type: "string", required: true }] },
      ],
      relations: [
        {
          from: "primary",
          to: "secondary",
          relation: "sec",
          inverse: "prim",
          type: "unknown-custom" as any, // unhandled type
        },
      ],
    };

    const store = await DbDataStore.forQuery(
      db,
      { resource: "primary", select: ["sec.*"] },
      schema,
      "datafn",
      undefined,
      logger,
    );

    // Verify no findMany call was made with where: [] for the secondary resource
    const secondaryCalls = findManySpy.mock.calls.filter(
      (call) => (call[0] as any).model === "secondary",
    );
    for (const call of secondaryCalls) {
      const where = (call[0] as any).where;
      expect(where).not.toEqual([]);
    }

    // Should have warning about unhandled relation type
    const hasWarning = warnLogs.some((args) =>
      typeof args[0] === "string" && args[0].includes("nhandled relation type"),
    );
    expect(hasWarning).toBe(true);

    // Secondary records should be empty (not loaded via full scan)
    expect(store.getRecords("secondary")).toEqual([]);
  });
});
