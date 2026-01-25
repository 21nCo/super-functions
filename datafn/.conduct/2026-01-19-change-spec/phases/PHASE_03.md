## Phase goal

Implement `DatafnTable.mutate` + deterministic event emission and `DatafnTable.subscribe` resource scoping.

---

## In scope

- `client.mutate` and `table.mutate` remote delegation + unwrapping.
- Emit `mutation_applied` / `mutation_rejected` events deterministically.
- `table.subscribe` injects `resource: table.name`.
- Tests for `TV-MUT-*` and `TV-SUB-*`.

## Out of scope

- Offline change log.
- Signal reactivity (Phase 04).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/client/src/tables/table.ts`
- `superfunctions/datafn/client/src/events/filter.ts` (align with `DatafnEventFilter`)

Add:
- `superfunctions/datafn/client/src/mutate.ts`
- `superfunctions/datafn/client/__tests__/mutate.test.ts`
- `superfunctions/datafn/client/__tests__/subscribe.test.ts`

---

## Requirements covered

- CLIENT-MUT-001
- CLIENT-SUB-001

---

## Implementation tasks

- [ ] Implement `client.mutate(m | m[])` in `src/mutate.ts`:
  - [ ] Call `remote.mutation(...)`.
  - [ ] Unwrap envelope (Phase 00).
  - [ ] Emit `mutation_applied` on per-item success.
  - [ ] Emit `mutation_rejected` on per-item failure or thrown transport error.
  - [ ] Use `getTimestamp()` for `timestampMs`.
- [ ] Wire `DatafnTable.mutate(fragment | fragments[])`:
  - [ ] Merge `resource` and `version` into each mutation.
  - [ ] Delegate to `client.mutate(...)`.
- [ ] Update filtering types:
  - [ ] Replace custom `EventFilter` with `DatafnEventFilter` (or alias it) so `table.subscribe` can accept core filters.
- [ ] Implement `DatafnTable.subscribe(handler, filter?)`:
  - [ ] Call `client.subscribe(handler, { ...filter, resource: table.name })`.
  - [ ] Ignore user-provided `filter.resource`.
- [ ] Add tests:
  - [ ] `mutate.test.ts` asserts `TV-MUT-001` and `TV-MUT-002`.
  - [ ] `subscribe.test.ts` asserts `TV-SUB-001` and `TV-SUB-002`.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- `TV-MUT-*` and `TV-SUB-*` assertions pass exactly.

---

## Stop condition

Report:
- Confirm event payload fields match `TEST_VECTORS.md` exactly.
- Confirm per-table subscribe scoping ignores user-provided resource filters.

