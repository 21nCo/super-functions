import { describe, expect, it, vi } from "vitest";
import { LruCache } from "../src/cache";
import { QueryEngine } from "../src/query";
import { DocumentStatsManager } from "../src/query/document-stats";
import { IndexedDbManager } from "../src/storage";
import type { TermCacheValue, VectorCacheValue } from "../src/cache";

function createQueryEngine(dbName = `query-engine-${crypto.randomUUID()}`) {
  const storage = new IndexedDbManager({ dbName, version: 1 });
  const termCache = new LruCache<TermCacheValue>({ maxEntries: 32 });
  const vectorCache = new LruCache<VectorCacheValue>({ maxEntries: 8 });
  const stats = new DocumentStatsManager();

  return { storage, termCache, vectorCache, stats };
}

describe("QueryEngine", () => {
  it("supports injected chunk decoders and scorers", async () => {
    const { storage, termCache, vectorCache, stats } = createQueryEngine();
    await storage.open();

    const decodeChunk = vi.fn(() => [{ docId: "doc-1", termFrequency: 2 }]);
    const scoreDocuments = vi.fn((input) => {
      expect(input.averageDocLength).toBe(4);
      expect(input.documentLengths.get("doc-1")).toBe(4);
      expect(input.chunks).toEqual([
        {
          field: "title",
          term: "hello",
          chunk: 0,
          postings: [{ docId: "doc-1", termFrequency: 2 }],
          docFrequency: 1,
          inverseDocumentFrequency: undefined
        }
      ]);

      return [{ docId: "doc-1", score: 42 }];
    });

    const queryEngine = new QueryEngine({
      storage,
      termCache,
      vectorCache,
      stats,
      decodeChunk,
      scoreDocuments
    });

    try {
      stats.addDocument("doc-1", 4);
      await storage.putTermChunk({
        key: { field: "title", term: "hello", chunk: 0 },
        payload: new Uint8Array(0).buffer,
        encoding: "json",
        docFrequency: 1
      });

      const result = await queryEngine.execute([
        { field: "title", term: "hello", boost: 1 }
      ]);

      expect(result.documents).toEqual([{ docId: "doc-1", score: 42 }]);
      expect(decodeChunk).toHaveBeenCalledTimes(1);
      expect(scoreDocuments).toHaveBeenCalledTimes(1);
    } finally {
      await storage.close();
      await storage.deleteDatabase();
    }
  });
});
