# MailFn Technical Specification

## Status and boundaries

- Package release: `0.1.0`
- HTTP API: `/v1`
- Event envelope: version `1`
- Queue jobs: `mailfn.parse` and `mailfn.webhook-delivery`, version `1`, on separate queue bindings so endpoint latency cannot delay MIME parsing
- Initial deployment adapter: Cloudflare Email Workers + Workers + D1 + R2 + Queues
- Outbound transport owner: SendFn through `@mailfn/sendfn`
- Protocol clients in scope: TypeScript client, CLI, MCP, test helpers
- Public multi-tenant launch: implemented as gated controls, not authorized or deployed

The core package must not import Cloudflare APIs or embed provider DNS/routing policy. Runtime integrations supply provider-required DNS records and implement the contracts in `@mailfn/core`.

## Domain model

`Project` is the tenancy and environment boundary. An `Inbox` owns an address, lifecycle, labels, and optional expiry. `Credential` holds only a token hash plus explicit scopes and may be project- or inbox-bound. `Message` owns normalized headers/content and independent raw, attachment, and message expiry clocks. `Attachment` points to object storage and includes a SHA-256 digest. `Thread`, `Draft`, `Webhook`, `WebhookDelivery`, `MailDomain`, `AuditEvent`, and versioned `MailFnEvent` are durable entities.

Tokens use the `mfn_<credential-id>_<secret>` form, are returned once, and are compared against a hash. Inbox-scoped credentials cannot cross inboxes or delegate permissions they do not hold. Idempotent inbox creation may replay the one-time token only when encrypted response storage is configured.

## Core behavior by phase

### Phase 0: definition and release design

- Stable and expiring inboxes are first-class modes.
- Stable defaults: message 30 days, raw 14 days, attachments 14 days, audit 365 days.
- Expiring defaults: message/raw/attachments 24 hours, audit 90 days, delete on inbox expiry.
- The core owns OTP and verification-link extraction so client, test, CLI, and MCP behavior cannot drift.
- Initial waits use bounded long polling; webhooks supply push delivery.
- Custom domains use reversible DNS verification and routing operations; provider-specific routing records belong to `MailFnDomainAdapter` implementations.
- Semver governs packages; breaking API/event changes require a new major/versioned route or envelope.

### Phase 1: inbound test inbox

- Project bootstrap and stable/expiring inbox CRUD.
- Scoped credentials, revocation, expiry, audit, atomic project/inbox/sender rate limits, stored-byte/outbound reservations, quotas, and idempotency.
- Preflight recipient lifecycle, declared size, sender policy, ingress quota, and storage quota before consuming raw MIME; store raw before metadata and enqueue only after both durable writes.
- Dedupe on `(inbox_id, provider_delivery_id)` for at-least-once delivery. Cloudflare derives this identity from normalized envelope plus raw SHA-256 evidence, never sender-controlled `Message-ID` alone.
- Parse MIME, sanitize HTML, block remote images, normalize addresses/headers, hash attachments, and preserve raw evidence.
- List, filter, paginate, read, download raw/attachments, wait with timeout/cancel, and extract OTP/link with source attribution.
- Typed TypeScript client and deterministic memory adapters/tests.

### Phase 2: integrations and operations

- CLI text/JSON and MCP surfaces default to metadata/redaction and reveal content or one-time credentials only through explicit actions. MCP validates JSON-RPC requests, enforces initialization, and never replies to notifications.
- Signed, timestamped, versioned webhooks have bounded retry, quarantine, DNS destination validation, and durable delivery-ID replay protection.
- Cloudflare custom-domain adapter verifies expected DNS before enabling routing and can disable the routing rule.
- Testing fixtures create expiring, idempotent inboxes and always dispose in lifecycle cleanup.
- Scheduled retention, audit trail, usage records, reconciliation, and operational snapshots/alerts are implemented.

### Phase 3: mailbox depth and outbound composition

