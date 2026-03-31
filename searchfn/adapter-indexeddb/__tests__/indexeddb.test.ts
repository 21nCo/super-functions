import { describe, it, expect } from "vitest";
import { runAdapterContractTests } from "./adapter-contract";
import { IndexedDbAdapter } from "../src/index";
import { SearchAdapterError } from "@searchfn/adapter-contracts";

let testCounter = 0;
function freshDbName(): string {
  return `test-idb-${++testCounter}`;
}

runAdapterContractTests("IndexedDbAdapter", () => new IndexedDbAdapter({ dbName: freshDbName() }));

describe("IndexedDbAdapter — IDB-specific tests", () => {
  // TV-IDB-002: persistence across dispose/reinitialize
  it("persists indexed data across dispose and reinitialize", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [
        { id: "task:1", fields: { title: "Buy groceries", description: "Get milk and bread" } },
        { id: "task:2", fields: { title: "Review pull request", description: "Check auth changes" } },
      ],
    });
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      const result = await adapter2.search({ resource: "tasks", query: "groceries" });
      expect(result).toEqual(["task:1"]);
    } finally {
      await adapter2.dispose();
    }
  });

  it("persists remove operations across dispose and reinitialize", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [
        { id: "task:1", fields: { title: "Buy groceries" } },
        { id: "task:2", fields: { title: "Review pull request" } },
      ],
    });
    await adapter1.remove({ resource: "tasks", ids: ["task:1"] });
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      const result = await adapter2.search({ resource: "tasks", query: "groceries", fields: ["title"] });
      expect(result).toEqual([]);
      const result2 = await adapter2.search({ resource: "tasks", query: "review", fields: ["title"] });
      expect(result2).toContain("task:2");
    } finally {
      await adapter2.dispose();
    }
  });

  // TV-IDB-003: clear removes data from IDB permanently
  it("clear removes IndexedDB data so a new adapter session finds nothing", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [
        { id: "1", fields: { title: "Buy groceries" } },
        { id: "2", fields: { title: "Review request" } },
      ],
    });
    await adapter1.clear("tasks");
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      const result = await adapter2.search({
        resource: "tasks",
        query: "groceries",
        fields: ["title"],
      });
      expect(result).toEqual([]);
    } finally {
      await adapter2.dispose();
    }
  });

  // TV-IDB-004: multiple resources in same adapter use separate IDBs
  it("isolates multiple resources — each resource uses a separate database", async () => {
    const dbName = freshDbName();
    const adapter = new IndexedDbAdapter({ dbName });

    try {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "Task A" } }],
      });
      await adapter.index({
        resource: "notes",
        documents: [{ id: "1", fields: { title: "Note A" } }],
      });

      const taskResult = await adapter.search({ resource: "tasks", query: "Note" });
      expect(taskResult).toEqual([]);

      const noteResult = await adapter.search({ resource: "notes", query: "Task" });
      expect(noteResult).toEqual([]);
    } finally {
      await adapter.dispose();
    }
  });

  it("upsert correctly updates persisted data on cold restart", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "old title" } }],
    });
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    await adapter2.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "new title" } }],
    });
    await adapter2.dispose();

    const adapter3 = new IndexedDbAdapter({ dbName });
    try {
      const oldResult = await adapter3.search({ resource: "tasks", query: "old", fields: ["title"] });
      expect(oldResult).toEqual([]);

      const newResult = await adapter3.search({ resource: "tasks", query: "new", fields: ["title"] });
      expect(newResult).toContain("1");
    } finally {
      await adapter3.dispose();
    }
  });

  it("supports fuzzy search on persisted index", async () => {
    const dbName = freshDbName();
    const adapter = new IndexedDbAdapter({ dbName });
    try {
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "groceries" } }],
      });
      const result = await adapter.search({
        resource: "tasks",
        query: "groceris",
        fuzzy: true,
      });
      expect(result).toContain("1");
    } finally {
      await adapter.dispose();
    }
  });

  it("keeps legacy doc-term snapshots from polluting fuzzy vocabulary with prefix terms", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "testing" } }],
    });

    const engine1 = (adapter1 as any).getOrCreateEngine("tasks");
    await (adapter1 as any).ensureOpen(engine1);
    const docTermsBuffer = await engine1.storage.getCacheState("doc-terms");
    expect(docTermsBuffer).toBeTruthy();

    const legacySnapshot = JSON.parse(
      new TextDecoder().decode(docTermsBuffer),
    ) as Record<string, Array<{ field: string; term: string; isPrefix?: boolean }>>;

    for (const entries of Object.values(legacySnapshot)) {
      for (const entry of entries) {
        delete entry.isPrefix;
      }
    }

    await engine1.storage.putCacheState(
      "doc-terms",
      new TextEncoder().encode(JSON.stringify(legacySnapshot)).buffer,
    );
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      await adapter2.index({
        resource: "tasks",
        documents: [{ id: "2", fields: { title: "alpha" } }],
      });

      const result = await adapter2.search({
        resource: "tasks",
        query: "test",
        fuzzy: true,
      });

      expect(result).toEqual([]);
    } finally {
      await adapter2.dispose();
    }
  });

  it("removes stale legacy vocabulary entries after deleting the last legacy document", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "testing" } }],
    });

    const engine1 = (adapter1 as any).getOrCreateEngine("tasks");
    await (adapter1 as any).ensureOpen(engine1);
    const docTermsBuffer = await engine1.storage.getCacheState("doc-terms");
    expect(docTermsBuffer).toBeTruthy();

    const legacySnapshot = JSON.parse(
      new TextDecoder().decode(docTermsBuffer),
    ) as Record<string, Array<{ field: string; term: string; isPrefix?: boolean }>>;

    for (const entries of Object.values(legacySnapshot)) {
      for (const entry of entries) {
        delete entry.isPrefix;
      }
    }

    await engine1.storage.putCacheState(
      "doc-terms",
      new TextEncoder().encode(JSON.stringify(legacySnapshot)).buffer,
    );
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      await adapter2.remove({ resource: "tasks", ids: ["1"] });

      const engine2 = (adapter2 as any).getOrCreateEngine("tasks");
      await (adapter2 as any).ensureOpen(engine2);

      expect(Array.from(engine2.vocabulary)).not.toContain("testing");
    } finally {
      await adapter2.dispose();
    }
  });

  it("supports remove after cold restart without explicit initialize", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "cold restart removal" } }],
    });
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      await adapter2.remove({ resource: "tasks", ids: ["1"] });

      const result = await adapter2.search({
        resource: "tasks",
        query: "cold",
        fields: ["title"],
      });
      expect(result).toEqual([]);
    } finally {
      await adapter2.dispose();
    }
  });

  it("supports explicit-resource searchAll after cold restart", async () => {
    const dbName = freshDbName();

    const adapter1 = new IndexedDbAdapter({ dbName });
    await adapter1.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "cold restart search all" } }],
    });
    await adapter1.dispose();

    const adapter2 = new IndexedDbAdapter({ dbName });
    try {
      const result = await adapter2.searchAll({
        resources: ["tasks"],
        query: "cold",
        limit: 10,
      });

      expect(result).toEqual([
        expect.objectContaining({ resource: "tasks", id: "1" }),
      ]);
    } finally {
      await adapter2.dispose();
    }
  });

  it("honors configured searchFields when params.fields is omitted", async () => {
    const adapter = new IndexedDbAdapter({ dbName: freshDbName() });
    try {
      await adapter.initialize({
        resources: [{ name: "tasks", searchFields: ["title"] }],
      });
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "visible", body: "hidden-body-term" } }],
      });

      const result = await adapter.search({
        resource: "tasks",
        query: "hidden-body-term",
      });

      expect(result).toEqual([]);
    } finally {
      await adapter.dispose();
    }
  });

  it("drops removed resources from implicit searchAll after reinitialize", async () => {
    const adapter = new IndexedDbAdapter({ dbName: freshDbName() });
    try {
      await adapter.initialize({
        resources: [
          { name: "tasks", searchFields: ["title"] },
          { name: "notes", searchFields: ["title"] },
        ],
      });
      await adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "task alpha" } }],
      });
      await adapter.index({
        resource: "notes",
        documents: [{ id: "n1", fields: { title: "note beta" } }],
      });

      await adapter.initialize({
        resources: [{ name: "tasks", searchFields: ["title"] }],
      });

      const result = await adapter.searchAll({
        query: "note",
        limit: 10,
      });

      expect(result).toEqual([]);
    } finally {
      await adapter.dispose();
    }
  });

  it("supports fieldBoosts for ranking", async () => {
    const dbName = freshDbName();
    const adapter = new IndexedDbAdapter({ dbName });
    try {
      await adapter.index({
        resource: "items",
        documents: [
          { id: "A", fields: { title: "report", body: "quarterly data" } },
          { id: "B", fields: { title: "quarterly data", body: "report" } },
        ],
      });
      const result = await adapter.search({
        resource: "items",
        query: "report",
        fieldBoosts: { title: 5, body: 1 },
        limit: 10,
      });
      expect(result[0]).toBe("A");
    } finally {
      await adapter.dispose();
    }
  });

  it("indexes >10k documents via deterministic chunking", async () => {
    const dbName = freshDbName();
    const adapter = new IndexedDbAdapter({ dbName });
    try {
      const documents = Array.from({ length: 12000 }, (_, i) => ({
        id: `d${i}`,
        fields: { title: `doc ${i}` },
      }));
      await adapter.index({ resource: "bulk", documents });
      const result = await adapter.search({
        resource: "bulk",
        query: "doc 11999",
        fields: ["title"],
      });
      expect(result).toContain("d11999");
    } finally {
      await adapter.dispose();
    }
  });

  it("throws DFQL_ABORTED when indexing with an aborted signal", async () => {
    const adapter = new IndexedDbAdapter({ dbName: freshDbName() });
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "hello" } }],
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(SearchAdapterError);
    await expect(
      adapter.index({
        resource: "tasks",
        documents: [{ id: "1", fields: { title: "hello" } }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "DFQL_ABORTED" });
    await adapter.dispose();
  });

  it("throws DFQL_ABORTED when searchAll signal is aborted", async () => {
    const adapter = new IndexedDbAdapter({ dbName: freshDbName() });
    await adapter.index({
      resource: "tasks",
      documents: [{ id: "1", fields: { title: "hello report" } }],
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.searchAll({
        query: "report",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "DFQL_ABORTED" });

    await adapter.dispose();
  });
});

