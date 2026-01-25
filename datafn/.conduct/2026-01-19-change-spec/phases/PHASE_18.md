## Phase goal

Provide an IndexedDB-backed storage adapter that conforms to the storage contract and persists across reloads.

---

## In scope

- Implement IndexedDB adapter conforming to `DatafnStorageAdapter` (STORAGE-IDB-001).
- Use `fake-indexeddb` for deterministic tests.

## Out of scope

- Offline query/mutation behavior (Phases 19–21).

---

## Deliverables (files to create/modify)

Add:
- `superfunctions/datafn/client/src/storage/indexeddb.ts`
- `superfunctions/datafn/client/__tests__/storage-indexeddb.test.ts`

Modify:
- `superfunctions/datafn/client/src/index.ts` (export adapter)

---

## Requirements covered

- STORAGE-IDB-001

---

## Implementation tasks

- [ ] Implement persistence:
  - [ ] Use object stores keyed by `(resource,id)` and `(relationKey,from,to)` for joins.
  - [ ] Persist cursors + hydration state.
  - [ ] Persist changelog with monotonic `seq`.
- [ ] Add tests implementing:
  - [ ] `TV-STORAGE-IDB-001`, `TV-STORAGE-IDB-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- IndexedDB vectors pass exactly.

---

## Stop condition

Report:
- IndexedDB adapter passes storage vectors and persists across adapter re-instantiation.

