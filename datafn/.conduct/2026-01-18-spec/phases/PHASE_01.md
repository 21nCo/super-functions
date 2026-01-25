## Phase goal

Implement `@datafn/server` skeleton with canonical envelopes, deterministic errors, authorization, limits, `/datafn/status`, and `/datafn/query` validation.

---

## In scope

- New package `superfunctions/datafn/server` (`@datafn/server`) exposing `createDatafnServer`.
- Routing via `@superfunctions/http` `createRouter`.
- Endpoint handlers:
  - `GET /datafn/status`
  - `POST /datafn/query` (validation-only in this phase; execution can return empty results)
- Cross-cutting behavior:
  - `DatafnEnvelope` responses (API-001).
  - Deterministic error codes/messages.
  - `authorize(...)` enforcement (SEC-001).
  - Limits enforcement for `query.limit` and `transact.steps` length (LIMIT-001) where applicable.

## Out of scope

- Full query execution (filters/sort/pagination/relations).
- Mutations, transactions, and sync endpoints.
- SQL adapter integration.

---

## Deliverables

- `superfunctions/datafn/server/package.json`
- `superfunctions/datafn/server/tsconfig.json`
- `superfunctions/datafn/server/tsup.config.ts`
- `superfunctions/datafn/server/vitest.config.ts`
- `superfunctions/datafn/server/src/index.ts`
- `superfunctions/datafn/server/src/server.ts` (createDatafnServer)
- `superfunctions/datafn/server/src/http/json.ts` (helpers for JSON parsing + responses)
- `superfunctions/datafn/server/src/http/errors.ts` (mapping to DatafnError/DatafnEnvelope)
- `superfunctions/datafn/server/src/routes/status.ts`
- `superfunctions/datafn/server/src/routes/query.ts`
- `superfunctions/datafn/server/__tests__/status.test.ts`
- `superfunctions/datafn/server/__tests__/query-validation.test.ts`

---

## Requirements covered

- API-001
- QUERY-001 (validation only)
- SEC-001
- LIMIT-001 (query.limit only in this phase)
- COMP-001 (status metadata)

---

## Implementation tasks

- [ ] Create `@datafn/server` package scaffold (match `searchfn` conventions).
- [ ] Implement `createDatafnServer<TContext>(config)`:
  - [ ] Validate `config.schema` using `@datafn/core.validateSchema` at startup; store the validated schema.
  - [ ] Create a `Router` with `basePath: "/"` and routes for `/datafn/status` and `/datafn/query`.
  - [ ] Implement a single, shared error-to-envelope function that returns deterministic `{ ok:false, error:{code,message,details} }`.
- [ ] Implement authorization:
  - [ ] For each request, call `config.authorize(ctx, action, payload)` when provided.
  - [ ] On deny, return `{ ok:false, error:{ code:\"FORBIDDEN\", message:\"Forbidden\" } }` and do not execute route logic.
- [ ] Implement limits:
  - [ ] Enforce configured `maxLimit` against `query.limit` (default maxLimit=100 if not configured).
  - [ ] If exceeded, return `LIMIT_EXCEEDED` with message `Limit exceeded: limit>MAX`.
- [ ] Implement `/datafn/status`:
  - [ ] `schemaHash` computed from validated schema (`validateSchema` output) using the algorithm in `SPEC.md`.
  - [ ] `capabilities` includes at least `dfql.query` for this phase.
  - [ ] `limits` echoes configured limits.
  - [ ] `serverTimeMs` is current time in ms (tests stub time).
- [ ] Implement `/datafn/query` validation:
  - [ ] Accept body as object or array; otherwise `DFQL_INVALID` with message `Invalid DFQL: expected object or array`.
  - [ ] For each query: validate `resource`, `version`, and any referenced `select`/`filters` paths exist in schema.
  - [ ] Fail-fast for batch: first invalid query rejects the whole request with `error.details.index`.
  - [ ] Return an empty successful result for valid queries in this phase:
    - Non-aggregate: `{ data: [], nextCursor: null }`
    - Aggregate: `{ groups: [], nextCursor: null }`
- [ ] Tests:
  - [ ] `status.test.ts` asserts `TV-COMP-001` (use fake time).
  - [ ] `query-validation.test.ts` asserts `TV-API-002` and `TV-QUERY-002` negative variants.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- All `@datafn/server` tests pass (status + query validation).

---

## Stop condition

Report:
- `@datafn/server` public API surface and how to mount the router.
- Confirmation that envelope/error semantics match `TV-API-002`, `TV-QUERY-002`, and `TV-COMP-001`.