describe("IndexedDbAdapter — prefix search", () => {
  // TV-IDB-001: prefix: true matches partial terms
  it("TV-IDB-001: prefix: true finds documents matching partial query", async () => {
    const adapter = new IndexedDbAdapter({ dbName: freshDbName() });
    try {
      await adapter.index({
        resource: "r",
        documents: [{ id: "1", fields: { text: "testing" } }],
      });
      const result = await adapter.search({
        resource: "r",
        query: "test",
        prefix: true,
      });
      expect(result).toContain("1");
    } finally {
      await adapter.dispose();
    }
  });

  // TV-IDB-002: construct-time defaults.prefix applied
  it("TV-IDB-002: construct-time defaults.prefix applied when param omitted", async () => {
    const adapter = new IndexedDbAdapter({ dbName: freshDbName(), defaults: { prefix: true } });
    try {
      await adapter.index({
        resource: "r",
        documents: [{ id: "1", fields: { text: "hello world" } }],
      });
      const result = await adapter.search({
        resource: "r",
        query: "hel",
      });
      expect(result).toContain("1");
    } finally {
      await adapter.dispose();
    }
  });

  it("TV-IDB-CAP: capabilities include prefix: true", () => {
    const adapter = new IndexedDbAdapter();
    expect(adapter.capabilities.prefix).toBe(true);
  });
});
