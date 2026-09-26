---
title: Server package
description: Control plane, runtime API, migration, and storage contract.
---

# @secfn/server

Adapter-backed SecFn server package.

`@secfn/server` hosts the control plane and runtime API for secrets, service tokens, RBAC, rate limiting, scanning, and durable security audit events. It uses `@superfunctions/db` for persistence and `@superfunctions/http` for routing.

## Example

```ts
import { createSecFnServer } from "@secfn/server";

export const secfn = createSecFnServer({
  db,
  basePath: "/secfn",
  encryption: {
    masterKey: process.env.SECFN_MASTER_KEY!,
    keyId: "env:main",
  },
  authorize: async (ctx, action) => {
    return ctx.actorId === "admin" || action === "audit-events:list";
  },
  namespaceProvider: (ctx) => ctx.namespace,
  logger,
});
```

The return value contains:

- `router`
- `vault`
- `access`
- `rateLimit`
- `audit`
- `scanner`
- `getSchema()`

SecFn does not re-export Express, Hono, Fastify, Next.js, or SvelteKit adapters. Mount the returned router with the existing shared HTTP adapter packages.

Runtime scope IDs and names must agree when both are supplied, including a namespace
provided by the host context. An environment ID alone derives its parent namespace;
an explicit conflicting namespace is rejected. Hosts supporting selection across
namespaces should omit a fixed namespace context rather than rely on query IDs to override it.
Secret-set creation validates every member and output name before persisting the set.

Schema version 2 adds nullable `tenant_id` to `secfn_scan_runs`. Apply the generated
migration before using tenant-scoped scan history. Existing unowned rows remain
hidden from tenant lists; backfill only from a trusted ownership mapping. Persist
new runs with `vault.recordScanRun({ tenantId, startedAt, target, status, findingCount })`;
the scanner itself remains a pure producer of findings.

Secret rotation requires an adapter advertising transaction support. The encrypted
version insert and version-pointer advance commit together; a failed
pointer update rolls back the new version. Nontransactional adapters fail before writing.

Secret creation also requires transactional storage: the secret and initial encrypted
version are inserted together, so a failed version insert leaves no unusable secret.
Shared rate limiting must use `rateLimit.atomicStore` with linearizable compare-and-set.
Legacy `rateLimit.persistence` is accepted only with `singleProcess: true`; it does
not coordinate quotas across server instances. In-memory defaults are process-local.

Schema version 3 adds the scan-run tenant index. PostgreSQL installations on
version 2 should apply `migrations/0003_scan_run_tenant_index.sql` before recording
version 3. Other adapters should apply the generated schema diff for the same index.

A fixed host namespace also restricts admin collections and service-token revocation.
Namespace creation/renaming and tenant-wide scan history require an operator context
without a fixed namespace. Conflicting namespace queries are rejected.

Namespace-scoped contexts must include `tenantId`, since namespace slugs are only
unique within a tenant. Environment creation derives that trusted scope and rejects
conflicting namespace names or IDs in its body.

Schema version 4 adds optional immutable environment bindings to secret sets. Apply `migrations/0004_secret_set_environment.sql` after schema 3; a generated diff alone does not express its null-safe uniqueness constraint. Existing sets remain unbound. Creating a set with an explicit environment stores its ID and enforces it on creation, member additions/replacements, and runtime resolution.

Audit metrics walk event pages by stable ID inside one repeatable-read transaction, including events committed before its first read and excluding later commits regardless of event timestamps. Multi-scope rate limits preflight every configured limit before charging. Shared CAS contention can still conservatively retain earlier charges; no stale-snapshot rollback is attempted.

Schema 4 requires PostgreSQL 15+ and migration `0004_secret_set_environment.sql`, including on a fresh installation generated from the portable schema. The migration enforces NULLS NOT DISTINCT uniqueness for `(tenant_id, namespace_id, environment_id, name)`. Set `secfn.migration_schema` on the migration connection when multiple deployments share a database; otherwise the migration requires exactly one matching table and fails rather than guessing. Bound sets with the same name coexist across environments; runtime resolution prefers an exact binding then a legacy unbound set. Members of legacy sets still must pass runtime scope checks.

Metrics require `capabilities.transactions.configurableIsolation` and `repeatable_read` support; adapters without those guarantees fail explicitly. The shared PostgreSQL Drizzle adapter implements per-call isolation. Namespace, schema and observability wrappers preserve it. Ordinary transaction calls without options retain their previous behavior.

Member additions and replacements acquire the parent set row lock in a read-committed transaction before checking output names. Set deletion takes the same lock before deleting members. Both runtime resolution and administrator reveal reject duplicate output names in legacy/corrupt sets instead of overwriting values. Secret renames can change the default output name of members without aliases; assign explicit unique aliases when those names collide.

### Existing duplicate set identities

Schema 4 preflights duplicate identities before changing the unique index and fails with an actionable `23505` error. It never deletes or merges sets or their members. A failed migration leaves the old schema intact after rollback. Inspect duplicate groups with the following query, replacing `deployment` with the selected schema:

```sql
SELECT tenant_id, namespace_id, to_jsonb(s)->>'environment_id' AS environment_id,
       name, array_agg(id ORDER BY id) AS set_ids
FROM deployment.secfn_secret_sets AS s
GROUP BY tenant_id, namespace_id, to_jsonb(s)->>'environment_id', name
HAVING count(*) > 1;
```

Choose one name per set before rerunning the migration. A deterministic candidate is each conflicting set's unique `id`: verify that no other set in that identity scope already uses the candidate as its name, then rename only the selected conflicting rows by ID in a transaction. Keep the original IDs and member references. If a candidate collides with an existing name, choose a distinct explicit name instead. The migration verifies uniqueness again; abort and review any remaining conflicts rather than dropping data. Migration connections must roll back a failed `BEGIN…COMMIT` script before issuing cleanup or retry statements.
