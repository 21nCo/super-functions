## Metadata

- timestamp: `2026-04-20T10:27:26Z`
- agent_name: `codex`
- model: `gpt-5.4`
- launcher: `Codex desktop`
- workspace/project path: `repo root`
- os: `Darwin arm64`
- shell: `zsh`
- git:
  - branch: `codex/billfn-phase1`
  - commit: `db99dadc8ec500377bf181931075c3ea0bbe8e0e`
  - dirty: `no`

## Audit scope

This is a full read-only audit of the Phase 1 TypeScript `billfn` implementation under `billfn/` against the architecture and core requirements discussed for `billfn`.

Codebase scope audited:

- `billfn/core`
- `billfn/client`
- `billfn/svelte`
- `billfn/provider-dodo`
- `billfn/provider-apple`

Excluded from behavioral pass/fail:

- generated `dist/` artifacts
- any downstream adoption work in `authfn`, `filefn`, or app packages
- Python bindings, docs/examples beyond the architecture note

## Inputs audited (intent + spec bundles)

Intent / notes audited:

- `billfn/README.md`
- `billfn/docs/content/docs/architecture.mdx`
- `billfn/docs/content/docs/getting-started.mdx`

Spec bundles audited:

- no standalone in-repo spec bundle or REQUIREMENTS.md was provided for `billfn`
- this audit therefore uses the repo-local README and docs architecture/getting-started pages as the authoritative intent/spec baseline for pass/fail on core requirements

Implementation inputs audited:

- `billfn/core/src/types.ts`
- `billfn/core/src/helpers.ts`
- `billfn/core/src/schema.ts`
- `billfn/core/src/http.ts`
- `billfn/core/src/errors.ts`
- `billfn/core/src/router.ts`
- `billfn/core/src/service.ts`
- `billfn/core/src/__tests__/billfn.test.ts`
- `billfn/client/src/types.ts`
- `billfn/client/src/http-client.ts`
- `billfn/client/src/index.ts`
- `billfn/client/src/__tests__/client.test.ts`
- `billfn/svelte/src/context.ts`
- `billfn/svelte/src/stores.ts`
- `billfn/provider-dodo/src/index.ts`
- `billfn/provider-dodo/src/__tests__/provider.test.ts`
- `billfn/provider-apple/src/index.ts`
- `billfn/provider-apple/src/__tests__/provider.test.ts`
- `billfn/*/package.json`

## High-level findings

Overall status: `NOT production ready`

Summary:

- The package split and core surface are directionally aligned with the intended architecture.
- The implementation does expose the intended `subscriptionProvider` and `quotaProvider` seams and uses shared `@superfunctions/*` building blocks in the core service.
- The current implementation has several production-blocking security and correctness issues around subject resolution, restore ownership, webhook idempotency, webhook projection, and usage accounting concurrency.
- Test coverage is far below what is needed for billing. There are no webhook dedupe tests, no ownership/authorization tests, no race-condition tests, and no restore abuse tests.

Top risks:

1. Authenticated callers can override the resolved billing subject with arbitrary body/query input.
2. Restore flows can project another party's purchase into the caller's billing account.
3. Webhook dedupe is not atomic and the schema does not enforce provider-event uniqueness.
4. Webhooks cannot create missing subscriptions or entitlements, so provider-driven reconciliation is incomplete.
5. Usage metering is non-atomic and accepts negative deltas, so quotas are not trustworthy under concurrency or malicious input.

## Intent Inventory

