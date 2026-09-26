---
title: Schema and migrations
description: Apply SecFn's schema and PostgreSQL changes in order.
---

# Schema and migrations

`getSecFnSchema()` supplies the portable `@superfunctions/db` schema. A fresh installation still needs the PostgreSQL-specific version 4 migration for the null-safe secret-set uniqueness constraint. Migrations are the operator's responsibility; server startup does not apply them.

The current server guide describes four schema stages. Version 2 adds nullable `tenant_id` to scan runs. Version 3 adds `migrations/0003_scan_run_tenant_index.sql`. Version 4 adds optional immutable environment bindings with `migrations/0004_secret_set_environment.sql`, which requires PostgreSQL 15+ and `NULLS NOT DISTINCT` uniqueness. Apply them in order against the intended deployment schema. For a shared database, set `secfn.migration_schema`; otherwise the version 4 script refuses to guess when it cannot uniquely find the table.

Version 4 preflights duplicate secret-set identities and aborts with an actionable unique-violation error. It does not merge or delete data. Resolve duplicate names by ID in a reviewed transaction, preserve set IDs and members, roll back failed migration transactions, and retry only after the duplicates are gone. The [server README reference](/docs/reference/server) includes the diagnostic SQL and detailed rollout notes.

Verify generated schema diffs, existing row ownership, and adapter capabilities before deploying. A local schema build does not prove a hosted migration or data backfill.
