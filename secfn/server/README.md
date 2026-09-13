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
