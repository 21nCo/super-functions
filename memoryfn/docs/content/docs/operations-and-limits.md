---
title: Operations and current limits
description: Supported configuration, migration responsibility, tests, and proof boundaries.
---

This site describes the `origin/dev` source, an unpublished candidate. A green local build is workspace evidence, not proof that the same-version registry package or a hosted deployment has these changes.

## Configuration boundaries

- The factory supports OpenAI `llm` and `embedder` providers. Other provider values fail at initialization.
- `policies.redaction` is rejected with `MEMORY_REDACTION_UNSUPPORTED`.
- `maxMemoriesPerContainer` and `maxMemorySizeBytes` are rejected with `MEMORY_LIMITS_UNSUPPORTED`.
- SQLite requires an injected adapter. The factory does not implement Qdrant, graph storage, reranking, or caching merely because legacy config types mention them.
- Search is vector based. Without an embedder, it fails with `MEMORY_EMBEDDER_REQUIRED`.
- Multi-fact extraction can partially write; design application-level reconciliation before replaying an ingest batch.

## Database and release operations

The host applies `0001-initial.sql` and `0002-memory-lifecycle.sql` itself. There is no CLI schema discovery or `getSchema` contract. Use a disposable database for the real PostgreSQL test suite: `MEMORYFN_TEST_DATABASE_URL` enables integration tests that create tables and truncate memory data. A local PostgreSQL pass does not prove hosted Hyperdrive behavior.

Application code owns the source-of-truth record, caller authorization, and the deletion deny path. MemoryFn owns scoped derived-store operations. Keep external replicas and indexes behind equivalent tombstone and cleanup controls. See the [storage and lifecycle source guide](/docs/reference/storage-lifecycle) for the detailed contract.
