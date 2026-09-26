---
title: Routes
description: SecFn admin and runtime route families.
---

# Routes

The server router defaults to `/secfn` as its base path. Admin routes require host `authorize(ctx, action, details)` and pass rate checks. They cover namespace and environment management, secrets, secret versions through rotate and reveal actions, secret sets and members, service-token creation and revocation, audit-event lists, and scan-run lists. Secret and set reveal routes require `confirm: true` in the request body.

Runtime routes are `GET /runtime/secrets/:key` and `POST /runtime/secret-sets/:name/resolve`, both under the base path. They require a bearer service token, trusted scope, and rate checks. `GET /runtime/health` returns plain status without the runtime token flow.

Admin lists and runtime reads have different authorization paths. The host should not expose admin routes to a token intended only for runtime retrieval. For exact methods, body fields, and response envelopes, use the [source router](https://github.com/21nCo/super-functions/blob/dev/secfn/server/src/router.ts) and [server package guide](/docs/reference/server).
