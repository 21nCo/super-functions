import { describe, it, expect, vi } from "vitest";
import { executeCrossResourceSearch } from "../cross-resource.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../../core-types.js";
import type { SearchProvider } from "../../../search-provider.js";

const schema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: false },
        { name: "status", type: "string", required: false },
      ],
    },
    {
      name: "notes",
      version: 1,
      fields: [{ name: "body", type: "string", required: false }],
    },
  ],
};

function makeProvider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    name: "mock",
    search: vi.fn().mockResolvedValue([]),
    searchAll: vi.fn().mockResolvedValue([]),
    updateIndices: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("TV-XSRV-001: executeCrossResourceSearch — basic cross-resource search", () => {
  it("returns results from multiple resources sorted by score desc", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "t1", title: "alpha", status: "active" }, namespace: "datafn" });
    await db.create({ model: "notes", data: { id: "n1", body: "alpha note" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "t1", score: 0.9 },
        { resource: "notes", id: "n1", score: 0.7 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "alpha" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].resource).toBe("tasks");
    expect(result.results[0].id).toBe("t1");
    expect(result.results[0].score).toBe(0.9);
    expect(result.results[1].resource).toBe("notes");
    expect(result.results[1].score).toBe(0.7);
  });

  it("returns empty results when searchAll returns no candidates", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({ searchAll: vi.fn().mockResolvedValue([]) });

    const result = await executeCrossResourceSearch(
      { query: "nothing" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results).toHaveLength(0);
  });

  it("forwards prefix/fuzzy/fieldBoosts to provider.searchAll", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "t1", title: "alpha", status: "active" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([{ resource: "tasks", id: "t1", score: 0.9 }]),
    });

    await executeCrossResourceSearch(
      {
        query: "alpha",
        resources: ["tasks"],
        prefix: true,
        fuzzy: 0.2,
        fieldBoosts: { title: 2 },
      },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(provider.searchAll).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "alpha",
        resources: ["tasks"],
        prefix: true,
        fuzzy: 0.2,
        fieldBoosts: { title: 2 },
      }),
    );
  });
});

describe("TV-XSRV-002: executeCrossResourceSearch — deleted records silently excluded", () => {
  it("excludes candidates for records not found in DB", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "ghost-id", score: 0.9 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "ghost" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results).toHaveLength(0);
  });

  it("excludes soft-deleted records that have been hard-deleted from DB", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "t-live", title: "live" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "t-live", score: 0.8 },
        { resource: "tasks", id: "t-deleted", score: 0.5 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "task" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("t-live");
  });
});

describe("TV-XSRV-003: executeCrossResourceSearch — select projection", () => {
  it("returns only selected fields in data", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "t1", title: "hello", status: "active" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "t1", score: 1.0 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "hello", select: ["id", "title"] },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results[0].data).toHaveProperty("id");
    expect(result.results[0].data).toHaveProperty("title");
    expect(result.results[0].data).not.toHaveProperty("status");
  });

  it("returns full record data when select is not specified", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "t1", title: "hello", status: "active" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "t1", score: 1.0 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "hello" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results[0].data).toHaveProperty("title");
    expect(result.results[0].data).toHaveProperty("status");
  });
});

describe("TV-DET-001: executeCrossResourceSearch — deterministic sort", () => {
  it("sorts by score desc, then resource asc, then id asc", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "b", title: "task b" }, namespace: "datafn" });
    await db.create({ model: "tasks", data: { id: "a", title: "task a" }, namespace: "datafn" });
    await db.create({ model: "notes", data: { id: "c", body: "note c" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "b", score: 0.5 },
        { resource: "notes", id: "c", score: 0.5 },
        { resource: "tasks", id: "a", score: 0.5 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "x" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results[0]).toMatchObject({ resource: "notes", id: "c" });
    expect(result.results[1]).toMatchObject({ resource: "tasks", id: "a" });
    expect(result.results[2]).toMatchObject({ resource: "tasks", id: "b" });
  });

  it("sorts higher-score results before lower-score", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "low", title: "low score" }, namespace: "datafn" });
    await db.create({ model: "tasks", data: { id: "high", title: "high score" }, namespace: "datafn" });

    const provider = makeProvider({
      searchAll: vi.fn().mockResolvedValue([
        { resource: "tasks", id: "low", score: 0.1 },
        { resource: "tasks", id: "high", score: 0.9 },
      ]),
    });

    const result = await executeCrossResourceSearch(
      { query: "score" },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results[0].id).toBe("high");
    expect(result.results[1].id).toBe("low");
  });
});

describe("executeCrossResourceSearch — error when searchAll missing", () => {
  it("throws DFQL_UNSUPPORTED when searchAll is not implemented", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({ searchAll: undefined });

    await expect(
      executeCrossResourceSearch({ query: "test" }, provider, db, schema, "datafn"),
    ).rejects.toMatchObject({ code: "DFQL_UNSUPPORTED" });
  });
});

describe("TV-ABRT-001: executeCrossResourceSearch — abort support", () => {
  it("throws DFQL_ABORTED when signal is already aborted", async () => {
    const db = memoryAdapter();
    await db.initialize();
    const provider = makeProvider({ searchAll: vi.fn().mockResolvedValue([]) });
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeCrossResourceSearch(
        { query: "test", signal: controller.signal },
        provider,
        db,
        schema,
        "datafn",
      ),
    ).rejects.toMatchObject({
      code: "DFQL_ABORTED",
      message: "Search request aborted",
    });
  });

  it("throws DFQL_ABORTED when signal aborts during execution", async () => {
    const db = memoryAdapter();
    await db.initialize();
    await db.create({ model: "tasks", data: { id: "t1", title: "task" }, namespace: "datafn" });

    const controller = new AbortController();
    const provider = makeProvider({
      searchAll: vi.fn().mockImplementation(async () => {
        controller.abort();
        return [{ resource: "tasks", id: "t1", score: 1 }];
      }),
    });

    await expect(
      executeCrossResourceSearch(
        { query: "task", signal: controller.signal },
        provider,
        db,
        schema,
        "datafn",
      ),
    ).rejects.toMatchObject({
      code: "DFQL_ABORTED",
      message: "Search request aborted",
    });
  });
});

describe("executeCrossResourceSearch — limit enforcement", () => {
  it("respects global limit", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const candidates: Array<{ resource: string; id: string; score: number }> = [];
    for (let i = 0; i < 5; i++) {
      const id = `t${i}`;
      await db.create({ model: "tasks", data: { id, title: `task ${i}` }, namespace: "datafn" });
      candidates.push({ resource: "tasks", id, score: 1 - i * 0.1 });
    }

    const provider = makeProvider({ searchAll: vi.fn().mockResolvedValue(candidates) });

    const result = await executeCrossResourceSearch(
      { query: "task", limit: 3 },
      provider,
      db,
      schema,
      "datafn",
    );

    expect(result.results).toHaveLength(3);
  });
});
