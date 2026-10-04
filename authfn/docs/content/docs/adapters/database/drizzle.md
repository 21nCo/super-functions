---
title: Drizzle adapter
description: Use Drizzle ORM with Postgres, MySQL, SQLite, or Cloudflare D1.
---

# Drizzle adapter

`drizzleAdapter` is the recommended adapter for production. It supports any database Drizzle supports: Postgres, MySQL, SQLite, and Cloudflare D1.

```bash
npm install drizzle-orm @superfunctions/db
npm install --save-dev @superfunctions/cli drizzle-kit
```

Point the Superfunctions CLI at the module that exports your `authApp`:

```js
// superfunctions.config.mjs
export default {
  adapter: {
    type: 'drizzle',
    drizzle: { dialect: 'postgres' },
  },
  libraries: ['./src/auth.ts'],
};
```

Then generate the schema. `--force` makes subsequent runs replace the stale
generated file after you add or remove a plugin:

```bash
npx @superfunctions/cli generate-schema --config ./superfunctions.config.mjs --adapter drizzle --dialect postgres --output ./db/generated --force
```

The generated file is `authfn-schema.ts` for an authfn declaration. Import it
and pass it to every `drizzle()` constructor below; `drizzleAdapter` resolves
tables from Drizzle's schema registry and cannot operate without it. Set
`--dialect` to the database you use: `postgres`, `mysql`, or `sqlite`. Cloudflare
D1 uses the `sqlite` dialect.

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
    return auth.router.handle(request);
  },
};
```

For workers, hoist the `auth` instance outside the handler if you want it to persist across invocations within the same isolate (the kernel itself is stateless; only the adapter holds connections).

## Applying migrations

After generating the Drizzle TypeScript schema from your enabled plugin set,
configure Drizzle Kit to read the same file. This complete example is for
PostgreSQL:

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/generated/authfn-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Keep Drizzle Kit's dialect aligned with the schema command and runtime adapter:

| Target | CLI `--dialect` | Drizzle Kit `dialect` | Credentials / apply step |
| --- | --- | --- | --- |
| PostgreSQL | `postgres` | `postgresql` | `dbCredentials: { url: DATABASE_URL }`; `drizzle-kit migrate` |
| MySQL | `mysql` | `mysql` | `dbCredentials: { url: DATABASE_URL }`; `drizzle-kit migrate` |
| local SQLite | `sqlite` | `sqlite` | `dbCredentials: { url: './authfn.db' }`; `drizzle-kit migrate` |
| Cloudflare D1 | `sqlite` | `sqlite` | Generate SQL with Drizzle Kit, then apply it with Wrangler's D1 migration command. |

For MySQL, every string field used as a primary key, unique key, foreign key,
or index member must declare `maxLength`. Generation fails instead of silently
narrowing an unbounded string contract.
AuthFn applies the same 255-character ceiling at runtime to caller- or
provider-controlled keys, including custom user IDs, normalized email keys,
provider account IDs, and region IDs.

The generated schema reserves up to 767 characters for user primary and
foreign keys. This is a compatibility allowance for persisted AuthFn v1 users;
new user IDs remain limited to 255 characters. The 767-character bound keeps a
user reference plus a timestamp within MySQL's 3072-byte `utf8mb4` composite
index limit.

### Upgrading an existing AuthFn v1 MySQL schema

Do not use `drizzle-kit generate` to diff an existing AuthFn v1 MySQL schema
against the v2 generated schema. V1 used unbounded `TEXT` for key columns, and
that direct diff can emit unsafe narrowing operations. Route this upgrade
through the Superfunctions compatibility planner instead. Give the CLI access
to the existing database and use the same directory as your reviewed SQL
migrations:

```js
// superfunctions.config.mjs
export default {
  adapter: {
    type: 'drizzle',
    drizzle: {
      dialect: 'mysql',
      connectionString: process.env.DATABASE_URL,
    },
  },
  libraries: ['./src/auth.ts'],
  migrationsDir: './migrations',
};
```

```bash
npx @superfunctions/cli generate-migration authfn --config ./superfunctions.config.mjs
```

Review and apply the generated SQL file (named
`<timestamp>_authfn_v<version>.sql`) with your normal SQL deployment tool. It
preserves compatible v1 `TEXT` columns and advances AuthFn's recorded schema
version. Do not run a second Drizzle Kit schema diff for this v1-to-v2 MySQL
step.

For new MySQL installations, PostgreSQL, and local SQLite, generate and apply
the migration with Drizzle Kit:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

For D1, point the binding's Wrangler migration directory at the same Drizzle
Kit output directory:

```jsonc
// wrangler.jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "authfn",
      "database_id": "replace-me",
      "migrations_dir": "./drizzle"
    }
  ]
}
```

The repository-pinned Drizzle Kit 0.31.x release writes migration SQL files
directly under `./drizzle`, which is the layout Wrangler scans by default. If
you upgrade to a Drizzle version that emits `./drizzle/<timestamp>/migration.sql`,
also set `"migrations_pattern": "drizzle/*/migration.sql"` as documented for
Wrangler's nested migration layouts.

Then generate the SQL and apply it locally or remotely with Wrangler instead
of `drizzle-kit migrate`:

```bash
npx drizzle-kit generate
npx wrangler d1 migrations apply authfn --local
npx wrangler d1 migrations apply authfn --remote
```

## Schema visibility

The generated schema includes only the tables for plugins you have enabled.
After disabling a plugin, rerun the `generate-schema` command above with
`--force`; then Drizzle Kit can produce a migration that drops those tables.
Review drop migrations carefully before running them in production.

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
