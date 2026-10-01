---
title: Release gate
description: TypeScript build, test, package, and live-qualification boundaries.
---

Release line: 0.1.0. Run `npm run gate:langfn-release` from repo root.
The TypeScript adoption checks `npm --prefix langfn/typescript run build`, type checking against real shared package declarations, the complete TypeScript suite, and built package imports. Python remains in the next source repository and is outside this TypeScript consumer adoption. Live Gemini verification is separately required before release readiness.

HTTP trace listing and feedback require an authenticated actor. Trace records persist `tenantId` and `userId` from trusted session metadata; SQL-backed custom trace stores must include those columns and apply both query predicates. Historical unowned traces are excluded from HTTP results. Direct trusted SDK access remains available for maintenance. HTTP provider errors omit upstream bodies and metadata.

Custom stores serving scoped HTTP access must advertise `supportsScope: true`, apply tenant/user predicates before pagination, and implement `findOne(traceId, scope)` for feedback ownership checks. A store that cannot meet that contract is rejected explicitly. Feedback records also carry top-level tenant/user fields for scoped idempotency.

Provider `timeout` is a total response deadline, including streaming bodies, in milliseconds. Set it to `0` to disable it or increase it for long generations; cancellation remains independent. The built-in graph checkpoint store retains at most 1000 entries (oldest evicted), atomically consumes checkpoints before resuming nodes, and uses UUIDs. Use an injected durable store for recovery across processes. Custom stores must implement atomic `take(id)` for resumption; save/load-only stores fail before node execution. After consumption, failures require application reconciliation, not replay of the old checkpoint. This is at-most-once checkpoint admission, not an exactly-once guarantee for external effects.

`api_call` allows public IPv4 literals by default. Hostnames and IPv6 literals require an explicit `allowedHosts` entry, because portable fetch cannot validate and pin a resolved address in both Node and Workers. Allowlisted hosts are trusted network exceptions, including all addresses they resolve to; do not populate the allowlist from model or request input. `allowPrivateNetwork: true` is a broader explicit opt-in. Redirects are rejected, and only HTTP(S) URLs without embedded credentials are accepted. Deployments needing dynamic hostname access should use an egress proxy that validates and pins destinations.

The storage-level `TraceStorage.saveFeedback` accepts top-level tenant/user fields or nested `scope`; conflicting values are rejected and both lookup and deduplication use the normalized scope. The public `LangFn.feedback()` request accepts only nested `scope`, while HTTP feedback derives scope from authenticated session metadata. Cached completions save a fresh scoped trace, allowing feedback on every returned trace ID. The built-in `/stream` SSE route cancels model work when its request signal aborts; the host adapter must propagate disconnects and stream responses. In that setup, configured retry signals remain effective unless a per-call cancellation token overrides them.
