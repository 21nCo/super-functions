## Phase goal

Add client-side schema validation and deterministic remote response unwrapping to establish a stable base for the table registry and query APIs.

---

## In scope

- Implement `DatafnClientError` and deterministic error throwing.
- Validate schema at `createDatafnClient` startup using `@datafn/core.validateSchema`.
- Add remote response unwrapping utility supporting:
  - wrapped `DatafnEnvelope` success/error
  - unwrapped success
  - transport error for unknown shapes
- Add/adjust tests to cover `TV-CLIENT-*` and `TV-REMOTE-*`.

## Out of scope

- Table registry and Proxy behavior.
- Query/mutation execution semantics beyond unwrapping.
- Signals and sync facade.

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/client/src/client.ts`
- `superfunctions/datafn/client/src/index.ts`

Add:
- `superfunctions/datafn/client/src/errors.ts`
- `superfunctions/datafn/client/src/remote/unwrap.ts`
- `superfunctions/datafn/client/__tests__/client-create.test.ts`
- `superfunctions/datafn/client/__tests__/remote-unwrap.test.ts`

---

## Requirements covered

- CLIENT-API-001
- CLIENT-REMOTE-001

---

## Implementation tasks

- [ ] Add `DatafnClientError` type + helpers in `src/errors.ts`:
  - [ ] `createClientError(code, message, details)`
  - [ ] `asClientError(e)` (optional)
- [ ] Add `unwrapRemoteSuccess(...)` in `src/remote/unwrap.ts`:
  - [ ] If `{ ok:true, result }` → return `result`
  - [ ] If `{ ok:false, error }` → throw `DatafnClientError` mapped from `error.code/message/details.path`
  - [ ] If `{ data, nextCursor }` or `{ groups, nextCursor }` → return input as-is
  - [ ] Else → throw `TRANSPORT_ERROR` with message `Transport error: unexpected response shape` and `details.path:"$"`
- [ ] Update `createDatafnClient`:
  - [ ] Validate schema using `validateSchema`; on failure throw `SCHEMA_INVALID` with message/details matching `TV-CLIENT-002`.
  - [ ] Accept a required `remote` adapter (config type changes are part of this phase).
- [ ] Add tests:
  - [ ] `client-create.test.ts` asserts `TV-CLIENT-001` and `TV-CLIENT-002`.
  - [ ] `remote-unwrap.test.ts` asserts `TV-REMOTE-001` and `TV-REMOTE-002`.

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/client
```

Expected outcome:
- `TV-CLIENT-*` and `TV-REMOTE-*` assertions pass exactly.

---

## Stop condition

Report:
- The final `DatafnClientConfig` shape and how remote unwrapping works.
- Confirmation that schema validation and transport errors are deterministic.

