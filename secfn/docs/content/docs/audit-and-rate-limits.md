---
title: Audit and rate limits
description: Configure durable security events and quota enforcement.
---

# Audit and rate limits

The server exposes `AuditService`, `AccessService`, and `SecFnRateLimiter`. Admin denials and runtime scope denials create security audit events. The host supplies a logger and can provide an audit sink. Audit metrics traverse stable event pages in a repeatable-read transaction and require an adapter that advertises configurable transaction isolation; unsupported adapters fail explicitly.

Rate checks run before admin and runtime actions. In-memory defaults are process-local. For shared quotas across instances, configure `rateLimit.atomicStore` with linearizable compare-and-set. Legacy persistence is accepted only with `singleProcess: true`. Multi-scope checks preflight all configured limits before charging; under shared CAS contention earlier charges may conservatively remain.

The DB adapter, audit sink, and host monitoring determine durability and operational visibility. Read the [server contract](/docs/reference/server) for exact transaction and rate-store guarantees, and the [source audit service](https://github.com/21nCo/super-functions/blob/dev/secfn/server/src/audit.ts) for event behavior.
