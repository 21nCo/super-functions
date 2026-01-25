## Phase 06

### Phase goal (1 sentence)

Implement client-side plugin hook execution with registration order, runsOn enforcement, and fail-open/closed semantics.

### In scope

- Extend `createDatafnClient` config to accept `plugins?: DatafnPlugin[]`.
- Implement hook runner for:
  - `beforeQuery` / `afterQuery`
  - `beforeMutation` / `afterMutation`
  - `beforeSync` / `afterSync`
  - (transact: treat as query+mutation steps or as its own hook if defined; use existing spec hook surface)
- Enforce `plugin.runsOn.includes("client")`.
- Fail-closed for `before*` and fail-open for `after*` by default.

### Out of scope

- Rich subscription filtering (Phase 07).
- Storage adapter shipping (Phase 09).

### Deliverables (explicit files/modules)

- Modify: `datafn/client/src/client.ts`
- Add: `datafn/client/src/plugins/run-hooks.ts` (or equivalent)
- Modify: `datafn/client/src/query.ts`
- Modify: `datafn/client/src/mutate.ts`
- Modify: `datafn/client/src/sync.ts`
- Modify: `datafn/client/src/transact.ts`
- Modify tests:
  - Add/modify `datafn/client/__tests__/plugins.test.ts` (new) OR extend existing tests to cover plugin behavior

### Requirements covered

- CLIENT-PLUG-001

### Implementation tasks (ordered checklist)

- Add plugins to client config and store in client instance.
- Implement `runBeforeQuery/runAfterQuery`, etc., mirroring server semantics:
  - registration order
  - runsOn enforcement
  - fail-closed for before (throw deterministic error with `details.path:"plugins.<name>.<hook>"`)
  - fail-open for after (log and continue)
- Ensure hooks wrap the actual payload that will be sent to remote/local execution:
  - `beforeQuery` can transform the query
  - `beforeMutation` can transform the mutation(s)
  - `beforeSync` can transform the sync payload
- Add tests validating:
  - beforeQuery transformation applies
  - beforeQuery error prevents remote calls
  - runsOn prevents running client-ineligible plugins

### Verification steps

From repo root:

```bash
npm test -- --filter=@datafn/client
```

Expected outcome:

- All client tests pass.
- Plugin vectors validated:
  - `TV-PLUG-CLIENT-001`
  - `TV-PLUG-CLIENT-002`

### Stop condition

Report:

- The new `DatafnClientConfig.plugins` behavior
- The deterministic error shape thrown for plugin failures
- Test run result for `@datafn/client`

