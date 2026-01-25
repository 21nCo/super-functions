## Metadata

- **timestamp**: 2026-01-24T06:17:11Z (UTC)
- **agent_name**: unknown-agent
- **model**: GPT-5.2
- **IDE/editor**: Cursor (Cursor IDE)
- **workspace path**: `/Users/ar/dev`
- **project root**: `/Users/ar/dev/superfunctions/datafn`
- **OS**: darwin 25.0.0
- **shell**: zsh
- **repo**:
  - **git repo?**: yes (`/Users/ar/dev/superfunctions`)
  - **git toplevel**: `/Users/ar/dev/superfunctions`
  - **branch**: `HEAD` (detached; `## HEAD (no branch)`)
  - **commit**: `ec7e3e4d5938dca77997723a0378ea58ed0ed485`
  - **dirty?**: yes (notably `?? datafn/` indicates `datafn/` is untracked in this git state; many other modified/untracked paths exist)
- **intent/notes paths audited**:
  - `/Users/ar/dev/superfunctions/datafn/.conduct/datafn.intent.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/dfql.intent.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/spec.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/implementation.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/migration-plan-from-nucleus.md`
  - `/Users/ar/dev/superfunctions/datafn/core/README.md`
  - `/Users/ar/dev/superfunctions/datafn/client/README.md`
  - `/Users/ar/dev/superfunctions/datafn/server/README.md`
  - `/Users/ar/dev/superfunctions/datafn/svelte/README.md`
- **spec bundle paths audited**:
  - **Bundle A**: `/Users/ar/dev/superfunctions/datafn/.conduct/2026-01-18-spec/`
    - Included: `REQUIREMENTS.md`, `SPEC.md`, `TEST_VECTORS.md`, `PLAN.md`, `IMPLEMENTATION_SUMMARY.md`, `phases/PHASE_00.md..PHASE_05.md`, `phase_*_completion_report.md`
  - **Bundle B**: `/Users/ar/dev/superfunctions/datafn/.conduct/2026-01-19-change-spec/`
    - Included: `REQUIREMENTS.md`, `SPEC.md`, `TEST_VECTORS.md`, `PLAN.md`, `COVERAGE_MATRIX.md`, `phases/PHASE_00.md..PHASE_26.md`
  - **Bundle C**: `/Users/ar/dev/superfunctions/datafn/.conduct/2026-01-23-audit-fix-change-spec/`
    - Included: `INTENT_AUDIT.md`, `REQUIREMENTS.md`, `SPEC.md`, `TEST_VECTORS.md`, `PLAN.md`, `phases/PHASE_00.md..PHASE_15.md`
- **codebase scope audited**:
  - **included**:
    - `/Users/ar/dev/superfunctions/datafn/core/src/**`
    - `/Users/ar/dev/superfunctions/datafn/client/src/**`
    - `/Users/ar/dev/superfunctions/datafn/server/src/**`
    - `/Users/ar/dev/superfunctions/datafn/svelte/src/**`
    - `/Users/ar/dev/superfunctions/datafn/cli/src/**`
    - `/Users/ar/dev/superfunctions/datafn/python/datafn/**`
    - package/unit tests were read for behavioral intent, but **not executed** (see scope)
  - **excluded** (non-source / would violate read-only rule if executed/written):
    - `/Users/ar/dev/superfunctions/datafn/python/venv/**`
    - `**/__pycache__/**`
    - `**/dist/**` (not present in this workspace snapshot)
- **commands executed during audit**:
  - `curl -fsSL https://www.fetch.at/audit.txt`
  - `git -C "/Users/ar/dev/superfunctions" rev-parse --show-toplevel`
  - `git -C "/Users/ar/dev/superfunctions" rev-parse --abbrev-ref HEAD`
  - `git -C "/Users/ar/dev/superfunctions" rev-parse HEAD`
  - `git -C "/Users/ar/dev/superfunctions" status --porcelain=v1 -b`
  - `date -u "+%Y-%m-%dT%H:%M:%SZ"`
  - `mkdir -p "/Users/ar/dev/superfunctions/datafn/.conduct/audits"`

## Audit scope

- **Audit type**: full, thorough, read-only.
- **No code changes** were made; the only filesystem change performed was creating the required directory and this report file in `.conduct/audits/`.
- **Tests/vectors execution**: Not executed. Rationale: the audit instruction forbids creating/modifying any files besides the report; typical JS/Python test runs write caches/artifacts, and the repo does not include `node_modules/` in this workspace snapshot.
- **Spec precedence**: The user did not specify precedence across bundles. This report:
  - audits **each bundle’s** requirements against the implementation
  - flags cross-bundle disagreements as **SPEC CONFLICT**
  - recommends an explicit precedence decision.

## Inputs audited (intent + spec bundles)

### Intent / notes (authoritative “what was intended”)

- `.conduct/datafn.intent.md`
- `.conduct/dfql.intent.md`
- `.conduct/spec.md`
- `.conduct/implementation.md`
- `.conduct/migration-plan-from-nucleus.md`
- Package READMEs: `core/README.md`, `client/README.md`, `server/README.md`, `svelte/README.md`

### Spec bundles (authoritative “what was specified”)

- 2026-01-18 spec bundle (Bundle A)
- 2026-01-19 change spec bundle (Bundle B)
- 2026-01-23 audit-fix change spec bundle (Bundle C)

## High-level findings

### Summary

- **Core contract is mostly implemented**: `@datafn/core` defines a canonical `DatafnEnvelope`, deterministic DFQL normalization (`normalizeDfql`/`dfqlKey`), and `unwrapEnvelope`. However, `DatafnError` is modeled as a plain object (not a class), and docs contain mismatches.
- **Client runtime is partially implemented**: table registry (including `client.<table>` proxy), events + filters (including `action/fields/contextKeys`), signal caching, sync facade, and offline fallback classification exist. Local/offline query semantics are a **subset** of DFQL; storage adapters miss required deterministic input validation.
- **Server runtime is partially implemented**: endpoints exist, adapter-backed idempotency and change tracking tables exist, and sync endpoints largely match the latest test vectors. Major gaps remain in deterministic request validation + execution error surfacing, mutation semantics (`replace`, `if` guards, relation ops), transaction atomicity, and authorization ordering semantics (especially around invalid JSON).
- **Python SDK is not parity**: it is a stub that does not provide real `/datafn/*` handlers with TypeScript parity semantics.
- **Documentation parity is not met**: READMEs include multiple API/shape mismatches (client uses `where` instead of DFQL `filters`, server capabilities strings differ in docs vs spec/code, core README references a non-existent `DatafnError` class).

### Highest-risk issues (ranked)

1. **Server query execution swallows execution errors** (returns `{ data: [], nextCursor:null }`), breaking determinism and making invalid DFQL look like empty datasets.
2. **Authorization ordering violates spec**: `authorize(...)` can run even when JSON parsing fails, potentially returning `FORBIDDEN` instead of the required deterministic `DFQL_INVALID "Invalid JSON"`.
3. **Transactions are not atomic** (no rollback); spec/intent require atomic multi-step updates.
4. **Server mutation semantics are incomplete**: `if` guards ignored; relation mutations unsupported; `replace` behaves like `merge`.
5. **Python SDK parity missing**: breaks cross-language deployment goal.

## Intent Inventory (numbered)

This inventory is extracted from the authoritative intent/notes/docs listed in **Metadata** (not from any spec bundle). Each item is intended to be **exhaustive** at the “contract surface” level; when an item contains sub-bullets, those sub-bullets are part of the same intent item.

1. **I01 — Product mission / shape**: datafn is a **schema-driven, local-first data layer** for reactive apps with offline sync, providing a constrained JSON wire protocol (DFQL) plus typed SDK APIs. It includes **both client and server runtimes** and must not force a single UI/app framework.
2. **I02 — Problem statement**: solve graph-like querying (joins/relations) without bespoke endpoints, make offline sync/caching first-class, enable optimistic UI + reactive updates.
3. **I03 — Non-goals / guardrails**:
   - DFQL is **not** arbitrary execution (no raw SQL execution; no embedded user-defined server code in queries).
   - DFQL is **schema-bounded**: only declared tables/fields/relations are addressable; server-side authz enforces this boundary.
   - The primary authoring surface is **typed SDK APIs**; DFQL JSON is a portable “wire format/query plan”.
   - **No framework lock-in**: framework adapters are separate packages (Svelte first).
4. **I04 — Canonical envelope contract**:
   - Canonical transport wrapper is `DatafnEnvelope<T>`: success `{ ok:true, result:T }`, error `{ ok:false, error: DatafnError }`.
   - Request-level failures are **top-level `ok:false`** (never `ok:true` with nested failure payloads).
   - `DatafnError.details.path` is always present (use `"$"` when not more specific).
5. **I05 — Determinism invariant**: identical validated schema + identical DFQL input + identical underlying data must yield identical outputs and error shapes; plugins must not break determinism (especially ordering).
6. **I06 — Package/runtime surfaces (v0)**:
   - Client runtime (init/query/mutate/subscribe/transact/sync/signals/plugins/offline).
   - Server runtime (endpoints, authz, idempotency, sync engine, plugins, limits).
   - Framework adapters (Svelte first via `@datafn/svelte`; others later).
   - Tooling (migrations + codegen; optionally via `@datafn/cli`).
   - Python server-only SDK parity with TypeScript server wire semantics.
7. **I07 — Client v0 runtime surface** (init/query/reactive/mutate/subscribe/transact/sync):
   - **init**: initialize once with schema + persistence adapter + optional plugins.
   - **query**: execute DFQL queries; local-first when offlinability is enabled.
   - **reactive queries**: signal-backed query results for declarative binding (Svelte v0 via `@datafn/svelte`).
   - **mutate**: execute DFQL mutations; when offline, persist to a local change log.
   - **subscribe**: fine-grained subscriptions for data changes (resource/table, ids, actions, context keys, fields).
   - **transact**: ordered query/mutation steps (delegates to server when needed).
   - **sync**: `seed`, `clone`, `pull`, `push`.
   - **conflict default**: deterministic LWW by server ordering (see sync invariants).
8. **I08 — Server v0 runtime surface**:
   - Endpoints: `/datafn/status`, `/datafn/query`, `/datafn/mutation`, `/datafn/transact`, `/datafn/seed`, `/datafn/clone`, `/datafn/pull`, `/datafn/push`.
   - Schema-bounded validation + authorization enforcement over tables/fields/relations.
   - Idempotency via `(clientId, mutationId)` for safe retries.
   - Framework-agnostic routing via `@superfunctions/http`.
   - DB abstraction via `@superfunctions/db`.
9. **I09 — Canonical “inner” payload shapes (recommended)**:
   - Query (non-aggregate): `{ data, count?, nextCursor? }`.
   - Query (aggregate / groupBy): `{ groups, nextCursor? }`.
   - Mutation: `{ ok, mutationId, affectedIds, errors? }` (plus optional richer context: resource/operation/id, relationChanges).
   - Transact: `{ ok, results: [...] }` (results correspond to steps order).
10. **I10 — Schema: resources/tables**:
    - `resources[]` entries include: `name`, `version`, optional `idPrefix`, optional `isRemoteOnly`, `fields[]`, optional `indices`, optional `permissions`.
    - `isRemoteOnly:true` tables are server-only: queries/mutations happen directly on server and they must be rejected from clone/offline hydration.
11. **I11 — Schema: fields + constraints**:
    - Field keys include (at minimum): `name`, `type` (`string|number|boolean|object|array|date|file`), `required`.
    - Additional field intent keys exist (implementation-defined enforcement): `nullable`, `encrypt`, `default`, `enum`, numeric constraints (`min/max`), string constraints (`minLength/maxLength/pattern`), `readonly`, `unique`.
    - “System fields” are assumed on all records (examples given): `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `isArchived`, `trashInformation` (exact set may be implementation-defined but must be treated consistently).
12. **I12 — Schema: indices normalization**:
    - `indices` supports either an object `{ base, search, vector }` or shorthand arrays (e.g. `indices: ["label"]` ⇒ `{ base:["label"], search:[], vector:[] }`).
13. **I13 — Schema: relations/links**:
    - Relation schema includes `from`, `to` (string or arrays), `type` (`one-many|many-one|many-many|htree`), `relation`, `inverse`, optional `cache`, optional `metadata[]`.
    - Naming inference exists but is discouraged for developer-facing APIs; explicit `relation`/`inverse` preferred.
14. **I14 — Relation type semantics**:
    - `many-one`: forward uses FK on “many” side; inverse expands by scanning FK matches.
    - `one-many`: inverse of `many-one`.
    - `many-many`: join table/edge list with optional metadata fields.
    - `htree`: hierarchy via materialized path column (e.g. `a-b-c`).
15. **I15 — DFQL query request shape**:
    - Keys include: `resource`, `version`, `select`, `filters`, `search`, `sort`, `limit`, `offset`, `cursor`, `count`, `omit`, `groupBy`, `aggregations`, `having`.
16. **I16 — DFQL query response shape**:
    - Non-aggregate: `{ data: [...], count?, nextCursor? }`
    - Aggregate: `{ groups: [...], nextCursor? }`
    - Batch query request (array) returns array of results in the same order.
17. **I17 — DFQL select baseline rules**:
    - Omitted `select` selects all base fields of the resource and **no** relation expansions.
    - Relation expansion is explicit via tokens like `rel.*`, `rel.#`, `rel.*#`, `children.**`, etc.
    - Nested select traversal is allowed (e.g. `tasks.tags.*`) and must be deterministic.
18. **I18 — DFQL select: ids-only and expansions (one-many / many-one)**:
    - Ids-only token (`rel`) returns id or id array depending on cardinality.
    - `rel.*` returns expanded related record(s).
    - Nested expansion tokens like `tasks.tags.*` expand intermediate relations and then descendant selection deterministically.
19. **I19 — DFQL select: many-many specifics**:
    - Ids-only returns deterministic array of ids.
    - `rel.#` returns join rows `[{from,to,...metadata}]`.
    - `rel.*#` returns expanded records each with `$relation_metadata`.
    - Ordering: deterministic, and when `order` metadata exists it should be used as primary ordering key (else deterministic id-based tie-breakers).
20. **I20 — DFQL select: htree specifics**:
    - Ids-only `parent` yields parent hierarchy ids (materialized path split).
    - `parent.*` expands ordered ancestor chain (root → immediate parent).
    - `children.*` expands immediate children.
    - `children.**` expands all descendants with deterministic ordering.
21. **I21 — DFQL filters (scalar + operator objects)**:
    - `field: value` means equality.
    - `field: [a,b,c]` means membership (“in”).
    - Operator objects include at least: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `not_like`, `ilike`, `not_ilike`, `before`, `after`, `between`, `not_between`, `is_null`, `is_not_null`, `is_empty`, `is_not_empty`.
    - Filter keys may be dot-paths crossing nested objects/relations (e.g. `parent.id`, `collections.property.type`).
22. **I22 — Relation-crossing filter default semantics**: when a filter path crosses a relation yielding multiple rows (`one-many`, `many-many`, `htree children`), dot-path semantics are **ANY-match by default** (“there exists a related row that matches”).
23. **I23 — Relation quantifier blocks (`$any/$all/$none`)**:
    - `$any`: at least one related row matches the nested filter.
    - `$all`: all related rows match the nested filter (**false** when there are zero related rows).
    - `$none`: no related rows match the nested filter (**true** when there are zero related rows).
24. **I24 — Compound filters (`$and/$or`)**:
    - `$and`: array of filter blocks; all must match.
    - `$or`: array of filter blocks; any may match.
    - Multiple keys within a single filter object are treated as implicit AND.
