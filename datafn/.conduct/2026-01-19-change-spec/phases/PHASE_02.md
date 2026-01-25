## Phase goal

Implement `DatafnTable.query` (resource/version merge + remote.query delegation + deterministic error mapping) and batch ordering guarantees.

---

## In scope

- `client.query` and `table.query` implementation (remote-first MVP).
- Merge semantics (ignore user-provided `resource`/`version`).
- Batch queries preserve order.
- Tests for `TV-QUERY-*`.

## Out of scope

- Local-first query execution.
- Signal reactivity (Phase 04).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/client/src/tables/table.ts`

Add:
- `superfunctions/datafn/client/src/query.ts`
- `superfunctions/datafn/client/__tests__/query.test.ts`

---

## Requirements covered

- CLIENT-QUERY-001

---

## Implementation tasks

- [ ] Implement `client.query(q | q[])` in `src/query.ts`:
  - [ ] Call `remote.query(...)`.
  - [ ] Use Phase 00 unwrapping logic.
  - [ ] Return query result object(s) (no extra wrapping).
- [ ] Wire `DatafnTable.query(fragment)`:
  - [ ] Construct full query: `{ resource: table.name, version: table.version, ...fragmentWithoutResourceOrVersion }`.
  - [ ] Delegate to `client.query(fullQuery)` and return the single result.
- [ ] Add tests `query.test.ts` asserting:
  - [ ] `TV-QUERY-001` (merge + remote call args)
  - [ ] `TV-QUERY-002` (remote ok:false → thrown client error)

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- `TV-QUERY-*` assertions pass exactly.

---

## Stop condition

Report:
- Confirm `resource`/`version` override keys are ignored in fragments.
- Confirm batch query ordering behavior is preserved.

