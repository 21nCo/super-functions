# `@mailfn/cloudflare`

Cloudflare runtime adapter for MailFn: Email Worker ingress, Worker HTTP API, D1 store/migrations, R2 object storage, Queue producer/consumer, `postal-mime` parsing, signed webhooks, scheduled retention, and Cloudflare Email Routing custom-domain operations.

```ts
import { createMailFnCloudflareHandlers } from '@mailfn/cloudflare';

export default createMailFnCloudflareHandlers({
  // Optional: sendAdapter: createSendFnAdapter(sendfn)
});
```

Copy `wrangler.example.jsonc`, provision the declared bindings, apply `migrations/0001_mailfn.sql`, and set a 32-byte `MAILFN_SECRET_KEY`. `MAILFN_STORAGE_REGION` must match the D1/R2 deployment location. `MAILFN_ADMIN_TOKEN` protects initial `POST /v1/admin/projects`; set `MAILFN_PROJECT_ID` after bootstrap. Custom domains require an exact `CLOUDFLARE_ZONE_ID` plus `CLOUDFLARE_ZONE_NAME`. Public-platform, production-security, billing, and support flags default off.

The Email Worker preflights recipient lifecycle, sender policy, declared size, ingress quota, and stored-byte quota before reading raw MIME. Delivery identity is a SHA-256 fingerprint over normalized envelope plus raw evidence, not sender-controlled `Message-ID`. Raw MIME is then committed to R2 before the D1 row; the parse Queue job is sent last. Queue failures leave a reconcilable `queue_failed` row. Events and pending webhook deliveries are committed together, then webhook-delivery jobs use a separate Queue binding and consumer so endpoint latency cannot block MIME parsing; scheduled reconciliation recovers unsent or abandoned jobs. See the parent `OPERATIONS.md` and `THREAT_MODEL.md` before deployment.

Webhook targets must resolve directly to public origin IP addresses. Cloudflare-proxied targets are rejected when the webhook is created because the Workers TCP socket API cannot connect to Cloudflare IP ranges; use a non-proxied DNS record or a direct-origin endpoint for webhook delivery.

The package test command includes Node unit tests and a workerd integration suite using real local D1 and R2 bindings, Email/Queue handler invocation, D1 batch atomicity, durable webhook replay, and concurrent quota enforcement. A real Cloudflare Email Routing/DNS smoke remains an approval-gated pre-runtime-release operation.