25. **I25 — DFQL search block**:
    - Search can be combined with `filters` using AND.
    - Shape includes `query`, `type: "fullText"|"semantic"`, optional `fields`, optional `topK`.
    - Intended integration: delegate candidate-id selection to `searchfn` plugin when present, then apply DFQL filters/sort/pagination deterministically on the candidate set.
26. **I26 — DFQL sort**:
    - Sort is an array of sort terms applied left-to-right.
    - Supported forms include `"field"`, `"field:asc"|"field:desc"`, and/or object-form terms `{ field, direction }` (intent docs mention both).
    - If `sort` is omitted, a deterministic default may be applied (commonly `id:asc`).
    - Deterministic tie-breaking is required (typically `id` as final key for cursor pagination).
27. **I27 — DFQL pagination via `limit`/`offset`**:
    - `limit` bounds number of top-level rows; servers may enforce max limits.
    - `offset` skips the first N rows; intended to be used with `sort` for stability; cursor pagination preferred for frequently-mutated datasets.
28. **I28 — DFQL cursor pagination (`cursor.after` / `cursor.before`)**:
    - Cursor object maps sort keys to “last seen” values; must include tie-breaker (typically `id`) for stability.
    - `cursor.after` resumes strictly after the anchor row; `cursor.before` supports backwards pagination.
    - Query results may include `nextCursor` when more pages exist; otherwise `nextCursor` is `null`.
29. **I29 — DFQL `count`**:
    - When `count:true`, result includes total count of rows matching filters **before** pagination (ignoring `limit/offset`).
30. **I30 — DFQL `omit`**:
    - Removes specified fields from returned output records (including nested expansions), while `id` is always present.
    - If both `select` and `omit` are provided, omit wins.
    - Unknown omitted fields should be rejected (schema-boundedness).
31. **I31 — DFQL aggregates (`groupBy` / `aggregations` / `having`)**:
    - `groupBy` makes a query an aggregate query returning `groups[]`.
    - `aggregations` defines alias→aggregation operations; intent includes ops: `count`, `countDistinct`, `sum`, `avg`, `min`, `max`.
    - `having` filters grouped rows after aggregations are computed; keys may reference group keys or aggregation aliases.
    - Initial constraint: relation expansions in `select` are not supported with `groupBy`.
32. **I32 — DFQL mutation request shape**:
    - Keys include: `resource`, `version`, `mutationId`, `clientId`, optional `timestamp`, optional `context`, `operation`, `id` or ids, `record`/`records`, optional `if`, optional `cascade`, optional `relations`.
    - Supported operations (v0): `insert`, `merge`, `replace`, `delete`, `relate`, `modifyRelation`, `unrelate`.
33. **I33 — DFQL relation mutation payload semantics**:
    - `relations` is keyed by relation name; payloads support shorthands and full objects with `$ref` and metadata fields.
    - Many-many relations can carry join metadata; metadata keys must be validated against relation schema.
    - Additional targeting/where semantics are mentioned as optional/undefined in some docs; base v0 focuses on `$ref` + metadata.
34. **I34 — DFQL record id + record(s) forms**:
    - `id` may be string or array.
    - Some docs mention `records[]` bulk insert; server/client should be schema-bounded and deterministic about batch ordering and response order.
35. **I35 — Optimistic concurrency via `if` guard**:
    - `if` uses the same operator semantics as DFQL filters.
    - Server applies mutation only when guard matches current server record state; otherwise returns a deterministic conflict (`CONFLICT`).
36. **I36 — Cascade semantics (intent-level)**:
    - Delete mutations may optionally cascade on specified relations (either as shorthand list or explicit per-relation modes like delete vs unrelate).
    - Unknown cascade relations should be rejected deterministically (schema-boundedness).
37. **I37 — Mutation response shape (recommended)**:
    - Includes `ok`, `mutationId`, `affectedIds`, optional `errors[]` with machine-readable entries (`code/message/path/retryable`).
38. **I38 — Transact (ordered multi-step) semantics**:
    - Request includes `steps[]` of `{ query }` or `{ mutation }` and optional `transactionId`; `atomic` default true.
    - Response includes `ok` and step results in the same order.
    - When `atomic:true`, mutation effects are all-or-nothing (rollback on failure); `atomic:false` may allow partial commit but must be deterministic.
39. **I39 — Client initialization responsibilities**:
    - Validate schema deterministically at startup.
    - Register tables/relations and create typed table handles.
    - Initialize storage adapter(s) and sync state (per-table cursors + hydration state).
40. **I40 — Client table registry ergonomics**:
    - Provide `client.table(name)` and an ergonomic proxy form `client.<tableName>`.
    - Unknown tables must fail fast with deterministic errors; reserved JS keys must not break runtime access patterns.
41. **I41 — Client local-first query routing**:
    - When offlinability is enabled and a table is `ready`, query executes locally against storage.
    - During `clone`/heavy `pull`, tables may be `hydrating`; queries touching hydrating tables may temporarily use remote fallback.
    - Remote fallback must preserve DFQL semantics deterministically (filters/sort/pagination must still match).
42. **I42 — Client reactive queries (signals) + Svelte adapter**:
    - Signals are cached computations keyed by a normalized DFQL key.
    - Signals refresh on relevant mutation events and notify subscribers deterministically; refresh is de-duped/batched to avoid thrash.
    - `@datafn/svelte` provides `toSvelteStore(signal)` to bind signals to Svelte’s reactive store model.
43. **I43 — Client events + subscription filtering**:
    - Emit `mutation_applied` and `mutation_rejected` (and sync lifecycle events where applicable).
    - Subscription filtering is fine-grained and deterministic: `type`, `resource`, ids, `mutationId`, plus `action`, `fields`, and `contextKeys` (context-keys derived from `event.context` when it’s an object).
44. **I44 — Client offlinability / changelog / sync plumbing**:
    - When offlinability is enabled, maintain a durable local DB (IndexedDB) and an ordered changelog of pending mutations.
    - Maintain per-table cursors/last-sync state to optimize pulls.
    - Push sends local changes; on success, clear/ack changelog entries deterministically.
    - Provide hooks/callbacks for sync lifecycle (start/complete/error) and support conflict resolution strategies (default LWW by server order; others optional via plugins).
45. **I45 — Sync invariants (client/server contract)**:
    - Idempotency: `(clientId, mutationId)` required for retryable mutations and safe replay.
    - Ordering: server assigns a monotonic ordering per account/space/namespace; this is the conflict source-of-truth.
    - Conflict default: last-write-wins (LWW) by server ordering for overlapping writes.
    - Cursors: per-table cursor values stored locally; pull sends `{ [table]: cursor }` and server returns updated cursors.
46. **I46 — Sync apply semantics on client**:
    - `clone` applies a full snapshot, drives hydration state transitions (`notStarted → hydrating → ready`).
    - `pull` applies incremental upserts/deletes and advances cursors monotonically (never backwards).
47. **I47 — Plugin architecture (client + server)**:
    - Hooks: `beforeQuery/afterQuery`, `beforeMutation/afterMutation`, `beforeSync/afterSync`.
    - Ordering: hooks run in registration order.
    - Environment gating: hooks must declare where they run (client/server/both) and runtimes must enforce that.
    - Error handling: correctness/security hooks fail-closed; side-effect hooks fail-open by default (configurable).
    - Mutability: `before*` may transform requests; `after*` may post-process results but must preserve determinism.
48. **I48 — `searchfn` plugin integration intent**:
    - Query: when `query.search` exists, delegate candidate selection to `searchfn`, then apply DFQL filters/sort/pagination deterministically over candidate ids.
    - Mutation: update search indices on successful mutations for affected records.
49. **I49 — Server runtime architecture intent**:
    - “Better-auth-like” plugin-first extensibility, automatic endpoint generation, internal abstractions.
    - Uses `@superfunctions/http` for routing and middleware integration; uses `@superfunctions/db` for DB execution.
50. **I50 — Server authz + validation boundaries**:
    - Validate DFQL against schema (tables/fields/relations).
    - Enforce permissions server-side (table/field/relation) regardless of client behavior.
    - Authorization is evaluated before side effects; denied actions return deterministic `FORBIDDEN` envelopes.
51. **I51 — Server sync engine intent**:
    - `/seed` records seed execution idempotently per namespace.
    - `/clone` returns snapshot per requested table ordered deterministically by `id:asc` and cursors derived from server ordering state.
    - `/pull` returns changes since cursor (upserts + deletes) and monotonic cursors.
    - `/push` applies mutation batches idempotently, returns applied mutationIds + per-mutation errors, and writes change tracking so pull observes effects.
52. **I52 — Server generated APIs + migrations intent**:
    - Auto-generate REST (recommended default) and optionally GraphQL APIs from schema; DFQL is the single source-of-truth for semantics.
    - Generate migration scripts from schema diffs (Postgres at minimum), with a clear workflow (CLI-driven or programmatic).
53. **I53 — Tooling intent (codegen + migrations)**:
    - Deterministic schema validation for tooling.
    - Deterministic type generation from schema (record interfaces + typed client/table handles).
    - Deterministic schema diff and migration plan/script generation.
54. **I54 — Extension environment intent (RPC)**:
    - Background/service worker hosts authoritative runtime (storage + sync + plugins).
    - Content/sidepanel uses a thin RPC transport that forwards DFQL calls and subscriptions.
    - Canonical RPC envelopes: request `{ id, method, payload }`, response `{ id, envelope }`, event `{ type:"event", subscriptionId, event }`.
55. **I55 — Python server SDK parity intent**:
    - Python package `datafn` is server-only and must expose `create_datafn_server(config)` returning routable `/datafn/*` endpoints with the same envelope semantics and key invariants (invalid JSON determinism, idempotency, sync cursors).
56. **I56 — Documentation parity intent**:
    - Package READMEs are part of the contract surface and must match implemented API names, payload shapes (e.g., DFQL `filters` vs `where`), and canonical examples (especially Svelte happy path via signals + `toSvelteStore`).
57. **I57 — Testing + performance/limits intent**:
    - Tests should cover DFQL validation/normalization, query execution, signals invalidation, idempotency, sync cursors, search integration.
    - Servers should enforce hard caps (max limit, max transaction steps, max payload bytes; and recommended caps for relation expansion depth and search candidate sets).
58. **I58 — Compatibility/versioning intent**:
    - Server should expose schema hash + capability metadata via `/datafn/status` so clients can do compatibility checks across versions.
59. **I59 — Security/observability intent**:
    - Respect field-level sensitivity (e.g., fields marked `encrypt:true` should not leak to logs).
    - Support deterministic request metadata (e.g., accept and propagate `context` through hooks/logging).

## Intent → Spec coverage matrix (complete; no sampling)

For each intent item `I##`, this matrix maps where the intent is specified in each bundle (SPEC sections + REQUIREMENTS IDs + referenced test vectors where applicable). If a bundle does not specify an intent item, it is marked **SPEC MISSING** for that bundle. Cross-bundle disagreements are flagged as **SPEC CONFLICT** in the Notes column.