- Thread resolution uses `In-Reply-To`/`References` before normalized-subject fallback.
- Labels and bounded message content search are scoped capabilities; the Cloudflare store maintains an FTS5 index transactionally with message rows.
- Draft, reply, reply-all, and forward flows preserve thread metadata and attachment references.
- Sending delegates to `MailFnSendAdapter`; `@mailfn/sendfn` adapts modern and legacy SendFn surfaces and propagates a stable per-draft idempotency key.
- Delegated credentials are limited to an actor's existing scopes and inbox boundary.

### Phase 4: gated public readiness

- Tenant quotas, hourly project/inbox/sender ingress rate limiting, daily outbound limits, usage accounting, abuse/support case management, compliance exports/retention locks/deletion SLAs, region-bound deployments, and operational alert thresholds are implemented.
- `PublicPlatformPolicy` defaults to disabled. Production-security approval, billing, support, verified-domain outbound, data residency, and future protocol services are explicit controls.
- A repository implementation is not public-launch approval. Deployment, DNS, package publication, billing activation, outbound approval, and compliance attestation remain external release gates.

## HTTP surface

All JSON responses use `{ ok, data, error, meta: { requestId, version } }`. Binary raw/attachment responses use `Cache-Control: private, no-store`. Representative routes:

- `POST /v1/admin/projects`
- `POST|GET /v1/inboxes`; `GET|PATCH|DELETE /v1/inboxes/:id`
- `POST|DELETE /v1/inboxes/:id/tokens[/:tokenId]`
- `GET /v1/inboxes/:id/messages`; `POST .../wait`; `GET .../search`
- `GET /v1/inboxes/:id/messages/:messageId[/raw|/attachments|/attachments/:attachmentId]`
- `POST .../extract|/reply|/forward`; `PUT .../labels`
- `GET /v1/inboxes/:id/threads`; `PUT .../threads/:threadId/labels`; `GET|POST /v1/inboxes/:id/drafts`; `GET|PATCH|DELETE /v1/drafts/:id`; `POST /v1/drafts/:id/send`
- `POST /v1/webhooks`; `POST /v1/domains`; `POST /v1/domains/:id/verify`; `DELETE /v1/domains/:id`
- `GET /v1/audit|/v1/operations/snapshot|/v1/billing/usage`
- `GET|POST /v1/abuse`; `PATCH /v1/abuse/:id`; `GET /v1/reputation`; `PUT /v1/reputation/:sender`; `GET|POST /v1/support/cases`; `PATCH /v1/support/cases/:id`; `PUT /v1/compliance`; `GET /v1/compliance/export`
- `POST /v1/admin/retention|/v1/admin/reconcile`

## Failure invariants

| Failure | Required result |
| --- | --- |
| R2 raw write fails | No D1 row or queue message; transient SMTP failure |
| D1 message write fails | Best-effort raw cleanup; no queue message; transient failure |
| Parse Queue send fails | Raw and D1 row remain; message becomes `queue_failed`; retry/reconcile is idempotent |
| Webhook Queue send fails | Event and pending delivery remain in D1; scheduled delivery reconciliation retries it without blocking inbound mail |
| Duplicate inbound delivery | Existing message returned; no duplicate row/event; failed queue may be retried |
| MIME/attachment parse fails | Raw remains; partial attachment writes are cleaned; state becomes `parse_failed`; Queue retries/DLQ applies |
| Webhook consumer fails | Accepted mail is not rolled back; delivery is failed/dead-lettered and repeated failures quarantine endpoint |
| Object deletion fails | Metadata remains retryable; retention audits failure and continues other records |
| Unknown/inactive/oversize/policy recipient | Permanent SMTP rejection with non-sensitive reason |

## Acceptance

The release gate must typecheck/build the package graph, pass unit/integration tests, create npm tarballs, install them into a clean temporary project, and import every public runtime. D1 migration SQL must execute in SQLite, schema and runtime migration definitions must cover every durable entity, and failure-mode tests must cover at-least-once dedupe, queue reconciliation, independent retention, object deletion retry, webhook isolation, credential containment, HTML sanitization, threading, extraction, and the public outbound gate.
