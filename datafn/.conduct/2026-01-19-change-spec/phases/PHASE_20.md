## Phase goal

Enable local-first query execution when storage is enabled, with deterministic remote fallback during hydration.

---

## In scope

- Implement query routing rules for `ready` vs `hydrating` tables (CLIENT-OFFLINE-QUERY-001).

## Out of scope

- Offline mutation logging (Phase 21).
- Advanced dependency tracking for signal refresh (out of scope).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/table.ts` (or equivalent table query implementation)
- `superfunctions/datafn/client/src/offline/query.ts`

Add:
- `superfunctions/datafn/client/__tests__/offline-query.test.ts`

---

## Requirements covered

- CLIENT-OFFLINE-QUERY-001

---

## Implementation tasks

- [ ] Implement local query execution against storage:
  - [ ] Start with minimal filters/sort needed by vectors (id equality + deterministic ordering).
  - [ ] Ensure results match DFQL semantics for supported subset.
- [ ] Implement remote fallback:
  - [ ] When hydration state is `hydrating`, call remote and return remote result.
- [ ] Add tests implementing:
  - [ ] `TV-OFFLINE-QUERY-001`, `TV-OFFLINE-QUERY-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- Offline query vectors pass exactly.

---

## Stop condition

Report:
- Queries are local-first for `ready` tables and remote-fallback for `hydrating` tables.

