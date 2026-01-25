## Phase goal

Implement DFQL aggregate queries: `groupBy`, `aggregations`, and `having` using the v0 aggregation shape defined in `SPEC.md`.

---

## In scope

- Grouped queries (`groupBy`) and aggregation definitions (DFQL-GROUPBY-001).
- Having filters on group keys and aggregation aliases.
- Reject relation expansions in `select` when `groupBy` is present.

## Out of scope

- Cursor pagination on grouped rows beyond `nextCursor:null` in v0.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/execution/query/execute.ts` (aggregate execution path)
- `superfunctions/datafn/server/src/routes/query.ts` (validation rules for aggregate queries)

Add:
- `superfunctions/datafn/server/src/execution/query/aggregate.ts`
- `superfunctions/datafn/server/__tests__/dfql-aggregate.test.ts`

---

## Requirements covered

- DFQL-GROUPBY-001

---

## Implementation tasks

- [ ] Implement aggregation shape:
  - [ ] `aggregations[alias] = { op, field }` with allowed ops
  - [ ] Emit grouped rows with `groupBy` fields + aggregation aliases
- [ ] Implement `having`:
  - [ ] Apply filter operators to grouped rows using the same operator semantics as normal filters.
- [ ] Validate and reject unsupported shapes:
  - [ ] Relation expansions in `select` when `groupBy` is present → `DFQL_UNSUPPORTED`
- [ ] Add tests implementing:
  - [ ] `TV-DFQL-GROUP-001`, `TV-DFQL-GROUP-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- Aggregate vectors pass exactly.

---

## Stop condition

Report:
- Aggregate queries match the v0 shape and behave deterministically.

