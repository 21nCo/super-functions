## datafn — Coverage Matrix (Original intent/spec → Current code → Change spec)

This document is a **mechanical mapping** to prevent omissions.

### Legend

- **Impl status**
  - **✅ Implemented**: exists in code and matches original intent/spec semantics at v0 level
  - **🟡 Partial**: exists but materially deviates (missing fields/paths/semantics, wrong envelopes, non-durable, etc.)
  - **❌ Missing**: not present in code
- **Change spec coverage**
  - **Covered**: has requirement ID(s) in `REQUIREMENTS.md` + vectors in `TEST_VECTORS.md` + phase file(s)
  - **Uncovered**: not yet represented as requirement/vectors/phases (this is a spec bug)

---

## A) Coverage from `agent/intent/datafn/datafn.intent.md`

| Source | Intent statement (atomic) | Impl status | Where in current code | Covered by change spec? | Notes |
|---|---|---:|---|---|---|
| Intent Overview | Schema-driven local-first data layer + offline sync | 🟡 Partial | server exists; client local-first missing | Covered (STORAGE-ADAPTER-001, CLIENT-HYDRATION-001, CLIENT-SYNC-APPLY-001, CLIENT-OFFLINE-QUERY-001, CLIENT-OFFLINE-MUT-001, CLIENT-CHANGELOG-001, SERVER-SYNC-001..003) | Not implemented yet |
| Guardrails | DFQL is schema-bounded (no arbitrary execution) | ✅ Implemented | server query validation + schema validation | Covered (DFQL-* requirements + SEARCH-PLUGIN-001) | Some DFQL paths not supported yet |
| Guardrails | Typed SDK is primary authoring surface; DFQL JSON is wire format | 🟡 Partial | types exist; no typed codegen | Covered (CODEGEN-TS-001) | TypeScript codegen is now specified (P2) |
| Client v0 | init with schema + persistence adapter + optional plugins | ❌ Missing | client has no persistence adapter, plugins unused | Covered (STORAGE-ADAPTER-001, PLUG-CLIENT-001) | |
| Client v0 | query (local-first when offlinability enabled) | ❌ Missing | client has no query | Covered (CLIENT-QUERY-001, CLIENT-OFFLINE-QUERY-001) | |
| Client v0 | reactive queries via signals (Svelte first) | ❌ Missing | client has no signal | Covered (CLIENT-SIGNAL-001, DOC-001) | |
| Client v0 | mutate and persist to local change log when offline | 🟡 Partial | mutate exists but no change log | Covered (CLIENT-MUT-001, CLIENT-OFFLINE-MUT-001, CLIENT-CHANGELOG-001) | |
| Client v0 | subscribe fine-grained (table, ids, actions, context, fields) | 🟡 Partial | filter only type/resource/ids/mutationId | Covered (CLIENT-SUB-001, SUB-EXTRA-001) | extra dimensions missing |
| Client v0 | transact ordered steps | 🟡 Partial | server has; client lacks | Covered (CLIENT-TX-001) | |
| Client v0 | sync clone/pull/push | 🟡 Partial | server has; client lacks | Covered (CLIENT-SYNC-001, CLIENT-SYNC-APPLY-001, CLIENT-HYDRATION-001) | |
| Client v0 | conflict default: deterministic LWW by server ordering | ❌ Missing | no server ordering model | Covered (SERVER-CONFLICT-001, SERVER-SYNC-001..003) | Server ordering + cursors are now specified |
| Server v0 | endpoints query/mutation/transact/clone/pull/push | 🟡 Partial | exist, but sync error envelopes inconsistent | Covered (SERVER-ENVELOPE-001) | |
| Server v0 | seed endpoint exists | ❌ Missing | no `/datafn/seed` route | Covered (SERVER-SEED-001, PHASE_06) | |
| Server v0 | authz: validate schema + permissions | 🟡 Partial | authorize exists but payload is `null`; no field-level | Covered (SERVER-AUTH-001, PLUG-SERVER-001) | Authorization payload is now specified; field-level policies are implementable via plugins |
| Server v0 | idempotency dedupe mutationId+clientId | 🟡 Partial | in-memory idempotency only | Covered (SERVER-DB-002, PHASE_07) | durability missing |
| Server v0 | transport abstraction via @superfunctions/http | ✅ Implemented | `createRouter` usage | Covered | |
| Server v0 | storage abstraction via @superfunctions/db | ❌ Missing | server uses `MemoryStore` | Covered (SERVER-DB-001, PHASE_07) | |
| Extensions | should work in extension context (background delegation, etc.) | ❌ Missing | no RPC transport | Covered (EXT-001) | requires full spec + phase |
| Plugins | plugin architecture + hooks | 🟡 Partial | plugin types exist; not executed | Covered (PLUG-CLIENT-001, PLUG-SERVER-001) | execution missing |
| searchFn plugin | use searchfn when `search` present + update index on changes | ❌ Missing | no search plugin integration | Covered (SEARCH-PLUGIN-001) | |

**All rows above are now covered by explicit requirements + vectors + phases.**

---

## B) Coverage from `superfunctions/datafn/.conduct/spec.md` (original spec)