| Intent | Bundle A: 2026-01-18-spec | Bundle B: 2026-01-19-change-spec | Bundle C: 2026-01-23-audit-fix-change-spec | Notes |
| --- | --- | --- | --- | --- |
| I01 | SPEC.md (Overview/Goals/Non-goals) | SPEC.md (Overview/Goals/Non-goals) | SPEC.md (Overview/Goals/Non-goals) | Broad/product intent; not fully normatively “MUST”-ed. |
| I02 | SPEC.md (Overview/Problem) | SPEC.md (Problem statement / context) | SPEC.md (Context) | Same as I01. |
| I03 | SPEC.md (Non-goals) | SPEC.md (Non-goals) | SPEC.md (Goals/Non-goals) | Same as I01. |
| I04 | **API-001** | **SERVER-ENVELOPE-001**, **SERVER-ENVELOPE-001** (envelope semantics), plus bundle-wide envelope rules in SPEC.md | **CORE-ENV-001**, **SERVER-ENV-001**, **SERVER-ENV-002**, **SERVER-ENV-003** | Bundle C is the most explicit; Bundle A includes broader error-code set than Bundle C (see Spec Conflicts). |
| I05 | **DETERMINISM-001**, **NORM-001**, plus PLUG-001 determinism guidance | Determinism across client/server is spread across DFQL requirements + PLUG-*; SPEC.md has determinism invariants | SPEC.md “Deterministic envelopes/ordering”; requirements touch determinism indirectly via **SERVER-PLUG-001**, **CLIENT-SIGNAL-001**, **CLI-*** | Bundle C does not fully re-specify DFQL/query determinism; many DFQL determinism points are SPEC MISSING in C (see I15–I31). |
| I06 | SPEC.md (repo/package structure); no single “must” requirement | Requirements cover many surfaces (CLIENT-*, SERVER-DB-*, PY-SDK-001, CODEGEN/MIG/API-GEN-*) | Requirements cover audit-fix subset (CORE-*, SERVER-*, REST-*, CLIENT-*, EXT-*, CLI-*, PY-SDK-*, DOCS-*) | Bundle C narrows to audit-fix scope; some original surfaces (e.g. transact semantics) become SPEC MISSING. |
| I07 | EVENTS-001 (subscribe/events), SYNC-001..003 (sync), MUT-* (mutate), TX-001 (transact) | **CLIENT-API-001**, **CLIENT-REG-001/002**, **CLIENT-QUERY-001**, **CLIENT-MUT-001**, **CLIENT-SUB-001**, **CLIENT-SIGNAL-001**, **CLIENT-TX-001**, **CLIENT-SYNC-001** | **CLIENT-PLUG-001**, **CLIENT-EVENT-001**, **CLIENT-FILTER-001**, **CLIENT-SIGNAL-001**, plus offline/storage reqs | Bundle A is more server/protocol-focused; Bundle B/C are more explicit on client API ergonomics. |
| I08 | **API-001**, **SEC-001**, **LIMIT-001**, **SYNC-001..003**, **MUT-001..004**, **TX-001**, **COMP-001** | **SERVER-DB-001/002**, SERVER-ENVELOPE-001, SERVER-STATUS-001, SERVER-AUTH-001, SERVER-CONFLICT-001, SERVER-SYNC-* | **SERVER-ENV-001..003**, **SERVER-DB-001**, **SERVER-STATUS-001**, **SERVER-AUTH-001**, **SERVER-SEQ/CHANGES/IDEMP/SEED** | Bundle C is audit-fix oriented; core DFQL validation/execution semantics are only partially re-stated. |
| I09 | QUERY-* (query shape/result), MUT-* (mutation result), TX-001 (transact result), SYNC-* (sync result) | Client/server requirements specify result shapes via test vectors + SPEC.md; SERVER-ENVELOPE-001 shapes wrappers | SPEC.md defines envelope + specific endpoint result shapes; requirements cover envelope + sync payload shapes | Bundle C does not include transact/query semantics requirements (SPEC MISSING for those aspects). |
| I10 | **SCHEMA-001** | Specified in SPEC.md; enforced via CLIENT-API-001 (schema validation on client) and server config requirements | SPEC.md mentions schema; **no explicit core schema validation requirement in Bundle C REQUIREMENTS.md** | **SPEC GAP** in Bundle C: core schema validation is not a normative requirement emphasizes audit-fix scope. |
| I11 | Specified in intent/spec docs; not fully normatively required beyond schema structural validation | Specified in SPEC.md; not all field constraint enforcement is normatively required (many are Undefined) | Specified in SPEC.md (background); no dedicated requirement | Many field-level constraints/encryption are intent-level but not fully specified as enforceable requirements (SPEC PARTIAL). |
| I12 | **SCHEMA-001** (indices normalization) | Specified in SPEC.md; not separately required beyond schema validation | Not a dedicated requirement in Bundle C | Bundle C is largely silent on indices normalization (SPEC PARTIAL/MISSING). |
| I13 | Query/mutation requirements rely on relations being schema-bounded (QUERY-003, MUT-004) | DFQL-* requirements cover relations selection/filtering | Not explicitly required (beyond sync internal tables and REST wrappers) | DFQL relation semantics are SPEC MISSING in Bundle C requirements. |
| I14 | QUERY-003 covers relation tokens; dfql semantics in SPEC.md | DFQL-RELIDS-001, DFQL-NESTEDSELECT-001, DFQL-FILTER-PATH-001, DFQL-HTREE-001 | Not explicitly required | SPEC MISSING in Bundle C requirements for most DFQL relation semantics. |
| I15 | QUERY-001..004 (query request keys/validation) | DFQL requirements + client query requirements | SPEC.md defines query shape; **no normative DFQL query execution requirements in Bundle C** | Bundle C focuses on envelopes/auth/sync/rest; DFQL query semantics become SPEC MISSING at requirement level. |
| I16 | API-001 + QUERY-* | CLIENT-QUERY-001 (client-side), DFQL requirements (server-side) | SPEC.md defines query response envelope; no req | **SPEC GAP** in Bundle C: query semantics not normatively covered. |
| I17 | QUERY-003 | DFQL-RELIDS-001, DFQL-OMIT-001, DFQL-NESTEDSELECT-001 | SPEC.md mentions; no req | SPEC MISSING in Bundle C requirements. |
| I18 | QUERY-003 | DFQL-RELIDS-001 | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I19 | QUERY-003 (join rows + metadata) | DFQL-RELIDS-001 + nested select + omit requirements | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I20 | Mentioned in SPEC.md; not a P0 req in Bundle A | **DFQL-HTREE-001** | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I21 | **QUERY-002** | **DFQL-FILTER-OPS-EXTRA-001**, DFQL-FILTER-PATH-001 | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I22 | Mentioned in dfql SPEC; optional unless required | **DFQL-FILTER-PATH-001** | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I23 | Optional in Bundle A notes; not required by P0 | **DFQL-FILTER-RELQ-001** | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I24 | **QUERY-002** | DFQL filter requirements imply (compound filters appear in SPEC.md) | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I25 | **SEARCH-001** (P1) | **SEARCH-PLUGIN-001** (P2) | Not specified as a requirement | **SPEC GAP**: Bundle C treats search as Undefined (not required); Bundle B makes it required (P2). |
| I26 | QUERY-004 + DETERMINISM-001 | Specified in SPEC.md (DFQL); partially covered by query-related requirements | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I27 | QUERY-004 + LIMIT-001 | Specified in SPEC.md; server/client requirements cover parts | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I28 | QUERY-004 + DETERMINISM-001 | DFQL-PAGE-BEFORE-001 (P2) | Not a requirement | **SPEC CONFLICT** risk: Bundle A expects meaningful `nextCursor` behavior; Bundle C test vectors allow `nextCursor:null` (see Requirement Results). |
| I29 | Mentioned in intent/spec; not in Bundle A P0 requirements (count appears but not separately required) | **DFQL-COUNT-001** | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I30 | Mentioned in intent/spec; not in Bundle A P0 requirements (omit appears but not separately required) | **DFQL-OMIT-001** | Not a requirement | SPEC MISSING in Bundle C requirements. |
| I31 | **GROUP-001** (P1) | **DFQL-GROUPBY-001** (P2) | Not a requirement | SPEC MISSING in Bundle C requirements; also some aggregate ops (e.g. countDistinct) vary across docs. |
| I32 | **MUT-001..004**, **MUT-002**, **MUT-003** | Client mutation surface via **CLIENT-MUT-001**; server mutation semantics are mostly in SPEC.md (not fully in REQUIREMENTS) | Not a requirement | Bundle C largely omits mutation semantics (SPEC MISSING). |
| I33 | **MUT-004** (relations) | Relation mutation semantics are largely SPEC.md (not a dedicated MUST in REQUIREMENTS) | Not a requirement | SPEC MISSING/partial in Bundle B/C REQUIREMENTS for full relation mutation payload surface. |
| I34 | Batch semantics implied by SPEC.md; not a dedicated MUST in REQUIREMENTS | Some batch/order behavior appears in CLIENT-QUERY-001 / CLIENT-MUT-001 (ordering) and SPEC.md | Not a requirement | Mostly specified in SPEC.md/test vectors, not always in requirements. |
| I35 | **MUT-003** | Not a dedicated requirement in Bundle B REQUIREMENTS (guard semantics are in SPEC.md) | Not a requirement | Bundle B/C are SPEC MISSING for explicit `if` guard enforcement as a MUST (Bundle A has it). |
| I36 | Mentioned as Undefined/optional in Bundle A notes | Not specified as a MUST | Not specified as a MUST | SPEC MISSING as a normative requirement across bundles (cascade remains mostly Undefined). |
| I37 | **MUT-001..002** (result shape expectations) | **CLIENT-MUT-001** (client-side result/event), SERVER-DB-002 idempotency persistence | Not a requirement | Bundle C does not normatively specify mutation result shape beyond envelope basics. |
| I38 | **TX-001** | **CLIENT-TX-001** (client delegates) + server transact semantics mostly in SPEC.md | Not a requirement | **SPEC GAP**: Bundle C does not normatively specify transact atomicity/order. |
| I39 | Specified in intent/spec docs; not a Bundle A requirement | **CLIENT-API-001** (schema validation) + STORAGE-ADAPTER-001 (init implications) | Not explicit | Bundle C does not include a client creation/schema validation requirement; intent is only partially covered via other requirements. |
| I40 | Not specified as a MUST in Bundle A | **CLIENT-REG-001**, **CLIENT-REG-002** | Not a requirement | SPEC MISSING in Bundle C requirements (client registry ergonomics were moved out of audit-fix scope). |
| I41 | Mentioned in Bundle A SPEC.md; not a P0 requirement | **CLIENT-OFFLINE-QUERY-001**, **CLIENT-HYDRATION-001** | **CLIENT-OFFLINE-QUERY-001** | Bundle C covers only offline query routing (not broader hydration lifecycle). |
| I42 | Mentioned in Bundle A SPEC.md; not a P0 requirement | **CLIENT-SIGNAL-001**, **DOC-001** | **CLIENT-SIGNAL-001**, **DOCS-SVELTE-001** | Bundle C focuses on audit-fix signals + docs; broader framework adapter goals are descriptive. |
| I43 | **EVENTS-001** | **CLIENT-MUT-001**, **SUB-EXTRA-001** | **CORE-EVENT-001**, **CLIENT-EVENT-001**, **CLIENT-FILTER-001** | Bundle A’s filter dimensions are narrower; Bundle B/C require `action/fields/contextKeys`. |
| I44 | **SYNC-001..003**, MUT-002 idempotency | Storage/offline/sync requirements: STORAGE-ADAPTER-001, STORAGE-*, CLIENT-OFFLINE-*, CLIENT-CHANGELOG-001, CLIENT-SYNC-APPLY-001, CLIENT-HYDRATION-001, SERVER-SYNC-* | STORAGE-*, CLIENT-OFFLINE-*, CLIENT-CHANGELOG-001 | Bundle C omits CLIENT-SYNC-APPLY + hydration requirement IDs (SPEC GAP). |
| I45 | **MUT-002**, **SYNC-001..003** | **SERVER-CONFLICT-001**, **SERVER-SYNC-001..003**, **SERVER-DB-002** | **SERVER-SEQ-001**, **SERVER-CHANGES-001**, **SERVER-IDEMP-001**, **SERVER-SYNC-CLIENTID-001** | Bundle C is narrower (audit-fix) but covers serverSeq/idempotency/internal tables explicitly. |
| I46 | Mentioned in Bundle A SPEC.md; not a P0 requirement | **CLIENT-SYNC-APPLY-001**, **CLIENT-HYDRATION-001** | Not a requirement | **SPEC GAP** in Bundle C (no normative apply/hydration requirement). |
| I47 | **PLUG-001** | **PLUG-CLIENT-001**, **PLUG-SERVER-001** | **CLIENT-PLUG-001**, **SERVER-PLUG-001**, **SERVER-PLUG-002** | Bundle C refines plugin ordering + runsOn enforcement. |
| I48 | **SEARCH-001** (P1) | **SEARCH-PLUGIN-001** (P2) | Not specified as a requirement | SPEC GAP: Bundle C treats search as Undefined. |
| I49 | SPEC.md (server architecture) | SPEC.md (server architecture) | SPEC.md (server architecture) | Broad architectural intent, not fully normatively required. |
| I50 | **SEC-001** + query/mutation validation requirements | **SERVER-AUTH-001** + SERVER-ENVELOPE-001 + DFQL validation reqs | **SERVER-AUTH-001**, **SERVER-ENV-003** | Bundle A also includes broader DFQL “unknown field/relation” codes; Bundle C’s code set is narrower (SPEC CONFLICT). |
| I51 | **SYNC-001..003**, MUT-002 | **SERVER-SYNC-001..003**, **SERVER-DB-002**, **SERVER-CONFLICT-001** | **SERVER-CHANGES-001**, **SERVER-IDEMP-001**, **SERVER-SEED-001**, **SERVER-SEQ-001**, **SERVER-SYNC-CLIENTID-001** | Bundle C covers internal tables and sync ordering; query/mutation details are less specified. |
| I52 | Mentioned in Bundle A SPEC.md | **API-GEN-REST-001**, **API-GEN-GQL-001**, **MIG-001** | **REST-001..004**, **CLI-MIG-001** | Bundle C is SPEC MISSING for GraphQL generation (explicitly optional/undefined). |
| I53 | Mentioned in Bundle A SPEC.md | **CODEGEN-TS-001**, **MIG-001** | **CLI-VALIDATE-001**, **CLI-CODEGEN-001**, **CLI-MIG-001** | Bundle C focuses on deterministic tooling behavior. |
| I54 | Bundle A notes it as Undefined | **EXT-001** | **EXT-001** | Bundle A is SPEC MISSING; bundles B/C specify canonical RPC envelopes. |
| I55 | Mentioned in Bundle A SPEC.md (Python parity) | **PY-SDK-001** | **PY-SDK-001**, **PY-SDK-002** | Bundle C tightens parity expectations for invalid JSON + idempotency. |
| I56 | Not a Bundle A requirement | **DOC-001** | **DOCS-SVELTE-001**, **DOCS-CLIENT-001**, **DOCS-CORE-001**, **DOCS-SERVER-001** | Bundle C is most explicit about docs parity. |
| I57 | **LIMIT-001**, **OBS-001** (guidance) | Some limits are described in SPEC.md; few are MUST requirements | Not specified as requirements (beyond maxLimit in status shape) | SPEC GAP: Bundle C omits broad limits/perf test requirements. |
| I58 | **COMP-001** (P2) | **SERVER-STATUS-001** | **SERVER-STATUS-001** | Capability string naming differs across bundles (Bundle A says Undefined; Bundles B/C fix names). |
| I59 | **SEC-001**, **OBS-001** (P2 guidance) | Security/observability are described in SPEC.md; auth is required via SERVER-AUTH-001 | Auth required via **SERVER-AUTH-001**; other observability largely Undefined | Broad observability (encrypt:true logging redaction) is not consistently normatively required across bundles (SPEC PARTIAL). |

### Intent → Implementation audit (complete; no sampling)

This is an **implementation** status per intent item (independent of spec bundles). Evidence points at primary implementations/tests.

