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
import * as schema from "./schema"; // Generated Drizzle table definitions for this dialect.

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzleAdapter({ db: drizzle(pool, { schema }), dialect: "postgres" });
// Pass db to createFileFn({ database: db, storage, ... }).
```

Use dialect `postgres`, `mysql`, or `sqlite` with the corresponding Drizzle driver. The host owns the connection lifecycle; close the pool during application shutdown.

## Provision tables first

Use `getSchema({ namespace })` from `@filefn/server` as the source of table/field/index descriptors. Generate and review your host migrations, then apply them before running FileFn. Constructing the adapter or FileFn does not create SQL tables. The adapter does not expose an `applySchemaToAdapter` helper or automatic migration support.

See [DB adapters](./db) for the schema contract and [SQLite](./db-sqlite) for a local SQL configuration.

Generate/import the Drizzle table definitions in `./schema` and pass the namespace-imported table registry to `drizzle(..., { schema })`. SQL migrations alone are insufficient: the adapter also requires this runtime table registry. See [schema setup](/docs/adapters/db#schema-and-migrations); include every library sharing the adapter and use the same dialect and namespace.
