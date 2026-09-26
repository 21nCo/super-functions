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
import * as schema from "./schema"; // Generated Drizzle table definitions for this dialect.

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const db = drizzleAdapter({ db: drizzle(pool, { schema }), dialect: "postgres" });
```

Pass `db` to `createFileFn`. Size the pool for your database connection budget and number of application replicas; `max: 10` above is an example, not a throughput guarantee. Call `pool.end()` during shutdown.

Provision the table and index definitions from `getSchema({ namespace })` exported by `@filefn/server` through your host migration system before handling requests. Neither the adapter nor FileFn runs DDL automatically. There is no `generateSqlForSchema` export from a `@superfunctions/db-postgres` package. See [DB adapters](./db) and [schema](../reference/schema).

Generate/import the Drizzle table definitions in `./schema` and pass the namespace-imported table registry to `drizzle(..., { schema })`. SQL migrations alone are insufficient: the adapter also requires this runtime table registry. See [schema setup](/docs/adapters/db#schema-and-migrations); include every library sharing the adapter and use the same dialect and namespace.
