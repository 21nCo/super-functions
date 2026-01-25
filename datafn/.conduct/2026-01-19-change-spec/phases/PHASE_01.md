## Phase goal

Implement the client table registry (`client.table(name)` and `client.<tableName>` Proxy access) and deterministic unknown-table rejection.

---

## In scope

- Table registry based on validated schema resources.
- `DatafnTable` object identity caching (same table name → same handle object).
- Proxy reserved-key behavior (`then`, `toJSON`, `inspect`).
- Tests for `TV-REG-*`.

## Out of scope

- Query/mutation/signal semantics (they can be stubs wired in later phases).
- Sync facade.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/client/src/index.ts`

Add:
- `superfunctions/datafn/client/src/tables/table.ts`
- `superfunctions/datafn/client/src/tables/registry.ts`
- `superfunctions/datafn/client/__tests__/registry.test.ts`

---

## Requirements covered

- CLIENT-REG-001
- CLIENT-REG-002

---

## Implementation tasks

- [ ] Implement `DatafnTable` constructor in `src/tables/table.ts`:
  - [ ] `name`, `version` properties
  - [ ] method placeholders (`query`, `mutate`, `signal`, `subscribe`) that delegate to the client (actual logic implemented in later phases)
- [ ] Implement registry in `src/tables/registry.ts`:
  - [ ] Map of `tableName -> DatafnTable` cached by object identity.
  - [ ] `getTable(name)` throws `DFQL_UNKNOWN_RESOURCE` with message `Unknown resource: <name>` and `details:{ path:"resource", resource:<name> }`.
- [ ] Wrap `DatafnClient` in a Proxy in `createDatafnClient`:
  - [ ] `get(target, prop)`:
    - [ ] if `prop` is reserved (`then`, `toJSON`, `inspect`) return `undefined`
    - [ ] if `prop` matches a declared resource name, return `getTable(prop)`
    - [ ] else return the underlying property (methods like `query`, `mutate`, `subscribe`, `table`, `sync`)
- [ ] Add tests `registry.test.ts` asserting:
  - [ ] `TV-REG-001`, `TV-REG-002`, `TV-REG-003`, `TV-REG-004`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- `TV-REG-*` assertions pass exactly.

---

## Stop condition

Report:
- The exact reserved keys list implemented and why (Proxy safety).
- Confirmation that unknown table access fails deterministically in both `.table("x")` and `.x` forms.

