---
title: Drizzle adapter
description: Use Drizzle ORM with Postgres, MySQL, SQLite, or Cloudflare D1.
---

# Drizzle adapter

`drizzleAdapter` is the recommended adapter for production. It supports any database Drizzle supports: Postgres, MySQL, SQLite, and Cloudflare D1.

```bash
npm install drizzle-orm @superfunctions/db
```

## Postgres

```ts
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

createAuthFn({
  database: drizzleAdapter(db),
  // ...
});
```

## SQLite (better-sqlite3)

```ts
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const db = drizzle(new Database('authfn.db'));

createAuthFn({
  database: drizzleAdapter(db),
  // ...
});
```

## MySQL

```ts
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

const pool = await mysql.createPool({ uri: process.env.DATABASE_URL });
const db = drizzle(pool);

createAuthFn({ database: drizzleAdapter(db), /* ... */ });
```

## Cloudflare D1

```ts
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';

export default {
  fetch(request: Request, env: { DB: D1Database }) {
    const db = drizzle(env.DB);
    const auth = createAuthFn({ database: drizzleAdapter(db), /* ... */ });
    return auth.router.fetch(request);
  },
};
```

For workers, hoist the `auth` instance outside the handler if you want it to persist across invocations within the same isolate (the kernel itself is stateless; only the adapter holds connections).

## Generating Drizzle schema

The Superfunctions CLI generates Drizzle TypeScript schema from your enabled plugin set:

```bash
npx @superfunctions/cli generate --output ./src/db/schema.ts
```

Run Drizzle's migration tool against that schema to produce migration files:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## Schema visibility

The generated schema includes only the tables for plugins you have enabled. Disable a plugin → run `generate` again → drizzle-kit will produce a migration that drops those tables (review carefully before running in production).

## Transactions

`drizzleAdapter` uses Drizzle's `db.transaction()` for the kernel's transactional helpers. Plugins that need transactional writes (sign-up, account deletion) automatically benefit.

## Performance notes

- Set `pool.max` based on your concurrency. authfn's reads-per-request are typically ≤ 5 (session lookup, plugin-specific reads).
- Add an explicit index on `authfn_sessions.token_hash` (the kernel does this in the generated schema).
- For multi-region deployments, use a regional pool per region. Don't share a global writer pool.

## Related

- [Drizzle ORM docs](https://orm.drizzle.team/docs/overview)
- [Adapters → Postgres](./postgres) — raw pg without Drizzle.
- [Adapters → SQLite](./sqlite) — better-sqlite3 directly.
