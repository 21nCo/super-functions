import {
  TsSearchCoreEngine,
  encodeTermPostings,
  type DocumentStatsProvider,
  type IndexedDbManager,
  type LruCache,
  type Pipeline,
  type SearchCoreEngine,
  type TermCacheValue,
  type TermPosting,
  type VectorCacheValue
} from "@searchfn/core";

export const abiVersion = 1;

export interface SearchCoreEngineFactoryOptions {
  storage: IndexedDbManager;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  stats: DocumentStatsProvider;
  pipeline?: Pipeline;
}

export async function createSearchCoreEngine(
  options: SearchCoreEngineFactoryOptions
): Promise<SearchCoreEngine> {
  const delegate = new TsSearchCoreEngine({
    storage: options.storage,
    termCache: options.termCache,
    vectorCache: options.vectorCache,
    stats: options.stats,
    pipeline: options.pipeline
  });

  return {
    kind: "wasm",
    ingest: (record) => delegate.ingest(record),
    ingestBatch: (records) => delegate.ingestBatch(records),
    encodePostings: (input) => {
      const encoded = encodeTermPostings(input.postings);
      return {
        payload: encoded.buffer.buffer.slice(
          encoded.buffer.byteOffset,
          encoded.buffer.byteOffset + encoded.buffer.byteLength
        ) as ArrayBuffer,
        encoding: encoded.encoding,
        docFrequency: input.postings.length,
        inverseDocumentFrequency: undefined
      };
    },
    decodePostings: (input) => delegate.decodePostings(input),
    executeQuery: (input) => delegate.executeQuery(input),
    selfTest: async () => {
      const encoded = encodeTermPostings([
        { docId: "__searchfn_wasm_self_test__", termFrequency: 1 }
      ]);
      const decoded = delegate.decodePostings({
        chunk: {
          key: { field: "__self_test__", term: "__self_test__", chunk: 0 },
          payload: encoded.buffer.buffer.slice(
            encoded.buffer.byteOffset,
            encoded.buffer.byteOffset + encoded.buffer.byteLength
          ) as ArrayBuffer,
          encoding: encoded.encoding,
          docFrequency: 1
        }
      });
      assertSelfTestResult(decoded);
    }
  };
}

function assertSelfTestResult(postings: TermPosting[]): void {
  if (
    postings.length !== 1 ||
    postings[0]?.docId !== "__searchfn_wasm_self_test__" ||
    postings[0]?.termFrequency !== 1
  ) {
    throw new Error("SearchFn WASM engine self-test failed.");
  }
}
