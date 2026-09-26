---
title: Server setup
description: Configure persistence, encryption, host context, and route mounting.
---

Create the server with an adapter-backed database, encryption key source, trusted request context, and host authorization. The returned object contains `router`, `vault`, `access`, `rateLimit`, `audit`, `scanner`, and `getSchema()`.

```ts
import type { Adapter } from "@superfunctions/db";
import { createSecFnServer, type SecFnAdminAction, type SecFnRequestContext } from "@secfn/server";

interface Principal extends SecFnRequestContext {
  actorId: string;
  tenantId: string;
  allowedActions: SecFnAdminAction[];
}
interface Context extends SecFnRequestContext {
  allowedActions: SecFnAdminAction[];
}

export function createSecretsServer(
  db: Adapter,
  authenticate: (request: Request) => Promise<Principal | null>,
) {
  return createSecFnServer<Context>({
    db,
    basePath: "/secfn",
    encryption: { masterKey: process.env.SECFN_MASTER_KEY!, keyId: "env:main" },
    context: async (request) => {
      const principal = await authenticate(request);
      return principal
        ? { actorId: principal.actorId, tenantId: principal.tenantId,
            namespace: principal.namespace, allowedActions: principal.allowedActions }
        : { allowedActions: [] };
    },
    authorize: (ctx, action) => Boolean(
      ctx.actorId && ctx.tenantId && ctx.allowedActions.includes(action),
    ),
    namespaceProvider: (ctx) => ctx.namespace,
  });
}
```

The host’s `authenticate` callback must verify session identity and derive action grants from trusted policy. No session means no admin access; even audit listing requires an explicit `audit-events:list` grant.

Supply either `keyProvider` or `encryption.masterKey`; server creation fails when both are absent. The host owns key custody and rotation. The default router base path is `/secfn`, and the default JSON body limit is one MiB. SecFn does not re-export Express, Hono, Fastify, Next.js, or SvelteKit adapters. Use the shared HTTP adapter for the chosen host.

Rate limiting is disabled unless `rateLimit.enabled` is `true`. Every admin route passes a rate check and the host's `authorize` callback. If `authorize` is absent, admin access is denied. Runtime routes require a bearer service token and verify its scope before returning values. The health route returns `{ ok: true, data: { status: "ok" } }`. See [route reference](/docs/reference/routes) and [source router](https://github.com/21nCo/super-functions/blob/dev/secfn/server/src/router.ts).
