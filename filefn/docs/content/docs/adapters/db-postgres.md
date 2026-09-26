---
title: PostgreSQL adapter
description: Connect FileFn to PostgreSQL through Drizzle and pg.
---

# PostgreSQL

```sh
npm install @superfunctions/db drizzle-orm pg
```

```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db = drizzleAdapter({ db: drizzle(pool), dialect: "postgres" });
```

Pass `db` to `createFileFn`. Size the pool for your database connection budget and number of application replicas; `max: 10` above is an example, not a throughput guarantee. Call `pool.end()` during shutdown.

Provision the table and index definitions from `getSchema({ namespace })` through your host migration system before handling requests. Neither the adapter nor FileFn runs DDL automatically. There is no `generateSqlForSchema` export from a `@superfunctions/db-postgres` package. See [DB adapters](./db) and [schema](../reference/schema).
