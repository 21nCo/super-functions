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

Audit metrics walk all event pages by stable ID instead of a 10,000-event cap; the walk is not a transactional snapshot of concurrent writes. Multi-scope rate limits preflight every configured limit before charging. Shared CAS contention can still conservatively retain earlier charges; no stale-snapshot rollback is attempted.

Schema 4 requires PostgreSQL 15+ and migration `0004_secret_set_environment.sql`, including on a fresh installation generated from the portable schema. The migration enforces NULLS NOT DISTINCT uniqueness for `(tenant_id, namespace_id, environment_id, name)`. Set `secfn.migration_schema` on the migration connection when multiple deployments share a database; otherwise the migration requires exactly one matching table and fails rather than guessing. Bound sets with the same name coexist across environments; runtime resolution prefers an exact binding then a legacy unbound set. Members of legacy sets still must pass runtime scope checks.

Metrics capture an exclusive timestamp cutoff before pagination, so writes timestamped during the scan are deferred to the next request. This is a bounded observational read, not a database snapshot: backdated events or transactions begun earlier but committed during the scan require a host-provided consistent snapshot for exact point-in-time accounting.
