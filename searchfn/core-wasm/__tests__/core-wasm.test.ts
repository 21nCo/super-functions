import { describe, expect, it } from "vitest";
import {
  DocumentStatsManager,
  IndexedDbManager,
  LruCache,
  TsSearchCoreEngine,
  type TermCacheValue,
  type VectorCacheValue
} from "@searchfn/core";
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

  it("matches TypeScript query ranking for boosted and prefix-sensitive scoring", async () => {
    const wasmDeps = createFactoryOptions(`core-wasm-${crypto.randomUUID()}`);
    const tsDeps = createFactoryOptions(`core-ts-${crypto.randomUUID()}`);
    await Promise.all([wasmDeps.storage.open(), tsDeps.storage.open()]);

    try {
      const wasmEngine = await createSearchCoreEngine(wasmDeps);
      const tsEngine = new TsSearchCoreEngine(tsDeps);

      wasmDeps.stats.addDocument("doc-1", 4);
      wasmDeps.stats.addDocument("doc-2", 4);
      tsDeps.stats.addDocument("doc-1", 4);
      tsDeps.stats.addDocument("doc-2", 4);

      const encoded = wasmEngine.encodePostings({
        postings: [
          { docId: "doc-1", termFrequency: 1 },
          { docId: "doc-2", termFrequency: 2, metadata: { isPrefix: true } }
        ]
      });

      await Promise.all([
        wasmDeps.storage.putTermChunk({
          key: { field: "title", term: "hello", chunk: 0 },
          payload: encoded.payload,
          encoding: encoded.encoding,
          docFrequency: encoded.docFrequency
        }),
        tsDeps.storage.putTermChunk({
          key: { field: "title", term: "hello", chunk: 0 },
          payload: encoded.payload,
          encoding: encoded.encoding,
          docFrequency: encoded.docFrequency
        })
      ]);

      const tokens = [{ field: "title", term: "hello", boost: 0.8 }];
      const [wasmResult, tsResult] = await Promise.all([
        wasmEngine.executeQuery({ tokens, limit: 5 }),
        tsEngine.executeQuery({ tokens, limit: 5 })
      ]);

      expect(wasmResult.documents.map((document) => document.docId)).toEqual(
        tsResult.documents.map((document) => document.docId)
      );
      expect(wasmResult.documents).toHaveLength(tsResult.documents.length);
      for (const [index, document] of wasmResult.documents.entries()) {
        expect(document.score).toBeCloseTo(tsResult.documents[index]?.score ?? 0, 10);
      }
    } finally {
      await Promise.all([
        wasmDeps.storage.close().then(() => wasmDeps.storage.deleteDatabase()),
        tsDeps.storage.close().then(() => tsDeps.storage.deleteDatabase())
      ]);
    }
  });

  it("normalizes fractional term frequencies before encoding through Rust", async () => {
    const { storage, termCache, vectorCache, stats } = createFactoryOptions();
    await storage.open();

    try {
      const engine = await createSearchCoreEngine({
        storage,
        termCache,
        vectorCache,
        stats
      });

      const encoded = engine.encodePostings({
        postings: [{ docId: "doc-1", termFrequency: 1.5 }]
      });

      expect(
        engine.decodePostings({
          chunk: {
            key: { field: "title", term: "hello", chunk: 0 },
            payload: encoded.payload,
            encoding: encoded.encoding,
            docFrequency: encoded.docFrequency
          }
        })
      ).toEqual([{ docId: "doc-1", termFrequency: 1 }]);
    } finally {
      await storage.close();
      await storage.deleteDatabase();
    }
  });
});
