---
title: Cloudflare runtime
description: Provision Email Routing, D1, R2, Queues, and Worker handlers.
---

`@mailfn/cloudflare` supplies Email Worker ingress, the HTTP Worker API, D1 store and migrations, R2 objects, separate parse and webhook Queues, MIME parsing, signed webhooks, scheduled retention, and Cloudflare custom-domain operations.

```ts
import { createMailFnCloudflareHandlers } from "@mailfn/cloudflare";

export default createMailFnCloudflareHandlers({
  // Optional: sendAdapter supplied by your application.
});
```

Copy the package's `wrangler.example.jsonc`, provision its bindings, apply `migrations/0001_mailfn.sql`, set a 32-byte `MAILFN_SECRET_KEY`, and ensure `MAILFN_STORAGE_REGION` matches the D1/R2 deployment location. `MAILFN_ADMIN_TOKEN` protects initial `POST /v1/admin/projects`; set `MAILFN_PROJECT_ID` after bootstrap. Custom domains need the exact zone ID and name. Public-platform, production-security, billing, and support flags default off.

Ingress checks recipient lifecycle, sender policy, size, and quotas before reading MIME. It commits raw MIME to R2 before the D1 row, then enqueues parsing. Queue failure leaves a reconcilable row. Webhook deliveries use a separate Queue so endpoint latency cannot block MIME parsing. Read the [Cloudflare guide](/docs/reference/cloudflare), [operations](/docs/reference/operations), and [threat model](/docs/reference/threat-model) before deployment.

For outbound SendFn composition, import `createSendFnAdapter` from `@mailfn/sendfn` and pass `sendAdapter: createSendFnAdapter(sendfn)` to `createMailFnCloudflareHandlers`. The configured `sendfn` instance is host-owned; the adapter is not exported by `@mailfn/cloudflare`.
