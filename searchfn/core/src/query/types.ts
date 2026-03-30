import type { DocId } from "../types";
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

export interface DocumentStatsProvider {
  getLength(docId: DocId): number | undefined;
  getAverageLength(): number;
}
