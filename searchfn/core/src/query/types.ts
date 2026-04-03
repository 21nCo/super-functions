import type { DocId } from "../types";
import type { TermPosting } from "../cache";
import type { ChunkDecodeResult, StoredPostingChunk, TermIdentifier } from "../types";

export interface QueryToken {
  field: string;
  term: string;
  boost: number;
  fuzziness?: number;
}

export interface QueryOptions {
  limit?: number;
  suggest?: boolean;
}

export interface RetrievedPostingChunk {
  term: string;
  field: string;
  docFrequency: number;
  postings: TermPosting[];
  inverseDocumentFrequency?: number;
}

export interface ScoredDocument {
  docId: DocId;
  score: number;
}

export interface QueryStorage {
  getTermChunk(key: TermIdentifier): Promise<StoredPostingChunk | undefined>;
  decodeChunkPayload(chunk: StoredPostingChunk): ChunkDecodeResult;
}

export interface DocumentStatsProvider {
  getLength(docId: DocId): number | undefined;
  getAverageLength(): number;
}