1. `billfn` must be a reusable billing and entitlements kernel for `superfunctions`, not an app-specific plan module.
2. Entitlements must be the primary internal source of truth for access decisions.
3. Providers must remain separate packages from the start.
4. The core must reuse shared `@superfunctions/*` packages rather than rolling custom primitives.
5. The public shape must support local SDK usage and hosted/remote usage.
6. The architecture must expose provider seams that other superfunctions can consume.
7. `billfn` must compose cleanly with `authfn`, `filefn`, `datafn`, and future functions.
8. `authfn` should enrich authenticated sessions using billfn’s billing-account resolution rather than being bypassed by caller-controlled identifiers.
9. `filefn` should consume a quota seam backed by billfn entitlements rather than billing-provider-specific logic.
10. The route surface should separate consumer-facing entitlement reads from operational billing mutations.
11. Billing account resolution must be canonical and shared.
12. Catalog and provider mappings must be data-driven and not hardcoded into app-local source.
13. The system must model subscriptions, checkout sessions, entitlements, usage, webhook receipts, and billing events as separate concerns.
14. Webhook ingestion must verify signatures, record receipts, dedupe idempotently, and project normalized entitlement state.
15. The implementation must preserve entitlement correctness even when provider events arrive asynchronously.
16. Usage/quota enforcement must be reliable enough for `filefn`-style enforcement.
17. Error handling should use canonical shared envelopes and typed errors.
18. Compatibility/versioning/migrations should be explicit enough for later rollout.
19. Phase 1 should include Dodo and Apple provider support, plus core/package seams for other providers later.
20. Phase 1 should ship tests that cover entitlement projection, webhook dedupe, and quota behavior.

## Intent → Spec coverage matrix

| Intent item | Architecture coverage | Implementation status |
| --- | --- | --- |
| 1 | Covered | PASS |
| 2 | Covered | PARTIAL |
| 3 | Covered | PASS |
| 4 | Covered | PARTIAL |
| 5 | Covered | PASS |
| 6 | Covered | PASS |
| 7 | Covered | PARTIAL |
| 8 | Covered | FAIL |
| 9 | Covered | PARTIAL |
| 10 | Covered | PASS |
| 11 | Covered | PARTIAL |
| 12 | Covered | PARTIAL |
| 13 | Covered | PASS |
| 14 | Covered | FAIL |
| 15 | Covered | FAIL |
| 16 | Covered | FAIL |
| 17 | Covered | PARTIAL |
| 18 | Covered | PARTIAL |
| 19 | Covered | PARTIAL |
| 20 | Covered | FAIL |

## Requirement coverage summary

Derived requirement set: `ARCH`

- PASS: 6
- PARTIAL: 8
- FAIL: 6
- UNVERIFIED: 0

## Requirement-by-requirement results

| ID | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| ARCH-01 | Provider implementations are isolated packages | PASS | `billfn/provider-dodo`, `billfn/provider-apple` |
| ARCH-02 | Core reuses shared superfunctions packages | PARTIAL | Uses `db/http/envelope/errors/metrics/queue`; does not implement `auth`, `webhooks`, or `http-openapi` integration at core surface |
| ARCH-03 | Auth-resolved subject must be authoritative | FAIL | `billfn/core/src/helpers.ts:88-109` |
| ARCH-04 | Expose entitlement and quota seams | PASS | `billfn/core/src/service.ts:96-184`, `billfn/core/src/types.ts:381-407` |
| ARCH-05 | Route surface split between consumer and operational billing flows | PASS | `billfn/core/src/router.ts:10-169` |
| ARCH-06 | Canonical billing account resolution shared across consumers | PARTIAL | Exists, but caller-controlled identifiers can override auth and create accounts on read paths |
| ARCH-07 | Entitlements are the primary consumer-facing read model | PARTIAL | Read model exists, but webhook projection and restore correctness are incomplete |
| ARCH-08 | Webhooks must be idempotent and deduped | FAIL | `billfn/core/src/service.ts:461-489`, `billfn/core/src/schema.ts:105-117` |
| ARCH-09 | Webhooks must project provider state into subscriptions/entitlements | FAIL | `billfn/core/src/service.ts:499-520` ignores unmatched events |
| ARCH-10 | Quota enforcement must be reliable | FAIL | `billfn/core/src/service.ts:142-169`, `955-993` |
| ARCH-11 | Restore/reconciliation must be safe and ownership-aware | FAIL | `billfn/core/src/service.ts:380-412`, provider restore implementations |
| ARCH-12 | Error handling should use canonical envelopes and typed errors | PARTIAL | Core router uses canonical errors; Svelte wrapper erases error typing |
| ARCH-13 | Dodo Phase 1 support | PARTIAL | Basic create/verify/cancel/restore exist; webhook verification is optional and receipt metadata overstates verification |
| ARCH-14 | Apple Phase 1 support | PARTIAL | Basic create/verify/sync/restore exist; webhook support absent; ownership binding absent |
| ARCH-15 | Compatibility/versioning/migrations explicit enough for rollout | PARTIAL | `schema.version = 1` exists, but no migration path or uniqueness constraints for durable rollout |
| ARCH-16 | Phase 1 tests should cover entitlement projection, webhook dedupe, quota behavior | FAIL | Only happy-path tests; no webhook, race, or auth boundary coverage |

