---
title: Drizzle DB adapter
description: Use the shared Drizzle adapter with PostgreSQL, MySQL, or SQLite.
---

# Drizzle DB adapter

```sh
npm install @superfunctions/db drizzle-orm pg
```

```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzleAdapter({ db: drizzle(pool), dialect: "postgres" });
// Pass db to createFileFn({ db, storage, ... }).
```

Use dialect `postgres`, `mysql`, or `sqlite` with the corresponding Drizzle driver. The host owns the connection lifecycle; close the pool during application shutdown.

## Provision tables first

Use `getSchema({ namespace })` from `@filefn/server` as the source of table/field/index descriptors. Generate and review your host migrations, then apply them before running FileFn. Constructing the adapter or FileFn does not create SQL tables. The adapter does not expose an `applySchemaToAdapter` helper or automatic migration support.

See [DB adapters](./db) for the schema contract and [SQLite](./db-sqlite) for a local SQL configuration.
