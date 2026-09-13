import { describe, expect, it } from "vitest";

import { DbVectorStore, Embeddings } from "../src/rag/index.js";
import { getTransportClient } from "../src/models/transport.js";
import {
  createChatCacheKey,
  createCompletionCacheKey,
  createEmbeddingCacheKey,
  createRetrieverCacheKey
} from "../src/utils/cache-keys.js";
import { mapWithConcurrency } from "../src/utils/concurrency.js";

class FakeEmbeddings extends Embeddings {
  async embedQuery(text: string): Promise<number[]> {
    return vectorize(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => vectorize(text));
  }
}

describe("performance and scaling", () => {
  it("reuses pooled transport clients for equivalent configs", () => {
    const fetchImpl = async () => new Response(null, { status: 204 });
    const left = getTransportClient({
      baseUrl: "https://api.example.com/",
      headers: { b: "2", a: "1" },
      timeout: 1000,
      fetchImpl
    });
    const right = getTransportClient({
      baseUrl: "https://api.example.com",
      headers: new Headers({ a: "1", b: "2" }),
      timeout: 1000,
      fetchImpl
    });

    expect(left).toBe(right);
  });

  it("derives stable cache keys across metadata ordering and request types", async () => {
    await expect(
      createCompletionCacheKey({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "hello",
        metadata: { z: 1, a: { y: true, x: 1 } }
      })
    ).resolves.toBe(
      await createCompletionCacheKey({
        provider: "openai",
        model: "gpt-4o-mini",
        prompt: "hello",
        metadata: { a: { x: 1, y: true }, z: 1 }
      })
    );

    await expect(
      createChatCacheKey({
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        metadata: { nested: { b: 2, a: 1 } }
      })
    ).resolves.toBeTruthy();
    await expect(
      createEmbeddingCacheKey({
        provider: "openai",
        model: "text-embedding-3-small",
        inputs: ["a", "b"]
      })
    ).resolves.toBeTruthy();
    await expect(
      createRetrieverCacheKey({
        query: "paris",
        namespace: "docs",
        filter: { source: "wiki" },
        options: { k: 4 }
      })
    ).resolves.toBeTruthy();
  });

  it("preserves ordering while enforcing bounded concurrency", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 10, 20], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(delay);
      active -= 1;
      return index;
    });

    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toEqual([0, 1, 2]);
  });

  it("paginates reference retrieval past the first 100 rows", async () => {
    const offsets: number[] = [];
    const records = Array.from({ length: 140 }, (_, index) => ({
      id: `doc-${index}`,
      content: index === 120 ? "Paris is the capital of France." : `filler-${index}`,
      embedding: vectorize(index === 120 ? "Paris is the capital of France." : `filler-${index}`),
      metadata: { source: "wiki" },
      namespace: "default",
      createdAt: index
    }));
    const db = {
      async createMany() {
        return [];
      },
      async findMany(params: { limit?: number; offset?: number }) {
        const offset = params.offset ?? 0;
        const limit = params.limit ?? records.length;
        offsets.push(offset);
        return records.slice(offset, offset + limit);
      }
    } as any;

    const store = new DbVectorStore(db, new FakeEmbeddings(), {
      mode: "reference",
      pageSize: 50,
      maxScan: 150
    });
    const result = await store.search("Tell me about Paris", { k: 1, filter: { source: "wiki" } });

    expect(offsets).toEqual([0, 50, 100]);
    expect(result[0]?.content).toContain("Paris");
  });
});

function vectorize(text: string): number[] {
  const normalized = text.toLowerCase();
  return [normalized.includes("paris") ? 1 : 0, normalized.length];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