| Intent | Status | Implementation evidence | Notes (delta / limitations) |
| --- | --- | --- | --- |
| I01 | **PARTIAL** | `core/`, `client/`, `server/`, `cli/`, `python/` | End-to-end “local-first + sync” exists, but major contract surfaces are incomplete (search, transact, relation mutations, Python parity). |
| I02 | **PARTIAL** | `client/src/offline/*`, `client/src/signals/*`, `server/src/execution/sync/*` | Core problem is addressed, but local DFQL is a subset and conflict handling is incomplete. |
| I03 | **PASS** | No raw SQL / arbitrary code execution surface | DFQL is constrained and schema-bounded (no “run arbitrary server code” query surface). |
| I04 | **PARTIAL** | `core/src/errors.ts`, `server/src/http/errors.ts`, `client/src/remote/unwrap.ts` | Canonical envelopes exist, but error typing (`details?`) + auth/invalid-JSON ordering weaken determinism. |
| I05 | **FAIL** | `server/src/routes/query.ts` (swallowed errors), `server/src/routes/seed.ts` (`Date.now()`), `client/src/extension/transport.ts` (`Math.random`) | Determinism invariant is violated by swallowed errors and nondeterministic IDs/timestamps in core flows. |
| I06 | **PARTIAL** | Package set exists; Python package present | Python runtime is a stub; some planned surfaces (search integration, relation mutations) are missing. |
| I07 | **PARTIAL** | `client/src/client.ts`, `client/src/query.ts`, `client/src/mutate.ts`, `client/src/sync.ts` | Client runtime exists; offline/local semantics are incomplete and docs drift. |
| I08 | **PARTIAL** | `server/src/server.ts` + `server/src/routes/*` | Endpoints exist; schema-bounded validation is incomplete for mutation/push; transact/mutation semantics incomplete. |
| I09 | **PARTIAL** | `server/src/routes/query.ts`, `server/src/execution/mutation/execute.ts`, `server/src/execution/transact.ts` | Inner result shapes broadly exist; transact + cursor semantics diverge from intent. |
| I10 | **PARTIAL** | `core/src/schema.ts`, `server/src/execution/sync/clone.ts` | `isRemoteOnly` enforced for clone; client/local routing for remote-only is not comprehensively enforced. |
| I11 | **PARTIAL** | `core/src/schema.ts` | Schema structural validation exists; runtime enforcement of constraints (`encrypt`, defaults, min/max, etc.) is mostly missing. |
| I12 | **PASS** | `core/src/schema.ts` | `indices` normalization (array → object) implemented. |
| I13 | **PARTIAL** | `server/src/execution/query/*` | Relation schema is used for query traversal; full relation mutation surface is not supported. |
| I14 | **PARTIAL** | `server/src/execution/query/select.ts`, `server/src/execution/query/filters.ts` | Relation query semantics exist; relation mutations do not. |
| I15 | **PARTIAL** | `server/src/routes/query.ts`, `client/src/query.ts` | Many keys accepted; `search` not executed; some validations incomplete. |
| I16 | **PARTIAL** | `server/src/routes/query.ts` (batch), `server/src/execution/query/execute.ts` | Batch query supported; `nextCursor` always `null`. |
| I17 | **PARTIAL** | `server/src/execution/query/select.ts` | Baseline select + explicit expansion largely implemented; determinism weakened by error swallowing. |
| I18 | **PARTIAL** | `server/src/execution/query/select.ts` | Server supports ids-only + `rel.*`; client local query does not. |
| I19 | **PARTIAL** | `server/src/execution/query/select.ts` (join rows + metadata) | Many-many select semantics exist; relation mutation support missing. |
| I20 | **PARTIAL** | `server/src/execution/query/select.ts` (htree) | Server supports htree; client local query does not. |
| I21 | **PARTIAL** | `server/src/execution/query/filters.ts` | Most operators exist; nested-object dot-path traversal is not implemented as true object traversal. |
| I22 | **PASS** | `server/src/execution/query/filters.ts` | Relation-crossing dot-path defaults to ANY-match. |
| I23 | **PASS** | `server/src/execution/query/filters.ts` | `$any/$all/$none` implemented. |
| I24 | **PASS** | `server/src/execution/query/filters.ts` | `$and/$or` implemented. |
| I25 | **FAIL** | `server/src/routes/query.ts` (`hasSearchPlugin` only) | No searchfn candidate selection or deterministic merge; effectively unsupported. |
| I26 | **PARTIAL** | `server/src/execution/query/sort.ts`, `server/src/routes/query.ts` | Sort exists; cursor sort/tie-breaker validation + error surfacing are inconsistent. |
| I27 | **PASS** | `server/src/execution/query/pagination.ts` | Limit/offset implemented; server maxLimit enforced. |
| I28 | **FAIL** | `server/src/execution/query/execute.ts` (`nextCursor:null`) | Cursor pagination is incomplete and `nextCursor` is never emitted. |
| I29 | **PASS** | `server/src/execution/query/execute.ts` | `count` computed before pagination. |
| I30 | **PASS** | `server/src/execution/query/select.ts` (`applyOmit`) | Omit applied recursively; id preserved. |
| I31 | **PARTIAL** | `server/src/execution/query/aggregate.ts` | GroupBy/aggregations/having exist; ordering/pagination determinism incomplete. |
| I32 | **PARTIAL** | `server/src/execution/mutation/execute.ts`, `client/src/mutate.ts` | Core ops exist; timestamp/context/relations/guards/cascade incomplete/missing. |
| I33 | **FAIL** | `server/src/execution/mutation/execute.ts` | Relation ops rejected as `DFQL_UNSUPPORTED`. |
| I34 | **PARTIAL** | `server/src/execution/mutation/dfql.ts`, `server/src/execution/sync/push.ts` | Single-id mutation forms supported; bulk `records[]` not supported end-to-end. |
| I35 | **FAIL** | `server/src/execution/mutation/execute.ts` | `if` guards are ignored; deterministic `CONFLICT` not produced. |
| I36 | **UNVERIFIED** | No cascade execution path | Cascade is not implemented; intent treats it as optional/undefined in places. |
| I37 | **PARTIAL** | `server/src/execution/mutation/execute.ts`, `client/src/offline/mutate.ts` | Server result shape is close; offline optimistic results may diverge from canonical result contract. |
| I38 | **FAIL** | `server/src/routes/transact.ts`, `server/src/execution/transact.ts` | Does not support query steps; atomic rollback not implemented; request shape differs (`transactionId/atomic`). |
| I39 | **PARTIAL** | `client/src/client.ts`, `client/src/adapters/*` | Init exists; adapter runtime validation (invalid inputs) is incomplete. |
| I40 | **PASS** | `client/src/client.ts` Proxy, `client/src/tables/registry.ts` | `client.table(name)` + `client.<table>` implemented. |
| I41 | **PARTIAL** | `client/src/query.ts`, `client/src/offline/query.ts` | Local-first routing exists; local DFQL feature set is a subset. |
| I42 | **PASS** | `client/src/signals/querySignal.ts`, `svelte/src/toSvelteStore.ts` | Signals cached by `dfqlKey`; Svelte adapter exists. |
| I43 | **PASS** | `client/src/mutate.ts`, `client/src/events/filter.ts` | Event emission + filtering include `action/fields/contextKeys`. |
| I44 | **PARTIAL** | `client/src/offline/mutate.ts`, `client/src/sync/apply.ts` | Changelog + apply exist; broader offline semantics (relations/search/local DFQL completeness) missing. |
| I45 | **PARTIAL** | `server/src/execution/sync/change-tracking.ts`, `server/src/execution/idempotency-db.ts` | Idempotency exists; serverSeq atomicity under concurrency unverified; explicit LWW conflict logic not implemented beyond “arrival order”. |
| I46 | **PASS** | `client/src/sync/apply.ts`, `client/src/adapters/*` | Clone/pull apply + hydration transitions + monotonic cursors exist. |
| I47 | **PASS** | `client/src/plugins/run-hooks.ts`, `server/src/plugins/run-hooks.ts` | Hooks + ordering + runsOn gating + fail-open/closed exist. |
| I48 | **FAIL** | `server/src/routes/query.ts` | Search integration is absent (no candidate selection, no index updates). |
| I49 | **PARTIAL** | `server/src/server.ts` | Minimal architecture exists but not full auto-gen/plugin-first breadth. |
| I50 | **FAIL** | `server/src/server.ts` (auth ordering), `server/src/execution/sync/push.ts` (limited validation) | Authorization ordering and schema-bounded validation are not fully correct (notably invalid JSON + unknown resource on mutation/push). |
| I51 | **PARTIAL** | `server/src/execution/sync/*`, `server/src/routes/sync.ts` | Sync endpoints exist and broadly match newer bundles’ vectors; determinism issues remain (timestamps/adapter assumptions). |
| I52 | **PARTIAL** | `server/src/routes/rest.ts`, `cli/src/migrations/*` | REST wrappers exist; GraphQL generation missing; SQL render is minimal. |
| I53 | **PASS** | `cli/src/codegen.ts`, `cli/src/migrations/diff.ts` | Deterministic validation + deterministic output ordering implemented. |
| I54 | **PARTIAL** | `client/src/extension/rpc.ts`, `client/src/extension/transport.ts` | Canonical RPC types exist; event forwarding drops `subscriptionId`. |
| I55 | **FAIL** | `python/datafn/server.py` | Python parity runtime is a stub (no real handlers). |
| I56 | **FAIL** | `core/README.md`, `client/README.md`, `server/README.md`, `svelte/README.md` | Multiple doc/code mismatches (DFQL `filters` vs `where`, capability strings, non-existent types). |
| I57 | **PARTIAL** | `server/src/routes/query.ts` (limits), existing tests under `client/__tests__`, `python/tests` | Some tests/limits exist; transact step cap + payload cap not enforced; no perf validation executed. |
| I58 | **PASS** | `server/src/routes/status.ts` | Schema hash + capabilities exist for compatibility checks. |
| I59 | **PARTIAL** | `server/src/server.ts` (authorize), `client/src/events/filter.ts` (contextKeys) | Auth hook exists; observability/redaction for `encrypt:true` is not implemented. |

## Requirement coverage summary (PASS/PARTIAL/FAIL/UNVERIFIED counts per spec bundle)

Statuses are based on **static audit** (tests/vectors were not executed; see Audit scope). Counts are per bundle’s `REQUIREMENTS.md`.

| Spec bundle | Total reqs | PASS | PARTIAL | FAIL | UNVERIFIED |
| --- | ---:| ---:| ---:| ---:| ---:|
| **Bundle A** (`2026-01-18-spec`) | 24 | 9 | 8 | 6 | 1 |
| **Bundle B** (`2026-01-19-change-spec`) | 49 | 29 | 14 | 5 | 1 |
| **Bundle C** (`2026-01-23-audit-fix-change-spec`) | 39 | 22 | 7 | 10 | 0 |

Interpretation notes:

- **Bundle C is narrower** (audit-fix scope) and therefore has fewer DFQL/mutation/transact requirements; a “PASS” on Bundle C does **not** imply full parity with the original DFQL/mutation intent (see Spec Gaps and Bundle B results).
- Several **SPEC CONFLICT** cases exist between Bundle A and later bundles (notably error-code sets and pagination expectations). Those are called out explicitly in “Spec conflicts / spec gaps”.

## Requirement-by-requirement results (tables + per-requirement notes)

### Bundle A — `2026-01-18-spec` (`.conduct/2026-01-18-spec/REQUIREMENTS.md`)

#### Spec inventory (Bundle A REQUIREMENTS.md)

| ID | Priority | Statement | Test vectors |
| --- | --- | --- | --- |
| API-001 | P0 | All `@datafn/server` HTTP endpoints MUST return a `DatafnEnvelope` with mutual exclusivity of `result`/`error`, deterministic `error.message`, and `error.code` in the `DatafnErrorCode` set. | TV-API-001, TV-API-002 |
| SCHEMA-001 | P0 | `@datafn/core.validateSchema(schema)` MUST return `ok: true` with a normalized `DatafnSchema` for valid input schemas and MUST return `ok: false` with `SCHEMA_INVALID` for invalid schemas. | TV-SCHEMA-001, TV-SCHEMA-002 |
| QUERY-001 | P0 | The `/datafn/query` endpoint MUST reject DFQL queries that reference unknown resources, fields, or relations with `DFQL_UNKNOWN_RESOURCE`, `DFQL_UNKNOWN_FIELD`, or `DFQL_UNKNOWN_RELATION` respectively. | TV-QUERY-001, TV-QUERY-002 |
| QUERY-002 | P0 | `/datafn/query` MUST implement DFQL filter semantics including operator objects and compound `$and` / `$or` groups. | TV-QUERY-005, TV-QUERY-006 |
| QUERY-003 | P0 | `/datafn/query` MUST implement DFQL `select` token semantics for base fields and the defined relation expansion tokens (`relation`, `relation.*`, `relation.#`, `relation.*#`, `relation.**`). | TV-QUERY-007, TV-QUERY-008 |
| QUERY-004 | P0 | `/datafn/query` MUST support deterministic pagination via `limit`/`offset` and via `cursor.after` when `sort` is specified. | TV-QUERY-009, TV-QUERY-004 |
| DETERMINISM-001 | P0 | Given the same validated schema, the same normalized DFQL query, and the same underlying data snapshot, `/datafn/query` MUST return identical JSON results (excluding fields explicitly marked `volatile: true` in schema) and MUST reject cursor pagination requests whose `sort` omits `id` as the final tie-breaker key. | TV-QUERY-003, TV-QUERY-004 |
| MUT-001 | P0 | The `/datafn/mutation` endpoint MUST support record mutations for `insert`, `merge`, `replace`, and `delete` operations. | TV-MUT-001, TV-MUT-002 |
| MUT-002 | P0 | The server MUST provide idempotency for write operations by deduplicating replays of the same `(clientId, mutationId)` pair. | TV-MUT-003, TV-MUT-004 |
| MUT-003 | P0 | When a mutation includes an `if` guard, the server MUST only apply the mutation if the guard matches the current record state and MUST otherwise fail the mutation with `CONFLICT`. | TV-MUT-005, TV-MUT-006 |
| MUT-004 | P0 | The `/datafn/mutation` endpoint MUST support relation mutations via `relate`, `modifyRelation`, and `unrelate` with relation metadata for many-many relations. | TV-MUT-007, TV-MUT-008 |
| TX-001 | P0 | The `/datafn/transact` endpoint MUST execute steps in order and, when `atomic: true`, MUST apply an all-or-nothing commit across all mutation steps. | TV-TX-001, TV-TX-002 |
| NORM-001 | P0 | `@datafn/core.normalizeDfql` and `@datafn/core.dfqlKey` MUST produce the same key for semantically equivalent DFQL objects regardless of JSON key ordering. | TV-NORM-001, TV-NORM-002 |
| EVENTS-001 | P0 | The client runtime MUST emit `DatafnEvent` notifications for applied and rejected mutations and MUST support `subscribe(handler, filter)` with deterministic filter semantics. | TV-EVENTS-001, TV-EVENTS-002 |
| SYNC-001 | P0 | The `/datafn/clone` endpoint MUST return the requested tables’ records and per-table cursors in a single response. | TV-SYNC-001, TV-SYNC-002 |
| SYNC-002 | P0 | The `/datafn/pull` endpoint MUST accept per-table cursors and MUST return `records`, `deleted`, and updated `cursors` per table. | TV-SYNC-003, TV-SYNC-004 |
| SYNC-003 | P0 | The `/datafn/push` endpoint MUST apply a batch of mutations with `(clientId, mutationId)` idempotency and MUST return `applied` mutationIds and per-mutation errors. | TV-SYNC-005, TV-SYNC-006 |
| SEC-001 | P0 | `@datafn/server` MUST enforce authorization by consulting the configured `authorize(...)` function (or an equivalent built-in authorizer) and MUST reject unauthorized actions with `FORBIDDEN`. | TV-SEC-001, TV-SEC-002 |
| LIMIT-001 | P0 | The server MUST enforce configured limits for `query.limit` and `transact.steps.length`, returning `LIMIT_EXCEEDED` when caps are violated. | TV-LIMIT-001, TV-LIMIT-002 |
| GROUP-001 | P1 | `/datafn/query` SHOULD support `groupBy`, `aggregations`, and `having` with deterministic grouped-row pagination. | TV-GROUP-001, TV-GROUP-002 |
| SEARCH-001 | P1 | When a `searchfn` plugin is installed, `/datafn/query` SHOULD support a `search` block and apply DFQL filters/pagination deterministically over the plugin’s candidate set. | TV-SEARCH-001, TV-SEARCH-002 |
| PLUG-001 | P1 | The runtime SHOULD execute plugin hooks in registration order and SHOULD define fail-closed vs fail-open behavior per hook category. | TV-PLUG-001, TV-PLUG-002 |
| COMP-001 | P2 | The server SHOULD expose its supported DFQL capability/version metadata via `/datafn/status` to enable client compatibility checks. | TV-COMP-001, TV-COMP-002 |
| OBS-001 | P2 | Server logs SHOULD exclude field values marked `encrypt: true` in schema and SHOULD include deterministic request metadata for auditing. | TV-OBS-001, TV-OBS-002 |

#### Implementation results (static audit)

| ID | Priority | Status | Implementation evidence | Notes (delta / limitations) |
| --- | --- | --- | --- | --- |
| API-001 | P0 | **PASS** | `server/src/http/errors.ts` (`okResponse` / `errorResponse`), all `server/src/routes/*` | Envelope wrapper present; deterministic message set is mostly satisfied for explicit validations. |
| SCHEMA-001 | P0 | **PASS** | `core/src/schema.ts` (`validateSchema`) | Returns `DatafnEnvelope`; normalizes `indices` array→object. |
| QUERY-001 | P0 | **PARTIAL** | `server/src/routes/query.ts` (`validateQuery`, `validateFilters`) | Validation exists, but filter-path error paths are sometimes incorrect/flattened; execution errors are swallowed as empty results (see `createQueryHandler` catch). |
| QUERY-002 | P0 | **PARTIAL** | `server/src/execution/query/filters.ts` (`evaluateFilter`) | Operators implemented, but `$`-prefixed operator keys are accepted in validation yet not executed; unknown operators can be swallowed as empty results. |
| QUERY-003 | P0 | **PARTIAL** | `server/src/execution/query/select.ts` (`materializeSelect`) | Many tokens implemented (`rel`, `rel.*`, `rel.#`, `rel.*#`, nested tokens, htree), but overall query error surfacing is non-deterministic (swallowed errors) and some semantics differ across bundles. |
| QUERY-004 | P0 | **FAIL** | `server/src/execution/query/execute.ts` | `nextCursor` is always `null`; cursor pagination does not emit a cursor when more pages exist. |
| DETERMINISM-001 | P0 | **FAIL** | `server/src/routes/query.ts` + `server/src/execution/query/*` | Cursor sort validation can throw, but handler catches and returns empty results; cursor-after validation is incomplete; some invalid DFQL becomes “empty dataset”. |
| MUT-001 | P0 | **PARTIAL** | `server/src/execution/mutation/execute.ts` | `replace` is implemented as update/merge (does not clear unspecified fields); conflict/not-found handling is largely INTERNAL. |
| MUT-002 | P0 | **PASS** | `server/src/execution/idempotency-db.ts`, `server/src/execution/mutation/execute.ts` | `(clientId, mutationId)` dedupe exists and sets `deduped:true` on replay. |
| MUT-003 | P0 | **FAIL** | `server/src/execution/mutation/execute.ts` | `mutation.if` is explicitly TODO/ignored (guard not enforced). |
| MUT-004 | P0 | **FAIL** | `server/src/execution/mutation/execute.ts` | `relate/modifyRelation/unrelate` return `DFQL_UNSUPPORTED` (not implemented). |
| TX-001 | P0 | **FAIL** | `server/src/execution/transact.ts`, `server/src/routes/transact.ts` | No DB transaction / rollback; stops on failure but does not guarantee all-or-nothing; step shape differs from intent (`steps` are treated as mutations only). |
| NORM-001 | P0 | **PASS** | `core/src/normalize.ts` (`normalizeDfql`, `dfqlKey`) | Recursively sorts keys and strips `undefined`; key is stable stringify of normalized DFQL. |
| EVENTS-001 | P0 | **PASS** | `client/src/events/bus.ts`, `client/src/events/filter.ts`, `client/src/mutate.ts` | Emits mutation events and deterministic subscription filtering (at least type/resource/ids; more supported). |
| SYNC-001 | P0 | **PARTIAL** | `server/src/execution/sync/clone.ts`, `server/src/routes/sync.ts` | Clone returns `{ ok:true, data, cursors }` inside envelope and rejects `isRemoteOnly` tables, but Bundle A’s TV-SYNC-002 expects `error.details.path:"tables[0]"` while implementation uses `"tables"`. |
| SYNC-002 | P0 | **PASS** | `server/src/execution/sync/pull.ts`, `server/src/routes/sync.ts` | Pull validates cursors, returns `{ records, deleted, cursors }`, cursors are integer strings. |
| SYNC-003 | P0 | **PASS** | `server/src/execution/sync/push.ts`, `server/src/routes/sync.ts`, `server/src/execution/idempotency-db.ts` | Push validates request clientId consistency, applies mutations idempotently, emits applied + errors. |
| SEC-001 | P0 | **PARTIAL** | `server/src/server.ts` (`withAuth`) | Auth is checked before handlers, but **invalid JSON** may still call `authorize` and can return `FORBIDDEN` instead of deterministic `DFQL_INVALID`. |
| LIMIT-001 | P0 | **PARTIAL** | `server/src/routes/query.ts` (limit check), `server/src/routes/transact.ts` | Query maxLimit enforced; transact maxTransactSteps not enforced. |
| GROUP-001 | P1 | **PARTIAL** | `server/src/execution/query/aggregate.ts`, `server/src/routes/query.ts` | GroupBy/aggregations/having exist, but determinism + validation are incomplete and cursor pagination is always null. |
| SEARCH-001 | P1 | **FAIL** | `server/src/routes/query.ts` (`hasSearchPlugin`) | Only rejects search when plugin missing; no deterministic delegation to searchfn candidate set. |
| PLUG-001 | P1 | **PASS** | `client/src/plugins/run-hooks.ts`, `server/src/plugins/run-hooks.ts` | Hook ordering + runsOn enforcement + fail-open/closed semantics implemented. |
| COMP-001 | P2 | **PASS** | `server/src/routes/status.ts` | `schemaHash` + `capabilities[]` returned; capability naming is consistent with later bundles (Bundle A says naming undefined). |
| OBS-001 | P2 | **UNVERIFIED** | N/A (host-defined logging) | Server uses `console.error` in several places; no evidence of `encrypt:true` redaction logic. |

