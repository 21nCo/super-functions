---
title: Public API
description: MemoryFn package entry points, methods, input types, and adapters.
---

# Public API

| Import | Main surface | Purpose |
| --- | --- | --- |
| `@memoryfn/core` | `memoryfn`, `MemoryFn`, `Memory`, input/result types, `StorageAdapter`, `MemoryStorageAdapter`, `PostgresAdapter` | Factory, pipeline, and storage contracts |
| `@memoryfn/core/http` | `createMemoryRouter` | Authorized HTTP router |
| `@memoryfn/core/mcp` | `MemoryMCP` | Scoped stdio MCP tools |
| `@memoryfn/core/storage/pg` | `PostgresAdapter`, `memories`, `memoryRelationships` | PostgreSQL adapter and Drizzle schema |

## Factory and pipeline

`memoryfn(config: MemoryFnConfig): MemoryFn` selects process-local storage, an owned PostgreSQL connection, or an injected adapter. Supported factory providers are OpenAI LLM and embeddings. `new MemoryFn(config, storage, embedder?, llm?)` allows custom provider instances.

`MemoryFn` methods:

- `add({ tenantId, containerTags, content?, messages?, type?, metadata? })` returns memories, relationships, and created/updated/deduplicated counts. Content or messages must be nonempty.
- `search({ tenantId, containerTags, q, filters?, limit?, threshold? })` returns scoped vector results and count metadata; it requires an embedder.
- `update({ tenantId, containerTags, id, expectedRevision, content, metadata? })` returns a new revision or fails on a stale revision.
- `forget({ tenantId, containerTags, id, expectedRevision? })` scrubs a memory and retains its tombstone.
- `close()` disposes only resources owned by the selected adapter.

`Memory` includes ID, tenant and tags, type, content, embedding, metadata, revision, deleted timestamp, latest flag, and created/updated timestamps. The factory's public type unions retain some unsupported options; consult [operations and limits](/docs/operations-and-limits) before using them.

The [source factory](https://github.com/21nCo/super-functions/blob/dev/memoryfn/typescript/src/index.ts), [pipeline](https://github.com/21nCo/super-functions/blob/dev/memoryfn/typescript/src/core/pipeline.ts), and [type definitions](https://github.com/21nCo/super-functions/blob/dev/memoryfn/typescript/src/core/types.ts) define exact signatures.
