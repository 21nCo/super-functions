## Phase goal

Implement DFQL `htree` semantics (`parent.*`, `children.*`, `children.**`) using materialized-path storage.

---

## In scope

- `htree` select semantics per `SPEC.md` (DFQL-HTREE-001).
- Deterministic ordering rules for ancestor chains and descendant lists.

## Out of scope

- Aggregations and cursor-before (Phases 14–15).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/execution/query/select.ts` (htree expansion)
- `superfunctions/datafn/server/src/routes/query.ts` (htree token validation)

Add:
- `superfunctions/datafn/server/__tests__/dfql-htree.test.ts`

---

## Requirements covered

- DFQL-HTREE-001

---

## Implementation tasks

- [ ] Implement materialized path parsing:
  - [ ] `pathField` delimiter is `"-"` and excludes self id.
  - [ ] Root has `pathField:""`.
- [ ] Implement `parent.*`:
  - [ ] Expand ancestor ids (root → parent) into records in that order.
- [ ] Implement `children.*`:
  - [ ] Immediate children are records whose last `pathField` segment equals the parent id.
- [ ] Implement `children.**`:
  - [ ] Descendants are records whose `pathField` contains the parent id as a segment.
  - [ ] Ordering is deterministic by `(path length asc, id asc)`.
- [ ] Add tests implementing:
  - [ ] `TV-HTREE-001`, `TV-HTREE-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- Htree vectors pass exactly.

---

## Stop condition

Report:
- `htree` tokens behave per spec and test vectors.

