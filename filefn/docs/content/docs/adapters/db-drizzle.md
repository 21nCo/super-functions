---
title: Drizzle DB adapter
description: createDrizzleAdapter — the Drizzle-ORM-backed adapter for Postgres, SQLite, and MySQL.
---

# Drizzle DB adapter

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { createDrizzleAdapter } from "@superfunctions/db-drizzle";

const drizzleClient = drizzle(pgPool);
const db = createDrizzleAdapter({
  db: drizzleClient,
  dialect: "postgres",
});
```

## Dialects

| Dialect | Underlying driver |
| --- | --- |
| `"postgres"` | `pg` / `node-postgres` (or `postgres-js`) |
| `"sqlite"` | `better-sqlite3` / `bun:sqlite` |
| `"mysql"` | `mysql2` / `planetscale-serverless` |

## Migration

filefn ships its schemas via `getSchema()`. To apply them with Drizzle:

```ts
import { applySchemaToAdapter } from "@superfunctions/db";

const { schemas } = fileFn.getSchema();
await applySchemaToAdapter(db, schemas);
```

For Drizzle Kit-driven migrations, generate Drizzle table definitions from the same schema source — see the [authfn migration recipe](https://www.npmjs.com/package/@superfunctions/db-drizzle) for a working pattern.

## When to use it

- You're already on Drizzle ORM.
- You want a single migration story across the whole superfunctions stack.

## See also

- [db](./db) — the adapter contract.
- [@superfunctions/db-drizzle on npm](https://www.npmjs.com/package/@superfunctions/db-drizzle).