Per-requirement notes:

- `ARCH-03`: `resolveRequestSubject()` returns `bodySubject` before consulting the configured auth resolver. Any POST route that accepts a `subject` payload can therefore act on an arbitrary billing account instead of the authenticated actor.
- `ARCH-08`: receipt dedupe is implemented as `findOne` followed by `create`, with no schema-level uniqueness on `(provider, providerEventId)`. Concurrent deliveries can double-process the same event.
- `ARCH-09`: webhook projection only updates an existing subscription found by provider references. If the first provider signal is a webhook, or if identifiers do not match a pre-existing row, the event is recorded and then ignored.
- `ARCH-10`: usage updates are read-modify-write with no compare-and-swap or atomic increment semantics, and negative deltas are accepted.
- `ARCH-11`: restore calls accept an arbitrary `purchaseReference` and write the returned state into the caller’s resolved billing account without proving the purchase belongs to that account.

## Spec conflicts / spec gaps

Spec conflicts:

- None found in the provided inputs.

Spec gaps:

- No formal in-repo REQUIREMENTS bundle exists for `billfn`.
- No explicit acceptance criteria were provided for restore ownership verification, webhook bootstrapping, or atomic quota accounting.
- The architecture mentions OpenAPI and later migration/shadow-read work, but there is no formal Phase 1 acceptance definition for those items.

## Cross-cutting audits (security/determinism/limits/errors/compat)

### Security / authz / validation boundaries

Status: `FAIL`

Findings:

- `billfn/core/src/helpers.ts:88-109`: body-supplied subject data overrides the configured auth resolver.
- `billfn/core/src/router.ts:54-165`: all mutating routes accept caller-supplied `subject` and trust it if present.
- `billfn/core/src/service.ts:380-412`: restore writes entitlements into the resolved billing account with no provider-backed subject ownership proof.
- `billfn/provider-dodo/src/index.ts:141-168`: signature verification is optional, but `billfn/core/src/service.ts:474-483` always records `signatureVerified: true`.

### Determinism invariants

Status: `FAIL`

Findings:

- `billfn/core/src/service.ts:461-489`: webhook dedupe is not deterministic under concurrent delivery.
- `billfn/core/src/service.ts:955-993`: usage metering is not deterministic under concurrent updates because increments are not atomic.
- `billfn/core/src/helpers.ts:22-24`: the default ID factory uses `Math.random()` and wall-clock time; acceptable for local IDs, but not ideal for deterministic replay/testing.

### Limits / caps

Status: `FAIL`

Findings:

- `billfn/core/src/service.ts:144-169`: no validation rejects negative `requestedBytes` or `bytes`, so callers can manipulate usage downward.
- `billfn/core/src/service.ts:171-182`: `quotaProvider.getUsage()` returns `-1` when no entitlement snapshot exists, which reads as “unlimited” rather than “unknown” or “inactive”.

### Error handling + canonical envelopes

Status: `PARTIAL`

Strengths:

- Core errors use `@superfunctions/errors`.
- Router `onError` maps thrown typed errors into canonical envelopes.
- Client normalizes success/error envelopes using `@superfunctions/envelope`.

Gaps:

