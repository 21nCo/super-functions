## Phase goal

Implement `/datafn/transact` (atomic, fail-fast) and the sync endpoints (`clone`, `pull`, `push`) so `TV-TX-*` and `TV-SYNC-*` vectors pass.

---

## In scope

- `/datafn/transact`:
  - ordered execution
  - fail-fast on first failing step
  - atomic rollback when `atomic:true`
- Sync endpoints:
  - `/datafn/clone`
  - `/datafn/pull`
  - `/datafn/push`
- Reference cursor store (in-memory) using base-10 integer strings, monotonic per table.

## Out of scope

- `/datafn/seed` (can return `{ ok:true }` placeholder until a future spec requires it).
- Full multi-tenant/account partitioning (host integration point only).
- Conflict resolution beyond `if` guards and server-ordered “apply once” behavior.

---

## Deliverables

- `superfunctions/datafn/server/src/routes/transact.ts`
- `superfunctions/datafn/server/src/execution/transact.ts`
- `superfunctions/datafn/server/src/routes/sync.ts` (or separate route files per endpoint)
- `superfunctions/datafn/server/src/execution/sync/cursors.ts`
- `superfunctions/datafn/server/src/execution/sync/clone.ts`
- `superfunctions/datafn/server/src/execution/sync/pull.ts`
- `superfunctions/datafn/server/src/execution/sync/push.ts`
- `superfunctions/datafn/server/__tests__/transact.test.ts` (assert `TV-TX-001`, `TV-TX-002`)
- `superfunctions/datafn/server/__tests__/sync.test.ts` (assert `TV-SYNC-001`..`TV-SYNC-006`)

---

## Requirements covered

- TX-001
- SYNC-001
- SYNC-002
- SYNC-003

---

## Implementation tasks

- [ ] Implement transact executor:
  - [ ] Parse request `{ transactionId?, atomic?, steps[] }`.
  - [ ] Execute steps sequentially; stop at first failing step.
  - [ ] For `atomic:true`, execute steps inside a transactional snapshot of the in-memory store:
    - [ ] Apply mutations to a copy; only commit to the live store if all executed steps succeed.
    - [ ] On failure, discard copy; ensure no effects persisted.
  - [ ] Return `{ ok, results }` using the step result shape from `SPEC.md`.
- [ ] Implement clone:
  - [ ] Reject any table whose schema has `isRemoteOnly:true` with `DFQL_INVALID` message `Invalid DFQL: remote-only table cannot be cloned: <table>`.
  - [ ] Return `data` with record arrays ordered by `id:asc`.
  - [ ] Return `cursors` per table as integer strings.
- [ ] Implement pull:
  - [ ] Validate cursor values are integer strings; otherwise `DFQL_INVALID` message `Invalid DFQL: cursor must be an integer string`.
  - [ ] For the reference implementation, use an injected “changesSince” store (for tests) to return deterministic results.
  - [ ] Ensure returned cursors are monotonic per table.
- [ ] Implement push:
  - [ ] Validate each mutation as in `/datafn/mutation` (including required `clientId`+`mutationId`).
  - [ ] Apply mutations using the mutation executor from Phase 03 with idempotency.
  - [ ] Return `{ ok:true, applied:[...], errors:[...] }` matching `TEST_VECTORS.md`.
- [ ] Wire endpoints into server router.
- [ ] Tests:
  - [ ] `transact.test.ts` asserts `TV-TX-001` and `TV-TX-002`.
  - [ ] `sync.test.ts` asserts `TV-SYNC-001`..`TV-SYNC-006`.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- `TV-TX-001`, `TV-TX-002`, and all `TV-SYNC-*` assertions pass exactly.

---

## Stop condition

Report:
- Confirmation that transact is fail-fast and atomic semantics are observable via `TV-TX-002`.
- Confirmation that clone/pull/push outputs match canonical ordering and cursor formats.

