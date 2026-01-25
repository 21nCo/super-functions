## Phase goal

Implement `client.transact(...)` and `client.<table>.transact(...)` with deterministic remote unwrapping and transport error behavior.

---

## In scope

- `client.transact` remote-first delegation to `remote.transact`.
- `table.transact` alias to `client.transact`.
- Wrapped/unwrapped response handling per `CLIENT-TX-001`.
- Tests for `TV-TX-001` and `TV-TX-002`.

## Out of scope

- Transaction semantics on server (already exists).
- Local-first transact behavior.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/client/src/index.ts`
- `superfunctions/datafn/client/src/tables/table.ts`

Add:
- `superfunctions/datafn/client/src/transact.ts`
- `superfunctions/datafn/client/__tests__/transact.test.ts`

---

## Requirements covered

- CLIENT-TX-001

---

## Implementation tasks

- [ ] Implement `client.transact(payload)` in `src/transact.ts`:
  - [ ] Call `remote.transact(payload)` exactly once.
  - [ ] Unwrap wrapped envelope success/error using the Phase 00 unwrapping helper.
  - [ ] Unexpected shape → throw `TRANSPORT_ERROR`.
- [ ] Wire `DatafnTable.transact(payload)` to call `client.transact(payload)` with no mutation.
- [ ] Add tests asserting:
  - [ ] `TV-TX-001` success path (both client + table)
  - [ ] `TV-TX-002` transport error path

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- `TV-TX-*` assertions pass exactly.

---

## Stop condition

Report:
- Confirm transact is usable from both `client.transact` and `client.task.transact`.

