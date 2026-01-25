## Phase goal

Implement deterministic DFQL query execution for base fields, filters, sort, pagination, and relation expansion (`many-one` and `many-many`) so `TV-QUERY-*` vectors pass.

---

## In scope

- Extend `@datafn/server` `/datafn/query` from validation-only to full execution against a reference in-memory store.
- Implement:
  - filter semantics (`QUERY-002`)
  - deterministic ordering + default sort (`DETERMINISM-001`)
  - pagination (`QUERY-004`)
  - `select` token materialization for:
    - base fields
    - `many-one` expansions (`relation.*`)
    - `many-many` join rows (`relation.#`)
    - `many-many` expansions with metadata (`relation.*#`)

## Out of scope

- Aggregate queries (`groupBy`/`aggregations`/`having`) (P1).
- Search delegation (`search` block) (P1).
- Relation quantifier blocks (`$any/$all/$none`) beyond simple field paths.
- SQL backends (`@superfunctions/db`) integration.

---

## Deliverables

- `superfunctions/datafn/server/src/execution/store.ts` (abstract store interface)
- `superfunctions/datafn/server/src/execution/memory-store.ts` (fixture-backed in-memory store)
- `superfunctions/datafn/server/src/execution/query/dfql.ts` (DFQL query parsing/typing)
- `superfunctions/datafn/server/src/execution/query/filters.ts`
- `superfunctions/datafn/server/src/execution/query/sort.ts`
- `superfunctions/datafn/server/src/execution/query/pagination.ts`
- `superfunctions/datafn/server/src/execution/query/select.ts` (token parsing + materialization)
- `superfunctions/datafn/server/src/routes/query.ts` (wire into execution engine)
- `superfunctions/datafn/server/__tests__/fixtures/f1.ts` (Fixture F1 schema + dataset)
- `superfunctions/datafn/server/__tests__/query-execution.test.ts` (assert `TV-QUERY-001`, `TV-QUERY-003`, `TV-QUERY-004`, `TV-QUERY-005`, `TV-QUERY-006`, `TV-QUERY-007`, `TV-QUERY-008`, `TV-QUERY-009`)

---

## Requirements covered

- QUERY-002
- QUERY-003
- QUERY-004
- DETERMINISM-001

---

## Implementation tasks

- [ ] Implement the in-memory store:
  - [ ] Store records by table name and id.
  - [ ] Store many-many join rows keyed by relation (e.g. `"task.tags"`).
  - [ ] Provide deterministic iterators returning ids in sorted order where applicable.
- [ ] Implement DFQL filter evaluation:
  - [ ] Field equality (`field: value`), `in` (`field: [a,b]`), and operator objects (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is_null`, `is_not_null`).
  - [ ] `$and` and `$or` groups.
  - [ ] Unknown operator → `DFQL_UNSUPPORTED` with message `Unsupported DFQL feature: operator.<name>`.
- [ ] Implement sorting:
  - [ ] Parse sort terms from string forms (`"field"`, `"field:asc"`, `"field:desc"`).
  - [ ] Default sort when absent: `id:asc`.
  - [ ] Ensure stable deterministic ordering (tie-break via `id` when multiple rows share sort key).
- [ ] Implement pagination:
  - [ ] `limit` and `offset`.
  - [ ] Cursor pagination with `cursor.after`:
    - [ ] Require `sort` includes `id` as final term; otherwise return `DFQL_INVALID` message `Invalid DFQL: cursor requires sort with id tie-breaker`.
    - [ ] Apply strict “after” semantics.
  - [ ] `nextCursor` is always `null` in P0 (until cursor emission is specified).
- [ ] Implement `select` token parsing/materialization:
  - [ ] If `select` omitted: include all schema-defined fields + `id`.
  - [ ] Base fields: include only those requested.
  - [ ] `many-one`: materialize ids-only and `relation.*` using `fkField`.
  - [ ] `many-many`:
    - [ ] `relation.#` emits join rows including `from`, `to`, and declared metadata fields.
    - [ ] `relation.*#` emits related records and attaches `$relation_metadata`.
    - [ ] Apply ordering rules from `SPEC.md` (order asc when present).
  - [ ] Unknown fields/relations referenced by select → reject per `QUERY-001`.
- [ ] Wire execution into `/datafn/query`.
- [ ] Tests:
  - [ ] Add fixture module `__tests__/fixtures/f1.ts` matching `TEST_VECTORS.md` Fixture F1 exactly.
  - [ ] Write `query-execution.test.ts` that calls the router with Requests and asserts exact JSON bodies for all listed TVs.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- `TV-QUERY-001`, `TV-QUERY-003`, `TV-QUERY-004`, `TV-QUERY-005`, `TV-QUERY-006`, `TV-QUERY-007`, `TV-QUERY-008`, and `TV-QUERY-009` assertions pass exactly.

---

## Stop condition

Report:
- Any deviations discovered between the spec and implementable behavior (must be resolved by updating spec or code, not by weakening tests).
- Confirmation that query execution is deterministic for Fixture F1.

