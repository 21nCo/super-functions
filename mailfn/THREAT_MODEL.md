# MailFn Threat Model

## Assets and trust boundaries

The protected assets are mailbox addresses, raw MIME, normalized bodies, attachments, verification secrets, credential and webhook secrets, sender identity evidence, audit logs, usage records, and outbound authority. Trust boundaries exist at SMTP/Email Routing ingress, HTTP authentication, D1, R2, Queue jobs, webhook consumers, DNS/Cloudflare API calls, SendFn, CLI output, and MCP tool output.

## Required controls

- Credentials are random bearer secrets, stored only as hashes, returned once, explicitly scoped, revocable, and optionally expiring. Token comparisons and admin-token checks are constant-time.
- Project/inbox ownership is checked before resource existence is disclosed. Inbox-scoped actors cannot cross inboxes or expand delegated scopes.
- Raw MIME is evidence, never executable input. Parsed HTML removes scripts, event handlers, dangerous URLs, and remote-image loads. Attachment filenames and content types are normalized; bytes are hashed.
- Size, project/inbox/sender message-rate, inbox-count, attachment-size, webhook-count, domain-count, stored-byte, and outbound limits are tenant policy, not client suggestions. Ingress counts, stored bytes, and outbound sends use durable atomic reservations.
- Every Queue job and webhook event is versioned. Cloudflare ingress derives delivery identity from normalized envelope plus SHA-256 raw evidence rather than trusting sender-controlled `Message-ID`; byte-identical retries deduplicate before parsing while different raw messages sharing `Message-ID` remain distinct. Webhooks are HMAC-signed with timestamp and delivery ID; `verifyMailFnWebhookOnce` consumes delivery IDs through a durable replay store.
- Raw, attachment, message, and audit retention clocks are independent. Deletion metadata advances only after object deletion succeeds.
- CLI text and JSON plus MCP surfaces redact bodies, raw data, tokens, secrets, and verification values by default. Explicit extraction, content display, and one-time credential reveal are auditable opt-ins.
- Custom-domain routing is enabled only after DNS verification, exact zone-ID/name authorization, and explicit Email Routing enablement. Rule creation is idempotent and persistence failure compensates by deleting the provider rule. Public outbound requires separate production-security approval and verified sender domains.
- Errors and audits never include bearer tokens, webhook secrets, raw MIME, message bodies, or extracted verification values.

## Abuse cases

- Address enumeration: use generic recipient rejection reasons and avoid cross-tenant resource disclosure.
- Inbox flooding/storage exhaustion: preflight recipient, lifecycle, sender policy, declared size, hourly ingress, stored-byte, and active-inbox quotas before consuming or parsing MIME. Completed hourly ingress buckets are aged before new reservations. Abuse signals lower durable sender reputation, and blocked senders are rejected before storage.
- Open relay/spam: no SMTP submission exists in core; outbound requires SendFn, `send:write`, daily quota, platform approval, and domain policy.
- Verification-code theft: source attribution, least-privilege inbox tokens, short-lived test inboxes, no-store responses, and redacted agent surfaces.
- MIME parser exploits/tracking: treat parser as untrusted boundary, preserve raw separately, sanitize display HTML, block remote images, and cap attachment sizes.
- Webhook SSRF/exfiltration: dispatch resolves A/AAAA evidence, rejects non-public destinations and redirects, and still requires a production egress policy to close DNS-rebinding races; secrets are encrypted at rest and delivery failure cannot roll back mail.
- Replay/duplicate delivery: unique provider-delivery constraint, signed webhook timestamp/delivery ID, and idempotency keys.
- DNS takeover or routing mistakes: require expected-record verification, scoped Cloudflare token, explicit routing creation, and reversible disable.

## Public launch checklist

Public launch remains blocked until production-security approval is explicitly set after external review of tenant isolation, egress/SSRF policy, domain ownership, abuse response, billing enforcement, support operations, compliance/data residency, deletion evidence, alert routing, incident runbooks, and any IMAP/SMTP/JMAP compatibility service. Code defaults alone do not satisfy those reviews.
