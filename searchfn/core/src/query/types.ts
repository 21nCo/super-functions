import type { DocId, ChunkDecodeResult, StoredPostingChunk, TermIdentifier } from "../types";
import type { TermPosting } from "../cache";

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

export interface QueryScoringOptions {
  k1?: number;
  b?: number;
  d?: number;
}

export interface QueryScoringInput {
  chunks: RetrievedPostingChunk[];
  documentLengths: Map<DocId, number>;
  averageDocLength: number;
  options?: QueryScoringOptions;
  limit?: number;
}

export type QueryDocumentScorer = (
  input: QueryScoringInput
) => ScoredDocument[] | Promise<ScoredDocument[]>;

export interface QueryStorage {
  getTermChunk(key: TermIdentifier): Promise<StoredPostingChunk | undefined>;
  decodeChunkPayload(chunk: StoredPostingChunk): ChunkDecodeResult;
}

export interface DocumentStatsProvider {
  getLength(docId: DocId): number | undefined;
  getAverageLength(): number;
}