Key Bundle A gaps:

- **Cursor pagination (`nextCursor`) and determinism error surfacing** are not compliant with QUERY-004/DETERMINISM-001.
- **Mutation semantics**: `if` guards and relation ops are missing; `replace` semantics are incorrect vs intent.
- **Transact atomicity** is not implemented.

### Bundle B — `2026-01-19-change-spec` (`.conduct/2026-01-19-change-spec/REQUIREMENTS.md`)

#### Spec inventory (Bundle B REQUIREMENTS.md)

| ID | Priority | Statement | Test vectors |
| --- | --- | --- | --- |
| CLIENT-API-001 | P0 | `createDatafnClient` MUST validate `config.schema` using `@datafn/core.validateSchema` and MUST throw a `DatafnClientError` with `code: "SCHEMA_INVALID"` when schema validation fails. | TV-CLIENT-001, TV-CLIENT-002 |
| CLIENT-REG-001 | P0 | A `DatafnClient` instance MUST expose a table registry supporting both `client.table(name)` and `client.<tableName>` property access for schema-declared resources. | TV-REG-001, TV-REG-003 |
| CLIENT-REG-002 | P0 | The table registry MUST deterministically reject unknown table names by throwing `DatafnClientError` with `code:"DFQL_UNKNOWN_RESOURCE"` while allowing access to reserved non-table keys without throwing. | TV-REG-003, TV-REG-004 |
| CLIENT-REMOTE-001 | P0 | The client MUST accept successful remote responses in either wrapped `DatafnEnvelope` form or unwrapped form and MUST throw `DatafnClientError` with `code:"TRANSPORT_ERROR"` when the remote response cannot be interpreted. | TV-REMOTE-001, TV-REMOTE-002 |
| CLIENT-QUERY-001 | P0 | `DatafnTable.query` MUST merge `resource` and `version` from the table handle, call `remote.query`, and return a `DatafnQueryResult` (or array) preserving request order. | TV-QUERY-001, TV-QUERY-002 |
| CLIENT-TX-001 | P0 | `client.transact(...)` and `DatafnTable.transact(...)` MUST delegate to `remote.transact(...)`, unwrap wrapped `DatafnEnvelope` responses, and MUST throw `DatafnClientError` with `code:"TRANSPORT_ERROR"` for unexpected response shapes. | TV-TX-001, TV-TX-002 |
| CLIENT-MUT-001 | P0 | `DatafnTable.mutate` MUST merge `resource` and `version`, call `remote.mutation`, return the unwrapped mutation result(s), and MUST emit deterministic `mutation_applied`/`mutation_rejected` events. | TV-MUT-001, TV-MUT-002 |
| CLIENT-SUB-001 | P0 | `DatafnTable.subscribe(handler, filter?)` MUST subscribe to the client’s global event bus and MUST behave as if `resource: table.name` was AND-ed into the filter. | TV-SUB-001, TV-SUB-002 |
| CLIENT-SIGNAL-001 | P0 | `DatafnTable.signal(query)` MUST return a cached `DatafnSignal` keyed by `dfqlKey(fullQuery)` and MUST re-fetch on `mutation_applied` events for the same resource with deterministic de-duplication. | TV-SIGNAL-001, TV-SIGNAL-002 |
| CLIENT-SYNC-001 | P0 | The client MUST expose `client.sync.seed/clone/pull/push` methods that delegate to the remote adapter and return the remote responses unmodified (except for unwrapping `DatafnEnvelope` when present). | TV-SYNC-001, TV-SYNC-002 |
| DOC-001 | P0 | The `@datafn/svelte` README MUST include an end-to-end example using `createDatafnClient`, `client.<table>.signal(query)`, and `toSvelteStore` without requiring hand-rolled signals. | TV-DOC-001, TV-DOC-003 |
| SERVER-DB-001 | P0 | `@datafn/server` MUST accept a `db` value that is a `@superfunctions/db.Adapter` and MUST execute DFQL `query`, `mutation`, and `transact` operations against that adapter (not only an in-memory store). | TV-DB-001, TV-DB-002 |
| SERVER-DB-002 | P0 | When configured with a `@superfunctions/db.Adapter`, the server MUST store idempotency state for `(clientId, mutationId)` in adapter-backed storage so that dedupe survives process restarts. | TV-IDEMP-001, TV-IDEMP-002 |
| SERVER-SEED-001 | P1 | `@datafn/server` MUST expose `POST /datafn/seed` accepting `{ clientId: string }` and returning `DatafnEnvelope<{ ok: true }>` and MUST reject missing/invalid `clientId` with `DFQL_INVALID`. | TV-SEED-001, TV-SEED-002 |
| SERVER-ENVELOPE-001 | P1 | All `@datafn/server` endpoints MUST return top-level `DatafnEnvelope` responses and MUST represent request-level failures using `ok:false` envelopes (not `ok:true` with embedded `result.ok:false`). | TV-SERVER-ENV-001, TV-SERVER-ENV-002 |
| SERVER-STATUS-001 | P1 | `GET /datafn/status` MUST advertise accurate `capabilities[]` for the configured server and MUST return `ok:false` with `INTERNAL` when the configured DB adapter is unhealthy. | TV-STATUS-001, TV-STATUS-002 |
| SERVER-AUTH-001 | P1 | The server MUST call `authorize(ctx, action, payload)` with the parsed request payload for every `/datafn/*` endpoint and MUST return `FORBIDDEN` when authorization denies. | TV-AUTH-001, TV-AUTH-002 |
| SERVER-CONFLICT-001 | P1 | The server MUST assign a monotonic `serverSeq` ordering per namespace for all applied mutations and MUST resolve concurrent writes to the same record using last-write-wins by `serverSeq`. | TV-CONFLICT-001, TV-CONFLICT-002 |
| SERVER-SYNC-001 | P1 | `POST /datafn/clone` MUST accept `{ clientId, tables? }` and MUST return a full snapshot of requested tables and per-table cursors derived from the server’s change tracking state. | TV-SERVER-CLONE-001, TV-SERVER-CLONE-002 |
| SERVER-SYNC-002 | P1 | `POST /datafn/pull` MUST accept `{ clientId, cursors }` and MUST return all changes since per-table cursors using the server’s change tracking log and MUST advance cursors monotonically. | TV-SERVER-PULL-001, TV-SERVER-PULL-002 |
| SERVER-SYNC-003 | P1 | `POST /datafn/push` MUST accept `{ clientId, mutations }`, MUST apply a batch of mutations idempotently, and MUST write change tracking entries so subsequent `pull` calls observe the effects. | TV-SERVER-PUSH-001, TV-SERVER-PUSH-002 |
| PLUG-CLIENT-001 | P1 | The client MUST execute `DatafnPlugin` hooks in registration order and MUST apply deterministic fail-closed vs fail-open behavior as specified in `SPEC.md`. | TV-PLUG-CLIENT-001, TV-PLUG-CLIENT-002 |
| PLUG-SERVER-001 | P1 | The server MUST execute `DatafnPlugin` hooks in registration order around query/mutation/transact/sync and MUST preserve determinism for equivalent inputs. | TV-PLUG-SERVER-001, TV-PLUG-SERVER-002 |
| SUB-EXTRA-001 | P1 | Event emission and subscription filtering MUST support `action`, `fields`, and `contextKeys` filters in addition to `type/resource/ids/mutationId`. | TV-SUB-EXTRA-001, TV-SUB-EXTRA-002 |
| DFQL-OMIT-001 | P1 | The server MUST implement DFQL `omit` to remove specified fields from all returned records (including expanded relation records and join rows) deterministically. | TV-DFQL-OMIT-001, TV-DFQL-OMIT-002 |
| DFQL-RELIDS-001 | P1 | The server MUST implement ids-only relation selection tokens (e.g. `tags`) returning related record id(s) according to relation cardinality. | TV-DFQL-RELIDS-001, TV-DFQL-RELIDS-002 |
| DFQL-NESTEDSELECT-001 | P1 | The server MUST implement nested select traversal tokens (e.g. `tasks.tags.*`) by implicitly expanding intermediate relations and applying descendant selections deterministically. | TV-DFQL-NESTED-001, TV-DFQL-NESTED-002 |
| DFQL-FILTER-PATH-001 | P1 | The server MUST support dot-path filter keys (e.g. `parent.id`) across nested objects and relations with default ANY-match semantics when traversing multi-row relations. | TV-DFQL-FILTERPATH-001, TV-DFQL-FILTERPATH-002 |
| DFQL-FILTER-RELQ-001 | P2 | The server MUST implement relation filter blocks with quantifiers `$any`, `$all`, and `$none` as defined in `dfql.intent.md`. | TV-DFQL-RELQ-001, TV-DFQL-RELQ-002 |
| DFQL-HTREE-001 | P1 | The server MUST implement DFQL `htree` select semantics for `parent.*`, `children.*`, and `children.**` using materialized-path storage as specified in `SPEC.md`. | TV-HTREE-001, TV-HTREE-002 |
| DFQL-COUNT-001 | P1 | When `count: true` is specified, the server MUST include `count` in the query result equal to the total number of rows matching filters before pagination. | TV-DFQL-COUNT-001, TV-DFQL-COUNT-002 |
| DFQL-GROUPBY-001 | P2 | The server MUST implement DFQL `groupBy`, `aggregations`, and `having` for aggregate queries and MUST reject relation expansion tokens when `groupBy` is present. | TV-DFQL-GROUP-001, TV-DFQL-GROUP-002 |
| DFQL-PAGE-BEFORE-001 | P2 | The server MUST support cursor backwards pagination using `cursor.before` when `sort` includes `id` as a tie-breaker. | TV-DFQL-BEFORE-001, TV-DFQL-BEFORE-002 |
| DFQL-FILTER-OPS-EXTRA-001 | P2 | The server MUST implement additional DFQL filter operators defined in `dfql.intent.md` (`in`, `not_in`, `not_like`, `not_ilike`, `before`, `after`, `between`, `not_between`, `is_empty`, `is_not_empty`). | TV-DFQL-OPS-001, TV-DFQL-OPS-002 |
| SEARCH-PLUGIN-001 | P2 | When a `searchfn` plugin is installed, the server MUST support the DFQL `search` block by delegating candidate selection to the plugin and then applying DFQL filters/sort/pagination deterministically to that candidate id set. | TV-SEARCH-001, TV-SEARCH-002 |
| STORAGE-ADAPTER-001 | P2 | The client MUST support a storage adapter interface capable of persisting records, join rows, per-table cursors, hydration states, and an offline change log. | TV-STORAGE-001, TV-STORAGE-002 |
| STORAGE-MEM-001 | P2 | The client MUST provide a memory storage adapter implementation that conforms to `STORAGE-ADAPTER-001` for tests/dev. | TV-STORAGE-001, TV-STORAGE-003 |
| STORAGE-IDB-001 | P2 | The client MUST provide an IndexedDB storage adapter implementation that conforms to `STORAGE-ADAPTER-001` and persists data across reloads. | TV-STORAGE-IDB-001, TV-STORAGE-IDB-002 |
| CLIENT-OFFLINE-QUERY-001 | P2 | When offlinability is enabled, `DatafnTable.query` MUST execute locally against the storage adapter for tables in `ready` state and MUST use remote fallback for tables in `hydrating` state while preserving deterministic DFQL semantics. | TV-OFFLINE-QUERY-001, TV-OFFLINE-QUERY-002 |
| CLIENT-OFFLINE-MUT-001 | P2 | When offlinability is enabled and remote mutation fails, `DatafnTable.mutate` MUST apply an optimistic local write and MUST append the mutation to the offline change log for later push. | TV-OFFLINE-MUT-001, TV-OFFLINE-MUT-002 |
| CLIENT-CHANGELOG-001 | P2 | The client MUST persist an offline change log as an ordered list of DFQL mutations with deterministic de-duplication by `(clientId, mutationId)`. | TV-CHANGELOG-001, TV-CHANGELOG-002 |
| CLIENT-SYNC-APPLY-001 | P2 | The client MUST apply `clone` and `pull` results into local storage deterministically and MUST update per-table cursors accordingly. | TV-CLIENT-SYNC-APPLY-001, TV-CLIENT-SYNC-APPLY-002 |
| CLIENT-HYDRATION-001 | P2 | The client MUST maintain per-table hydration state `{ notStarted \| hydrating \| ready }` and MUST expose this state for observability and deterministic query routing. | TV-HYDRATION-001, TV-HYDRATION-002 |
| EXT-001 | P2 | The client MUST support extension contexts by providing an RPC transport that forwards DFQL queries/mutations/subscriptions to a background-owned runtime using a canonical message envelope. | TV-EXT-001, TV-EXT-002 |
| CODEGEN-TS-001 | P2 | The project MUST provide a deterministic TypeScript code generator that converts a `DatafnSchema` into typed table handles and record types. | TV-CODEGEN-001, TV-CODEGEN-002 |
| PY-SDK-001 | P2 | The repo MUST include a Python server-only SDK package `datafn` that exposes `create_datafn_server` and mounts the canonical `/datafn/*` endpoints with the same wire semantics as `@datafn/server`. | TV-PY-001, TV-PY-002 |
| MIG-001 | P2 | The project MUST provide schema migration tooling that can diff schema versions and generate deterministic migration scripts for supported DBs. | TV-MIG-001, TV-MIG-002 |
| API-GEN-REST-001 | P2 | The server MUST support schema-driven REST wrappers for DFQL query/mutation as described in the original spec (`/datafn/resources/:table`). | TV-REST-001, TV-REST-002 |
| API-GEN-GQL-001 | P2 | The server SHOULD support generating a GraphQL schema and resolvers from the datafn schema, mapping selection sets to DFQL `select`. | N/A |

