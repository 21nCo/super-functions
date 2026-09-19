---
title: Database adapters
description: Wire authfn to your database — Drizzle, raw Postgres, SQLite, in-memory, or a custom adapter.
---

# Database adapters

authfn writes through `@superfunctions/db`'s `Adapter` contract. You pick an adapter and pass it to `authApp.createServer({ database })`, where `authApp` is the declaration returned by `authfn({ plugins })`.

```ts
interface Adapter {
  create<T>(input: CreateInput): Promise<T>;
  findOne<T>(input: FindInput): Promise<T | null>;
  findMany<T>(input: FindInput): Promise<T[]>;
  update<T>(input: UpdateInput): Promise<T | null>;
  delete(input: DeleteInput): Promise<void>;
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

Whatever adapter you pick, your enabled plugin set determines the schema you
need. Generate the ORM schema with the Superfunctions CLI, then use your ORM's
migration tool. For Drizzle on Postgres:

```bash
npx @superfunctions/cli generate-schema --adapter drizzle --dialect postgres --output ./db/generated
npx drizzle-kit generate
npx drizzle-kit migrate
```

The CLI imports the declared app, reads `authApp.getSchema()`, and writes the
adapter-specific schema file. See [the CLI docs](https://github.com/21nCo/super-functions/tree/dev/clifn) for full options.

## Namespacing

Every read and write goes through `namespace` — the prefix you choose with `authfn({ namespace: 'authfn' })`. Tables become `authfn_users`, `authfn_sessions`, `authfn_password_credentials`, etc. Run two authfn deployments in the same database by giving them different namespaces.
