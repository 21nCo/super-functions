## Phase 02

### Phase goal (1 sentence)

Enforce the server DB requirement (remove validation-only mode) and align `/datafn/status` capability strings and DB health behavior with the canonical contract.

### In scope

- Make `config.db` mandatory for all non-status endpoints; missing DB returns request-level `INTERNAL`.
- Align `/datafn/status` capabilities to: `dfql.query`, `dfql.mutation`, `dfql.transact`, `sync.seed`, `sync.clone`, `sync.pull`, `sync.push`.
- Ensure `/datafn/status` returns `ok:false INTERNAL` when DB is unhealthy.
- Ensure authorization sees parsed payload (POST) and `null` payload (status).

### Out of scope

- Plugin semantics fixes beyond auth ordering (Phase 03).
- Internal tables/idempotency/serverSeq atomicity (Phase 04).

### Deliverables (explicit files/modules)

- Modify: `datafn/server/src/server.ts`
- Modify: `datafn/server/src/routes/status.ts`
- Modify: `datafn/server/src/routes/query.ts`
- Modify: `datafn/server/src/routes/mutation.ts`
- Modify: `datafn/server/src/routes/transact.ts`
- Modify: `datafn/server/src/routes/seed.ts`
- Modify: `datafn/server/src/routes/sync.ts`
- Modify tests:
  - `datafn/server/__tests__/status.test.ts`
  - `datafn/server/__tests__/phase-08-envelopes-status-auth.test.ts`
  - any tests asserting old capability strings (`dfql.sync`, `dfql.seed`)
  - any tests asserting validation-only mode behavior (query without DB)

### Requirements covered

- SERVER-DB-001
- SERVER-STATUS-001
- SERVER-AUTH-001

### Implementation tasks (ordered checklist)

- Remove or gate the “no DB” branches in query/mutation/transact so they return request-level `INTERNAL` with `details.path:"$"`.
- Update status capabilities list to the canonical `sync.*` entries and deterministic ordering.
- Ensure status DB health:
  - call `db.isHealthy()` (or equivalent) and return `ok:false INTERNAL` when unhealthy
- Ensure `authorize(ctx, action, payload)`:
  - is called with parsed JSON payload for valid POST bodies
  - is called with `null` for `GET /datafn/status`
  - is called before DB reads/writes

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/server
```

Expected outcome:

- All server tests pass.
- Status tests validate vectors:
  - `TV-STATUS-001`
  - `TV-STATUS-002`
- DB-missing behavior validated by:
  - `TV-DB-MISSING-001`

### Stop condition

Report:

- The exact `capabilities` array returned by `/datafn/status`
- The behavior for `db` missing and `db.isHealthy().healthy === false`
- Test run result for `@datafn/server`

