## datafn — Change Plan (execution strategy)

This plan implements the change defined by `SPEC.md` and `REQUIREMENTS.md`.

**Global rule**: No phase is complete unless its verification steps pass. (Per [`spec.txt`](https://www.fetch.at/spec.txt))

---

## Architecture sketch

### `@datafn/core` (required deltas)

Used capabilities:
- `validateSchema` for client startup validation.
- `dfqlKey` for query signal caching.
- shared event types (`DatafnEvent`, `DatafnEventFilter`) and plugin types.

Required changes:
- Extend `DatafnEvent` and `DatafnEventFilter` to support `action`, `fields`, and `contextKeys` (SUB-EXTRA-001).

### `@datafn/client` (primary change surface)

New responsibilities (relative to current implementation):
- Table registry:
  - `client.table(name)` and `client.<tableName>` Proxy access
  - `DatafnTable` handles (`query/mutate/signal/subscribe`)
- Remote-first query + transact + sync delegation:
  - accept wrapped/unwrapped success responses
  - unwrap server envelopes deterministically and throw `DatafnClientError` on `ok:false`
- Reactive query signals:
  - cached by `dfqlKey`
  - refresh on `mutation_applied` for same resource
  - deterministic in-flight de-duplication
- Plugins:
  - execute `DatafnPlugin` hooks with defined fail-open/fail-closed defaults (PLUG-CLIENT-001)
- Offline/local-first:
  - storage adapter + changelog + hydration states (STORAGE-*, CLIENT-OFFLINE-*, CLIENT-HYDRATION-001)
- Extension RPC:
  - RPC transport using canonical envelope (EXT-001)

### `@datafn/svelte` (docs + examples)

No API changes required (`toSvelteStore` remains).
This change plan updates the README so the quick start uses `client.<table>.signal(...)` instead of hand-rolled signals.

### `@datafn/server` (required deltas)

Required changes:
- Transport envelope consistency for all endpoints (SERVER-ENVELOPE-001).
- Status capability advertising and DB health gating (SERVER-STATUS-001).
- Authorization payload forwarding (SERVER-AUTH-001).
- Durable persistence + idempotency (SERVER-DB-001, SERVER-DB-002).
- Sync correctness + conflict ordering (SERVER-SYNC-001..003, SERVER-CONFLICT-001).
- Plugin hook execution (PLUG-SERVER-001) and search integration gating (SEARCH-PLUGIN-001).
- DFQL completeness items enumerated by DFQL-* requirements.
- REST wrappers (API-GEN-REST-001).

---

## Dependency graph

- Phase 00→05 are client ergonomics (schema/errors → registry → query/mutate/subscribe/signal → transact).
- Phase 06→10 are server foundation (seed route → DB adapter → envelopes/status/auth → sync+conflict ordering → plugin execution/search gating).
- Phase 11→15 are DFQL completeness increments.
- Phase 16→22 are client ecosystem completion (plugins/sub filters → storage adapters → hydration/sync apply → offline query/mutation → extension RPC).
- Phase 23→26 are tooling surfaces (TS codegen → Python server SDK → migrations → REST wrappers).

---

## Phases overview

- **Phase 00** → goal: introduce deterministic `DatafnClientError` + remote unwrapping utilities + schema validation → delivers: client can be constructed and reject invalid schemas → verify: `TV-CLIENT-*`, `TV-REMOTE-*`
- **Phase 01** → goal: implement table registry (`table(name)` + Proxy) and `DatafnTable` handle objects → delivers: `datafn.<table>` surface exists → verify: `TV-REG-*`
- **Phase 02** → goal: implement `DatafnTable.query` merge semantics + error mapping over remote.query → delivers: table queries work and preserve ordering → verify: `TV-QUERY-*`
- **Phase 03** → goal: implement `DatafnTable.mutate` + deterministic event emission + `DatafnTable.subscribe` resource scoping → delivers: mutation-driven UI updates → verify: `TV-MUT-*`, `TV-SUB-*`
- **Phase 04** → goal: implement `DatafnTable.signal` caching + refresh semantics and add client `sync` facade + update `@datafn/svelte` README → delivers: Svelte can bind to real query signals → verify: `TV-SIGNAL-*`, `TV-SYNC-*`, `TV-DOC-*`
- **Phase 05** → goal: implement `client.transact` and `table.transact` delegation + unwrapping → delivers: transact surface matches v0 intent → verify: `TV-TX-*`
- **Phase 06** → goal: add server `POST /datafn/seed` endpoint shape (ack + validation) → delivers: seed exists for sync workflows → verify: `TV-SEED-*`
- **Phase 07** → goal: integrate `@datafn/server` with `@superfunctions/db.Adapter` for persistence + idempotency durability → delivers: server is no longer memory-only → verify: `TV-DB-*`, `TV-IDEMP-*`
- **Phase 08** → goal: server envelope consistency + status capabilities + auth payload forwarding → delivers: server is safe for clients to consume → verify: `TV-SERVER-ENV-*`, `TV-STATUS-*`, `TV-AUTH-*`
- **Phase 09** → goal: server sync correctness + deterministic conflict ordering (`serverSeq`) → delivers: clone/pull/push are durable and monotonic → verify: `TV-CONFLICT-*`, `TV-SERVER-CLONE-*`, `TV-SERVER-PULL-*`, `TV-SERVER-PUSH-*`
- **Phase 10** → goal: server plugin hook execution + search gating → delivers: plugins run deterministically and `search` is supported with `searchfn` plugin → verify: `TV-PLUG-SERVER-*`, `TV-SEARCH-*`
- **Phase 11** → goal: DFQL `omit` + ids-only relation tokens + nested select traversal → verify: `TV-DFQL-OMIT-*`, `TV-DFQL-RELIDS-*`, `TV-DFQL-NESTED-*`
- **Phase 12** → goal: DFQL nested filter paths + relation quantifiers → verify: `TV-DFQL-FILTERPATH-*`, `TV-DFQL-RELQ-*`
- **Phase 13** → goal: DFQL `htree` semantics → verify: `TV-HTREE-*`
- **Phase 14** → goal: DFQL `count:true` + `cursor.before` + extra filter operators → verify: `TV-DFQL-COUNT-*`, `TV-DFQL-BEFORE-*`, `TV-DFQL-OPS-*`
- **Phase 15** → goal: DFQL `groupBy/aggregations/having` → verify: `TV-DFQL-GROUP-*`
- **Phase 16** → goal: client plugins + richer subscriptions (`action/fields/contextKeys`) → verify: `TV-PLUG-CLIENT-*`, `TV-SUB-EXTRA-*`
- **Phase 17** → goal: storage adapter interface + memory adapter → verify: `TV-STORAGE-001`, `TV-STORAGE-002`, `TV-STORAGE-003`
- **Phase 18** → goal: IndexedDB adapter → verify: `TV-STORAGE-IDB-*`
- **Phase 19** → goal: client sync apply + hydration state machine → verify: `TV-CLIENT-SYNC-APPLY-*`, `TV-HYDRATION-*`
- **Phase 20** → goal: local-first query routing → verify: `TV-OFFLINE-QUERY-*`
- **Phase 21** → goal: offline mutation logging + changelog semantics → verify: `TV-OFFLINE-MUT-*`, `TV-CHANGELOG-*`
- **Phase 22** → goal: extension RPC transport → verify: `TV-EXT-*`
- **Phase 23** → goal: TypeScript codegen → verify: `TV-CODEGEN-*`
- **Phase 24** → goal: Python server SDK → verify: `TV-PY-*`
- **Phase 25** → goal: schema migrations tooling → verify: `TV-MIG-*`
- **Phase 26** → goal: REST wrappers → verify: `TV-REST-*`

---

## Definition of Done (global)

- All requirements covered by a phase have passing vectors in `TEST_VECTORS.md`.
- Any breaking change is captured by this change spec and has a migration/compatibility note.
- `@datafn/client` and `@datafn/svelte` build successfully and tests pass via Turbo.

