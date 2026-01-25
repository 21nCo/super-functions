# DataFn Spec Compliance Audit (audit-fix comprehensive)

## Metadata
- timestamp: 2026-01-25T10:13:01Z (UTC)
- agent_name: unknown-agent
- model: gpt-5.2 (xhigh reasoning)
- IDE/Editor: Warp (Agent Mode)
- workspace path: /Users/ar/dev/superfunctions
- project root: /Users/ar/dev/superfunctions/datafn
- OS: macOS 26.0.1 (Darwin 25.0.0 arm64)
- shell: /bin/zsh
- node: v23.11.1
- npm: 11.6.1
- repo:
  - git repo: yes (/Users/ar/dev/superfunctions)
  - branch: HEAD (detached)
  - commit: ec7e3e4d5938dca77997723a0378ea58ed0ed485
  - dirty: yes (many modified tracked files + many untracked items; see Appendix: Commands)
- audited spec bundle:
  - /Users/ar/dev/superfunctions/datafn/.conduct/2026-01-24-audit-fix-comprehensive-spec
  - documents read: SPEC.md, REQUIREMENTS.md, TEST_VECTORS.md, INTENT_AUDIT.md, PLAN.md, phases/*
- audited code scope:
  - TypeScript: datafn/core, datafn/server, datafn/client, datafn/svelte, datafn/cli
  - Python: datafn/python
  - Shared deps (read for evidence only): packages/db, packages/http
- audit mode: read-only w.r.t. implementation code (only this report + logs.csv updated)

## Scope & Method
This audit assesses the implementation under /Users/ar/dev/superfunctions/datafn against the requirement inventory in REQUIREMENTS.md (spec bundle dated 2026-01-24).

Method used:
- Read spec bundle (SPEC/REQUIREMENTS/TEST_VECTORS/INTENT_AUDIT/PLAN + phases)
- Run targeted tests for requirement-specific vectors where available
- Run full test suites for key packages to assess overall compliance health
- Inspect implementation files for load-bearing behaviors when tests are missing

Important limitations:
- Repo is in a detached HEAD state and dirty, so results are not fully reproducible without restoring the exact tree state.
- Several test suites fail (notably @datafn/server and @datafn/client). Where a requirement is marked PASS, the supporting requirement-specific tests passed, but the overall package may still have unrelated failures.
- A critical drift exists between datafn/server/src and datafn/server/dist (see Cross-cutting Findings). This impacts real-world behavior for consumers importing @datafn/server.

## High-level Findings
### Coverage summary (REQUIREMENTS.md inventory)
- PASS: 36
- PARTIAL: 8
- FAIL: 2
- UNVERIFIED: 1

### Key PASS areas (examples)
- AUTH-001 invalid JSON ordering (pre-auth JSON parse)
- EXEC-001/002 error surfacing for query/mutation
- Mutation semantics: guards, replace, relation operations
- Pagination + cursor validation
- Storage adapter validation (memory + IndexedDB)
- Offline local DFQL expansion (relations + groupBy) (direct executor tests)
- Extension RPC deterministic IDs + subscriptionId delivery
- Python parity test suite passes

### Key gaps / failures
- DETERM-001: nondeterministic timestamps in record output (replace sets updatedAt via new Date())
- DOCS-001: core README still documents DatafnError.details as optional while stating details.path is always present
- Transact-related requirements are materially impacted by server build artifact drift: dist implementation does not match src/spec
- LIMIT-001 is only enforced via Content-Length fast-reject (no stream-size enforcement)

## Test Evidence Summary
### Package-level suites
- @datafn/core: PASS (40/40)
- @datafn/server: FAIL (10 failed files; 21 failed tests; 144 passed tests)
- @datafn/client: FAIL (2 failed files; 6 failed tests; 82 passed tests)
- @datafn/svelte: PASS
- @datafn/cli: PASS
- datafn (python): PASS (pytest in venv)

### Requirement-targeted suites (high-signal)
- AUTH-001: datafn/server/src/routes/__tests__/auth-ordering.test.ts (PASS)
- EXEC-001/002: datafn/server/src/routes/__tests__/execution-errors.test.ts (PASS)
- MUT-GUARD-001: datafn/server/src/execution/mutation/__tests__/guards.test.ts (PASS)
- MUT-REPLACE-001: datafn/server/src/execution/mutation/__tests__/replace.test.ts (PASS)
- MUT-REL-001: datafn/server/src/execution/mutation/__tests__/relations.test.ts (PASS)
- TX-ATOMIC/TX-QUERY/TX-LIMITS: datafn/server/src/execution/__tests__/transact.test.ts (PASS)
- PAGE-001/002 + DETERM-003: datafn/server/src/execution/query/__tests__/pagination.test.ts (PASS)
- FILTER/AGG/OBS/LIMIT-002: datafn/server/src/execution/__tests__/completeness.test.ts (PASS)
- SEARCH-001/002: datafn/server/__tests__/plugins.test.ts (PASS)
- SYNC-002/003 (ordering + remote-only rejection): datafn/server/__tests__/sync-ordering.test.ts (PASS)
- STORAGE-001/002/003: datafn/client/src/adapters/__tests__/storage-validation.test.ts (PASS)
- OFFLINE-001/002: datafn/client/src/offline/__tests__/local-dfql.test.ts (PASS)
- EXT-001 + DETERM-002: datafn/client/src/extension/__tests__/rpc.test.ts (PASS)

## Requirement Results
Statuses: PASS / PARTIAL / FAIL / UNVERIFIED

### P0 (Critical)
- AUTH-001 — PASS
  - Implementation: datafn/server/src/server.ts (withAuth parses JSON before authorize), datafn/server/src/http/json.ts
  - Verification: src/routes/__tests__/auth-ordering.test.ts (13/13)

- VALID-001 — PARTIAL
  - Implementation: query/mutation/push validation exists under datafn/server/src/validation/* and is used by routes.
  - Verification: src/validation/__tests__/validation.test.ts passes query/mutation/push vectors but FAILS 3 transact validation assertions.
  - Additional risk: datafn/server/dist implements legacy transact step shape (see Cross-cutting Findings), so published behavior is likely non-compliant.

- EXEC-001 — PASS
  - Verification: src/routes/__tests__/execution-errors.test.ts (TV-EXEC-QUERY-ERR-001/003, adapter INTERNAL, empty query semantics)

- EXEC-002 — PASS
  - Verification: src/routes/__tests__/execution-errors.test.ts (mutation error surfacing) + replace/guards tests

- MUT-GUARD-001 — PASS
  - Verification: src/execution/mutation/__tests__/guards.test.ts

- MUT-REPLACE-001 — PASS
  - Verification: src/execution/mutation/__tests__/replace.test.ts
  - Note: determinism issues remain (see DETERM-001).

- MUT-REL-001 — PASS
  - Verification: src/execution/mutation/__tests__/relations.test.ts

- MUT-REL-002 — PASS
  - Implementation evidence: datafn/server/src/validation/mutation.ts validates relation metadata keys
  - Verification: src/validation/__tests__/validation.test.ts includes “unknown metadata key in relation mutation returns DFQL_UNKNOWN_FIELD”

- TX-ATOMIC-001 — PARTIAL
  - Implementation: datafn/server/src/execution/transact.ts wraps via db.transaction when available; non-atomic fallback is sequential.
  - Verification: src/execution/__tests__/transact.test.ts passes, but rollback verification is limited (memory adapter transaction is mocked; rollback isn’t asserted).
  - Additional risk: datafn/server/dist appears to ignore db.transaction and does not match src.

- TX-QUERY-001 — PARTIAL
  - Verification: src/execution/__tests__/transact.test.ts includes query steps and read-your-writes (PASS).
  - Additional risk: datafn/server/dist transact executor appears mutation-only (no query steps).

- TX-LIMITS-001 — PARTIAL
  - Verification: src/execution/__tests__/transact.test.ts validates LIMIT_EXCEEDED and max in details.
  - Additional risk: datafn/server/dist does not accept/configure maxTransactSteps the same way.

- DETERM-001 — FAIL
  - Evidence: datafn/server/src/execution/mutation/dfql.ts sets updatedAt using `new Date().toISOString()` (affects record output determinism).

- DETERM-002 — PASS
  - Verification: datafn/client/src/extension/__tests__/rpc.test.ts (TV-DETERM-RPC-ID-001)

- DETERM-003 — PASS
  - Verification: datafn/server/src/execution/query/__tests__/pagination.test.ts (TV-CURSOR-SORT-*)

### P1 (High-value)
- PAGE-001 — PASS (pagination.test.ts)
- PAGE-002 — PASS (pagination.test.ts)

- STORAGE-001 — PASS (storage-validation.test.ts)
- STORAGE-002 — PASS (storage-validation.test.ts)
- STORAGE-003 — PASS (storage-validation.test.ts)

- OFFLINE-001 — PASS (local-dfql.test.ts)
- OFFLINE-002 — PASS (local-dfql.test.ts)
  - Note: the broader client suite still has failures in __tests__/offline-query.test.ts; these failures are not in the requirement’s listed vectors and appear related to query plumbing/hydration transitions.

- EXT-001 — PASS (src/extension/__tests__/rpc.test.ts)
  - Note: client suite has a failing legacy test (__tests__/extension-rpc.test.ts) expecting a different event shape.

- DOCS-001 — FAIL
  - Evidence: datafn/core/README.md defines `details?: { path: string; ... }` (optional) while claiming details.path is always present.

- DOCS-002 — PASS
  - Evidence: datafn/client/README.md uses `filters` and canonical mutation operations; no `where`/`update` examples found.

- DOCS-003 — PASS
  - Evidence: datafn/server/README.md lists capability strings: dfql.query/dfql.mutation/dfql.transact/sync.seed/sync.clone/sync.pull/sync.push.

- DOCS-004 — PASS (with notes)
  - Evidence: datafn/svelte/README.md Quick Start includes createDatafnClient + signal({ filters }) + toSvelteStore + Svelte usage.
  - Note: same README also contains an example using `where` (non-canonical) in Advanced Usage.

- PY-001..PY-006 — PASS
  - Verification: /Users/ar/dev/superfunctions/datafn/python/venv/bin/python -m pytest -q datafn/python/tests (exit 0)

- SEARCH-001 — PASS (server __tests__/plugins.test.ts)
- SEARCH-002 — PASS (server __tests__/plugins.test.ts)
- SEARCH-003 — PARTIAL
  - Evidence: datafn/server/src/execution/mutation/execute.ts calls search plugin updateIndices after successful mutations.
  - Verification: no explicit TV-SEARCH-INDEX-UPDATE-001 test located/executed.

### P2 (Completeness)
- FILTER-001 — PASS (completeness.test.ts)
- FILTER-002 — PASS (completeness.test.ts + operator support in server/src/execution/query/filters.ts)
- AGG-001 — PASS (completeness.test.ts)
- AGG-002 — PASS (completeness.test.ts)

- LIMIT-001 — PARTIAL
  - Evidence: datafn/server/src/http/middleware.ts checks Content-Length only; parseJsonBody reads full req.text() with no stream cap.

- LIMIT-002 — PASS (completeness.test.ts asserts LIMIT_EXCEEDED on deep nesting)

- LIMIT-003 — UNVERIFIED
  - No targeted test evidence collected for nested select token depth > N rejection.

- OBS-001 — PASS (completeness.test.ts verifies [REDACTED] in logs)

- OBS-002 — PARTIAL
  - Evidence: many tests print structured JSON logs with endpoint/resource/operation/duration, but log level configurability is not verified.

- SYNC-001 — PARTIAL
  - Evidence: datafn/server/src/execution/sync/change-tracking.ts uses CAS-style update retries for serverSeq allocation.
  - Verification: no concurrency test executed to prove uniqueness under load.

- SYNC-002 — PASS (server __tests__/sync-ordering.test.ts)
- SYNC-003 — PASS (server __tests__/sync-ordering.test.ts + client remote-only routing noted in codebase)

## Cross-cutting Findings
### 1) datafn/server build artifact drift (src vs dist) — High severity
Observed mismatch between TypeScript source and published entrypoint artifacts:
- Source transact handler expects step wrappers `{ mutation: ... } | { query: ... }` (datafn/server/src/routes/transact.ts).
- Dist transact handler validates legacy unwrapped shapes and rejects wrapper steps with DFQL_INVALID:
  - datafn/server/dist/index.js (around lines 2927–2960) checks `step.operation` / `step.resource` and errors with "Invalid DFQL: step must have resource or operation".

Impact:
- Consumers importing @datafn/server (which exports dist) may NOT get the spec-compliant transact semantics even if src tests pass.

### 2) Determinism violations affecting outputs
- Replace record building sets updatedAt with current wall clock time (datafn/server/src/execution/mutation/dfql.ts:62–83). This breaks determinism for identical inputs.

### 3) Test-suite health vs requirement coverage
- Server full suite currently fails, including:
  - REST wrapper expectations (__tests__/rest.test.ts)
  - Sync suite expectations (__tests__/sync.test.ts)
  - Legacy transact validation expectations (src/validation/__tests__/validation.test.ts)
- Client full suite currently fails, including:
  - Legacy extension RPC expectations (__tests__/extension-rpc.test.ts)
  - Offline query integration failures (__tests__/offline-query.test.ts)

## Recommendations (ranked)
1) Rebuild/realign @datafn/server dist with src and spec (transact shape, query steps, atomic behavior) and add CI guard to prevent drift.
2) Fix DETERM-001 by removing wall-clock timestamps from record outputs (e.g., updatedAt derivation for replace).
3) Update/replace legacy failing tests to match spec-defined behavior:
   - server/src/validation/__tests__/validation.test.ts transact cases should use wrapper-shaped steps
   - client/__tests__/extension-rpc.test.ts should expect { subscriptionId, event }
4) Add/execute missing test vectors:
   - SEARCH-003 index update vector
   - LIMIT-001 payload enforcement when Content-Length missing
   - SYNC-001 serverSeq concurrency test
5) Fix DOCS-001 in datafn/core/README.md (DatafnError.details must be non-optional if details.path is always present).
6) Fix the non-canonical `where` example in datafn/svelte/README.md to use `filters`.

## Appendix: Commands (selected)
Environment + repo:
- git -C /Users/ar/dev/superfunctions --no-pager rev-parse HEAD
- git -C /Users/ar/dev/superfunctions --no-pager rev-parse --abbrev-ref HEAD
- git -C /Users/ar/dev/superfunctions --no-pager status --porcelain=v1
- uname -a
- sw_vers
- node -v
- npm -v

Tests:
- npm --prefix datafn/core test
- npm --prefix datafn/server test
- npm --prefix datafn/server test -- src/routes/__tests__/auth-ordering.test.ts
- npm --prefix datafn/server test -- src/routes/__tests__/execution-errors.test.ts
- npm --prefix datafn/server test -- src/execution/mutation/__tests__/guards.test.ts
- npm --prefix datafn/server test -- src/execution/mutation/__tests__/replace.test.ts
- npm --prefix datafn/server test -- src/execution/mutation/__tests__/relations.test.ts
- npm --prefix datafn/server test -- src/execution/__tests__/transact.test.ts
- npm --prefix datafn/server test -- src/execution/query/__tests__/pagination.test.ts
- npm --prefix datafn/server test -- src/execution/__tests__/completeness.test.ts
- npm --prefix datafn/server test -- __tests__/plugins.test.ts
- npm --prefix datafn/server test -- __tests__/sync-ordering.test.ts
- npm --prefix datafn/server test -- __tests__/sync.test.ts
- npm --prefix datafn/client test
- npm --prefix datafn/client test -- src/adapters/__tests__/storage-validation.test.ts
- npm --prefix datafn/client test -- src/offline/__tests__/local-dfql.test.ts
- npm --prefix datafn/client test -- src/extension/__tests__/rpc.test.ts
- /Users/ar/dev/superfunctions/datafn/python/venv/bin/python -m pytest -q datafn/python/tests

Runtime check (dist drift evidence):
- node --input-type=module -e 'import { createDatafnServer } from "./datafn/server/dist/index.js"; ...' (wrapper-shaped steps rejected with DFQL_INVALID; legacy steps accepted)
