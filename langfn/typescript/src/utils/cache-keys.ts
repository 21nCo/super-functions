import { secureSha256Hex } from "./random.js";

export interface CompletionCacheKeyInput {
  provider: string;
  model: string;
  prompt: string;
  metadata?: Record<string, unknown>;
  namespace?: string;
}

export interface ChatCacheKeyInput {
  provider: string;
  model: string;
  messages: unknown[];
  metadata?: Record<string, unknown>;
  namespace?: string;
}

export interface EmbeddingCacheKeyInput {
  provider: string;
  model: string;
  inputs: string[];
  metadata?: Record<string, unknown>;
  namespace?: string;
}

export interface RetrieverCacheKeyInput {
  provider?: string;
  model?: string;
  query: string;
  namespace?: string;
  filter?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeValue(value: unknown): CanonicalValue | undefined {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry) ?? null);
  }
  if (typeof value === "object") {
    const normalized: Record<string, CanonicalValue> = {};
    // Canonical keys use UTF-16 code-unit order, independent of host locale.
    for (const key of Object.keys(value as Record<string, unknown>).sort((a, b) => a < b ? -1 : a > b ? 1 : 0)) {
      const next = normalizeValue((value as Record<string, unknown>)[key]);
      if (next !== undefined) {
        normalized[key] = next;
      }
    }
    return normalized;
  }
  return undefined;
}

export function stableSerializeCachePayload(value: unknown): string {
  return JSON.stringify(normalizeValue(value) ?? null);
}

async function buildCacheKey(kind: string, payload: unknown): Promise<string> {
  const normalizedPayload =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : { value: payload };
  return await secureSha256Hex(
    stableSerializeCachePayload({
      version: 1,
      kind,
      ...normalizedPayload
    })
  );
}

export async function createCompletionCacheKey(input: CompletionCacheKeyInput): Promise<string> {
  return await buildCacheKey("completion", input);
}

export async function createChatCacheKey(input: ChatCacheKeyInput): Promise<string> {
  return await buildCacheKey("chat", input);
}

export async function createEmbeddingCacheKey(input: EmbeddingCacheKeyInput): Promise<string> {
  return await buildCacheKey("embedding", input);
}

export async function createRetrieverCacheKey(input: RetrieverCacheKeyInput): Promise<string> {
  return await buildCacheKey("retriever", input);
}