#### P0 requirements

| ID | Priority | Status | Implementation evidence | Notes (delta / limitations) |
| --- | --- | --- | --- | --- |
| CLIENT-API-001 | P0 | **PASS** | `client/src/client.ts` (`createDatafnClient` + `validateSchema` + `createClientError`) | Schema validation is envelope-based; error thrown via `createClientError`. |
| CLIENT-REG-001 | P0 | **PASS** | `client/src/client.ts` (Proxy), `client/src/tables/registry.ts` | `client.table(name)` + `client.<table>` supported for schema resources. |
| CLIENT-REG-002 | P0 | **PASS** | `client/src/client.ts` (`RESERVED_KEYS`), `client/src/tables/registry.ts` | Unknown tables throw `DFQL_UNKNOWN_RESOURCE`; reserved keys don’t throw. |
| CLIENT-REMOTE-001 | P0 | **PASS** | `client/src/remote/unwrap.ts` (`unwrapRemoteSuccess`) | Accepts wrapped envelopes and unwrapped **query** results; rejects unknown shapes with `TRANSPORT_ERROR`. |
| CLIENT-QUERY-001 | P0 | **PARTIAL** | `client/src/tables/table.ts` (resource/version merge), `client/src/query.ts` | Table query injects `resource/version`, but table-level batch queries are not supported (passing an array is not handled as a batch). |
| CLIENT-TX-001 | P0 | **PASS** | `client/src/transact.ts` | Delegates to `remote.transact` and unwraps envelopes; unknown shapes become transport errors. |
| CLIENT-MUT-001 | P0 | **PASS** | `client/src/mutate.ts` | Injects `resource/version`, calls `remote.mutation`, unwraps, emits applied/rejected events with deterministic `ids[]`. |
| CLIENT-SUB-001 | P0 | **PASS** | `client/src/tables/table.ts` (`subscribe`) | Table subscription injects `resource` and ignores caller-provided resource. |
| CLIENT-SIGNAL-001 | P0 | **PASS** | `client/src/signals/querySignal.ts` + `core/src/normalize.ts` | Cached by `dfqlKey(fullQuery)`; refresh on `mutation_applied` for same resource; de-duped refresh. |
| CLIENT-SYNC-001 | P0 | **PASS** | `client/src/sync.ts`, `client/src/remote/unwrap.ts` | `client.sync.seed/clone/pull/push` delegate to remote methods and unwrap envelopes; missing methods throw `TRANSPORT_ERROR`. |
| DOC-001 | P0 | **FAIL** | `svelte/README.md` | README does not show `createDatafnClient` and uses non-canonical DFQL keys (`where` vs `filters`). |
| SERVER-DB-001 | P0 | **PARTIAL** | `server/src/server.ts` + all route handlers | DB adapter is used; missing DB errors exist for most endpoints, but `/datafn/seed` still succeeds without DB (conflicts with later bundles). |
| SERVER-DB-002 | P0 | **PASS** | `server/src/execution/idempotency-db.ts` (`__datafn_idempotency`) | Durable idempotency state is stored via adapter-backed table. |

#### P1 / P2 requirements

| ID | Priority | Status | Implementation evidence | Notes (delta / limitations) |
| --- | --- | --- | --- | --- |
| SERVER-SEED-001 | P1 | **PASS** | `server/src/routes/seed.ts` | Validates `clientId`; returns `{ ok:true, result:{ ok:true } }`; records seed row when DB exists (best-effort). |
| SERVER-ENVELOPE-001 | P1 | **FAIL** | `server/src/server.ts` (`withAuth`), `server/src/http/json.ts`, route handlers | Handlers return `{ ok:false DFQL_INVALID "Invalid JSON" }`, but `withAuth` can return `FORBIDDEN` on invalid JSON (because it calls `authorize(..., payload:null)` before the handler), violating the requirement’s invalid-JSON rule. |
| SERVER-STATUS-001 | P1 | **PASS** | `server/src/routes/status.ts` | Capabilities use `dfql.*` + `sync.*`; returns `ok:false INTERNAL` when DB unhealthy. |
| SERVER-AUTH-001 | P1 | **PARTIAL** | `server/src/server.ts` (`withAuth`) | Parsed payload is passed on success, but invalid JSON still triggers `authorize` and can return `FORBIDDEN` instead of `DFQL_INVALID`. |
| SERVER-CONFLICT-001 | P1 | **PARTIAL** | `server/src/execution/sync/change-tracking.ts` | `serverSeq` exists, but conflict resolution is not explicitly implemented as “LWW by serverSeq” under concurrency (unverified). |
| SERVER-SYNC-001 | P1 | **PASS** | `server/src/execution/sync/clone.ts`, `server/src/routes/sync.ts` | Clone returns deterministic `id:asc` ordering via adapter orderBy and cursor from latest serverSeq. |
| SERVER-SYNC-002 | P1 | **PASS** | `server/src/execution/sync/pull.ts`, `server/src/routes/sync.ts` | Pull validates cursor strings and returns upserts/deletes + updated cursors. |
| SERVER-SYNC-003 | P1 | **PASS** | `server/src/execution/sync/push.ts` | Push applies mutations, writes change tracking, respects idempotency, and rejects mismatched item clientId. |
| PLUG-CLIENT-001 | P1 | **PASS** | `client/src/plugins/run-hooks.ts` | Deterministic ordering + runsOn enforcement + fail-open/closed semantics implemented. |
| PLUG-SERVER-001 | P1 | **PARTIAL** | `server/src/plugins/run-hooks.ts` + route handlers | Query/mutation/sync hooks exist; transact does not invoke hooks; determinism constraints are not enforced and query execution errors can be swallowed. |
| SUB-EXTRA-001 | P1 | **PASS** | `core/src/types.ts`, `client/src/events/filter.ts`, `client/src/mutate.ts` | `action/fields/contextKeys` supported in event types and filtering; mutation events include `action/fields`. |
| DFQL-OMIT-001 | P1 | **PASS** | `server/src/execution/query/select.ts` (`applyOmit`), `server/src/routes/query.ts` (omit validation) | Omit applied recursively; id preserved. |
| DFQL-RELIDS-001 | P1 | **PASS** | `server/src/execution/query/select.ts` (`getRelationIds`) | Implements ids-only relation tokens with deterministic ordering rules. |
| DFQL-NESTEDSELECT-001 | P1 | **PARTIAL** | `server/src/execution/query/select.ts` (nested token handling) | Nested expansion exists but relies on several assumptions and does not deeply validate intermediate resource types; no tests executed. |
| DFQL-FILTER-PATH-001 | P1 | **PARTIAL** | `server/src/execution/query/filters.ts` | Relation-crossing dot paths have ANY semantics; nested-object dot paths are not supported as true object traversal. |
| DFQL-FILTER-RELQ-001 | P2 | **PASS** | `server/src/execution/query/filters.ts` (`evaluateRelationFilter`) | `$any/$all/$none` semantics implemented including “zero-row” rules. |
| DFQL-HTREE-001 | P1 | **PASS** | `server/src/routes/query.ts` (validation), `server/src/execution/query/select.ts` (parent/children) | Implements `parent.*`, `children.*`, `children.**` based on `parentPath`. |
| DFQL-COUNT-001 | P1 | **PASS** | `server/src/execution/query/execute.ts` | `count` computed before pagination. |
| DFQL-GROUPBY-001 | P2 | **PARTIAL** | `server/src/execution/query/aggregate.ts`, `server/src/routes/query.ts` | GroupBy/aggregations/having exist, but validation is incomplete and output ordering is not explicitly specified/sorted by group keys. |
| DFQL-PAGE-BEFORE-001 | P2 | **FAIL** | `server/src/execution/query/execute.ts`, `server/src/routes/query.ts` | `cursor.before` logic exists, but validation + error surfacing are inconsistent (execution errors can be swallowed as empty results); nextCursor is always null. |
| DFQL-FILTER-OPS-EXTRA-001 | P2 | **PARTIAL** | `server/src/execution/query/filters.ts` (`evaluateOperator`) | Many extra operators implemented, but unknown-operator errors can be swallowed by handler catch. |
| SEARCH-PLUGIN-001 | P2 | **FAIL** | `server/src/routes/query.ts` (`hasSearchPlugin`) | Search is only gated/rejected; no delegation to searchfn candidate ids or deterministic merge of candidate set. |
| STORAGE-ADAPTER-001 | P2 | **PARTIAL** | `client/src/storage.ts` interface | Adapter covers required primitives, but deterministic runtime validation of invalid inputs is not implemented in shipped adapters. |
| STORAGE-MEM-001 | P2 | **FAIL** | `client/src/adapters/memoryStorage.ts` | Does not reject invalid hydration state deterministically (required by negative vectors in later bundles). |
| STORAGE-IDB-001 | P2 | **PARTIAL** | `client/src/adapters/indexedDbStorage.ts` | Persistence + dedupe exist; deterministic rejection of invalid inputs is not implemented. |
| CLIENT-OFFLINE-QUERY-001 | P2 | **PARTIAL** | `client/src/query.ts`, `client/src/offline/query.ts` | Local execution is used for `ready` tables, but supported DFQL feature set is a subset (no relations/groupBy/search). |
| CLIENT-OFFLINE-MUT-001 | P2 | **PASS** | `client/src/mutate.ts`, `client/src/offline/mutate.ts` | Offline fallback triggers only on transport errors; appends to changelog then applies optimistic local writes. |
| CLIENT-CHANGELOG-001 | P2 | **PASS** | `client/src/adapters/memoryStorage.ts`, `client/src/adapters/indexedDbStorage.ts` | Changelog dedupe by `(clientId, mutationId)` implemented. |
| CLIENT-SYNC-APPLY-001 | P2 | **PASS** | `client/src/sync/apply.ts` | Applies clone/pull results to storage and updates cursors monotonically. |
| CLIENT-HYDRATION-001 | P2 | **PASS** | `client/src/storage.ts` types + adapters + `client/src/sync/apply.ts` | Hydration state exists and is advanced on clone apply; default `notStarted` in adapters. |
| EXT-001 | P2 | **PARTIAL** | `client/src/extension/transport.ts` | Canonical request/response envelopes exist; subscription event forwarding drops `subscriptionId` for consumers (only forwards `event`). |
| CODEGEN-TS-001 | P2 | **PASS** | `cli/src/codegen.ts` | Deterministic ordering of resources/fields; invalid schema rejected via `unwrapEnvelope(validateSchema(...))`. |
| PY-SDK-001 | P2 | **PARTIAL** | `python/datafn/server.py` | Exposes route list and a stub mutation handler; does not provide full parity handlers for all endpoints. |
| MIG-001 | P2 | **PASS** | `cli/src/migrations/diff.ts`, `cli/src/migrations/render-postgres.ts` | Deterministic diff ordering; deterministic rejection via schema validation envelope unwrapping. |
| API-GEN-REST-001 | P2 | **PASS** | `server/src/routes/rest.ts` | REST wrappers exist and map to DFQL query/mutation handlers; inject schema version. |
| API-GEN-GQL-001 | P2 | **UNVERIFIED** | N/A | GraphQL generation is not implemented in this repo snapshot. |

### Bundle C — `2026-01-23-audit-fix-change-spec` (`.conduct/2026-01-23-audit-fix-change-spec/REQUIREMENTS.md`)

#### Spec inventory (Bundle C REQUIREMENTS.md)

