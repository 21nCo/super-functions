---
title: Postgres adapter
description: Talk to Postgres directly without Drizzle. Same contract, no ORM.
---

# Postgres adapter

If you'd rather not bring Drizzle in, the raw Postgres adapter accepts a `pg` Pool directly:

```ts
import { postgresAdapter } from '@superfunctions/db/adapters/postgres';   // hypothetical export
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

createAuthFn({
  database: postgresAdapter(pool),
  // ...
});
```

> Some monorepo builds expose `postgresAdapter` directly; if not, prefer `drizzleAdapter(drizzle(pool))` which does the same thing under the hood.

## Migrations

Generate raw SQL migrations with the CLI:

```bash
npx @superfunctions/cli generate --dialect postgres --output ./migrations
```

Apply them with your favorite migration tool: `node-pg-migrate`, `dbmate`, `flyway`, or in-house. The output is plain SQL — bring it into whatever tooling you already use.

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
