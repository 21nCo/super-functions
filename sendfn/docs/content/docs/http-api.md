---
title: HTTP API
description: Expose the optional router with an admin key.
---

# HTTP API

Set `enableApi: true` and supply `apiConfig.adminKey`, then mount `client.router` using a Superfunctions HTTP adapter. The router includes sends, device-token management, event queries, and an SES webhook route when SNS topics are configured. Administrative endpoints require `Authorization: Bearer <adminKey>`.

```ts
const client = sendfn({ database, enableApi: true, apiConfig: { adminKey: process.env.SENDFN_ADMIN_KEY } });
```

In an actual deployment, also configure the providers those routes need. Keep the admin key server-side, use TLS, and place the router behind the application's normal ingress controls. The [TypeScript guide](/docs/reference/typescript) lists the routes.
