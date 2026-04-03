import { describe, expect, it, vi } from "vitest";
import { DocumentStatsManager } from "../src/query/document-stats";
import { IndexedDbManager } from "../src/storage";
import { LruCache } from "../src/cache";
import { TsSearchCoreEngine } from "../src/engine";
import type { StoredPostingChunk, TermCacheValue, VectorCacheValue } from "../src";

function createEngine(dbName = `ts-search-core-engine-${crypto.randomUUID()}`) {
  const storage = new IndexedDbManager({ dbName, version: 1 });
  const termCache = new LruCache<TermCacheValue>({ maxEntries: 32 });
  const vectorCache = new LruCache<VectorCacheValue>({ maxEntries: 8 });
  const stats = new DocumentStatsManager();
  const engine = new TsSearchCoreEngine({
    storage,
    termCache,
    vectorCache,
    stats,
  });

  return { storage, stats, engine };
}

describe("TsSearchCoreEngine", () => {
  it("round-trips encoded postings through the legacy JSON-backed chunk format", async () => {
    const { storage, engine } = createEngine();
    await storage.open();

    try {
      const encoded = engine.encodePostings({
        postings: [
          { docId: "doc-1", termFrequency: 2, metadata: { isPrefix: true } },
          { docId: "doc-2", termFrequency: 1 },
        ],
      });

      const chunk: StoredPostingChunk = {
        key: { field: "title", term: "hello", chunk: 0 },
        payload: encoded.payload,
        encoding: encoded.encoding,
        docFrequency: encoded.docFrequency,
        inverseDocumentFrequency: encoded.inverseDocumentFrequency,
      };

      expect(engine.decodePostings({ chunk })).toEqual([
        { docId: "doc-1", termFrequency: 2, metadata: { isPrefix: true } },
        { docId: "doc-2", termFrequency: 1 },
      ]);
    } finally {
      await storage.close();
      await storage.deleteDatabase();
    }
  });

  it("drops malformed legacy postings while normalizing valid legacy shapes", async () => {
    const { storage, engine } = createEngine();
    const decodeChunkPayload = vi.spyOn(storage, "decodeChunkPayload").mockReturnValue({
      encoding: "json",
      postings: [
        "plain-doc-id",
        42,
        JSON.stringify({ docId: "json-doc", termFrequency: 0 }),
        JSON.stringify({ docId: { nested: true } }),
        { docId: "object-doc", termFrequency: Number.NaN },
        { docId: 7, termFrequency: 2 },
        { termFrequency: 3 },
      ]
    });

    try {
      const chunk: StoredPostingChunk = {
        key: { field: "title", term: "legacy", chunk: 0 },
        payload: new Uint8Array(0).buffer,
        encoding: "json",
        docFrequency: 6
      };

      expect(engine.decodePostings({ chunk })).toEqual([
        { docId: "plain-doc-id", termFrequency: 1 },
        { docId: "42", termFrequency: 1 },
        { docId: "json-doc", termFrequency: 1 },
        { docId: "object-doc", termFrequency: 1 },
        { docId: "7", termFrequency: 2 }
      ]);
      expect(decodeChunkPayload).toHaveBeenCalledWith(chunk);
    } finally {
      decodeChunkPayload.mockRestore();
    }
  });

  it("executes queries through the delegated query engine", async () => {
    const { storage, stats, engine } = createEngine();
    await storage.open();

    try {
      stats.addDocument("doc-1", 4);
      stats.addDocument("doc-2", 10);

      const encoded = engine.encodePostings({
        postings: [
          { docId: "doc-1", termFrequency: 3 },
          { docId: "doc-2", termFrequency: 1 },
        ],
      });

      const chunk: StoredPostingChunk = {
        key: { field: "title", term: "hello", chunk: 0 },
        payload: encoded.payload,
        encoding: encoded.encoding,
        docFrequency: encoded.docFrequency,
      };

      await storage.putTermChunk(chunk);

      const result = await engine.executeQuery({
        tokens: [{ field: "title", term: "hello", boost: 1 }],
        limit: 5,
      });

      expect(result.documents.map((document) => document.docId)).toEqual(["doc-1", "doc-2"]);
      expect(result.postings).toHaveLength(1);
      expect(result.postings[0]?.postings).toEqual([
        { docId: "doc-1", termFrequency: 3 },
        { docId: "doc-2", termFrequency: 1 },
      ]);
    } finally {
      await storage.close();
      await storage.deleteDatabase();
    }
  });
});
