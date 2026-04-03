import { describe, it, expect } from "vitest";
import { createMemorySearchClient, createIndexedDbSearchClient } from "../src/constructors";

describe("createMemorySearchClient", () => {
  it("returns a SearchClient backed by MemoryAdapter", () => {
    const client = createMemorySearchClient();
    const info = client.adapterInfo();
    expect(info.name).toBe("memory");
    expect(info.capabilities?.persistent).toBe(false);
    expect(info.capabilities?.searchAll).toBe(true);
  });

  it("accepts custom defaults", async () => {
    const client = createMemorySearchClient({ defaults: { limit: 50, fuzzy: true } });
    expect(client.adapterInfo().name).toBe("memory");
  });

  it("supports full lifecycle: initialize, index, search, remove, clear, dispose", async () => {
    const client = createMemorySearchClient();
    expect(client.initialize).toBeDefined();

    await client.initialize!({ resources: [{ name: "tasks", searchFields: ["title"] }] });
    await client.index({
      resource: "tasks",
      documents: [
        { id: "t1", fields: { title: "buy groceries" } },
        { id: "t2", fields: { title: "buy new phone" } },
      ],
    });

    const results = await client.search({ resource: "tasks", query: "buy", limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results).toContain("t1");
    expect(results).toContain("t2");

    await client.remove({ resource: "tasks", ids: ["t1"] });
    const afterRemove = await client.search({ resource: "tasks", query: "buy", limit: 10 });
    expect(afterRemove).not.toContain("t1");

    await client.clear("tasks");
    const afterClear = await client.search({ resource: "tasks", query: "buy", limit: 10 });
    expect(afterClear.length).toBe(0);

    await client.dispose();
  });

  it("searchAll works with memory adapter", async () => {
    const client = createMemorySearchClient();
    await client.initialize!({
      resources: [
        { name: "tasks", searchFields: ["title"] },
        { name: "notes", searchFields: ["body"] },
      ],
    });

    await client.index({
      resource: "tasks",
      documents: [{ id: "t1", fields: { title: "alpha beta" } }],
    });
    await client.index({
      resource: "notes",
      documents: [{ id: "n1", fields: { body: "alpha gamma" } }],
    });

    const results = await client.searchAll({
      query: "alpha",
      resources: ["tasks", "notes"],
      limit: 10,
    });

    expect(results.length).toBe(2);
    const resources = results.map((r) => r.resource);
    expect(resources).toContain("tasks");
    expect(resources).toContain("notes");
  });
});

describe("createIndexedDbSearchClient", () => {
  it("returns a SearchClient backed by IndexedDbAdapter", () => {
    const client = createIndexedDbSearchClient();
    const info = client.adapterInfo();
    expect(info.name).toBe("indexeddb");
    expect(info.capabilities?.persistent).toBe(true);
  });

  it("accepts custom adapter config and defaults", () => {
    const client = createIndexedDbSearchClient({
      adapterConfig: {
        dbName: "test-search-db",
        engine: "auto",
        wasmLoader: async () => {
          throw new Error("not-loaded-in-constructor-test");
        },
      },
      defaults: { limit: 20 },
    });
    expect(client.adapterInfo().name).toBe("indexeddb");
  });

  it("supports full lifecycle", async () => {
    const dbName = `constructors-test-db-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const client = createIndexedDbSearchClient({
      adapterConfig: { dbName },
    });

    await client.initialize!({
      resources: [{ name: "docs", searchFields: ["title"] }],
    });

    await client.index({
      resource: "docs",
      documents: [{ id: "d1", fields: { title: "hello world" } }],
    });

    const results = await client.search({ resource: "docs", query: "hello", limit: 5 });
    expect(results).toContain("d1");

    await client.dispose();
  });
});
