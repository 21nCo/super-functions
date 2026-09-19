---
title: Drizzle adapter
description: Use Drizzle ORM with Postgres, MySQL, SQLite, or Cloudflare D1.
---

# Drizzle adapter

`drizzleAdapter` is the recommended adapter for production. It supports any database Drizzle supports: Postgres, MySQL, SQLite, and Cloudflare D1.

```bash
npm install drizzle-orm @superfunctions/db
npx @superfunctions/cli generate-schema --adapter drizzle --output ./src/db/generated
```

The generated file is `authfn-schema.ts` for an authfn declaration. Import it
and pass it to every `drizzle()` constructor below; `drizzleAdapter` resolves
tables from Drizzle's schema registry and cannot operate without it. Configure
the target database dialect in `superfunctions.config.js` before generating.

## Postgres

```ts
import { authfn, authFnPlugins } from 'authfn';
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './db/generated/authfn-schema.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const authApp = authfn({ plugins: authFnPlugins(/* your plugins */) });
const auth = authApp.createServer({ database: drizzleAdapter({ db, dialect: 'postgres' }) });
```

## SQLite (better-sqlite3)

```ts
import { authfn, authFnPlugins } from 'authfn';
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './db/generated/authfn-schema.js';

const db = drizzle(new Database('authfn.db'), { schema });

const authApp = authfn({ plugins: authFnPlugins(/* your plugins */) });
const auth = authApp.createServer({ database: drizzleAdapter({ db, dialect: 'sqlite' }) });
```

## MySQL

```ts
import { authfn, authFnPlugins } from 'authfn';
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './db/generated/authfn-schema.js';

const pool = await mysql.createPool({ uri: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const authApp = authfn({ plugins: authFnPlugins(/* your plugins */) });
const auth = authApp.createServer({ database: drizzleAdapter({ db, dialect: 'mysql' }) });
```

## Cloudflare D1

```ts
import { authfn, authFnPlugins } from 'authfn';
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/generated/authfn-schema.js';

export default {
  fetch(request: Request, env: { DB: D1Database }) {
    const db = drizzle(env.DB, { schema });
    const authApp = authfn({ plugins: authFnPlugins(/* your plugins */) });
    const auth = authApp.createServer({ database: drizzleAdapter({ db, dialect: 'sqlite' }) });
    return auth.router.fetch(request);
  },
};
```

For workers, hoist the `auth` instance outside the handler if you want it to persist across invocations within the same isolate (the kernel itself is stateless; only the adapter holds connections).

## Applying migrations

After generating the Drizzle TypeScript schema from your enabled plugin set,
run Drizzle's migration tool against that schema:

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
