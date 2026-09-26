---
title: MemoryFn documentation
description: Scoped memory storage, retrieval, updates, and forgetting for application developers.
---

# MemoryFn

MemoryFn's TypeScript package, `@memoryfn/core`, stores tenant-scoped memories, searches them by embedding, updates them with revisions, and forgets them with tombstones. It also offers an authorized HTTP router and a scoped stdio MCP adapter.

These pages describe the **current `origin/dev` source**. Its README calls this an unpublished candidate: the same numbered registry release does not contain all the changes here. Test the package from this source or a packed build before adopting these contracts in a deployed consumer.

## Choose a path

- [Getting started](/docs/getting-started): add, update, and forget an ephemeral memory.
- [Scope and lifecycle](/docs/scope-and-lifecycle): tenant and tag boundaries, revisions, and forgetting.
- [Storage](/docs/storage): PostgreSQL migrations, connection ownership, and custom adapters.
- [Embeddings and extraction](/docs/embeddings-and-extraction): supported providers and ingestion behavior.
- [Search](/docs/search): semantic retrieval and result limits.
- [HTTP](/docs/http) or [MCP](/docs/mcp): expose memories through host-controlled authorization.
- [Operations and limits](/docs/operations-and-limits): unsupported settings and proof boundaries.

MemoryFn is a derived store. The application remains responsible for membership, sharing policy, current permissions, and authoritative deletion state. Intersect retrieved results with that authority before showing them to a caller.
