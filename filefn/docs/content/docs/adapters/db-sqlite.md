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

const sqlite = new Database("filefn.sqlite");
sqlite.pragma("journal_mode = WAL");
const db = drizzleAdapter({ db: drizzle(sqlite), dialect: "sqlite" });
```

Provision the FileFn tables from `getSchema({ namespace })` using the host migration system before serving traffic. Pass `db` to `createFileFn` and close `sqlite` during application shutdown. On Bun, use Bun's SQLite driver and `drizzle-orm/bun-sqlite` with the same `drizzleAdapter` entrypoint and dialect.

SQLite concurrency and filesystem durability depend on deployment topology. Use a database supported by your hosting environment; a local file is not shared storage across application replicas. See [DB adapters](./db).