| Source section | Spec statement (atomic) | Impl status | Where in current code | Covered by change spec? | Notes |
|---|---|---:|---|---|---|
| Public API TS | `DatafnClient.query/mutate/transact/subscribe/table` | 🟡 Partial | client missing query/transact/table | Covered (CLIENT-QUERY-001, CLIENT-MUT-001, CLIENT-TX-001, CLIENT-REG-001/002) | |
| Public API TS | Proxy registry `datafn.<table>.query(...)` | ❌ Missing | none | Covered (CLIENT-REG-001/002) | |
| Table handle | `DatafnTable.query/mutate/signal/subscribe` | ❌ Missing | none | Covered (CLIENT-QUERY-001, CLIENT-MUT-001, CLIENT-SIGNAL-001, CLIENT-SUB-001) | |
| Signals | `DatafnSignal` interface | ✅ Implemented | `@datafn/core` types + svelte adapter | Covered | |
| Svelte adapter | `toSvelteStore(signal)` | ✅ Implemented | `@datafn/svelte` | Covered (DOC-001 updates docs) | docs currently mislead |
| Python server SDK | parity server-only SDK exists | ❌ Missing | no python package | Covered (PY-SDK-001) | |
| Client runtime | local execution + remote fallback during hydration | ❌ Missing | none | Covered (CLIENT-HYDRATION-001, CLIENT-OFFLINE-QUERY-001, CLIENT-SYNC-APPLY-001) | |
| Query normalization | stable cache keys via normalization | ✅ Implemented | `@datafn/core.dfqlKey` | Covered | |
| Storage adapters | memory + indexeddb adapters | ❌ Missing | none | Covered (STORAGE-ADAPTER-001, STORAGE-MEM-001, STORAGE-IDB-001) | |
| Extension support | background runtime + thin clients | ❌ Missing | none | Covered (EXT-001) | needs concrete spec/vectors |
| Server runtime | routing via @superfunctions/http | ✅ Implemented | server | Covered | |
| Server runtime | DB via @superfunctions/db | ❌ Missing | server uses `MemoryStore` | Covered (SERVER-DB-001/002) | |
| Server endpoints | `/datafn/*` endpoints (incl seed) | 🟡 Partial | seed missing | Covered (SERVER-SEED-001) | |
| Plugins (ordering/error defaults) | hooks run in order; fail-open/closed rules | ❌ Missing | not executed | Covered (PLUG-CLIENT-001, PLUG-SERVER-001) | Test vectors added (TV-PLUG-CLIENT-*, TV-PLUG-SERVER-*) |
| API generation | REST/GraphQL generation | ❌ Missing | none | Covered (API-GEN-REST-001, API-GEN-GQL-001) | REST is required; GraphQL is optional (SHOULD) |
| Schema migrations | schema diff + migration scripts | ❌ Missing | none | Covered (MIG-001) | |

---

## C) Coverage from `superfunctions/datafn/.conduct/dfql.intent.md` vs current server DFQL execution

| DFQL feature | Intent | Impl status | Notes / evidence | Covered by change spec? |
|---|---|---:|---|---|
| Select: base fields | MUST | ✅ Implemented | `materializeSelect` supports base fields | Covered |
| Select: omit | MUST | ❌ Missing | server ignores `omit` | Covered (DFQL-OMIT-001) |
| Select: ids-only relation token (`tags`) | MUST | ❌ Missing | token without directive treated as field | Covered (DFQL-RELIDS-001) |
| Select: `relation.*` | MUST | ✅ Implemented | many-one, one-many, many-many expansions | Covered |
| Select: nested tokens (`tasks.tags.*`) | MUST | ❌ Missing | directives other than `*/#/*#` ignored | Covered (DFQL-NESTEDSELECT-001) |
| Select: `relation.#` join rows | MUST (for many-many) | ✅ Implemented | `tags.#` returns join rows | Covered |
| Select: `relation.*#` metadata expansion | MUST | ✅ Implemented | implemented | Covered |
| Select: `htree` `children.**` | MUST (for htree) | ❌ Missing | no htree relation execution | Covered (DFQL-HTREE-001) |
| Filters: field operators (eq/ne/gt/gte/lt/lte/like/ilike/is_null/is_not_null) | MUST | ✅ Implemented | see `filters.ts` | Covered |
| Filters: additional ops (before/after/between/is_empty/etc) | SHOULD/MAY | ❌ Missing | not implemented | Covered (DFQL-FILTER-OPS-EXTRA-001) |
| Filters: nested field paths (`parent.id`) | MUST | ❌ Missing | evaluator uses `record[key]` only | Covered (DFQL-FILTER-PATH-001) |
| Filters: relation quantifiers `$any/$all/$none` | SHOULD | ❌ Missing | no support | Covered (DFQL-FILTER-RELQ-001) |
| Search block delegation | SHOULD | ❌ Missing | no search plugin integration | Covered (SEARCH-PLUGIN-001) |
| groupBy/aggregations/having | SHOULD | ❌ Missing | types exist; executor ignores | Covered (DFQL-GROUPBY-001) |
| Cursor pagination `after` | MUST | ✅ Implemented | after only; requires id tie-breaker | Covered |
| Cursor pagination `before` | MAY | ❌ Missing | not implemented | Covered (DFQL-PAGE-BEFORE-001) |
| Query `count:true` | MUST | ❌ Missing | `executeQuery` does not compute count | Covered (DFQL-COUNT-001) |

**Interpretation:** server supports a functional subset of DFQL; full DFQL intent requires additional explicit requirements (not a single coarse bucket).

---

## D) Summary: what’s still missing besides client ergonomics + server DB

Even after covering client table registry + query/signal and server DB persistence, the repo still has additional intent gaps:
- `/datafn/seed` (now specified as SERVER-SEED-001)
- server envelope consistency for sync endpoints (currently inconsistent)
- server authz payload + field-level authz model
- DFQL completeness gaps (omit, ids-only relations, nested tokens, nested filter paths, htree, groupBy, count, search)
- plugin hook execution semantics (client + server)
- richer subscription filtering dimensions
- local-first persistence + offline change log
- hydration state + remote fallback
- extension RPC architecture
- Python server SDK parity
- migrations and auto-generated APIs

This matrix should be updated whenever requirements/phases are added or removed.

