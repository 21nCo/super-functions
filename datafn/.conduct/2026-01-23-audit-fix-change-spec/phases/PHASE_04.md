## Phase 04

### Phase goal (1 sentence)

Harden server sync invariants by normalizing internal table names, guaranteeing atomic `serverSeq`, ensuring durable idempotency, and enforcing push clientId consistency.

### In scope

- Normalize internal model names to `__datafn_*` as specified in `SPEC.md`.
- Make `serverSeq` increment atomic per namespace.
- Ensure idempotency is stored in `__datafn_idempotency` with uniqueness `(namespace, clientId, mutationId)`.
- Persist seed execution state in `__datafn_seed`.
- Enforce push `clientId` consistency across request and contained mutations.

### Out of scope

- REST wrapper changes (Phase 05).
- Client offline/sync apply changes (later phases).

### Deliverables (explicit files/modules)

- Modify: `datafn/server/src/execution/sync/change-tracking.ts`
- Modify: `datafn/server/src/execution/idempotency-db.ts`
- Modify: `datafn/server/src/execution/sync/push.ts` (or request validation layer) for clientId consistency
- Modify: `datafn/server/src/routes/seed.ts` (persist `__datafn_seed`)
- Modify tests:
  - `datafn/server/__tests__/sync-ordering.test.ts`
  - `datafn/server/__tests__/idempotency-db.test.ts`
  - `datafn/server/__tests__/seed.test.ts`
  - `datafn/server/__tests__/sync.test.ts` (if push validation is covered here)

### Requirements covered

- SERVER-SEQ-001
- SERVER-CHANGES-001
- SERVER-IDEMP-001
- SERVER-SEED-001
- SERVER-SYNC-CLIENTID-001

### Implementation tasks (ordered checklist)

- Update internal table/model names in DB adapter calls:
  - `__datafn_meta`
  - `__datafn_changes`
  - `__datafn_idempotency`
  - `__datafn_seed`
- Implement atomic `serverSeq` increment:
  - Use `@superfunctions/db.Adapter` transactional capability if available.
  - Otherwise implement a compare-and-swap retry loop with deterministic max retries and INTERNAL failure on exhaustion.
- Ensure idempotency uses a unique key on `(namespace, clientId, mutationId)` and:
  - replays return `deduped:true` with original result
- Implement `__datafn_seed` persistence:
  - seed is idempotent per namespace
  - repeated seed returns ok:true without creating duplicates
- Validate `/datafn/push`:
  - if any mutation has a `clientId` that differs from `request.clientId`, reject with request-level `DFQL_INVALID` and deterministic path

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/server
```

Expected outcome:

- All server tests pass.
- Ordering/idempotency/seed vectors validated:
  - `TV-SERVERSEQ-001`, `TV-SERVERSEQ-002`
  - `TV-IDEMP-001`, `TV-IDEMP-002`
  - `TV-SEED-001`, `TV-SEED-002`
  - `TV-PUSH-CLIENTID-001`, `TV-PUSH-CLIENTID-002`

### Stop condition

Report:

- The final internal model names used by the server
- The atomic increment mechanism used for `serverSeq`
- Test run result for `@datafn/server`

