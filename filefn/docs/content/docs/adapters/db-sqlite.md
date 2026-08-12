---
title: SQLite DB adapter
description: createSQLiteAdapter — better-sqlite3 / bun:sqlite for single-instance filefn deployments.
---

# SQLite DB adapter

## Node (better-sqlite3)

```ts
import Database from "better-sqlite3";
import { createSQLiteAdapter } from "@superfunctions/db-sqlite";

const sqlite = new Database("./filefn.db");
sqlite.pragma("journal_mode = WAL");

const db = createSQLiteAdapter({ db: sqlite });
```

## Bun

```ts
import { Database } from "bun:sqlite";
import { createSQLiteAdapter } from "@superfunctions/db-sqlite";

const sqlite = new Database("./filefn.db");
sqlite.run("PRAGMA journal_mode = WAL");

const db = createSQLiteAdapter({ db: sqlite });
```

## When to use it

- Local dev.
- Single-instance self-hosted deployments.
- Edge runtimes that support SQLite (Cloudflare D1, Turso, libSQL).
- Test environments.

## When not to use it

- Multi-instance horizontal scaling. SQLite isn't the right fit unless every instance shares the same disk (which usually defeats the point of horizontal scaling).

## WAL mode

Always enable WAL on persistent SQLite — it dramatically improves concurrency for read-heavy workloads and avoids most "database is locked" errors.

## Schema

```ts
import { applySchemaToAdapter } from "@superfunctions/db";

const { schemas } = fileFn.getSchema();
await applySchemaToAdapter(db, schemas);
```

## See also

- [db](./db) — the adapter contract.
