# MailFn Operations

## Cloudflare deployment inputs

Use `@mailfn/cloudflare` and copy `wrangler.example.jsonc`. Provision one D1 database, one private R2 bucket, a work Queue plus DLQ for parse and webhook-delivery jobs, an Email Routing Worker binding, and a scheduled retention trigger. Configure these secrets/variables:

- `MAILFN_DOMAIN`, `MAILFN_SECRET_KEY` (32 random bytes, hex or base64)
- `MAILFN_STORAGE_REGION`, matching the provisioned D1 location and R2 jurisdiction; a deployment accepts only this region
- `MAILFN_ADMIN_TOKEN` for project bootstrap/admin operations
- `MAILFN_PROJECT_ID` after bootstrap
- optional `MAILFN_CORS_ORIGINS`
- optional Cloudflare API token, zone ID, and Worker name for custom domains
- custom domains also require `CLOUDFLARE_ZONE_NAME`; it must exactly match the authorized zone ID
- keep `MAILFN_PUBLIC_PLATFORM_ENABLED`, production approval, billing, and support false until separately approved
- keep `MAILFN_PROTOCOL_SERVICES_ENABLED=false`; HTTP/MCP availability never authorizes public IMAP/SMTP/JMAP services

Apply `migrations/0001_mailfn.sql` or allow `createCloudflareMailFn` to run versioned migrations. Bootstrap once with `POST /v1/admin/projects`, store the returned project credential in a secret manager, then set the project ID used by administrative operations.
Provision a separate Worker/D1/R2 deployment for every supported data region. MailFn rejects an allowlist that does not exactly match the deployment's declared storage region; region migration requires an explicit export/import operation and is not performed by configuration alone.

## Health and observability

`GET /health` confirms the Worker/API version. `GET /v1/operations/snapshot` reports active/expired inboxes, pending/failed parses, storage estimate, webhook failures, authorization failures, and rate-limit events with threshold alerts. Usage records support tenant billing/reconciliation but do not activate a billing provider.

Alert on Queue DLQ growth, `queue_failed` or `parse_failed` messages, webhook quarantine, authorization/rate-limit spikes, R2/D1 errors, retention deletion failures, stored-byte growth, and Email Routing failures. Cloudflare logs must not capture Authorization headers or content-bearing bodies.

Internal rollout succeeds only after a seven-day observation window meets all of these thresholds: at least 99.9% of accepted messages reach `ready` without operator repair, parse latency p95 is under 30 seconds, wait-to-visible latency p95 is under 35 seconds, the committed MIME extraction fixture set remains 100% deterministic, attachment/raw hash mismatches are zero, orphaned R2 objects found by reconciliation are zero, DLQ rate is below 0.1%, and MailFn-specific operational work is below one intervention per 1,000 accepted messages. Any threshold breach pauses expansion and triggers rollback to the prior Worker route.

## Recovery

- Queue outage: accepted messages remain `queue_failed` with raw MIME. Call `POST /v1/admin/reconcile` after Queue recovery.
- Parse failure: raw MIME remains. Fix parser/configuration and replay the versioned job; consumers must tolerate at-least-once delivery.
- Webhook outage: delivery state remains independent of message acceptance. Retry bounded transient failures; quarantine endpoints after repeated failures.
- Retention deletion failure: message/attachment metadata remains so the next scheduled pass can retry. Review `retention.delete_failed` audits.
- D1 metadata write after R2 raw write: raw cleanup is best effort. Inventory R2 keys without matching D1 IDs during maintenance.
- R2 loss: normalized D1 message remains but raw/attachment retrieval fails; restore from bucket recovery if configured.
- Project/inbox bootstrap: D1 batch transactions commit the resource and its initial credential/idempotency record together; a batch failure exposes neither.
- Concurrent inbound duplicate: the unique D1 delivery constraint elects one canonical message; the losing request removes its own R2 object and quota reservations, then returns the canonical row.
- Cloudflare delivery identity: normalized envelope plus SHA-256 raw evidence is the stable retry key. Do not substitute sender-controlled `Message-ID`. Distinct raw messages that reuse a header remain distinct; byte-identical envelope/raw evidence is intentionally treated as the same delivery.
- Ingress reservations: each new hourly bucket deletes older bucket rows through the indexed cleanup path, bounding the durable rate-limit ledger.
- Custom-domain activation: if D1 cannot persist the active rule ID, MailFn deletes the newly created provider rule. Rule creation first reuses a matching owned rule to make retry safe.
- Outbound failure: a newly created daily quota reservation is released when SendFn rejects before accepting the send; queued/sent provider acceptance keeps one deterministic per-draft usage record.

Before runtime changes, export D1 with `wrangler d1 export`, confirm R2 object-version recovery for the target bucket, and retain the prior Worker version and Email Routing rule ID. Restore validation must compare message IDs, raw object keys, attachment hashes, credential status, and schema version in a disposable environment. Rollback restores the previous Worker route and D1 export together; never roll schema state backward while leaving a newer Worker active.

## Verification and release

Before a package release, use Node 22 and run:

```sh
npm run gate:mailfn-release
sqlite3 :memory: < mailfn/cloudflare/migrations/0001_mailfn.sql
```

Before a runtime release, additionally deploy to a non-production Cloudflare environment, bootstrap a disposable project, create an expiring inbox, deliver real multipart mail through Email Routing, verify raw/attachment hashes, OTP/link extraction, webhook signature/replay handling, Queue retry/DLQ, retention, custom-domain enable/disable, and log redaction. Run a restore rehearsal from the D1 export and R2 recovery configuration, then record the rollout thresholds above for Router and one unrelated consumer. Deployment, DNS mutation, registry publication, and public-platform approval require explicit authorization.
