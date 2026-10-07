import { describe, expect, it, vi } from "vitest";

import { LangFn } from "../src/client.js";
import { NonProductionBackendError, ValidationError } from "../src/core/errors.js";
import { BufferMemory, SummaryMemory } from "../src/memory/index.js";
import { MockChatModel } from "../src/models/mock.js";
import {
  DbVectorStore,
  InMemoryVectorStore,
  MemoryFnRetriever,
  RetrievalChain,
  type Document,
  Embeddings
} from "../src/rag/index.js";

class FakeEmbeddings extends Embeddings {
  async embedQuery(text: string): Promise<number[]> {
    return vectorize(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => vectorize(text));
  }
}

describe("memory and rag", () => {
  it("retains newest buffer entries and validates caps", async () => {
    const memory = new BufferMemory({ maxMessages: 2 });
    await memory.extend([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" }
    ]);
    await expect(memory.get()).resolves.toEqual([
      { role: "assistant", content: "two" },
      { role: "user", content: "three" }
    ]);
    await memory.clear();
    await expect(memory.get()).resolves.toEqual([]);
    expect(() => new BufferMemory({ maxMessages: -1 })).toThrowError(ValidationError);
  });

  it("summarizes overflow deterministically and resets cleanly", async () => {
    const memory = new SummaryMemory(undefined, {
      maxMessages: 2,
      summarizer: async ({ existingSummary, messages }) =>
        [existingSummary, ...messages.map((message) => `${message.role}:${message.content}`)].filter(Boolean).join("|")
    });

    await memory.extend([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" }
    ]);

    expect(memory.getSummary()).toBe("user:one");
    await expect(memory.get()).resolves.toEqual([
      { role: "system", content: "Previous conversation summary: user:one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" }
    ]);

    await memory.clear();
    expect(memory.getSummary()).toBeUndefined();
    await expect(memory.get()).resolves.toEqual([]);
  });

  it("supports retriever-centric rag and memoryfn adapter paths", async () => {
    const store = new InMemoryVectorStore(new FakeEmbeddings());
    await store.addDocuments([
      { content: "Paris is the capital of France.", metadata: { source: "wiki" } },
      { content: "Berlin is the capital of Germany.", metadata: { source: "wiki" } }
    ]);

    const retrieved = await store.asRetriever({ k: 1, filter: { source: "wiki" } }).getRelevantDocuments("Tell me about Paris");
    expect(retrieved[0]?.content).toContain("Paris");

    const memoryfn = new MemoryFnRetriever({
      search: async () =>
        [
          { content: "Rome is in Italy.", metadata: { source: "wiki" }, score: 0.1 },
          { content: "Paris is the capital of France.", metadata: { source: "wiki" }, score: 0.9 }
        ] satisfies Document[]
    });

    const chain = new RetrievalChain({
      retriever: memoryfn,
      generator: async ({ documents }) => documents[0]?.content ?? ""
    });
    const result = await chain.run("Tell me about Paris");
    expect(result.retrieved[0]?.content).toContain("Paris");
    expect(result.answer).toContain("capital of France");

    const lang = new LangFn({ model: new MockChatModel({ responses: ["unused"] }) });
    const langChain = lang.createRagChain({
      retriever: memoryfn,
      generator: async ({ documents }) => documents.map((document) => document.content).join("\n")
    });
    await expect(langChain.run("Tell me about Paris")).resolves.toMatchObject({
      answer: expect.stringContaining("capital of France")
    });
  });

  it("rejects non-production db reranking in production mode", async () => {
    const records = [
      {
        content: "Paris is the capital of France.",
        embedding: vectorize("Paris is the capital of France."),
        metadata: { source: "wiki" },
        namespace: "default",
        createdAt: 1
      }
    ];
    const db = {
      async createMany() {
        return undefined;
      },
      async findMany() {
        return records;
      }
    } as any;

    const referenceStore = new DbVectorStore(db, new FakeEmbeddings(), { mode: "reference" });
    await expect(referenceStore.search("Tell me about Paris", { k: 1 })).resolves.toHaveLength(1);

    const productionStore = new DbVectorStore(db, new FakeEmbeddings(), { mode: "production" });
    await expect(productionStore.search("Tell me about Paris", { k: 1 })).rejects.toBeInstanceOf(
      NonProductionBackendError
    );
  });

  it("rejects production fallback before embedding the query", async () => {
    const embeddings = new FakeEmbeddings();
    const embedQuery = vi.spyOn(embeddings, "embedQuery");
    const store = new DbVectorStore({} as any, embeddings, { mode: "production" });

    await expect(store.search("must not be embedded")).rejects.toBeInstanceOf(NonProductionBackendError);
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it("uses a stable page order and honors maxScan below pageSize", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const records = Array.from({ length: 5 }, (_, index) => ({
      id: `doc-${index}`,
      content: `document ${index}`,
      embedding: [1, 0],
      metadata: {},
      namespace: "default",
      createdAt: index
    }));
    const db = {
      async findMany(input: Record<string, unknown>) {
        calls.push(input);
        const offset = Number(input.offset ?? 0);
        const limit = Number(input.limit ?? records.length);
        return records.slice(offset, offset + limit);
      }
    } as any;
    const store = new DbVectorStore(db, new FakeEmbeddings(), { pageSize: 5, maxScan: 2 });

    await expect(store.search("document", { k: 5 })).resolves.toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      limit: 2,
      offset: 0,
      orderBy: [
        { field: "createdAt", direction: "asc" },
        { field: "id", direction: "asc" }
      ]
    });
  });
});

function vectorize(text: string): number[] {
  const normalized = text.toLowerCase();
  return [normalized.includes("paris") ? 1 : 0, normalized.length];
}
