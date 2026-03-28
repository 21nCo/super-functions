import { normalizeDfql } from "@datafn/core";

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a32(data: Uint8Array): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

const encoder = new TextEncoder();

export function computeMutationHash(hashInput: Record<string, unknown>): string {
  const normalized = normalizeDfql(hashInput);
  const json = JSON.stringify(normalized);
  const bytes = encoder.encode(json);
  const hash = fnv1a32(bytes);
  return (hash >>> 0).toString(36);
}
