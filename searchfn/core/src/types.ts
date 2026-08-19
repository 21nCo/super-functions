export type DocId = string | number;
export type PostingChunkEncoding = "delta-varint" | "json" | "posting-bin-v1";

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
  encoding?: PostingChunkEncoding;
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

export interface ChunkEncodeResult {
  buffer: Uint8Array;
  encoding: PostingChunkEncoding;
}

export interface ChunkDecodeResult {
  postings: Array<number | string | Record<string, unknown>>;
  encoding: PostingChunkEncoding;
}
