---
title: Postgres DB adapter
description: createPostgresAdapter — direct pg-backed adapter for production filefn deployments.
---

# Postgres DB adapter

```ts
import { Pool } from "pg";
import { createPostgresAdapter } from "@superfunctions/db-postgres";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});
const db = createPostgresAdapter({ pool });
```

## Pool sizing

Each filefn HTTP request can use up to 1-2 connections (typical). For 100 concurrent uploads with multipart requests:

- `max: 20` is a reasonable starting point on a 2-core app server.
- Add a connection pooler (PgBouncer in `transaction` mode) in front if you're running many app servers.

## Schema

Run `applySchemaToAdapter(db, schemas)` on boot, or generate migration SQL once:

```ts
import { generateSqlForSchema } from "@superfunctions/db-postgres";

const sql = generateSqlForSchema(schemas, { dialect: "postgres" });
await fs.writeFile("./migrations/001-filefn.sql", sql);
```

Run that against your DB through your normal migration pipeline.

## Indexes that matter

filefn ships indexes for:

- `filefn_upload_sessions(uploadSessionId)` — primary key.
- `filefn_upload_parts(uploadSessionId, partNumber)` — composite key.
- `filefn_files(fileId)` — primary key.
- `filefn_file_versions(fileId, createdAt)` — for version listing.
- `filefn_file_versions(checksumSha256Base64, tenantId)` — for dedup lookups.
- `filefn_file_shares(tokenHash)` — for share-link resolution.

If you're seeing slow queries, check that your migration applied them.

## When to use it

- Existing Postgres infrastructure.
- You want full control over the SQL surface.

## See also

- [db](./db) — the adapter contract.
- [db-drizzle](./db-drizzle) — Drizzle-backed alternative.
