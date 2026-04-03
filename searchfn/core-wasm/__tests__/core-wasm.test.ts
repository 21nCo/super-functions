import { describe, expect, it } from "vitest";
import { DocumentStatsManager, IndexedDbManager, LruCache, type TermCacheValue, type VectorCacheValue } from "@searchfn/core";
import { abiVersion, createSearchCoreEngine } from "../src/index";

function createFactoryOptions(dbName = `core-wasm-${crypto.randomUUID()}`) {
  const storage = new IndexedDbManager({ dbName, version: 1 });
  const termCache = new LruCache<TermCacheValue>({ maxEntries: 32 });
  const vectorCache = new LruCache<VectorCacheValue>({ maxEntries: 8 });
  const stats = new DocumentStatsManager();

  return { storage, termCache, vectorCache, stats };
}

describe("@searchfn/core-wasm", () => {
  it("exports the expected ABI version", () => {
    expect(abiVersion).toBe(1);
  });

  it("creates a wasm-tagged engine that passes self-test and executes queries", async () => {
    const { storage, termCache, vectorCache, stats } = createFactoryOptions();
    await storage.open();

    try {
      const engine = await createSearchCoreEngine({
        storage,
        termCache,
        vectorCache,
        stats
      });

      expect(engine.kind).toBe("wasm");
      await engine.selfTest?.();

      stats.addDocument("doc-1", 4);
      const encoded = engine.encodePostings({
        postings: [{ docId: "doc-1", termFrequency: 2 }]
      });
      expect(encoded.encoding).toBe("posting-bin-v1");

      await storage.putTermChunk({
        key: { field: "title", term: "hello", chunk: 0 },
        payload: encoded.payload,
        encoding: encoded.encoding,
        docFrequency: encoded.docFrequency
      });

      const result = await engine.executeQuery({
        tokens: [{ field: "title", term: "hello", boost: 1 }],
        limit: 5
      });

      expect(result.documents.map((document) => document.docId)).toEqual(["doc-1"]);
    } finally {
      await storage.close();
      await storage.deleteDatabase();
    }
  });
});
