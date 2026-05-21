---
title: Database adapters
description: Wire authfn to your database — Drizzle, raw Postgres, SQLite, in-memory, or a custom adapter.
---

# Database adapters

authfn writes through `@superfunctions/db`'s `Adapter` contract. You pick an adapter and pass it to `createAuthFn({ database: ... })`.

```ts
interface Adapter {
  create<T>(input: CreateInput): Promise<T>;
  findOne<T>(input: FindInput): Promise<T | null>;
  findMany<T>(input: FindInput): Promise<T[]>;
  update<T>(input: UpdateInput): Promise<T | null>;
  delete(input: DeleteInput): Promise<{ affected: number }>;
  // ... transactional helpers
}
```

The contract is closer to a typed query builder than to an ORM — `model`, `where`, `data`, `namespace`, plus `set`/`take`/`orderBy` modifiers. Each adapter implementation translates these into native database operations.

| Adapter | Best for | Page |
| --- | --- | --- |
| `memoryAdapter` | tests, local development | [Memory](./memory) |
| `drizzleAdapter` | Postgres / MySQL / SQLite via Drizzle | [Drizzle](./drizzle) |
| Postgres (raw) | Postgres without Drizzle | [Postgres](./postgres) |
| SQLite (raw) | local-first apps | [SQLite](./sqlite) |
| Cloudflare D1 | Workers | [D1](./drizzle) (via Drizzle) |
| Custom | anything else | [Custom](./custom) |

## Migrations

Whatever adapter you pick, your enabled plugin set determines the schema you need. Generate migrations with the Superfunctions CLI:

```bash
npx @superfunctions/cli generate
```

The CLI reads `auth.getSchema()` and writes adapter-specific migration files. See [the CLI docs](https://github.com/21nCo/super-functions/tree/dev/clifn) for full options.

## Namespacing

Every read and write goes through `namespace` — the prefix `createAuthFn({ namespace: 'authfn' })` chose. Tables become `authfn_users`, `authfn_sessions`, `authfn_password_credentials`, etc. Run two authfn deployments in the same database by giving them different namespaces.
