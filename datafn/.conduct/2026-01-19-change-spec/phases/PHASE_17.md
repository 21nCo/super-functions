## Phase goal

Define the client storage adapter interface and ship a deterministic in-memory implementation for tests/dev.

---

## In scope

- Define `DatafnStorageAdapter` interface in `@datafn/client` public types (STORAGE-ADAPTER-001).
- Implement memory adapter (STORAGE-MEM-001).

## Out of scope

- IndexedDB adapter (Phase 18).
- Applying sync results and offline query/mutation behavior (Phases 19–21).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts` (config types include `storage` + `clientId`)
- `superfunctions/datafn/client/src/index.ts` (export storage types)

Add:
- `superfunctions/datafn/client/src/storage/types.ts`
- `superfunctions/datafn/client/src/storage/memory.ts`
- `superfunctions/datafn/client/__tests__/storage-memory.test.ts`

---

## Requirements covered

- STORAGE-ADAPTER-001
- STORAGE-MEM-001

---

## Implementation tasks

- [ ] Implement adapter contract:
  - [ ] records: `getRecord/listRecords/upsertRecord/deleteRecord`
  - [ ] joins: `listJoinRows/upsertJoinRow/deleteJoinRow`
  - [ ] cursors + hydration state
  - [ ] changelog append/list/ack with deterministic `seq`
- [ ] Determinism rules:
  - [ ] `listRecords` is ordered by `id:asc`
  - [ ] `changelogList` ordered by `seq:asc`
- [ ] Add tests implementing:
  - [ ] `TV-STORAGE-001`, `TV-STORAGE-002`, `TV-STORAGE-003`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- Storage vectors pass exactly.

---

## Stop condition

Report:
- Storage adapter interface exists and memory adapter passes vectors deterministically.

