---
title: SQLite adapter
description: Single-file local database — perfect for local-first apps and self-hosted single-node deployments.
---

# SQLite adapter

SQLite is the right answer for:

- **Single-node deployments** that don't need replication.
- **Local-first apps** with a server side that primarily caches.
- **Edge cases** where you want zero infrastructure (Bun + SQLite + Resend = a complete auth server in one binary).

```bash
npm install better-sqlite3
```

## Via Drizzle

```ts
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const db = drizzle(new Database('authfn.db'));

createAuthFn({ database: drizzleAdapter(db), /* ... */ });
```

## Direct SQLite adapter

If a thin SQLite adapter is exposed in your build, use it directly:

```ts
import { sqliteAdapter } from '@superfunctions/db/adapters/sqlite';   // if available
import Database from 'better-sqlite3';

const db = new Database('authfn.db');

createAuthFn({ database: sqliteAdapter(db), /* ... */ });
```

When in doubt, the `drizzleAdapter` route works everywhere.

## Performance

SQLite is plenty fast for authfn workloads. A few tuning tips:

- Run with WAL mode: `db.pragma('journal_mode = WAL')`.
- Reduce synchronous fsync frequency if you're OK with last-second durability trade-offs: `db.pragma('synchronous = NORMAL')`. Use `OFF` only when you explicitly accept weaker crash safety.
- Add explicit indexes on `authfn_sessions.token_hash` and `authfn_users.primary_email` (the generated schema does both).

## Backup

Use the SQLite **online backup API** (`db.backup('authfn.db.bak')`) or the WAL-aware `litestream`/`litefs` if you need point-in-time recovery without taking the database down.

## Limitations

- **Single writer.** SQLite only allows one writer at a time. For concurrent writes from many threads, use a queue or accept the implicit serialization.
- **No native replication.** Use `litefs` or AWS Aurora-style replication if you need cross-region reads.

## When SQLite is enough

- Up to ~10k DAU with a single server.
- Apps where your user data is relatively cold (read once, write rarely).
- Local-first apps where the server is mainly a sync point.

## When to graduate

If you're hitting WAL contention or you need read replicas, move to [Postgres](./postgres) or [Drizzle on Postgres](./drizzle). Migrating is straightforward: dump SQLite to SQL, load into Postgres, swap the adapter.

## Related

- [Drizzle adapter](./drizzle) — Drizzle on top of better-sqlite3.
- [Custom adapter](./custom) — `bun:sqlite`, libSQL, etc.
