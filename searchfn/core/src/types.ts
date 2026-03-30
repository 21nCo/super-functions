export type DocId = string | number;

export interface TermIdentifier {
  field: string;
  term: string;
  chunk: number;
}

export interface StoredPostingChunk {
  key: TermIdentifier;
  /**
   * Binary payload representing encoded postings. Typically produced by
   * the chunk serializer (delta encoded numeric IDs or JSON fallback).
   */
  payload: ArrayBuffer;
  /**
   * Encoding hint so we can avoid additional lookups when decoding.
   */
  encoding?: "delta-varint" | "json";
  /**
   * Term frequency metadata for scoring heuristics.
   */
  docFrequency: number;
  /**
   * Cached inverse document frequency to speed up scoring. Optional.
   */
  inverseDocumentFrequency?: number;
  /**
   * Optional telemetry for cache heuristics.
   */
  accessCount?: number;
  lastAccessedAt?: number;
}

export interface DocumentVectorRecord {
  docId: DocId;
  field: string;
  /**
   * Sparse vector represented as alternating index/value pairs.
   */
  vector: ArrayBuffer;
  updatedAt: number;
}

export interface StoredDocumentRecord {
  docId: DocId;
  payload: Record<string, unknown>;
  updatedAt: number;
}

export interface MetadataRecord<TValue = unknown> {
  key: string;
  value: TValue;
  updatedAt: number;
}

export interface StorageInitOptions {
  dbName: string;
  version: number;
  chunkSize?: number;
}

export type TransactionMode = "readonly" | "readwrite";

export interface StorageLogger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
}

export interface ChunkEncodeResult {
  buffer: Uint8Array;
  encoding: "delta-varint" | "json";
}

export interface ChunkDecodeResult {
  postings: Array<number | string>;
  encoding: "delta-varint" | "json";
}
