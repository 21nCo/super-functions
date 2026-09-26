---
title: Server setup
description: Configure persistence, encryption, host context, and route mounting.
---

# Server setup

Create the server with an adapter-backed database, encryption key source, trusted request context, and host authorization. The returned object contains `router`, `vault`, `access`, `rateLimit`, `audit`, `scanner`, and `getSchema()`.

```ts
import { createSecFnServer } from "@secfn/server";

const secfn = createSecFnServer({
  db,
  basePath: "/secfn",
  encryption: { masterKey: process.env.SECFN_MASTER_KEY!, keyId: "env:main" },
  authorize: async (ctx, action) => canAdminister(ctx, action),
  namespaceProvider: (ctx) => ctx.namespace,
  logger,
});

// Mount secfn.router with your existing @superfunctions/http host adapter.
```

Supply either `keyProvider` or `encryption.masterKey`; server creation fails when both are absent. The host owns key custody and rotation. The default router base path is `/secfn`, and the default JSON body limit is one MiB. SecFn does not re-export Express, Hono, Fastify, Next.js, or SvelteKit adapters. Use the shared HTTP adapter for the chosen host.

Every admin route passes a rate check and the host's `authorize` callback. If `authorize` is absent, admin access is denied. Runtime routes require a bearer service token and verify its scope before returning values. The health route is a plain status response. See [route reference](/docs/reference/routes) and [source router](https://github.com/21nCo/super-functions/blob/dev/secfn/server/src/router.ts).
