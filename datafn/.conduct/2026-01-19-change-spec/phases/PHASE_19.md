## Phase goal

Apply sync results deterministically into local storage and maintain per-table hydration state.

---

## In scope

- Apply `clone` and `pull` results into storage deterministically (CLIENT-SYNC-APPLY-001).
- Maintain hydration state `{ notStarted | hydrating | ready }` (CLIENT-HYDRATION-001).

## Out of scope

- Local-first query routing (Phase 20).
- Offline mutation logging (Phase 21).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts` (sync methods apply when storage configured)
- `superfunctions/datafn/client/src/sync/apply.ts`

Add:
- `superfunctions/datafn/client/__tests__/sync-apply.test.ts`

---

## Requirements covered

- CLIENT-SYNC-APPLY-001
- CLIENT-HYDRATION-001

---

## Implementation tasks

- [ ] Implement hydration state machine:
  - [ ] Default `notStarted`
  - [ ] During clone application: `hydrating`
  - [ ] After clone applied: `ready`
- [ ] Apply clone results:
  - [ ] Upsert records by id
  - [ ] Set cursors monotonically
- [ ] Apply pull results:
  - [ ] Upsert `records`
  - [ ] Delete `deleted` ids
  - [ ] Set cursors monotonically
- [ ] Add tests implementing:
  - [ ] `TV-CLIENT-SYNC-APPLY-001`, `TV-CLIENT-SYNC-APPLY-002`
  - [ ] `TV-HYDRATION-001`, `TV-HYDRATION-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- Sync apply + hydration vectors pass exactly.

---

## Stop condition

Report:
- Clone/pull apply deterministically into storage and hydration state transitions are observable.

