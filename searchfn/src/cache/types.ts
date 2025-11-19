import type { DocId } from "../types";

export interface CacheEntry<TValue> {
  key: string;
  value: TValue;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface CacheStatistics {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface CacheOptions {
  maxEntries: number;
}

export interface TermPosting {
  docId: DocId;
  termFrequency: number;
  metadata?: Record<string, unknown>;
}

export interface TermCacheValue {
  field: string;
  term: string;
  chunk: number;
  postings: TermPosting[];
  docFrequency: number;
  inverseDocumentFrequency?: number;
}

export interface VectorCacheValue {
  docId: DocId;
  field: string;
  vector: Float32Array;
  updatedAt: number;
}
