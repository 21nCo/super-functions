import { describe, it, expect, beforeEach } from "vitest";
import { SearchFn } from "../src/search-engine";
import { createTestEngine } from "./helpers/test-utils";

describe("Batched Persistence", () => {
  let engine: SearchFn;

  beforeEach(async () => {
    engine = createTestEngine({
      fields: ["title", "body"]
    });
    await engine.clear();
  });

  it("add() with persist: false defers persistence", async () => {
    // Add documents without persisting
    await engine.add(
      { id: "1", fields: { title: "First document", body: "test content" } },
      { persist: false }
    );
    await engine.add(
      { id: "2", fields: { title: "Second document", body: "test content" } },
      { persist: false }
    );

    // Documents should be searchable in memory (even without persistence)
    const results = await engine.search("document");
    expect(results).toHaveLength(2);

    // Flush to persist
    await engine.flush();

    // Should still work after flush
    const afterFlush = await engine.search("document");
    expect(afterFlush).toHaveLength(2);
  });

  it("flush() is idempotent", async () => {
    await engine.add(
      { id: "1", fields: { title: "Test" } },
      { persist: false }
    );

    await engine.flush();
    await engine.flush(); // Second flush should not error
    await engine.flush(); // Third flush should not error

    const results = await engine.search("test");
    expect(results).toHaveLength(1);
  });

  it("flush() with no changes does nothing", async () => {
    // Flush on empty engine
    await engine.flush();

    // Add and persist normally
    await engine.add({ id: "1", fields: { title: "Test" } });

    // Flush again with no pending changes
    await engine.flush();

    const results = await engine.search("test");
    expect(results).toHaveLength(1);
  });

  it("stores documents in pendingDocuments queue when persist: false", async () => {
    await engine.add(
      {
        id: "1",
        fields: { title: "Test" },
        store: { url: "/test" }
      },
      { persist: false }
    );

    // Document should not be persisted yet
    await engine.flush();

    const doc = await engine.getDocument("1");
    expect(doc).toEqual({ url: "/test" });
  });

  it("batches multiple document store operations", async () => {
    const docs = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      fields: { title: `Document ${i}`, body: "test" },
      store: { index: i }
    }));

    for (const doc of docs) {
      await engine.add(doc, { persist: false });
    }

    await engine.flush();

    // Verify all documents are searchable (specify high limit)
    const results = await engine.search("document", { limit: 200 });
    expect(results).toHaveLength(100);

    // Verify stored data
    const stored = await engine.getDocument("doc-50");
    expect(stored).toEqual({ index: 50 });
  });

  it("default behavior persists immediately (backward compatibility)", async () => {
    await engine.add({ id: "1", fields: { title: "Test" } });

    // Should be searchable immediately without flush
    const results = await engine.search("test");
    expect(results).toHaveLength(1);
  });

  it("mixed persist and non-persist operations work correctly", async () => {
    // Immediate persist
    await engine.add({ id: "1", fields: { title: "First" } });

    // Deferred persist
    await engine.add(
      { id: "2", fields: { title: "Second" } },
      { persist: false }
    );

    // Immediate persist
    await engine.add({ id: "3", fields: { title: "Third" } });

    // Flush pending
    await engine.flush();

    const results = await engine.search("first second third");
    expect(results).toHaveLength(3);
  });
});

describe("Bulk Add API", () => {
  let engine: SearchFn;

  beforeEach(async () => {
    engine = createTestEngine({
      fields: ["title"]
    });
    await engine.clear();
  });

  it("addBulk() indexes multiple documents", async () => {
    const docs = Array.from({ length: 50 }, (_, i) => ({
      id: `doc-${i}`,
      fields: { title: `Document ${i}` }
    }));

    await engine.addBulk(docs);

    const results = await engine.search("document", { limit: 100 });
    expect(results).toHaveLength(50);
  });

  it("addBulk() calls progress callback", async () => {
    const docs = Array.from({ length: 2500 }, (_, i) => ({
      id: `doc-${i}`,
      fields: { title: `Test ${i}` }
    }));

    const progressCalls: Array<{ indexed: number; total: number }> = [];

    await engine.addBulk(docs, {
      batchSize: 1000,
      onProgress: (indexed, total) => {
        progressCalls.push({ indexed, total });
      }
    });

    // Should have been called at 1000, 2000, and 2500 (final)
    expect(progressCalls.length).toBe(3);
    expect(progressCalls[0]).toEqual({ indexed: 1000, total: 2500 });
    expect(progressCalls[1]).toEqual({ indexed: 2000, total: 2500 });
    expect(progressCalls[2]).toEqual({ indexed: 2500, total: 2500 });
  });

  it("addBulk() produces same results as individual adds", async () => {
    const docs = [
      { id: "1", fields: { title: "Alpha" } },
      { id: "2", fields: { title: "Beta" } },
      { id: "3", fields: { title: "Gamma" } }
    ];

    // Create two engines
    const engine1 = createTestEngine({ fields: ["title"] });
    const engine2 = createTestEngine({ fields: ["title"] });

    await engine1.clear();
    await engine2.clear();

    // Engine 1: individual adds
    for (const doc of docs) {
      await engine1.add(doc);
    }

    // Engine 2: bulk add
    await engine2.addBulk(docs);

    // Compare results
    const results1 = await engine1.search("alpha beta gamma");
    const results2 = await engine2.search("alpha beta gamma");

    expect(results1.sort()).toEqual(results2.sort());

    await engine1.destroy();
    await engine2.destroy();
  });

  it("addBulk() with empty array does nothing", async () => {
    await engine.addBulk([]);

    const results = await engine.search("anything");
    expect(results).toHaveLength(0);
  });
});

describe("Stats and Vocabulary Persistence", () => {
  it("persists and loads stats within same session", async () => {
    const engine = createTestEngine({ fields: ["title"] });
    await engine.clear();

    await engine.add(
      { id: "1", fields: { title: "Test document" } },
      { persist: false }
    );
    await engine.flush();

    // Should be searchable after flush
    const results = await engine.search("test");
    expect(results).toHaveLength(1);
  });

  it("persists and loads vocabulary within same session", async () => {
    const engine = createTestEngine({ fields: ["title"] });
    await engine.clear();

    await engine.add(
      { id: "1", fields: { title: "unique term" } },
      { persist: false }
    );
    await engine.flush();

    // Should be searchable after flush
    const results = await engine.search("unique");
    expect(results).toHaveLength(1);
  });
});
