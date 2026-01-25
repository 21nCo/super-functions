## Phase goal

Make server plugins real: execute `DatafnPlugin` hooks deterministically around query/mutation/transact/sync and support DFQL `search` when a `searchfn` plugin is installed.

---

## In scope

- Execute server plugin hooks in registration order (PLUG-SERVER-001).
- Apply fail-closed vs fail-open defaults as defined in `SPEC.md`.
- Gate DFQL `search`:
  - if `search` present and no `searchfn` plugin installed → reject with `DFQL_UNSUPPORTED`
  - if `searchfn` plugin installed → allow delegation (SEARCH-PLUGIN-001)

## Out of scope

- Implementing a concrete search engine (searchfn itself is external).
- DFQL completeness beyond search gating and plugin execution (Phase 11+).

---

## Deliverables (files to create/modify)

Modify:
- `superfunctions/datafn/server/src/server.ts` (wire plugin list into handlers)
- `superfunctions/datafn/server/src/routes/query.ts`
- `superfunctions/datafn/server/src/routes/mutation.ts`
- `superfunctions/datafn/server/src/routes/transact.ts`
- `superfunctions/datafn/server/src/routes/sync.ts`

Add:
- `superfunctions/datafn/server/src/plugins/run-hooks.ts`
- `superfunctions/datafn/server/__tests__/plugins.test.ts`

---

## Requirements covered

- PLUG-SERVER-001
- SEARCH-PLUGIN-001

---

## Implementation tasks

- [ ] Build a shared hook runner:
  - [ ] `runBeforeQuery`, `runAfterQuery`, `runBeforeMutation`, `runAfterMutation`, `runBeforeSync`, `runAfterSync`
  - [ ] Deterministic ordering: registration order
  - [ ] Fail-open/closed defaults per hook category
- [ ] Integrate hooks into routes:
  - [ ] Query: beforeQuery can transform query; afterQuery can post-process result
  - [ ] Mutation/transact: beforeMutation can transform; afterMutation runs after success/failure (as specified)
  - [ ] Sync: beforeSync can transform payload; afterSync runs after result
- [ ] Implement search gating in query handler:
  - [ ] If `q.search` present and no plugin `name === "searchfn"` → return `DFQL_UNSUPPORTED`
- [ ] Add tests implementing:
  - [ ] `TV-PLUG-SERVER-001`, `TV-PLUG-SERVER-002`
  - [ ] `TV-SEARCH-001`, `TV-SEARCH-002`

---

## Verification steps

- Run:

```bash
cd superfunctions
npx turbo run test --filter=@datafn/server
```

Expected outcome:
- Plugin and search vectors pass exactly.

---

## Stop condition

Report:
- Plugins execute in order with specified fail-open/closed defaults.
- `search` is rejected without `searchfn` and works with it installed (via deterministic query rewriting).

