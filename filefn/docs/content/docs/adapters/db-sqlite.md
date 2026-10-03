---
title: SQLite adapter
description: Connect FileFn to SQLite through Drizzle.
---

# SQLite

```sh
npm install @superfunctions/db drizzle-orm better-sqlite3
npm install --save-dev @types/better-sqlite3
```

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import * as schema from "./schema"; // Generated Drizzle table definitions for this dialect.

const sqlite = new Database("filefn.sqlite");
sqlite.pragma("journal_mode = WAL");
const db = drizzleAdapter({ db: drizzle(sqlite, { schema }), dialect: "sqlite" });
```

Provision the FileFn tables from `getSchema({ namespace })` using the host migration system before serving traffic. Pass `db` to `createFileFn` and close `sqlite` during application shutdown. On Bun, use Bun's SQLite driver and `drizzle-orm/bun-sqlite` with the same `drizzleAdapter` entrypoint and dialect.

SQLite concurrency and filesystem durability depend on deployment topology. Use a database supported by your hosting environment; a local file is not shared storage across application replicas. See [DB adapters](./db).

Generate/import the Drizzle table definitions in `./schema` and pass the namespace-imported table registry to `drizzle(..., { schema })`. SQL migrations alone are insufficient: the adapter also requires this runtime table registry. See [schema setup](/docs/adapters/db#schema-and-migrations); include every library sharing the adapter and use the same dialect and namespace.
