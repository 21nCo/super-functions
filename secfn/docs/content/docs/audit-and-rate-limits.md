---
title: Audit and rate limits
description: Configure durable security events and quota enforcement.
---

The server exposes `AuditService`, `AccessService`, and `SecFnRateLimiter`. An admin authorizer returning `false` creates a `permission_denied` event. Missing authorizers, missing tenant context, conflicting namespaces, and tenant-resource rejections can bypass that write. Runtime `SecFnForbiddenError` failures during secret/set reads are audited, but earlier token verification and scope mismatches can bypass runtime auditing. Instrument the host boundary for complete denial coverage. The host supplies a logger and can provide an audit sink. Audit metrics traverse stable event pages in a repeatable-read transaction and require an adapter that advertises configurable transaction isolation; unsupported adapters fail explicitly.

Rate limiting is disabled by default; set `rateLimit.enabled: true` to enforce quotas. When enabled, rate checks run before admin and runtime actions. In-memory defaults are process-local. For shared quotas across instances, configure `rateLimit.atomicStore` with linearizable compare-and-set. Legacy persistence is accepted only with `singleProcess: true`. Multi-scope checks preflight all configured limits before charging; under shared CAS contention earlier charges may conservatively remain.

The DB adapter provides audit durability: `AuditService.write()` persists the event before delivering it to the optional sink. Sink failures are swallowed after persistence; the sink and host monitoring add operational visibility. Read the [server contract](/docs/reference/server) for exact transaction and rate-store guarantees, and the [source audit service](https://github.com/21nCo/super-functions/blob/dev/secfn/server/src/audit.ts) for event behavior.
