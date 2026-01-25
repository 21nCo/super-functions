## Phase 09

### Phase goal (1 sentence)

Ship real storage adapters (memory + IndexedDB) that implement `DatafnStorageAdapter`, including deterministic ordering and changelog dedupe semantics.

### In scope

- Implement an in-memory adapter for tests/dev.
- Implement an IndexedDB adapter for browsers (tested with `fake-indexeddb`).
- Ensure both adapters:
  - provide deterministic `listRecords` ordering
  - implement changelog de-duplication by `(clientId, mutationId)`
  - implement hydration state + cursors APIs
  - implement join row storage required by relation expansions

### Out of scope

- Offline DFQL execution expansion (Phase 10).
- Offline mutation semantics hardening (Phase 11).

### Deliverables (explicit files/modules)

- Add: `datafn/client/src/adapters/memoryStorage.ts`
- Add: `datafn/client/src/adapters/indexedDbStorage.ts`
- Modify: `datafn/client/src/index.ts` (export adapters)
- Modify: `datafn/client/package.json` (dev dependency for IndexedDB tests, e.g. `fake-indexeddb`)
- Add/Modify tests:
  - `datafn/client/__tests__/storage-mem.test.ts` (new)
  - `datafn/client/__tests__/storage-idb.test.ts` (new)
  - Update existing changelog tests to use shipped adapters where appropriate

### Requirements covered

- STORAGE-MEM-001
- STORAGE-IDB-001
- CLIENT-CHANGELOG-001

### Implementation tasks (ordered checklist)

- Memory adapter:
  - implement record CRUD
  - implement join row CRUD
  - implement per-table cursors
  - implement hydration state
  - implement changelog append/list/ack with dedupe
- IndexedDB adapter:
  - define DB schema (object stores + indexes) for:
    - records (per resource)
    - join rows (per relation)
    - meta (cursors + hydration)
    - changelog
  - ensure deterministic ordering (sort by `id:asc` after retrieval if needed)
  - ensure dedupe on `(clientId, mutationId)`
  - add tests using `fake-indexeddb`
- Export adapters from `@datafn/client` public surface.

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.
- Storage vectors validated:
  - `TV-STORAGE-MEM-001`, `TV-STORAGE-MEM-002`
  - `TV-STORAGE-IDB-001`, `TV-STORAGE-IDB-002`
  - `TV-CHANGELOG-001`, `TV-CHANGELOG-002`

### Stop condition

Report:

- Exported adapter names and import paths
- Confirmation that changelog dedupe is implemented in both shipped adapters
- Test run result for `@datafn/client`

