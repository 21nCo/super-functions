import type { StorageInitOptions } from "../types";

export const DEFAULT_CHUNK_SIZE = 256;

export const DEFAULT_STORAGE_OPTIONS: Pick<
  StorageInitOptions,
  "version" | "chunkSize"
> = {
  version: 1,
  chunkSize: DEFAULT_CHUNK_SIZE
};

export const STORE_NAMES = {
  metadata: "metadata",
  terms: "terms",
  vectors: "vectors",
  documents: "documents",
  cacheState: "cacheState"
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];
