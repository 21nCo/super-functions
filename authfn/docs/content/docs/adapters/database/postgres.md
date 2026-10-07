---
title: Postgres adapter
description: Use Postgres with authfn through the supported Drizzle adapter path.
---

# Postgres adapter

For Postgres, use the supported Drizzle adapter path:

```ts
import { authfn, authFnPlugins } from 'authfn';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzleAdapter } from '@superfunctions/db/adapters/drizzle';
import * as schema from './db/generated/authfn-schema.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const authApp = authfn({ plugins: authFnPlugins(/* your plugins */) });
const auth = authApp.createServer({
  database: drizzleAdapter({ db, dialect: 'postgres' }),
  // ...
});
```

If you need a raw `pg` adapter, implement the [custom adapter](./custom) contract directly and keep the same generated schema.

## Migrations

After adding the complete CLI and Drizzle Kit configuration from the
[Drizzle adapter guide](./drizzle), generate the schema, then create and apply
migrations:

```bash
npx @superfunctions/cli generate-schema --config ./superfunctions.config.mjs --adapter drizzle --dialect postgres --output ./db/generated --force
npx drizzle-kit generate
npx drizzle-kit migrate
```

Review the generated SQL before applying it. If you use another migration
runner, point it at that reviewed SQL instead.

## Schema sketch

The generated schema for the standard plugin set creates:

```sql
CREATE TABLE authfn_users (
  id TEXT PRIMARY KEY,
  primary_email TEXT,
  email_verified_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_authfn_users_primary_email ON authfn_users (primary_email) WHERE primary_email IS NOT NULL;

CREATE TABLE authfn_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES authfn_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  csrf_hash TEXT,
  methods JSONB NOT NULL,
  metadata JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_authenticated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX idx_authfn_sessions_token_hash ON authfn_sessions (token_hash);
CREATE INDEX idx_authfn_sessions_user_id ON authfn_sessions (user_id);

-- ... plus tables for each enabled plugin
```

Use this as a reference when reviewing the CLI's output — the precise column types may differ slightly (e.g. JSONB vs JSON) depending on the dialect.

## Connection pooling

A `pg` Pool with `max: 10`–`max: 20` is plenty for most authfn workloads. authfn does not pin connections — every operation borrows and returns.

## RLS / row-level security

If you want RLS for defense-in-depth, you'll need to think carefully. authfn doesn't set per-request session variables, so RLS predicates will not see "the current authenticated user" inside the kernel's writes. RLS works best when applied to *your application's* tables — leave `authfn_*` to your application's normal access controls (an `authfn_user` role with full CRUD, scoped to the namespace).

## Replication / failover

For high availability, run a primary + replicas, route reads-and-writes to the primary, and use a connection-level failover (HAProxy, pgbouncer, RDS Proxy). authfn doesn't separate read traffic from write traffic; every authentication request needs the latest session row.

## Related

- [Drizzle adapter](./drizzle) — same database, with Drizzle on top.
- [Adapters → Database → Custom](./custom) — write your own.
