# MemoryFn TypeScript: storage and lifecycle

This dev adoption is based on next `b21477fc9a32ae425c38a2de810b5a8705fc711f` with explicit scope and lifecycle changes. It is an unpublished candidate; the same-version registry package does not contain these changes.

## PostgreSQL and ownership

Apply `migrations/0001-initial.sql` and `0002-memory-lifecycle.sql` in order, using a migration role against the intended application schema. Existing installations apply 0002 after confirming their baseline matches 0001. Migrations are additive and repeatable. They do not provision a database, grants, or Hyperdrive. The vector dimension is 1536. An approximate vector index is an operational choice after data loading; exact search works without one.

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { memoryfn } from '@memoryfn/core';
import { PostgresAdapter, memories, memoryRelationships } from '@memoryfn/core/storage/pg';

const client = postgres(connectionString, { prepare: false, max: 5 });
const storage = new PostgresAdapter(drizzle(client, { schema: { memories, memoryRelationships } }));
const memory = memoryfn({ storage: { kind: 'adapter', adapter: storage } });
// Supply a supported embedder for vector retrieval.
// memory.close() does not close this caller-owned client.
```

A URL configured with `kind: 'pg'` creates an owned client; `memory.close()` closes it. Injecting an adapter lets the consumer control request/Worker lifecycle, Hyperdrive connection options, and disposal. Local real-Postgres tests are separate from hosted Hyperdrive qualification.

## Scope and forgetting

Every operation requires an explicit tenant ID and tag array. All supplied tags must match; an empty array selects the entire explicit tenant. Tags are retrieval filters, not membership or sharing authority. Model-extracted tags are stored as descriptive metadata and cannot expand the caller's container tags.

`update({ tenantId, containerTags, id, expectedRevision, content })` uses compare-and-update and replaces the embedding. Failed re-embedding leaves the prior revision intact. `forget({ tenantId, containerTags, id, expectedRevision? })` scrubs content, vector and metadata, removes relationships and retains an immutable-ID tombstone. Concurrent stale updates cannot resurrect a tombstone. Forget can be retried; Postgres performs scrubbing and relationship cleanup in one transaction. A failed transaction reports failure and can be retried.

Rex must deny retrieval as soon as its authoritative DataFn record is forgotten, including while derived-store cleanup is pending. MemoryFn cannot infer the state of an external source of authority. Results must be intersected with current Rex permissions and authoritative deletion state. External indexes and replicas require equivalent tombstone checks and retryable cleanup; this package's Postgres vector lives in the same row as the tombstone.

The HTTP router requires an `authorize(request)` callback returning trusted scope or null. Request bodies cannot choose a tenant. The MCP adapter requires a trusted scope at construction; instantiate it per authorized scope and revoke access at the host boundary.

## Compatibility and limits

- `kind: 'memory'` selects process-local storage. `kind: 'sqlite'` without an explicit adapter throws; it no longer silently creates a memory store.
- Storage adapters must implement scoped get/update/delete and immutable-ID tombstones. The old insert/search-only interface is insufficient.
- `@memoryfn/core/http`, `/mcp`, and `/storage/pg` are separate subpaths; use these instead of root namespace re-exports.
- Fact extraction across multiple facts is not an atomic batch transaction. A failure can follow some inserts; reconcile before replaying an entire extracted batch. Prefer explicit single-memory writes for confirmed user memory until an application-level ingestion job provides reconciliation.
- Configure an embedder for meaningful vector search; the legacy no-embedder vector fallback is not a lexical search engine.

Run the test suite with `MEMORYFN_TEST_DATABASE_URL` pointing only to a disposable database. Integration tests create tables and truncate memory data.

The factory currently supports only OpenAI for `llm.provider` and `embedder.provider`.
Other values supplied from JavaScript or unvalidated configuration fail at initialization;
they never silently disable extraction or embeddings. The public TypeScript unions match
these implemented providers. Custom providers may be injected through the `MemoryFn` constructor.
