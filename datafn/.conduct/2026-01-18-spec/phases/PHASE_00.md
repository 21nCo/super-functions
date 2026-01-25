## Phase goal

Create `@datafn/core` with schema validation and DFQL normalization, backed by unit tests that assert the golden vectors.

---

## In scope

- New package `superfunctions/datafn/core` (`@datafn/core`) with:
  - schema types + `validateSchema`
  - DFQL normalization (`normalizeDfql`) + stable key (`dfqlKey`)
  - shared error and envelope types
  - shared event + plugin types (type-only, no runtime behavior required)
- Unit tests covering `TV-SCHEMA-*` and `TV-NORM-*`.

## Out of scope

- Server endpoints and routing.
- Query/mutation execution semantics.
- Client runtime storage/sync/signals.

---

## Deliverables

- `superfunctions/datafn/core/package.json`
- `superfunctions/datafn/core/tsconfig.json`
- `superfunctions/datafn/core/tsup.config.ts`
- `superfunctions/datafn/core/vitest.config.ts`
- `superfunctions/datafn/core/src/index.ts`
- `superfunctions/datafn/core/src/types.ts`
- `superfunctions/datafn/core/src/errors.ts`
- `superfunctions/datafn/core/src/schema.ts`
- `superfunctions/datafn/core/src/normalize.ts`
- `superfunctions/datafn/core/src/events.ts`
- `superfunctions/datafn/core/src/plugins.ts`
- `superfunctions/datafn/core/__tests__/setup.ts`
- `superfunctions/datafn/core/__tests__/schema.test.ts`
- `superfunctions/datafn/core/__tests__/normalize.test.ts`

---

## Requirements covered

- SCHEMA-001
- NORM-001

---

## Implementation tasks

- [ ] Create `@datafn/core` package scaffold (match `searchfn` conventions):
  - [ ] `package.json` with name `@datafn/core`, `type: module`, `tsup` build, `vitest` tests.
  - [ ] `tsconfig.json` targeting `ES2021` and including `DOM` lib (for shared types).
  - [ ] `tsup.config.ts` building `src/index.ts` to `dist/` in ESM+CJS with d.ts.
  - [ ] `vitest.config.ts` with `node` environment and `__tests__/setup.ts`.
- [ ] Implement core types in `src/types.ts`:
  - [ ] `DatafnSchema`, `DatafnResourceSchema`, `DatafnFieldSchema`, `DatafnRelationSchema`.
  - [ ] `DatafnEvent`, `DatafnEventFilter`, `DatafnSignal`.
  - [ ] `DatafnPlugin`, `DatafnHookContext`.
- [ ] Implement core error/envelope types in `src/errors.ts`:
  - [ ] `DatafnErrorCode`, `DatafnError`, `DatafnEnvelope<T>`.
  - [ ] Helpers: `ok(result)`, `err(code, message, details?)` (optional but recommended).
- [ ] Implement DFQL normalization in `src/normalize.ts`:
  - [ ] `normalizeDfql(value)` sorts object keys recursively and removes `undefined` values.
  - [ ] `dfqlKey(value)` returns `JSON.stringify(normalizeDfql(value))`.
- [ ] Implement schema validation in `src/schema.ts`:
  - [ ] Required shape checks for `resources[]`.
  - [ ] Unique resource names.
  - [ ] Field validation: required keys present; field names unique within a resource.
  - [ ] Normalize `indices: string[]` to `{ base, search, vector }`.
  - [ ] Normalize missing `relations` to `[]` (optional but recommended for downstream simplicity).
- [ ] Export public surface from `src/index.ts`.
- [ ] Write tests:
  - [ ] `__tests__/schema.test.ts` asserts `TV-SCHEMA-001` and `TV-SCHEMA-002`.
  - [ ] `__tests__/normalize.test.ts` asserts `TV-NORM-001` and `TV-NORM-002`.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/core
```

Expected outcome:
- All `@datafn/core` tests pass.

- Run:

```bash
cd superfunctions
npx turbo run build --filter=@datafn/core
```

Expected outcome:
- `superfunctions/datafn/core/dist/` is produced with `index.js`, `index.cjs`, and `.d.ts`.

---

## Stop condition

Report:
- The exported public API surface (`@datafn/core` exports list).
- Confirmation that `TV-SCHEMA-*` and `TV-NORM-*` assertions pass exactly.

