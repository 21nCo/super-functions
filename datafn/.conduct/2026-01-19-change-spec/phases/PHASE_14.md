## Phase goal

Implement DFQL pagination/computation completeness: `count:true`, `cursor.before`, and additional filter operators from `dfql.intent.md`.

---

## In scope

- `count:true` returns total rows before pagination (DFQL-COUNT-001).
- Cursor backwards pagination `cursor.before` (DFQL-PAGE-BEFORE-001).
- Additional filter operators (DFQL-FILTER-OPS-EXTRA-001).

## Out of scope

- Aggregate queries (`groupBy/aggregations/having`) (Phase 15).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/execution/query/execute.ts` (count + cursor.before)
- `superfunctions/datafn/server/src/execution/query/pagination.ts` (before pagination helper, if split)
- `superfunctions/datafn/server/src/execution/query/filters.ts` (extra operators)
- `superfunctions/datafn/server/src/routes/query.ts` (validation for `count` type)

Add:
- `superfunctions/datafn/server/__tests__/dfql-pagination-count.test.ts`

---

## Requirements covered

- DFQL-COUNT-001
- DFQL-PAGE-BEFORE-001
- DFQL-FILTER-OPS-EXTRA-001

---

## Implementation tasks

- [ ] Implement `count:true`:
  - [ ] Compute count after filters and before limit/offset/cursor slicing.
- [ ] Implement `cursor.before`:
  - [ ] Same validation rule as `after`: requires `id` tie-breaker in sort.
  - [ ] Apply strict “before” semantics.
- [ ] Implement extra operators:
  - [ ] `not_in`, `not_like`, `not_ilike`, `before`, `after`, `between`, `not_between`, `is_empty`, `is_not_empty`
  - [ ] Deterministic error on unknown operators
- [ ] Add tests implementing:
  - [ ] `TV-DFQL-COUNT-001`, `TV-DFQL-COUNT-002`
  - [ ] `TV-DFQL-BEFORE-001`, `TV-DFQL-BEFORE-002`
  - [ ] `TV-DFQL-OPS-001`, `TV-DFQL-OPS-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- Count/pagination/operator vectors pass exactly.

---

## Stop condition

Report:
- `count:true`, `cursor.before`, and extra filter operators match spec and vectors.

