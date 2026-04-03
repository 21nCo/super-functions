import type { LruCache, TermCacheValue, TermPosting, VectorCacheValue } from "../cache";
import type { IndexingInputRecord, IngestedDocument } from "../indexing/indexer";
import type {
  DocumentStatsProvider,
  QueryStorage,
  QueryToken,
  RetrievedPostingChunk,
  ScoredDocument
} from "../query";
import type { ChunkEncodeResult, StoredPostingChunk } from "../types";
import type { Pipeline } from "../pipeline";

export interface EngineEncodePostingsInput {
  postings: TermPosting[];
}

export interface EngineDecodePostingsInput {
  chunk: StoredPostingChunk;
}

export interface EngineExecuteQueryInput {
  tokens: QueryToken[];
  limit?: number;
}

export interface EngineQueryResult {
  documents: ScoredDocument[];
  postings: RetrievedPostingChunk[];
}

export interface SearchCoreEngine {
  readonly kind: "ts" | "wasm";

  ingest(record: IndexingInputRecord): IngestedDocument;
  ingestBatch(records: IndexingInputRecord[]): IngestedDocument[];
  encodePostings(input: EngineEncodePostingsInput): {
    payload: ArrayBuffer;
    encoding: ChunkEncodeResult["encoding"];
    docFrequency: number;
    inverseDocumentFrequency?: number;
  };
  decodePostings(input: EngineDecodePostingsInput): TermPosting[];
  executeQuery(input: EngineExecuteQueryInput): Promise<EngineQueryResult>;
}

export interface TsSearchCoreEngineOptions {
  storage: QueryStorage;
  termCache: LruCache<TermCacheValue>;
  vectorCache: LruCache<VectorCacheValue>;
  stats: DocumentStatsProvider;
  pipeline?: Pipeline;
}
