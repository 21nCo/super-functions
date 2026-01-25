## Phase goal

Implement DFQL completeness items that unblock common query shapes: `omit`, ids-only relation tokens, and nested select traversal tokens.

---

## In scope

- DFQL `omit` semantics (DFQL-OMIT-001)
- ids-only relation tokens (`relation` without directive) (DFQL-RELIDS-001)
- Nested select traversal tokens like `tasks.tags.*` (DFQL-NESTEDSELECT-001)

## Out of scope

- Dot-path filters and relation quantifiers (Phase 12).
- `htree` semantics (Phase 13).
- Aggregations and cursor-before (Phases 14–15).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/routes/query.ts` (validation for `omit` + nested tokens)
- `superfunctions/datafn/server/src/execution/query/select.ts` (omit + ids-only + nested traversal)
- `superfunctions/datafn/server/src/execution/query/parse.ts` (select token parsing, if needed)

Add:
- `superfunctions/datafn/server/__tests__/dfql-select.test.ts`

---

## Requirements covered

- DFQL-OMIT-001
- DFQL-RELIDS-001
- DFQL-NESTEDSELECT-001

---

## Implementation tasks

- [ ] Add validation for `omit`:
  - [ ] Reject unknown omitted fields with `DFQL_UNKNOWN_FIELD` at `omit[i]`.
- [ ] Implement `omit` application:
  - [ ] Apply after select materialization, but never remove `id`.
  - [ ] Apply to expanded relation records and join rows.
- [ ] Implement ids-only relation selection:
  - [ ] many-one → id | null
  - [ ] one-many/many-many → id[]
  - [ ] many-many ordering: by `order` metadata when present, else `id:asc`
- [ ] Implement nested select traversal:
  - [ ] Recognize tokens like `tasks.tags.*` and materialize intermediate expansions deterministically.
  - [ ] Ensure intermediate records include at least `id` plus fields needed for descendant expansions.
- [ ] Add tests implementing:
  - [ ] `TV-DFQL-OMIT-001`, `TV-DFQL-OMIT-002`
  - [ ] `TV-DFQL-RELIDS-001`, `TV-DFQL-RELIDS-002`
  - [ ] `TV-DFQL-NESTED-001`, `TV-DFQL-NESTED-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- DFQL select vectors pass exactly.

---

## Stop condition

Report:
- `omit` works and rejects unknown fields deterministically.
- ids-only relation tokens and nested traversal tokens behave per test vectors.

