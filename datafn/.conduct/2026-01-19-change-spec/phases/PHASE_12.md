## Phase goal

Implement DFQL filter completeness for nested dot-path filters and explicit relation quantifiers.

---

## In scope

- Dot-path filters across nested objects and relations with default ANY semantics (DFQL-FILTER-PATH-001).
- Relation quantifier blocks `$any/$all/$none` (DFQL-FILTER-RELQ-001).

## Out of scope

- `htree` select materialization (Phase 13).
- Aggregations and cursor-before (Phases 14–15).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/routes/query.ts` (validation for dot-path keys and quantifier blocks)
- `superfunctions/datafn/server/src/execution/query/filters.ts` (evaluator)
- `superfunctions/datafn/server/src/execution/query/execute.ts` (wire evaluator into execution)

Add:
- `superfunctions/datafn/server/__tests__/dfql-filters.test.ts`

---

## Requirements covered

- DFQL-FILTER-PATH-001
- DFQL-FILTER-RELQ-001

---

## Implementation tasks

- [ ] Implement dot-path resolution:
  - [ ] Nested object traversal (e.g. `a.b.c`)
  - [ ] Relation traversal for `many-one`, `one-many`, `many-many`, and `htree` children
  - [ ] Default ANY semantics for multi-row relations
- [ ] Implement relation quantifier blocks:
  - [ ] `$any` / `$all` / `$none` semantics including zero-row behavior
  - [ ] Deterministic error on unknown quantifier keys
- [ ] Add tests implementing:
  - [ ] `TV-DFQL-FILTERPATH-001`, `TV-DFQL-FILTERPATH-002`
  - [ ] `TV-DFQL-RELQ-001`, `TV-DFQL-RELQ-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- DFQL filter vectors pass exactly.

---

## Stop condition

Report:
- Dot-path filtering works across relations and supports `$any/$all/$none`.

