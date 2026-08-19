import { describe, expect, it } from "vitest";
import {
  decodePostings,
  DocumentStatsManager,
  LruCache,
  TsSearchCoreEngine,
  type QueryStorage,
  type StoredPostingChunk,
  type TermCacheValue,
  type TermIdentifier,
  type VectorCacheValue,
} from "@searchfn/core";
import { abiVersion, createSearchCoreEngine } from "../src/index";

type MutableQueryStorage = QueryStorage & {
  putTermChunk(chunk: StoredPostingChunk): Promise<void>;
};

function createQueryStorage(): MutableQueryStorage {
  const chunks = new Map<string, StoredPostingChunk>();
  return {
    async getTermChunk(key: TermIdentifier) {
      return chunks.get(termKey(key));
    },
    decodeChunkPayload(chunk: StoredPostingChunk) {
      return decodePostings(chunk.payload, chunk.encoding ?? "delta-varint");
    },
    async putTermChunk(chunk: StoredPostingChunk) {
      chunks.set(termKey(chunk.key), chunk);
    },
  };
}

function termKey(key: TermIdentifier) {
  return `${key.field}:${key.term}:${key.chunk}`;
}

function createFactoryOptions() {
  const storage = createQueryStorage();
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
    const engine = await createSearchCoreEngine({
      storage,
      termCache,
      vectorCache,
      stats,
    });

    expect(engine.kind).toBe("wasm");
    await engine.selfTest?.();

    stats.addDocument("doc-1", 4);
    const encoded = engine.encodePostings({
      postings: [{ docId: "doc-1", termFrequency: 2 }],
    });
    expect(encoded.encoding).toBe("posting-bin-v1");

    await storage.putTermChunk({
      key: { field: "title", term: "hello", chunk: 0 },
      payload: encoded.payload,
      encoding: encoded.encoding,
      docFrequency: encoded.docFrequency,
    });

    const result = await engine.executeQuery({
      tokens: [{ field: "title", term: "hello", boost: 1 }],
      limit: 5,
    });

    expect(result.documents.map((document) => document.docId)).toEqual([
      "doc-1",
    ]);
  });

  it("matches TypeScript query ranking for boosted and prefix-sensitive scoring", async () => {
    const wasmDeps = createFactoryOptions();
    const tsDeps = createFactoryOptions();

    const wasmEngine = await createSearchCoreEngine(wasmDeps);
    const tsEngine = new TsSearchCoreEngine(tsDeps);

    wasmDeps.stats.addDocument("doc-1", 4);
    wasmDeps.stats.addDocument("doc-2", 4);
    tsDeps.stats.addDocument("doc-1", 4);
    tsDeps.stats.addDocument("doc-2", 4);

    const encoded = wasmEngine.encodePostings({
      postings: [
        { docId: "doc-1", termFrequency: 1 },
        { docId: "doc-2", termFrequency: 2, metadata: { isPrefix: true } },
      ],
    });

    await Promise.all([
      wasmDeps.storage.putTermChunk({
        key: { field: "title", term: "hello", chunk: 0 },
        payload: encoded.payload,
        encoding: encoded.encoding,
        docFrequency: encoded.docFrequency,
      }),
      tsDeps.storage.putTermChunk({
        key: { field: "title", term: "hello", chunk: 0 },
        payload: encoded.payload,
        encoding: encoded.encoding,
        docFrequency: encoded.docFrequency,
      }),
    ]);

    const tokens = [{ field: "title", term: "hello", boost: 0.8 }];
    const [wasmResult, tsResult] = await Promise.all([
      wasmEngine.executeQuery({ tokens, limit: 5 }),
      tsEngine.executeQuery({ tokens, limit: 5 }),
    ]);

    expect(wasmResult.documents.map((document) => document.docId)).toEqual(
      tsResult.documents.map((document) => document.docId),
    );
    expect(wasmResult.documents).toHaveLength(tsResult.documents.length);
    for (const [index, document] of wasmResult.documents.entries()) {
      expect(document.score).toBeCloseTo(
        tsResult.documents[index]?.score ?? 0,
        10,
      );
    }
  });

  it("normalizes fractional term frequencies before encoding through Rust", async () => {
    const { storage, termCache, vectorCache, stats } = createFactoryOptions();
    const engine = await createSearchCoreEngine({
      storage,
      termCache,
      vectorCache,
      stats,
    });

    const encoded = engine.encodePostings({
      postings: [{ docId: "doc-1", termFrequency: 1.5 }],
    });

    expect(
      engine.decodePostings({
        chunk: {
          key: { field: "title", term: "hello", chunk: 0 },
          payload: encoded.payload,
          encoding: encoded.encoding,
          docFrequency: encoded.docFrequency,
        },
      }),
    ).toEqual([{ docId: "doc-1", termFrequency: 1 }]);
  });
});