| ID | Priority | Statement | Test vectors |
| --- | --- | --- | --- |
| CORE-ENV-001 | P0 | `@datafn/core` MUST define `DatafnEnvelope<T>` as the canonical transport wrapper used by `@datafn/server` (HTTP) and extension RPC, with request-level failures represented as top-level `{ ok:false, error }`. | TV-CORE-ENV-001 (positive), TV-SERVER-ENV-001 (negative) |
| CORE-EVENT-001 | P0 | `@datafn/core` MUST extend `DatafnEvent` and `DatafnEventFilter` to support `action`, `fields`, and `contextKeys` filtering as described in `SPEC.md`. | TV-CORE-EVENT-001 (positive), TV-CORE-EVENT-002 (negative) |
| CORE-UTIL-001 | P0 | `@datafn/core` MUST provide an `unwrapEnvelope` (or equivalently named) helper that deterministically throws a `DatafnError` when given `{ ok:false }`. | TV-CORE-UTIL-001 (positive), TV-CORE-UTIL-002 (negative) |
| SERVER-ENV-001 | P0 | Every `@datafn/server` endpoint MUST return a top-level `DatafnEnvelope` response. | TV-SERVER-ENV-OK-001 (positive), TV-SERVER-ENV-001 (negative) |
| SERVER-ENV-002 | P0 | Invalid JSON bodies for any `POST /datafn/*` endpoint MUST return `{ ok:false, error:{ code:\"DFQL_INVALID\", message:\"Invalid JSON\", details:{ path:\"$\" } } }`. | TV-SERVER-ENV-002-POS (positive), TV-SERVER-ENV-001 (negative) |
| SERVER-ENV-003 | P0 | Request-level schema/shape validation failures for `@datafn/server` endpoints MUST return top-level `ok:false` envelopes with deterministic `code/message/details.path`. | TV-SERVER-VALID-001 (positive), TV-SERVER-VALID-002 (negative) |
| SERVER-DB-001 | P0 | `@datafn/server` MUST require a configured `@superfunctions/db.Adapter` (`config.db`) and MUST return `{ ok:false, error:{ code:\"INTERNAL\", message:\"Internal error\", details:{ path:\"$\" } } }` for all non-status endpoints when DB is missing. | TV-DB-INIT-001 (positive), TV-DB-MISSING-001 (negative) |
| SERVER-STATUS-001 | P0 | `GET /datafn/status` MUST return accurate capability strings using the fixed names `dfql.query`, `dfql.mutation`, `dfql.transact`, `sync.seed`, `sync.clone`, `sync.pull`, `sync.push`, and MUST return `ok:false INTERNAL` when the DB adapter is unhealthy. | TV-STATUS-001 (positive), TV-STATUS-002 (negative) |
| SERVER-AUTH-001 | P0 | The server MUST call `authorize(ctx, action, payload)` exactly once per request (with parsed JSON payload for POST endpoints and `null` for `GET /datafn/status`) before any execution side effects, and MUST return `ok:false FORBIDDEN` when authorization denies. | TV-AUTH-001 (positive), TV-AUTH-002 (negative) |
| SERVER-PLUG-001 | P1 | The server MUST execute `DatafnPlugin` hooks in registration order around query/mutation/transact/sync and MUST enforce `plugin.runsOn` so only `\"server\"` plugins run on the server. | TV-PLUG-SERVER-ORDER-001 (positive), TV-PLUG-SERVER-RUNSON-001 (negative) |
| SERVER-PLUG-002 | P1 | The server MUST run `afterQuery` hooks for executed queries regardless of whether the server is DB-backed or not. | TV-PLUG-SERVER-AFTERQUERY-001 (positive), TV-PLUG-SERVER-AFTERQUERY-002 (negative) |
| SERVER-SEQ-001 | P1 | The server MUST assign a monotonic `serverSeq` per namespace for all applied mutations using an atomic increment mechanism. | TV-SERVERSEQ-001 (positive), TV-SERVERSEQ-002 (negative) |
| SERVER-CHANGES-001 | P1 | The server MUST persist sync change tracking in `__datafn_changes` and MUST derive clone/pull cursors from the latest `serverSeq` per table. | TV-SYNC-CLONE-001 (positive), TV-SYNC-CLONE-002 (negative) |
| SERVER-IDEMP-001 | P1 | The server MUST persist idempotency state for `(namespace, clientId, mutationId)` in `__datafn_idempotency` so dedupe survives restarts. | TV-IDEMP-001 (positive), TV-IDEMP-002 (negative) |
| SERVER-SEED-001 | P1 | `POST /datafn/seed` MUST validate `clientId` and MUST record seed execution in `__datafn_seed` per namespace for idempotency. | TV-SEED-001 (positive), TV-SEED-002 (negative) |
| SERVER-SYNC-CLIENTID-001 | P1 | `POST /datafn/push` MUST reject when `request.clientId` does not match a mutation’s `clientId` (when present) with deterministic `DFQL_INVALID`. | TV-PUSH-CLIENTID-001 (positive), TV-PUSH-CLIENTID-002 (negative) |
| REST-001 | P1 | REST wrappers MUST inject the correct `version` for the target resource from schema (not hard-coded). | TV-REST-VERSION-001 (positive), TV-REST-VERSION-002 (negative) |
| REST-002 | P1 | REST mutation wrappers MUST require deterministic `clientId` and `mutationId` inputs and MUST NOT generate `mutationId` from clocks (`Date.now`) or randomness. | TV-REST-META-001 (positive), TV-REST-META-002 (negative) |
| REST-003 | P1 | `GET /datafn/resources/:table` MUST parse `q` as URL-encoded JSON and MUST reject invalid `q` with `DFQL_INVALID` and deterministic `details.path:\"q\"`. | TV-REST-QUERY-001 (positive), TV-REST-QUERY-002 (negative) |
| REST-004 | P1 | `POST /datafn/resources/:table` MUST default the mutation operation to `merge` when the client does not specify an operation. | TV-REST-POST-DEFAULT-001 (positive), TV-REST-POST-DEFAULT-002 (negative) |
| CLIENT-PLUG-001 | P0 | `@datafn/client` MUST accept `plugins?: DatafnPlugin[]` and MUST execute hooks in registration order while enforcing `plugin.runsOn` so only `\"client\"` plugins run on the client. | TV-PLUG-CLIENT-001 (positive), TV-PLUG-CLIENT-002 (negative) |
| CLIENT-EVENT-001 | P0 | Client mutation events MUST include deterministic `action` and `fields` metadata when mutation inputs make them knowable, and MUST emit `mutation_rejected` on remote errors (including thrown transport errors). | TV-CLIENT-EVENT-001 (positive), TV-CLIENT-EVENT-002 (negative) |
| CLIENT-FILTER-001 | P0 | `@datafn/client` event filtering MUST support `action`, `fields`, and `contextKeys` in addition to `type/resource/ids/mutationId`. | TV-CLIENT-FILTER-001 (positive), TV-CLIENT-FILTER-002 (negative) |
| CLIENT-SIGNAL-001 | P0 | `DatafnTable.signal` MUST cache signals by `@datafn/core.dfqlKey(fullQuery)` (not a duplicated implementation) and MUST preserve object identity for semantically equivalent queries. | TV-CLIENT-SIGNAL-001 (positive), TV-CLIENT-SIGNAL-002 (negative) |
| STORAGE-MEM-001 | P1 | The repo MUST ship a deterministic in-memory `DatafnStorageAdapter` implementation suitable for tests/dev. | TV-STORAGE-MEM-001 (positive), TV-STORAGE-MEM-002 (negative) |
| STORAGE-IDB-001 | P1 | The repo MUST ship an IndexedDB-backed `DatafnStorageAdapter` implementation that persists data across reloads and passes the storage contract vectors. | TV-STORAGE-IDB-001 (positive), TV-STORAGE-IDB-002 (negative) |
| CLIENT-OFFLINE-QUERY-001 | P1 | When storage is configured and a table is `ready`, `DatafnTable.query` MUST execute locally without calling the remote adapter while preserving DFQL semantics deterministically. | TV-OFFLINE-QUERY-001 (positive), TV-OFFLINE-QUERY-002 (negative) |
| CLIENT-OFFLINE-MUT-001 | P1 | When storage is configured and remote mutation fails due to transport unavailability, the client MUST append the mutation to the offline changelog and MUST apply a deterministic optimistic local write. | TV-OFFLINE-MUT-001 (positive), TV-OFFLINE-MUT-002 (negative) |
| CLIENT-CHANGELOG-001 | P1 | The offline changelog MUST be an ordered list with deterministic dedupe by `(clientId, mutationId)` implemented by shipped storage adapters. | TV-CHANGELOG-001 (positive), TV-CHANGELOG-002 (negative) |
| EXT-001 | P1 | The repo MUST provide an extension RPC transport that forwards DFQL calls and supports deterministic subscription event forwarding using the canonical RPC envelopes defined in `SPEC.md`. | TV-EXT-001 (positive), TV-EXT-002 (negative) |
| CLI-VALIDATE-001 | P1 | `@datafn/cli` MUST treat `@datafn/core.validateSchema` as an envelope-returning function and MUST reject invalid schema inputs deterministically using `SCHEMA_INVALID` errors. | TV-CLI-VALIDATE-001 (positive), TV-CLI-VALIDATE-002 (negative) |
| CLI-CODEGEN-001 | P1 | TypeScript codegen MUST produce deterministic output for a schema and MUST deterministically reject invalid schema input. | TV-CODEGEN-001 (positive), TV-CODEGEN-002 (negative) |
| CLI-MIG-001 | P1 | Migration diff/render MUST be deterministic for a schema pair and MUST deterministically reject invalid schema inputs. | TV-MIG-001 (positive), TV-MIG-002 (negative) |
| PY-SDK-001 | P2 | The Python package `datafn` MUST expose `create_datafn_server(config)` returning a server object that includes routable `/datafn/*` endpoints with parity envelope semantics. | TV-PY-001 (positive), TV-PY-002 (negative) |
| PY-SDK-002 | P2 | Python server endpoints MUST match the TypeScript server’s request/response wire semantics (envelopes, error codes/messages, and sync/idempotency invariants) to the extent defined in `SPEC.md`. | TV-PY-PARITY-001 (positive), TV-PY-PARITY-002 (negative) |
| DOCS-SVELTE-001 | P0 | `@datafn/svelte` README MUST include an end-to-end example using `createDatafnClient`, `client.<table>.signal(query)`, and `toSvelteStore`. | TV-DOCS-SVELTE-001 (positive), TV-DOCS-SVELTE-002 (negative) |
| DOCS-CLIENT-001 | P1 | `@datafn/client` README MUST match the implemented public API (`remote` adapter, not `executor`) and MUST document table registry, query/mutate/transact/sync, plugins, and events. | TV-DOCS-CLIENT-001 (positive), TV-DOCS-CLIENT-002 (negative) |
| DOCS-CORE-001 | P1 | `@datafn/core` README MUST correctly describe `validateSchema` as envelope-returning and MUST document `unwrapEnvelope`, `dfqlKey`, and event/filter types. | TV-DOCS-CORE-001 (positive), TV-DOCS-CORE-002 (negative) |
| DOCS-SERVER-001 | P1 | `@datafn/server` README MUST match implemented server configuration (`db: @superfunctions/db.Adapter`, envelope semantics, capabilities naming, REST enabling). | TV-DOCS-SERVER-001 (positive), TV-DOCS-SERVER-002 (negative) |

| ID | Priority | Status | Implementation evidence | Notes (delta / limitations) |
| --- | --- | --- | --- | --- |
| CORE-ENV-001 | P0 | **PASS** | `core/src/errors.ts` (`DatafnEnvelope`), `core/src/index.ts` exports | Canonical envelope exists and is used across TS packages. |
| CORE-EVENT-001 | P0 | **PASS** | `core/src/types.ts` (`DatafnEventFilter` includes `action/fields/contextKeys`) | Extended event/filter surface exists. |
| CORE-UTIL-001 | P0 | **PASS** | `core/src/envelope.ts` (`unwrapEnvelope`) | Throws `{ ok:false }.error` exactly. |
| SERVER-ENV-001 | P0 | **PASS** | `server/src/http/errors.ts`, `server/src/routes/*` | Endpoints return top-level envelopes (including REST wrappers). |
| SERVER-ENV-002 | P0 | **FAIL** | `server/src/server.ts` (`withAuth`), `server/src/http/json.ts`, route handlers’ invalid-json catch blocks | Handlers return `DFQL_INVALID "Invalid JSON"`, but `withAuth` can return `FORBIDDEN` for invalid JSON (authorize runs first with `payload:null`), violating the “invalid JSON always yields DFQL_INVALID” requirement. |
| SERVER-ENV-003 | P0 | **PARTIAL** | `server/src/routes/query.ts` (validation), `server/src/routes/mutation.ts` (no schema validation) | Query validates unknown resources; mutation/transact do not fully validate DFQL shapes/resources and may return result-level INTERNAL instead of request-level deterministic DFQL errors. |
| SERVER-DB-001 | P0 | **FAIL** | `server/src/routes/seed.ts` | Seed succeeds without DB; Bundle C requires DB for all non-status endpoints. |
| SERVER-STATUS-001 | P0 | **PASS** | `server/src/routes/status.ts` | Capabilities + unhealthy-DB behavior match Bundle C. |
| SERVER-AUTH-001 | P0 | **FAIL** | `server/src/server.ts` (`withAuth`) | `authorize` may be called even when JSON parsing fails, allowing `FORBIDDEN` to override required `DFQL_INVALID "Invalid JSON"`. |
| SERVER-PLUG-001 | P1 | **PASS** | `server/src/plugins/run-hooks.ts` | Enforces `runsOn` and registration-order execution; before* fail-closed. |
| SERVER-PLUG-002 | P1 | **PASS** | `server/src/routes/query.ts` (`runAfterQuery` on DB-backed path) | `afterQuery` runs on DB-backed query execution; fail-open. |
| SERVER-SEQ-001 | P1 | **PARTIAL** | `server/src/execution/sync/change-tracking.ts` (`getNextServerSeq`) | CAS-style retry loop exists, but atomicity depends on adapter semantics (unverified). |
| SERVER-CHANGES-001 | P1 | **PASS** | `server/src/execution/sync/change-tracking.ts`, `server/src/execution/sync/clone.ts`, `pull.ts` | Changes table and cursor derivation from latest serverSeq implemented. |
| SERVER-IDEMP-001 | P1 | **PASS** | `server/src/execution/idempotency-db.ts` | Uses canonical `__datafn_idempotency` and parses/stores JSON results. |
| SERVER-SEED-001 | P1 | **PARTIAL** | `server/src/routes/seed.ts` | Records seed in `__datafn_seed` when DB exists, but DB is optional and persistence is best-effort. |
| SERVER-SYNC-CLIENTID-001 | P1 | **PASS** | `server/src/execution/sync/push.ts` | Rejects mismatched mutation clientId vs request clientId deterministically. |
| REST-001 | P1 | **PASS** | `server/src/routes/rest.ts` (`getResourceVersion`) | Injects schema version. |
| REST-002 | P1 | **PASS** | `server/src/routes/rest.ts` | Requires deterministic `clientId` + `mutationId`; does not generate ids. |
| REST-003 | P1 | **PASS** | `server/src/routes/rest.ts` | Parses `q` and rejects invalid JSON with deterministic `path:"q"`. |
| REST-004 | P1 | **PASS** | `server/src/routes/rest.ts` | Defaults REST POST operation to `merge`. |
| CLIENT-PLUG-001 | P0 | **PASS** | `client/src/plugins/run-hooks.ts`, `client/src/client.ts` | Client accepts plugins and executes hooks in registration order with runsOn enforcement. |
| CLIENT-EVENT-001 | P0 | **PASS** | `client/src/mutate.ts` | Emits `mutation_rejected` on thrown remote errors; includes `action` + deterministic `fields`. |
| CLIENT-FILTER-001 | P0 | **PASS** | `client/src/events/filter.ts` | Supports `action`, `fields` intersection, and `contextKeys` “all keys present” semantics. |
| CLIENT-SIGNAL-001 | P0 | **PASS** | `client/src/signals/querySignal.ts`, `core/src/normalize.ts` | Signal cache key uses canonical `dfqlKey`. |
| STORAGE-MEM-001 | P1 | **FAIL** | `client/src/adapters/memoryStorage.ts` | Does not reject invalid hydration state deterministically (Bundle C vectors require this). |
| STORAGE-IDB-001 | P1 | **PARTIAL** | `client/src/adapters/indexedDbStorage.ts` | Persistence + dedupe exist; deterministic rejection of invalid inputs is not implemented. |
| CLIENT-OFFLINE-QUERY-001 | P1 | **FAIL** | `client/src/offline/query.ts` | Local DFQL is a subset; Bundle C requires broader DFQL semantics locally for ready tables. |
| CLIENT-OFFLINE-MUT-001 | P1 | **PARTIAL** | `client/src/mutate.ts`, `client/src/offline/mutate.ts` | Fallback is correctly classified as transport-only; optimistic apply is limited to a subset of mutation ops (no relations). |
| CLIENT-CHANGELOG-001 | P1 | **PASS** | `client/src/adapters/memoryStorage.ts`, `client/src/adapters/indexedDbStorage.ts` | Dedupe by `(clientId, mutationId)` and ack exist. |
| EXT-001 | P1 | **PARTIAL** | `client/src/extension/rpc.ts`, `client/src/extension/transport.ts` | Request/response envelopes are canonical; subscription events are not delivered with `subscriptionId` to consumers. |
| CLI-VALIDATE-001 | P1 | **PASS** | `cli/src/codegen.ts`, `cli/src/migrations/diff.ts` | Tooling uses `unwrapEnvelope(validateSchema(...))` deterministically. |
| CLI-CODEGEN-001 | P1 | **PASS** | `cli/src/codegen.ts` | Deterministic output ordering + deterministic schema rejection via `unwrapEnvelope`. |
| CLI-MIG-001 | P1 | **PASS** | `cli/src/migrations/diff.ts`, `cli/src/migrations/render-postgres.ts` | Deterministic diff ordering + deterministic schema rejection via `unwrapEnvelope`. |
| PY-SDK-001 | P2 | **FAIL** | `python/datafn/server.py` | Does not expose real routable endpoint handlers for query/transact/sync; only route list + stub mutation handler. |
| PY-SDK-002 | P2 | **FAIL** | `python/datafn/envelope.py`, `python/datafn/server.py` | Error/envelope semantics and idempotency invariants do not match TS server contract. |
| DOCS-SVELTE-001 | P0 | **PARTIAL** | `svelte/README.md` | Demonstrates `table.signal` + `toSvelteStore` but not `createDatafnClient`; uses non-canonical DFQL keys (`where`). |
| DOCS-CLIENT-001 | P1 | **FAIL** | `client/README.md` | Example uses `remote` (good) but uses non-DFQL keys (`where`) and mutation op `update`; event filter docs are incomplete. |
| DOCS-CORE-001 | P1 | **FAIL** | `core/README.md` | References a `DatafnError` class that does not exist in implementation; license text also mismatches package metadata. |
| DOCS-SERVER-001 | P1 | **FAIL** | `server/README.md` | Capability strings and some example payloads diverge from spec/code (e.g., capabilities list). |

## Spec conflicts / spec gaps (explicit)

### Spec conflicts (cross-bundle disagreements)

