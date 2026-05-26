# PlugFn Current Failures Snapshot (Phase 00)

## Metadata

- Timestamp (UTC): 2026-03-11T17:50:55Z
- Captured command:

```bash
cd /Users/serro/Documents/dev/n/superfunctions/plugfn/core && npm test -- --run || true
```

- Raw output artifact: `/tmp/plugfn-phase00-vitest.txt`

## Suite summary

- Test files: 1
- Total tests: 6
- Passed: 3
- Failed: 3
- Dominant failure message: `Invalid encrypted data format`

## Failed tests

1. `tests/basic.test.ts > PlugFn SDK > Action Execution > should execute an action successfully`
   - Failure: `Invalid encrypted data format`
2. `tests/basic.test.ts > PlugFn SDK > Action Execution > should handle action errors`
   - Failure: expected `Action failed` but received `Invalid encrypted data format`
3. `tests/basic.test.ts > PlugFn SDK > Batch Execution > should execute multiple actions in batch`
   - Failure: expected success but got failure due to credential decode error

## Root cause classification

### Category A: Test fixture and encryption contract mismatch

- `mockConnection` fixture stores `encrypted: 'mock-encrypted-data'` in `src/testing/mock-provider.ts:91`.
- Runtime decrypt path expects `iv:authTag:ciphertext` format in `src/utils/crypto.ts:51`.
- This mismatch causes credential decode failure before action behavior is evaluated.

### Category B: Cascading test assertion masking

- Action-specific assertions do not execute because credential decode fails first.
- This masks intended behavior verification for error handling and batch execution.

### Category C: Critical-path placeholder behavior (non-test failure but release blocker)

- CLI provider test command remains unimplemented in `plugfn/cli/src/commands/test.ts:23`.
- This violates the hardening direction under `OPS-001` and prevents actionable diagnostics.

## Additional baseline observations

1. Router still trusts `userId` query params on route handlers:
   - `src/router/http-router.ts:118`
   - `src/router/http-router.ts:197`
2. OAuth state is generated in router using `Math.random` at:
   - `src/router/http-router.ts:150-152`
3. OAuth state handling in connection manager uses in-memory token store and private member access:
   - `src/core/connection-manager.ts:35`
   - `src/core/connection-manager.ts:77`
   - `src/core/connection-manager.ts:92`
   - `src/core/connection-manager.ts:98`

## Phase relevance

This snapshot is the baseline evidence artifact for:

- `ARCH-002` (shared OAuth migration baseline)
- `OPS-001` (current failing tests and hardening backlog)
- `OPS-002` (pre-matrix readiness state)
