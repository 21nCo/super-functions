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