- **SC-01 — Error path conventions (`details.path`) differ**:
  - Bundle A TV-SYNC-002 expects `details.path:"tables[0]"` for remote-only clone rejection.
  - Bundles B/C expect `details.path:"tables"` for the same case (TV-SERVER-CLONE-002 / TV-SYNC-CLONE-002).
  - **Impact**: implementation cannot simultaneously “PASS” all bundles without either branching by bundle or adopting one convention.

- **SC-02 — Pagination semantics (`nextCursor`)**:
  - Bundle A’s P0 `QUERY-004` + determinism language expects cursor pagination to be meaningful (emit a `nextCursor` when more results exist).
  - Bundles B/C test vectors largely accept `nextCursor:null` for server queries.
  - **Impact**: current server always returns `nextCursor:null`, which passes newer vectors but fails Bundle A `QUERY-004`/determinism intent.

- **SC-03 — Event filter surface is expanded over time**:
  - Bundle A events focus on `type/resource/ids/mutationId`.
  - Bundles B/C require `action/fields/contextKeys` filtering semantics.
  - **Impact**: implementation supports the expanded surface; Bundle A is not contradicted but is materially underspecified.

- **SC-04 — Error code sets and “required vs optional” details differ**:
  - `@datafn/core` defines `DatafnError.details?: unknown`, but helper `err()` always supplies `{ path:"$" }`.
  - Bundle C effectively treats `details.path` as mandatory in negative vectors/requirements; Bundle A is looser.
  - **Impact**: Type-level contract (TS + Python) does not fully encode Bundle C’s strictness.

- **SC-05 — Search integration scope differs**:
  - Bundle A and Bundle B require search integration (`SEARCH-001` / `SEARCH-PLUGIN-001`).
  - Bundle C treats search as Undefined (audit-fix scope).
  - **Impact**: a “PASS” on Bundle C does not imply feature completeness for search intent.

### Spec gaps (intent items not specified / not normatively required)

- **SG-01 — Bundle C narrows to audit-fix scope**:
  - Many DFQL semantics are **SPEC MISSING** in Bundle C `REQUIREMENTS.md` (query semantics, mutation semantics, transact semantics, search).
  - **Impact**: implementation may “PASS” Bundle C while still failing large parts of the original intent (see Intent → Implementation audit).

- **SG-02 — Bundle A under-specifies client surfaces**:
  - Client ergonomics (registry/signal/storage/offline details), extension RPC, and docs parity are largely not normatively required in Bundle A.
  - **Impact**: Bundle A compliance does not guarantee client SDK usability/parity.

- **SG-03 — Bundle B describes some features primarily in `SPEC.md` rather than `REQUIREMENTS.md`**:
  - Several semantics (guards, relation mutation payloads, deeper determinism constraints) are described but not always normatively required.
  - **Impact**: requirement-only compliance can miss important intent-level contracts; this audit therefore includes intent-level status.

## Cross-cutting audits (security/determinism/limits/errors/compat)

### Security / authz / validation boundaries

- **Authorization ordering vs invalid JSON (high risk)**:
  - `server/src/server.ts` calls `authorize(ctx, action, payload)` even when JSON parsing fails (payload becomes `null`), which can return `FORBIDDEN` instead of the required deterministic `DFQL_INVALID "Invalid JSON"` (Bundles B/C).
  - **Impact**: clients cannot rely on invalid JSON determinism; policies may accidentally treat parse failures as auth failures.

- **Schema-bounded validation is uneven across endpoints**:
  - Query validates resource/fields/relations in `server/src/routes/query.ts`.
  - Mutation and push paths (`server/src/routes/mutation.ts`, `server/src/execution/sync/push.ts`) do not consistently return deterministic `DFQL_UNKNOWN_RESOURCE`/`DFQL_UNKNOWN_FIELD` at request-level; adapter errors can surface as `INTERNAL`.
  - **Impact**: schema boundary is not consistently enforced server-side (intent I03/I50).

- **Field-level permissions / `encrypt:true` handling is not enforced**:
  - Schema contains permission/encryption concepts in intent/spec docs, but runtime enforcement (selection filtering, log redaction) is not implemented.
  - **Impact**: sensitive fields may be exposed to logs or over-the-wire unless hosts implement additional controls.

### Determinism invariants

- **Query execution errors are swallowed**:
  - In `server/src/routes/query.ts`, certain execution exceptions produce `{ data:[], nextCursor:null }` rather than deterministic `ok:false` envelopes.
  - **Impact**: invalid DFQL and runtime issues become indistinguishable from “empty dataset”; breaks determinism and debuggability.

- **Nondeterministic time/ID sources exist in core flows**:
  - `Date.now()` / `new Date().toISOString()` in `server/src/routes/seed.ts` and change tracking (`server/src/execution/sync/change-tracking.ts`).
  - `Math.random()` for RPC IDs in `client/src/extension/transport.ts`.
  - **Impact**: internal state (and sometimes observable behavior) can differ across runs.

### Limits / caps

- **Server maxLimit is enforced; transact/maxPayloadBytes are not**:
  - `maxLimit` is enforced in `server/src/routes/query.ts`.
  - `maxTransactSteps` exists in config but is not enforced for `/datafn/transact`.
  - `maxPayloadBytes` exists in config but is not enforced.
  - **Impact**: requests can exceed intended hard caps (intent I57, Bundle A `LIMIT-001`).

- **Full-table scans are common**:
  - Client local query (`client/src/offline/query.ts`) pulls all records then filters/sorts in memory.
  - Server DB store preloading (`server/src/execution/db-store.ts`) can load entire resources.
  - **Impact**: performance risks on large datasets; limits should be paired with query planning and adapter-level filtering.

### Error handling + canonical envelopes

- **Strengths**:
  - Canonical `DatafnEnvelope` exists (`core/src/errors.ts`) and server helpers (`server/src/http/errors.ts`) consistently produce envelopes.
  - `err()` defaults `details` to `{ path:"$" }` when omitted.

- **Weaknesses**:
  - Type-level contract still allows `details` to be absent (`details?: unknown`), conflicting with strict Bundle C expectations.
  - Some endpoints rely on ad-hoc “inner ok” result objects (sync/transact); while accepted by newer bundles’ vectors, it diverges from the cleanest “single ok flag” intent and increases confusion risk.

### Compatibility / versioning / migrations

- **Compatibility metadata exists**:
  - `/datafn/status` returns deterministic `schemaHash` and a fixed capability set (`server/src/routes/status.ts`).

- **Migrations/codegen are present but incomplete**:
  - CLI schema validation + deterministic codegen/diff exist.
  - Postgres SQL render is minimal and not sufficient for a full migration workflow.

- **Cross-language parity is missing**:
  - Python server package is not parity with TS server semantics (intent I55).

## Recommendations (ranked)

Fix order is ranked by **risk + blast radius**, referencing both intent items and requirement IDs.

1. **Fix auth vs invalid JSON ordering (server)**  
   - **Why**: breaks deterministic invalid JSON handling and can return the wrong top-level error code.  
   - **Refs**: intent **I04**, **I50**; Bundle B **SERVER-ENVELOPE-001**, **SERVER-AUTH-001**; Bundle C **SERVER-ENV-002**, **SERVER-AUTH-001**.

2. **Stop swallowing query execution errors; return deterministic envelopes**  
   - **Why**: “invalid DFQL becomes empty results” is a high-risk correctness and debugging failure.  
   - **Refs**: intent **I05**, **I15–I31**; Bundle A **QUERY-001/002/004**, **DETERMINISM-001**; Bundle B **DFQL-PAGE-BEFORE-001**, **DFQL-FILTER-OPS-EXTRA-001**.

3. **Implement missing DFQL mutation semantics (guards, relations, correct replace)**  
   - **Why**: server write semantics are a core contract; missing guards/relations break offline sync and correctness.  
   - **Refs**: intent **I32–I35**; Bundle A **MUT-001..004**.

4. **Implement transact per intent/spec (query+mutation steps, atomicity, limits)**  
   - **Why**: atomic multi-step workflows are central to correctness; current implementation cannot satisfy TX vectors.  
   - **Refs**: intent **I38**, **I57**; Bundle A **TX-001**, **LIMIT-001**; Bundle B **CLIENT-TX-001** (client-side contract).

5. **Harden schema-bounded validation across all server endpoints**  
   - **Why**: prevents adapter-level INTERNAL errors for user mistakes; enforces non-goals and security boundaries.  
   - **Refs**: intent **I03**, **I50**; Bundle C **SERVER-ENV-003**.

6. **Bring storage adapters up to deterministic validation requirements; expand local DFQL**  
   - **Why**: offline/local-first semantics depend on safe, deterministic adapters; local query is currently too limited.  
   - **Refs**: intent **I41**, **I44**, **I57**; Bundle B/C **STORAGE-***, **CLIENT-OFFLINE-QUERY-001**, **CLIENT-CHANGELOG-001**.

7. **Fix extension RPC subscription event delivery (`subscriptionId`) and ID determinism**  
   - **Why**: breaks multi-subscription correctness and determinism in extension environments.  
   - **Refs**: intent **I54**; Bundle B/C **EXT-001**.

8. **Update READMEs to match canonical DFQL and API naming**  
   - **Why**: docs are part of contract surface; current docs actively mislead usage.  
   - **Refs**: intent **I56**; Bundle C **DOCS-***; Bundle B **DOC-001**.

9. **Implement Python server parity or explicitly de-scope it**  
   - **Why**: current Python package does not meet parity intent/spec, undermining multi-language deployment goals.  
   - **Refs**: intent **I55**; Bundle B **PY-SDK-001**; Bundle C **PY-SDK-001/002**.

10. **Implement searchfn integration (or explicitly mark as unsupported everywhere)**  
   - **Why**: required by Bundle A/B; currently only gated.  
   - **Refs**: intent **I25**, **I48**; Bundle A **SEARCH-001**; Bundle B **SEARCH-PLUGIN-001**.

## Appendix: commands run + environment details

### Commands executed

- `curl -fsSL https://www.fetch.at/audit.txt`
- `git -C "/Users/ar/dev/superfunctions" rev-parse --show-toplevel`
- `git -C "/Users/ar/dev/superfunctions" rev-parse --abbrev-ref HEAD`
- `git -C "/Users/ar/dev/superfunctions" rev-parse HEAD`
- `git -C "/Users/ar/dev/superfunctions" status --porcelain=v1 -b`
- `date -u "+%Y-%m-%dT%H:%M:%SZ"`
- `mkdir -p "/Users/ar/dev/superfunctions/datafn/.conduct/audits"`

### Environment

- **workspace**: `/Users/ar/dev`
- **project root**: `/Users/ar/dev/superfunctions/datafn`
- **OS**: darwin 25.0.0
- **shell**: zsh
- **git**: repo `/Users/ar/dev/superfunctions` (detached `HEAD`), commit `ec7e3e4d5938dca77997723a0378ea58ed0ed485`, dirty state present
- **node/python versions**: not inspected (read-only audit; no runtime commands were executed beyond the list above)

### `audit.txt` instructions (verbatim)

```text
You are an audit agent. Your job is to perform a THOROUGH, READ-ONLY audit of an implemented codebase against:
1) the ORIGINAL user intent/notes (authoritative source intent), AND
2) ALL spec bundles provided (SPEC/REQUIREMENTS/TEST_VECTORS/PLAN/phases/INTENT_AUDIT),
and write a comprehensive audit report to the project’s `.conduct/audits/` folder.

Authoritative inputs (VERY IMPORTANT):
- The user’s intent/notes/docs are authoritative for “what was intended”.
- The provided spec bundles are authoritative for “what was specified”.
- You MUST read ALL provided intent/notes/docs and ALL provided spec bundles thoroughly.
- Ignore any existing audit reports in `.conduct/` for the purposes of determining compliance (they may be referenced only as historical context after you complete your own independent audit).

Scope rules (no omissions allowed):
- This is a FULL audit. You MUST cover every minute detail in the original intent/notes and every requirement in every provided REQUIREMENTS.md.
- You MUST NOT reduce scope, sample, or create an MVP view of the audit.
- If multiple spec bundles conflict, do NOT pick one silently:
  - identify conflicts explicitly
  - state which bundle is treated as authoritative for “pass/fail” ONLY if the user specified precedence; otherwise mark as “SPEC CONFLICT” and recommend a resolution.
- You MUST NOT change implementation code while auditing. The only file you may create/modify is the audit report itself.

Output file (MANDATORY):
- Write the audit report to the project root’s `.conduct/audits/` folder with EXACT filename format:
  - `.conduct/audits/audit-full-{YYYY-MM-DD}-{agent_name}.md`
- `{YYYY-MM-DD}` must be the date the audit ran.
- `{agent_name}` must be the AI agent name provided by the user; if not provided, use `unknown-agent`.

Directory rule:
- If `.conduct/audits/` does not exist, you MUST create it.

Audit report required metadata (top of file, must be present):
- exact timestamp (ISO 8601, include timezone; prefer UTC)
- agent_name
- model name/version (if known)
- IDE/editor info (if available)
- workspace/project absolute path (if available)
- OS + shell (if available)
- repo metadata if available (git: branch, commit, dirty status; if not a git repo, say so)
- intent/notes paths audited
- spec bundle paths audited (each bundle: root path + included files)
- codebase scope audited (root path + any excluded folders)
- commands executed during audit (if any)

Audit method (follow exactly):
1) Intent inventory (source-of-truth intent):
   - Extract an “Intent Inventory” from the user’s notes/intent/docs: a numbered, exhaustive list of every feature, constraint, invariant, edge case, API expectation, and “must not” rule.
2) Spec inventory (what is specified):
   - For each provided spec bundle:
     - if INTENT_AUDIT.md exists, use it as a starting point but still validate it
     - enumerate all requirements from REQUIREMENTS.md (requirement IDs, statements, acceptance criteria, referenced test vectors)
3) Spec-vs-intent audit (spec completeness / drift):
   - For EACH intent item:
     - map it to where it is specified (SPEC sections + requirement IDs + test vectors)
     - if missing: mark “SPEC MISSING” (this is a failure of the spec, not necessarily the implementation)
   - Identify spec conflicts across bundles (same concept specified differently).
4) Implementation audit (code vs what was intended and specified):
   - For EACH intent item and each requirement:
     - locate implementation evidence (files/symbols/tests)
     - verify behavior (prefer running tests/vectors; otherwise static audit with explicit limitations)
     - mark status:
       - PASS / PARTIAL / FAIL / UNVERIFIED for implementation
       - SPEC MISSING / SPEC CONFLICT where applicable
5) Cross-cutting audits (must include dedicated sections):
   - Security/authz/validation boundaries (as per intent/spec)
   - Determinism invariants
   - Limits/caps
   - Error handling + canonical envelopes
   - Compatibility/versioning/migrations
6) Summarize:
   - Coverage summary across:
     - intent coverage in spec (intent→spec)
     - spec coverage in code (requirements→code)
   - Top risks (ranked; include why it matters)
   - Fix order list (ranked; reference intent item numbers + requirement IDs)

Audit report structure (use these headings):
- Metadata
- Audit scope
- Inputs audited (intent + spec bundles)
- High-level findings
- Intent Inventory (numbered)
- Intent → Spec coverage matrix (complete; no sampling)
- Requirement coverage summary (PASS/PARTIAL/FAIL/UNVERIFIED counts per spec bundle)
- Requirement-by-requirement results (tables + per-requirement notes)
- Spec conflicts / spec gaps (explicit)
- Cross-cutting audits (security/determinism/limits/errors/compat)
- Recommendations (ranked)
- Appendix: commands run + environment details

User inputs (to be provided by the user in the task using this prompt):
- agent_name = <agent_name>
- project_root = <path>
- intent_paths = <one or more paths to intent/notes/docs>
- spec_bundle_paths = <one or more paths to spec bundle folders/files>
Now run the audit and write the report file.
```

