## Phase goal

Implement DFQL mutation execution (record CRUD, idempotency, `if` guards, and relation ops) so `TV-MUT-*` vectors pass.

---

## In scope

- Extend `@datafn/server` to implement `/datafn/mutation` execution over the reference in-memory store.
- Implement:
  - `insert`, `merge`, `replace`, `delete` (MUT-001)
  - idempotency dedupe on `(clientId, mutationId)` (MUT-002)
  - `if` optimistic concurrency guard (MUT-003)
  - relation ops `relate`, `modifyRelation`, `unrelate` for many-many (MUT-004)

## Out of scope

- SQL adapter integration.
- Cascade delete semantics beyond basic validation.
- Sync endpoints (`clone/pull/push`) and `/transact` (Phase 04).

---

## Deliverables

- `superfunctions/datafn/server/src/execution/idempotency.ts` (idempotency store interface + memory impl)
- `superfunctions/datafn/server/src/execution/mutation/dfql.ts` (mutation typing/validation)
- `superfunctions/datafn/server/src/execution/mutation/records.ts` (CRUD ops)
- `superfunctions/datafn/server/src/execution/mutation/guards.ts` (`if` evaluation)
- `superfunctions/datafn/server/src/execution/mutation/relations.ts` (many-many join row ops)
- `superfunctions/datafn/server/src/routes/mutation.ts`
- `superfunctions/datafn/server/__tests__/mutation-execution.test.ts` (assert `TV-MUT-001`..`TV-MUT-008`)

---

## Requirements covered

- MUT-001
- MUT-002
- MUT-003
- MUT-004

---

## Implementation tasks

- [ ] Implement idempotency store:
  - [ ] Persist `(clientId, mutationId) → mutation result` in memory store for tests.
  - [ ] On replay, return stored result with `deduped: true`.
- [ ] Implement mutation validation:
  - [ ] Require `resource`, `version`, `operation`, and `id` for single-record ops.
  - [ ] For `/datafn/mutation`, require `clientId` and `mutationId` (MUT-002); if missing, return per-mutation `DFQL_INVALID`.
  - [ ] Unknown operation → per-mutation `DFQL_UNSUPPORTED` with message `Unsupported DFQL feature: mutation.operation.<op>`.
- [ ] Implement record CRUD:
  - [ ] `insert`: create record (id + record payload) and validate field names exist in schema.
  - [ ] `merge`: shallow-merge provided fields.
  - [ ] `replace`: replace schema-defined fields with provided fields (missing fields become `null` if nullable, otherwise error) — if strict replacement is too large, scope to exact test vectors first.
  - [ ] `delete`: remove record.
- [ ] Implement `if` guards:
  - [ ] Evaluate the `if` object using the same operator semantics as filters.
  - [ ] If guard fails, return per-mutation `CONFLICT` with message `Conflict` and do not modify state.
- [ ] Implement many-many relation operations:
  - [ ] Validate `relations` payload keys are known relations for the resource.
  - [ ] For `relate`: insert join row with `$ref` target id and allowed metadata fields only.
  - [ ] For `modifyRelation`: update metadata fields on the existing join row identified by `$ref`.
  - [ ] For `unrelate`: delete join row identified by `$ref` (or shorthand string).
  - [ ] Unknown metadata field → per-mutation `DFQL_INVALID` message `Invalid DFQL: unknown relation metadata field <relation>.<field>`.
- [ ] Wire execution into `/datafn/mutation`:
  - [ ] Accept object or array; for array return result array.
  - [ ] Always return `ok:true` envelope for syntactically valid request bodies; represent per-item errors inside each mutation result object.
- [ ] Tests:
  - [ ] Use Fixture F1 and assert exact JSON for `TV-MUT-001`..`TV-MUT-008`.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- `TV-MUT-001`..`TV-MUT-008` assertions pass exactly.

---

## Stop condition

Report:
- Confirmation that idempotency is enforced and observable via `deduped:true`.
- Any ambiguity encountered in `replace` semantics (must be resolved against `SPEC.md`/`REQUIREMENTS.md` before proceeding).