- `billfn/svelte/src/stores.ts:21-23` unsafely casts a possible error envelope to `BillFnEntitlementsResponse`, which destroys canonical error typing at the UI seam.
- `billfn/provider-dodo/src/index.ts:150` will throw raw `SyntaxError` on malformed webhook JSON, which will surface as a generic internal error rather than a normalized provider/validation error.

### Compatibility / versioning / migrations

Status: `PARTIAL`

Strengths:

- `billfn/core/src/schema.ts:130-142` exposes `version: 1`.

Gaps:

- No migration helper or upgrade strategy exists for schema changes.
- No uniqueness constraints are modeled for critical external identifiers such as webhook receipts or provider subscription references.
- No compatibility or migration fixtures exist for legacy billing data.

## Recommendations

1. Make auth authoritative on every route.
   - Change `resolveRequestSubject()` to prefer the configured auth resolver over caller-supplied body/query data, or disallow caller-supplied subjects entirely on authenticated routes.
   - Relevant intent items: 7, 8, 11
   - Relevant requirement IDs: `ARCH-03`, `ARCH-06`

2. Secure restore and verification ownership binding.
   - Require provider-backed ownership evidence before writing restored purchases into a billing account.
   - At minimum, bind restore/verify payloads to an app/user token or an existing checkout/session linkage.
   - Relevant intent items: 2, 14, 15
   - Relevant requirement IDs: `ARCH-07`, `ARCH-11`

3. Make webhook dedupe atomic.
   - Add a uniqueness guarantee on `(provider, providerEventId)` and handle duplicate insert races as no-ops.
   - Relevant intent items: 14, 15, 18
   - Relevant requirement IDs: `ARCH-08`, `ARCH-15`

4. Let webhooks bootstrap state, not just update existing rows.
   - Use provider payloads plus catalog mapping to create or reconcile subscription records when no subscription row exists yet.
   - Relevant intent items: 2, 14, 15
   - Relevant requirement IDs: `ARCH-09`

5. Make quota accounting safe under concurrency.
   - Reject negative usage deltas.
   - Use atomic increment/update semantics in the adapter layer or explicit locking/version checks.
   - Relevant intent items: 9, 16
   - Relevant requirement IDs: `ARCH-10`

6. Stop overstating webhook verification.
   - Persist the actual verification result and require secrets/signatures in production-facing examples.
   - Relevant intent items: 14, 17
   - Relevant requirement IDs: `ARCH-12`, `ARCH-13`

7. Expand the test matrix before rollout.
   - Add tests for subject override attempts, restore abuse, webhook dedupe races, webhook-first reconciliation, negative usage deltas, and concurrent usage increments.
   - Relevant intent items: 14, 15, 16, 20
   - Relevant requirement IDs: `ARCH-08`, `ARCH-09`, `ARCH-10`, `ARCH-16`

## Appendix: commands run + environment details

Commands executed during audit (repo-relative form):

- `git status --short`
- `git rev-parse --abbrev-ref HEAD`
- `git rev-parse HEAD`
- `uname -sm`
- `date -u +"%Y-%m-%dT%H:%M:%SZ"`
- `find billfn -maxdepth 3 -type f | sort`
- `rg -n "..." billfn package.json`
- `sed -n ... billfn/core/src/{types.ts,helpers.ts,http.ts,errors.ts,router.ts,service.ts,schema.ts}`
- `sed -n ... billfn/client/src/{types.ts,http-client.ts,index.ts}`
- `sed -n ... billfn/svelte/src/{context.ts,stores.ts,index.ts}`
- `sed -n ... billfn/provider-dodo/src/index.ts`
- `sed -n ... billfn/provider-apple/src/index.ts`
- `sed -n ... billfn/*/src/__tests__/*.ts`
- `npm --workspace billfn/core test`
- `npm --workspace billfn/client test`
- `npm --workspace billfn/provider-dodo test`
- `npm --workspace billfn/provider-apple test`

Environment details:

- repo root: `repo root`
- external intent note: `agent/intent/billfn/ai-notes/architecture.md` (outside repo)
