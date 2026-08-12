---
title: Security
description: filefn's threat model — what it protects, what it doesn't, and how to harden a deployment.
---

# Security

filefn is a kernel; it inherits some risks from the host stack and adds a small number of its own. This page explains the threat model and the configuration knobs that matter.

## What filefn protects

- **Bytes at rest** — the storage adapter handles encryption (S3 SSE, GCS CMEK, etc.). filefn doesn't add a second encryption layer.
- **Bytes in flight** — TLS termination is the host stack's job. filefn assumes incoming requests are TLS-terminated and signed URLs are HTTPS.
- **Multipart integrity** — every part is etagged; conflicts fail closed. The final SHA-256 (when supported by storage) is recorded in `fileVersions.checksumSha256Base64`.
- **Idempotent retries** — `x-idempotency-key` prevents duplicate sessions from accidental retries.
- **Anonymous upload tokens** — `uploadSessionToken` is hashed at rest and short-lived. Stealing the token gives access only for the session TTL and only for that one upload.
- **Visibility** — `private` files require a session or grant. `shared` enforces the same. Share-link tokens are opaque and hashed.
- **CSRF** — for routes that mutate, filefn requires either an `Authorization` header (bearer) or a CSRF-protected cookie. The kernel doesn't ship CSRF middleware itself; it expects the host framework to provide one.
- **Secret redaction** — every log, event, and webhook payload is scrubbed for signed URLs, bearer tokens, and session tokens.

## What filefn does *not* protect against

- **Network-level attacks** — DDoS, TLS termination, load shedding. Use a CDN / WAF in front of filefn.
- **Compromised storage** — if your S3 bucket is publicly writable, filefn can't help.
- **Compromised auth** — filefn calls `auth.resolveSession`. If your session resolver is broken, every protected route is broken.
- **Malicious uploads** — filefn doesn't run virus scans. Pair it with a `Processor` that does — see [Recipes › Virus scanning](../recipes/virus-scanning).
- **DoS through cost** — large uploads hit your storage egress / processing costs even if rate-limited at the request layer. Use [Quotas](../features/quota) to cap per-tenant storage.

## Hardening checklist

### 1. Real auth

`auth.resolveSession` should return a typed `principalId` and `tenantId`. Never bypass with a hard-coded user in production.

```ts
auth: {
  required: true,
  resolveSession: async (request) => {
    const session = await sessions.fromHeaders(request.headers);
    if (!session) return null;
    return { principalId: session.userId, tenantId: session.orgId };
  },
}
```

### 2. Per-route rate limits

Always configure `rateLimit.limits` in production. The unrestricted defaults are intentional (the kernel doesn't pretend to know your traffic), but they're not safe in the wild.

### 3. CORS

Default to a strict origin list. Wide-open `Access-Control-Allow-Origin: *` works for proxy-mode public files, but anything that depends on credentials must scope down.

### 4. Strict policies

- Upper-bound every policy's `maxSizeBytes`. Don't ship a policy with unlimited size unless you really mean it.
- Lock `contentTypes` — `image/*` is fine; `*/*` is a footgun.

### 5. Storage isolation

If you serve multiple tenants:

- Use per-tenant storage targets (`storageTarget: "tenant-${tenantId}"`).
- Use bucket policies to deny cross-tenant access at the storage layer.
- Use `storagePath` to prefix every object with the tenant id.

### 6. Quota

Configure `quota` to refuse uploads when a tenant approaches their plan limit. The default `QuotaProvider` interface exposes `current`, `limit`, and `requested` so the client can show useful errors.

### 7. Share-link hygiene

- Always set `expiresAt`. Forever-shareable tokens accumulate forever.
- Set `maxDownloads` if the link is meant for one or two recipients.
- Set `requiresAuth: true` for internal-only sharing.
- Show `tokenHashPrefix` (returned by `GET /share-links`) in audit UIs — never the raw token.

### 8. Logger / event sinks

Pipe events and logs to your observability stack. Pair `processing.failed` and high `FILEFN_RATE_LIMITED` rates with alerts.

### 9. Native bridge integrity

For WKWebView apps using `@filefn/swift-bridge`:

- The bridge handshake verifies protocol version (`filefn-bridge/v1`).
- Native-backed mode is fail-fast. Don't fall back to browser-owned uploads if the bridge fails.
- Preview URLs use `filefn-bridge://asset/{handle}/preview`. Never expose filesystem paths to JS.

## Reporting issues

Security issues should go through the [GitHub security advisory](https://github.com/21nCo/super-functions/security/advisories) flow, not the public issue tracker.
