---
title: Embeddings and extraction
description: Configure supported providers and understand ingestion and deduplication behavior.
---

# Embeddings and extraction

The `memoryfn()` factory currently supports OpenAI for `embedder.provider` and `llm.provider`. An embedder is required for semantic retrieval. The built-in embedder defaults to `text-embedding-3-small`, requests the storage dimension when known, batches inputs, and checks response count and order. The default batch size is 2048; configured values must be an integer from 1 through 2048.

```ts
const memory = memoryfn({
  storage: { kind: "pg", url: process.env.MEMORY_DATABASE_URL! },
  embedder: {
    provider: "openai",
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY!,
    dims: 1536,
  },
});
```

The factory rejects unsupported provider values and missing API keys at initialization. For another provider, inject an `Embedder` or `LLMProvider` into the `MemoryFn` constructor with a compatible `StorageAdapter`; the factory does not select custom provider names.

Without an LLM, `add()` stores supplied content as one memory. With an LLM, it extracts facts, embeds them, checks for vector duplicates, and may resolve updates or relationships. The deduplication threshold is 0.95. Extracted tags are descriptive metadata; they never replace caller scope.

Multi-fact extraction is **not an atomic batch**. A failure may occur after some facts have been inserted. Reconcile before replaying an entire batch, or use explicit single-memory writes for confirmed user memory until the application has an ingestion job with recovery. A conflicting fact requires adapter transactions for its new row, revision changes, and relationships. See [operations and limits](/docs/operations-and-limits) for unsupported configuration fields.
