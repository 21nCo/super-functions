---
title: DB adapters
description: Configure the shared database adapter and provision FileFn tables.
---

# DB adapters

FileFn accepts `Adapter` from `@superfunctions/db`. Use `memoryAdapter` for disposable local state or `drizzleAdapter` for PostgreSQL, MySQL, or SQLite.

```ts
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
const db = memoryAdapter();
```

The published entrypoints are `@superfunctions/db/adapters/memory` and `@superfunctions/db/adapters/drizzle`. There are no separate `@superfunctions/db-postgres`, `db-sqlite`, or `db-drizzle` packages in this source tree.

## Schema and migrations

```ts
import { getSchema } from "@filefn/server";
const { version, schemas } = getSchema({ namespace: "filefn" });
console.log(version, schemas.map((table) => table.modelName));
```

For Drizzle, generate the dialect-specific table definitions with your host schema tooling (the repository’s `@superfunctions/cli` provides `generate-schema`) and import the generated `schema` registry. Construct `drizzle(client, { schema })`, then pass that instance to `drizzleAdapter`. The registry is required at runtime even after SQL migrations have created the tables.

This returns seven table descriptors, including fields and indexes. It does not provision a database. Translate/review these descriptors in your host's migration tooling and apply the migration before serving FileFn requests. The Drizzle adapter reports `schema.migrations: false`; it does not implement automatic DDL. Keep the namespace used in your migrations and `createFileFn` identical.

FileFn wraps the supplied adapter with its schema internally. For a custom adapter, implement the exported `Adapter` type rather than a positional CRUD interface: methods receive objects such as `findOne({ model, where })` and `create({ model, data })`. Respect the adapter's transaction and constraint capabilities; pretending to support transactions can break consistency guarantees.

See [Drizzle](./db-drizzle), [PostgreSQL](./db-postgres), [SQLite](./db-sqlite), and the [schema reference](../reference/schema).
