## Phase 01

### Phase goal (1 sentence)

Make all `@datafn/server` endpoints return top-level `DatafnEnvelope` for request-level failures (invalid JSON and invalid DFQL), eliminating nested `{ ok:false }` payloads.

### In scope

- Normalize JSON parsing for all POST endpoints to produce `DFQL_INVALID "Invalid JSON" path:"$"` on parse failure.
- Normalize request-level validation to always return top-level `ok:false` (not nested).
- Update server tests to assert the new (canonical) envelope behavior.

### Out of scope

- Changing capability strings (handled in Phase 02).
- Removing validation-only mode / DB requirement (handled in Phase 02).
- Plugin semantics changes (handled in Phase 03).

### Deliverables (explicit files/modules)

- Modify: `datafn/server/src/http/json.ts`
- Modify: `datafn/server/src/http/errors.ts`
- Modify: `datafn/server/src/routes/query.ts`
- Modify: `datafn/server/src/routes/mutation.ts`
- Modify: `datafn/server/src/routes/transact.ts`
- Modify: `datafn/server/src/routes/seed.ts`
- Modify: `datafn/server/src/routes/sync.ts`
- Modify tests:
  - `datafn/server/__tests__/phase-08-envelopes-status-auth.test.ts`
  - `datafn/server/__tests__/seed.test.ts`
  - `datafn/server/__tests__/transact.test.ts`
  - `datafn/server/__tests__/sync.test.ts`
  - any other tests asserting nested failure payloads

### Requirements covered

- SERVER-ENV-001
- SERVER-ENV-002
- SERVER-ENV-003

### Implementation tasks (ordered checklist)

- Ensure request body parsing occurs once per request and:
  - on parse failure returns `ok:false DFQL_INVALID "Invalid JSON" details:{path:"$"}`
  - does not call `authorize` (no parsed payload exists)
- For each endpoint, audit request-level failure paths:
  - invalid JSON
  - invalid shape (expected object/array)
  - missing required keys
  - unknown resource
  - invalid operators/fields
- Replace any request-level `{ ok:true, result:{ ok:false, ... } }` responses with top-level `ok:false`.
- Update tests to validate:
  - top-level ok:false for request failures
  - deterministic message and `details.path`

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/server
```

Expected outcome:

- All `@datafn/server` tests pass.
- Specific vectors validated in tests:
  - `TV-SERVER-ENV-001`
  - `TV-SERVER-VALID-001`
  - `TV-SERVER-VALID-002`

### Stop condition

Report:

- A list of all endpoints touched and the exact request-level error envelope shape they now return for invalid JSON.
- Test run result for `@datafn/server`.

