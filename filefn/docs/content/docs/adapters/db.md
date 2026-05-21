---
title: DB adapters
description: The Adapter contract — what every database backend must implement, and which schemas filefn touches.
---

# DB adapters

`@superfunctions/db` defines `Adapter` — the same one used by `authfn`, `botfn`, and the rest of the ecosystem. filefn's tables live alongside whatever else is using the same database.

## Tables filefn touches

| Table | Purpose |
| --- | --- |
| `filefn_upload_sessions` | Active multipart sessions. |
| `filefn_upload_parts` | One row per recorded part. |
| `filefn_files` | Logical files. |
| `filefn_file_versions` | Concrete versions (storage key, checksum, mime, size). |
| `filefn_file_artifacts` | Processor outputs. |
| `filefn_file_permissions` | Per-grant capability rows. |
| `filefn_file_shares` | Share-link rows. |

Prefix is configurable via `namespace` (default `filefn`).

## Migration

```ts
import { applySchemaToAdapter } from "@superfunctions/db";

const { schemas } = fileFn.getSchema();
await applySchemaToAdapter(db, schemas);
```

`applySchemaToAdapter` is idempotent — safe to run on every boot. For production, run it once via your migration tool.

## Bundled adapters

| Package | Adapter |
| --- | --- |
| `@superfunctions/db-memory` | `createMemoryAdapter()` |
| `@superfunctions/db-drizzle` | `createDrizzleAdapter({ db, dialect })` |
| `@superfunctions/db-postgres` | `createPostgresAdapter({ pool })` (via `pg`) |
| `@superfunctions/db-sqlite` | `createSQLiteAdapter({ db })` (via `better-sqlite3`) |
| `@superfunctions/db-mysql` | `createMySQLAdapter({ pool })` (via `mysql2`) |

See the per-adapter pages for setup details.

## Authoring a custom adapter

The `Adapter` interface:

```ts
interface Adapter {
  findOne<T>(table: string, where: WhereInput): Promise<T | null>;
  findMany<T>(table: string, query?: { where?: WhereInput; orderBy?: OrderBy; limit?: number; offset?: number }): Promise<T[]>;
  create<T>(table: string, data: T): Promise<T>;
  update<T>(table: string, data: Partial<T>, where: WhereInput): Promise<T>;
  delete(table: string, where: WhereInput): Promise<void>;
  count(table: string, where?: WhereInput): Promise<number>;
  transaction?<T>(fn: (txAdapter: Adapter) => Promise<T>): Promise<T>;
}
```

If your DB doesn't support transactions natively, `transaction` can no-op and rely on the kernel's defensive ordering.

## See also

- [Reference › Schema](../reference/schema) — the column-by-column reference.
