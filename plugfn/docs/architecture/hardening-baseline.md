# PlugFn Hardening Baseline (Phase 00)

## Metadata

- Timestamp (UTC): 2026-03-11T17:37:22Z
- Spec folder: `2026-03-11-new-1gdtvan4-spec`
- Phase: `PHASE_00`
- Requirements mapped: `ARCH-002`, `OPS-001`, `OPS-002`
- Vectors mapped: `TV-ARCH-SHARED-USE-POS`, `TV-ARCH-SHARED-USE-NEG`, `TV-OPS-HARDEN-POS`, `TV-OPS-HARDEN-NEG`, `TV-OPS-MATRIX-POS`, `TV-OPS-MATRIX-NEG`
- Baseline artifacts:
  - `/tmp/plugfn-oauth-inventory.txt`
  - `/tmp/plugfn-phase00-vitest.txt`

## Working checklist (Phase 00 implementation tasks)

1. Enumerate OAuth entrypoints and duplication points: completed.
2. Record failing tests and classify root causes: completed.
3. Define provider policy fields/default states: completed in `docs/architecture/provider-policy-matrix.md`.
4. Define release gates mapped to requirements and vectors: completed in `docs/operations/release-gates.md`.
5. Publish baseline artifacts for subsequent phases: completed.

## Current-state inventory

### OAuth/auth entrypoints

- `plugfn/core/src/core/connection-manager.ts`
  - Local OAuth usage via `OAuthFlowHandler`.
  - In-memory state store initialization via `MemoryTokenStore` (`line 35`).
  - Private member access for state writes/reads/deletes (`lines 77, 92, 98` via `oauthHandler['tokenStore']`).
- `plugfn/core/src/auth/oauth-flow.ts`
  - Authorization URL generation and state persistence (`line 18+`).
  - Placeholder state metadata with blank `userId` and `provider` (`lines 26-27`).
- `plugfn/core/src/router/http-router.ts`
  - Additional route-level state generation via `Math.random` (`lines 150-152`).
  - User identity accepted from query params on connections/workflows routes (`lines 118, 197`).
- `plugfn/core/src/types/config.ts`
  - Auth provider interface exists (`line 43`) and config requires `auth` (`line 121`), but this is not enforced in router behavior.

### Webhook/routing inventory

- Generic route: `POST /webhooks/:provider/:event` (`router/http-router.ts:67`).
- Signature extraction: `x-signature` or `x-hub-signature` (`webhooks/webhook-handler.ts:39`).
- Verification branch only runs when `verifySignature` exists and `secret` is supplied (`webhook-handler.ts:41`).
- Unverified fallback currently marks webhook as verified when verification config or secret is absent (`webhook-handler.ts:49`).
- Provider path declarations include provider-specific static paths:
  - GitHub: `/webhooks/github/issues` (`providers/github/index.ts:190`)
  - Stripe: `/webhooks/stripe/payment` (`providers/stripe/index.ts:240`)

### Transport inventory

- `utils/request.ts` applies `Content-Type: application/json` by default (`line 50`).
- Request body is always `JSON.stringify(data)` (`line 57`).
- Stripe provider action payloads intentionally send form-encoded content (`providers/stripe/index.ts:57,138,195`), creating a baseline mismatch risk when transport path serializes incorrectly.

### Placeholder/stub inventory

- CLI provider test command still emitted scaffold output at baseline capture time: `plugfn/cli/src/commands/test.ts:23`.

## Duplication/fragility findings relevant to ARCH-002

1. OAuth state lifecycle is split across `OAuthFlowHandler` and `ConnectionManager` with private-member access.
2. Connection manager currently couples to in-memory state storage, which is not production-safe in multi-instance deployments.
3. Router-level state generation duplicates OAuth-state concerns and bypasses shared abstraction design intent.
4. Auth provider abstraction is declared in config type but not actively used by route handlers for identity derivation.

## Baseline test status summary (relevant to OPS-001)

Reference snapshot: `core/tests/baseline/current-failures.snapshot.md`

- Command: `npm exec --workspace plugfn -- vitest --run || true`
- Result: 1 test file run, 6 tests total, 3 failed, 3 passed.
- Recurring failure signature:
  - `Invalid encrypted data format`
  - Root mismatch between mocked encrypted credential payload (`testing/mock-provider.ts:91`) and decrypt path (`storage/token-storage.ts`, `utils/crypto.ts:51`).

Root cause categories:

1. Test fixture and encryption contract mismatch.
2. Failure masking in action execution tests due credential decode failure before action assertions.
3. Batch path inherits same credential decode failure.

## Release readiness matrix baseline (relevant to OPS-002)

- Matrix gate command from vector:
  - `turbo run build test --filter=@superfunctions/oauth-core --filter=@superfunctions/oauth-http --filter=@superfunctions/oauth-storage --filter=@superfunctions/oauth-providers --filter=plugfn --filter=@authfn/core`
- Current baseline status:
  - Shared OAuth packages do not exist yet; matrix is expected to fail until Phase 01+.
  - `plugfn` current test baseline has known failures; hardening required before matrix can pass.

## Requirement mapping summary

### ARCH-002 baseline evidence

- Evidence captured for duplication points and non-shared OAuth paths.
- Gate checks defined to prove shared-package adoption and legacy logic removal.
- Implementation completion is intentionally pending later phases per plan sequence.

### OPS-001 baseline evidence

- Current failing tests captured and categorized.
- Regression surface identified (`mock encrypted data format` path).
- Placeholder critical-path behavior identified (CLI test command).

### OPS-002 baseline evidence

- Deterministic matrix gate defined with exact filters and fail behavior.
- Baseline prerequisites and expected failure reasons documented.

## Phase 00 discrepancy note

- `ARCH-002`, `OPS-001`, and `OPS-002` are production-end-state requirements.
- Phase 00 is a baseline/reporting phase by design and does not modify runtime behavior.
- This document captures objective evidence, gate definitions, and blocker inventory needed for implementation phases.
