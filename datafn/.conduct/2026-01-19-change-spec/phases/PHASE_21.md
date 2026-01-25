## Phase goal

Make offline mutation workflows correct: optimistic local writes and durable changelog persistence for later push.

---

## In scope

- Append offline mutations to changelog deterministically (CLIENT-CHANGELOG-001).
- When remote mutation fails, apply local write + changelog append (CLIENT-OFFLINE-MUT-001).

## Out of scope

- Push reconciliation strategies beyond server LWW defaults.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/table.ts` (or equivalent mutate implementation)
- `superfunctions/datafn/client/src/offline/mutate.ts`

Add:
- `superfunctions/datafn/client/__tests__/offline-mutate.test.ts`
- `superfunctions/datafn/client/__tests__/changelog.test.ts`

---

## Requirements covered

- CLIENT-OFFLINE-MUT-001
- CLIENT-CHANGELOG-001

---

## Implementation tasks

- [ ] Define changelog entry schema (seq, clientId, mutationId, mutation, timestampMs).
- [ ] Enforce de-duplication by `(clientId, mutationId)` at append time.
- [ ] Implement optimistic local write:
  - [ ] Apply merge/insert/delete to storage deterministically (minimal subset for vectors).
- [ ] On remote failure:
  - [ ] Record the mutation in changelog.
  - [ ] Return deterministic error or deterministic optimistic result (as specified by vectors).
- [ ] Add tests implementing:
  - [ ] `TV-OFFLINE-MUT-001`, `TV-OFFLINE-MUT-002`
  - [ ] `TV-CHANGELOG-001`, `TV-CHANGELOG-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- Offline mutation and changelog vectors pass exactly.

---

## Stop condition

Report:
- Remote failures produce deterministic offline mutation behavior with stored changelog entries.

