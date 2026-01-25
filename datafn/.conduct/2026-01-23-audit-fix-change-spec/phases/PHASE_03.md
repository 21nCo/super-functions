## Phase 03

### Phase goal (1 sentence)

Make server plugin execution correct and complete: enforce `runsOn` and ensure `afterQuery` runs for DB-backed queries with fail-open semantics.

### In scope

- Enforce `plugin.runsOn` environment gating for all server hook execution.
- Ensure `afterQuery` runs for successful DB-backed query execution.
- Ensure hook ordering is deterministic and registration-order.
- Add tests that lock these semantics.

### Out of scope

- Client plugin execution (Phase 06).
- Sync ordering/internal tables (Phase 04).

### Deliverables (explicit files/modules)

- Modify: `datafn/server/src/plugins/run-hooks.ts`
- Modify: `datafn/server/src/routes/query.ts`
- Modify: `datafn/server/src/routes/mutation.ts` (if necessary for runsOn enforcement consistency)
- Modify: `datafn/server/src/routes/sync.ts` (if necessary for runsOn enforcement consistency)
- Modify tests:
  - `datafn/server/__tests__/plugins.test.ts`
  - `datafn/server/__tests__/plugins-integration.test.ts`

### Requirements covered

- SERVER-PLUG-001
- SERVER-PLUG-002

### Implementation tasks (ordered checklist)

- Add environment filtering: only execute hooks when `plugin.runsOn.includes("server")`.
- Ensure hook order is stable:
  - before hooks: p0 → pN
  - after hooks: p0 → pN (unless explicitly specified otherwise; this spec requires registration order)
- Ensure afterQuery:
  - runs after DB query execution returns a result envelope
  - receives the same query payload used for execution (post beforeQuery transformations)
  - is fail-open: exceptions do not fail the request (but are logged)
- Add/update tests to validate:
  - ordering
  - runsOn enforcement
  - afterQuery for DB-backed path

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/server
```

Expected outcome:

- All server tests pass.
- Plugin tests validate vectors:
  - `TV-PLUG-SERVER-ORDER-001`
  - `TV-PLUG-SERVER-RUNSON-001`
  - `TV-PLUG-SERVER-AFTERQUERY-001`
  - `TV-PLUG-SERVER-AFTERQUERY-002`

### Stop condition

Report:

- The final runsOn gating logic
- How afterQuery is invoked for DB-backed queries (call site + error handling)
- Test run result for `@datafn/server`

