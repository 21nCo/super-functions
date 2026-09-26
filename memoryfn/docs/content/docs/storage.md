---
title: Storage and migrations
description: PostgreSQL setup, connection ownership, transaction requirements, and custom adapters.
---

# Storage and migrations

`kind: "memory"` provides a process-local adapter. Durable PostgreSQL needs the SQL in `memoryfn/typescript/migrations`: apply `0001-initial.sql`, then `0002-memory-lifecycle.sql`, using a migration role in the intended application schema. The first migration creates pgvector-backed tables with `vector(1536)`; the second adds revisions, tombstones, and an active-row index. Neither migration provisions a database, grants, or Hyperdrive. Exact vector search works without an approximate index.

## Inject a caller-owned PostgreSQL adapter

```ts
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { memoryfn } from "@memoryfn/core";
import { PostgresAdapter, memories, memoryRelationships } from "@memoryfn/core/storage/pg";

const client = postgres(connectionString, { prepare: false, max: 5 });
const adapter = new PostgresAdapter(
  drizzle(client, { schema: { memories, memoryRelationships } }),
);
const memory = memoryfn({ storage: { kind: "adapter", adapter } });

// The caller owns this client. Closing MemoryFn does not close it.
await memory.close();
await client.end();
```

Use an injected adapter when the host controls request or Worker lifetimes, pooling, and Hyperdrive options. `kind: "pg"` with a URL creates an owned client; `memory.close()` closes it. Passing a `connection` option to the factory's PostgreSQL branch is rejected: inject a `PostgresAdapter` instead.

PostgreSQL storage fixes embedding dimensions at 1536. The factory requests that dimension and rejects a conflicting embedder configuration, including with an injected `PostgresAdapter`.

The `StorageAdapter` contract includes scoped insert, search, get, compare-and-update, delete, optional close, and optional transaction. Immutable-ID tombstones and scope checks are required for equivalent behavior. A conflict resolution that changes several records requires `transaction()`; an adapter without it rejects that conflict before writing.

`kind: "sqlite"` requires an explicit adapter. The factory does not create SQLite storage. `qdrant` is present in a legacy type union but has no factory implementation. Review the [source lifecycle guide](/docs/reference/storage-lifecycle) and [adapter interface](https://github.com/21nCo/super-functions/blob/dev/memoryfn/typescript/src/storage/adapter.ts) before implementing a custom store.
