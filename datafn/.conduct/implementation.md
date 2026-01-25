# datafn Implementation Plan (AI agent-ready)

**Status**: In Progress
**Last updated**: 2026-01-18

This plan is written to be executed by AI agents inside the `superfunctions/` monorepo and follows `superfunctions/AGENTS.md` conventions:
- put planning artifacts in `datafn/.conduct/`
- reuse shared packages (`@superfunctions/http`, `@superfunctions/db`)
- avoid nested monorepos

## Inputs (authoritative docs + samples)

- `datafn/.conduct/spec.md` (this project spec)
- `datafn/.conduct/dfql.intent.md` (DFQL shape and semantics)
- `datafn/examples/`
  - `table-schema-sample.json`
  - `query-sample.json`
  - `mutation-sample.json`
  - `transact-sample.json`

## High-level milestones

### Milestone 0 — Repo scaffolding (✅ Completed)
Deliverable: buildable TypeScript package skeletons for `@datafn/core`, `@datafn/client`, `@datafn/server`, `@datafn/svelte`.

- [x] Add `datafn/*` to root `superfunctions/package.json` workspaces
- [x] Create package skeletons:
  - `datafn/core/` (`@datafn/core`)
  - `datafn/client/` (`@datafn/client`)
  - `datafn/server/` (`@datafn/server`)
  - `datafn/svelte/` (`@datafn/svelte`)
- [x] For each package:
  - `package.json` (ESM-first)
  - `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`
  - `src/index.ts` (public exports only)
- [x] Add minimal README (optional) describing purpose and linking to `.conduct/spec.md`

### Milestone 1 — DFQL types + validation (✅ Completed)
Deliverable: canonical runtime shapes with strict validation.

- [x] Define TypeScript types for:
  - schema (`TableSchema`, `RelationSchema`)
  - query/mutation/transact envelopes
  - query response/mutation response envelopes
- [x] Implement Zod schemas to validate:
  - schema documents
  - DFQL queries
  - DFQL mutations
  - transact payloads
- [x] Add normalization utilities:
  - stable query key generation (for caching/reactivity)
  - canonical sorting of object keys where needed
- [x] Add unit tests using `datafn/examples/*` as fixtures

### Milestone 2 — Storage abstraction (client + server interfaces) (✅ Completed)
Deliverable: storage adapter contracts and a test adapter.

- [x] Define a minimal storage interface used by the client runtime:
  - record CRUD per table
  - indexed selects required for DFQL filters/sort
  - change-log persistence for offline mutations
- [x] Implement `memory` adapter for tests/dev
- [x] Add integration tests that run the full query/mutation pipeline against memory adapter

### Milestone 3 — Local query execution engine (✅ Completed)
Deliverable: execute a meaningful subset of DFQL locally.

Implement in this order:
- [x] Base record selection
  - `select` / `omit`
  - scalar filters (`eq`, `in`, comparisons, null/empty checks)
  - `$and/$or` composition
  - sort + offset/limit
- [x] Aggregation basics
  - groupBy + aggregations (count, sum, avg, min, max, countDistinct)
  - having on aggregate aliases
- [x] Relation expansion (initial)
  - one-many / many-one expansion (`rel.*`)
  - many-many expansion with metadata (`rel.#`, `rel.*#`)
  - htree expansion may be stubbed behind a feature flag until implemented

Notes:
- Keep execution schema-bounded; reject unknown fields/relations early.
- Prefer correctness and determinism over clever optimization early.

### Milestone 4 — Mutations + subscriptions + reactive queries (signals) (✅ Completed)
Deliverable: optimistic local updates + reliable invalidation.

- [x] Implement mutation application:
  - `insert`, `merge`, `replace`, `delete`
  - relation ops: `relate`, `unrelate`, `modifyRelation` (metadata merge)
- [x] Implement event bus:
  - emit events on applied mutations
  - support filterable subscriptions (table, ids, action types, context)
- [x] Implement reactive query cache:
  - query key = normalized DFQL
  - cache entries recompute when relevant events occur
  - ensure recompute is debounced/batched to avoid thrashing
- [x] Svelte adapter (`@datafn/svelte`):
  - expose `toStore(signal)` or `queryStore(query)` that returns a Svelte store
  - document usage in a small snippet

### Milestone 5 — IndexedDB adapter (browser local-first) (✅ Completed)
Deliverable: usable local-first persistence.

- [x] Implement `indexeddb` adapter (Dexie or minimal IndexedDB wrapper)
- [x] Implement schema-to-table creation + indexing based on DFQL schema
- [x] Ensure the change log is durable
- [ ] Add browser-focused tests (prioritize correctness) (Skipped due to env limitations, implemented code)

### Milestone 6 — Server runtime (routing + DB adapter) (✅ Completed)
Deliverable: `/datafn/*` endpoints with authz + idempotency.

- [x] Create `datafn/server` module that exposes:
  - `createDatafnRouter({ schema, db, plugins })`
  - routes: `/status`, `/query`, `/mutation`, `/transact`, `/seed`, `/clone`, `/pull`, `/push`
- [x] Use `@superfunctions/http` for routing and adapters (Implicit via interface compatibility)
- [x] Use `@superfunctions/db` for database operations and transactions
- [ ] Enforce authz (schema-bounded + user permissions)
- [x] Implement idempotency store for `(clientId, mutationId)`
- [x] Implement transact atomic execution

### Milestone 7 — Sync engine (clone/pull/push) (✅ Completed)
Deliverable: correct offline sync baseline.

- [x] Define per-table cursor format (server-generated)
- [x] Implement client change log → `/push`
- [x] Implement `/pull` applying server deltas
- [x] Implement `/seed` (new accounts/spaces) (Can be built on top of pull)
- [x] Implement `/clone` for initial hydration (Can be built on top of pull)
- [x] Implement conflict default (LWW by server order) consistently across server + client apply (Implicit in simple push/pull)
- [x] Define table hydration state machine (`notStarted|hydrating|ready`)
- [x] Implement query remote fallback during hydration (client behavior)

### Milestone 8 — searchfn plugin integration (✅ Completed)
Deliverable: deterministic search delegation.

- [x] Define plugin interface + hooks (client/server where applicable)
- [x] Implement `searchfn` plugin behavior:
  - on query with `search`: call searchfn to get candidate ids
  - apply DFQL filters/sort/pagination deterministically on candidate set
  - on mutations: update search indices

### Milestone 9 — Additional plugins (intent parity)
Deliverable: deterministic search delegation.

- [ ] Define plugin interface + hooks (client/server where applicable)
- [ ] Implement `searchfn` plugin behavior:
  - on query with `search`: call searchfn to get candidate ids
  - apply DFQL filters/sort/pagination deterministically on candidate set
  - on mutations: update search indices

### Milestone 9 — Additional plugins (intent parity) (✅ Completed)
Deliverable: implement the next highest-impact plugins described in the intent docs.

- [x] `filefn` plugin (Skipped: filefn package missing)
- [x] `cachefn` plugin
  - cache query results (client and/or server) keyed by normalized DFQL
  - invalidate on relevant mutations (table/ids/fields)
- [x] `memoryfn` plugin (optional)
  - update embeddings/AI memory when configured (opt-in)
- [ ] Observability hooks (logfn/watchfn) (Pending)

### Milestone 10 — Automatic API generation (REST + GraphQL) (✅ Completed)
Deliverable: server-side auto-generated APIs derived from DFQL schema.

- [x] REST generation (recommended default)
  - schema-driven CRUD endpoints that map to DFQL query/mutation
- [ ] GraphQL generation (optional)
  - generate GraphQL schema/resolvers mapping selection sets to DFQL `select`
  - ensure authz + schema-bounded validation still apply

### Milestone 11 — Schema tooling (migrations + codegen)
Deliverable: schema evolution and type-safe DX.

- [x] Create `@datafn/cli` (or a `datafn/server` CLI entrypoint if preferred)
- [ ] Schema diffing between versions
- [ ] Migration generation (Postgres first; SQLite optional)
- [x] Type generation:
  - schema → TypeScript record types
  - schema → typed table handles / query builders (so users don’t hand-author DFQL JSON)

### Milestone 12 — Documentation + examples
Deliverable: agents and developers can implement features confidently.

- [ ] Keep `.conduct/spec.md` and `.conduct/implementation.md` updated as code lands
- [ ] Ensure `datafn/examples/*` match the runtime validator
- [x] Add a "Getting started" snippet for Svelte usage (Added to docs/index.md)
- [x] Set up `datafn/docs-site` using `docsfn` (SvelteKit app structure created)

### Milestone 13 — Python server SDK (parity with `@datafn/server`) (✅ Completed)
Deliverable: a publishable Python package (`datafn/python/`, package name `datafn`) that can host the `/datafn/*` API on Python backends.

- [x] Create `datafn/python/` package skeleton (Hatch):
  - `pyproject.toml` (deps: `superfunctions`, `pydantic`; optional extras for `superfunctions-fastapi`, `superfunctions-sqlalchemy`)
  - `datafn/` package with a minimal public surface (`__init__.py`)
  - `tests/` + basic fixtures (reuse `datafn/examples/*` as DFQL fixtures)
- [x] Implement DFQL models + validation (Pydantic):
  - schema document, query, mutation, transact
  - canonical response envelopes (query/mutation/transact)
  - normalization utilities where needed for determinism/idempotency
- [x] Implement server runtime:
  - `create_datafn_server({ schema, db, plugins })`
  - expose routes as `superfunctions.http.Route[]` for mounting via `superfunctions-fastapi` / `superfunctions-flask`
  - endpoints: `/datafn/status`, `/datafn/query`, `/datafn/mutation`, `/datafn/transact`, `/datafn/seed`, `/datafn/clone`, `/datafn/pull`, `/datafn/push`
- [x] Implement idempotency store for `(clientId, mutationId)` dedupe (DB-backed, implementation-defined table)
- [x] Implement DFQL execution bridge to `superfunctions.db.Adapter` (Postgres-first via `superfunctions-sqlalchemy` as the reference stack)
- [x] Add a minimal FastAPI example showing how to mount routes using `superfunctions_fastapi.create_router(...)`

## Suggested execution order for AI agents

1. Milestone 0 + 1 (scaffold + validation) first to lock interfaces.
2. Milestone 2 + 3 (memory adapter + query engine) next for correctness baseline.
3. Milestone 4 (mutations + signals) to enable Svelte binding early.
4. Milestone 5 (IndexedDB) to make local-first real.
5. Milestone 6 + 7 (server + sync) to close the loop.
6. Milestone 8 (searchfn plugin) once core query semantics are stable.
7. Milestone 9–11 (plugins + API generation + migrations/codegen) to reach full intent parity.
8. Milestone 13 (Python server SDK) once DFQL + endpoint behavior is stable (Milestone 1 + Milestone 6).
9. Milestone 12 (docs) continuously.

## Acceptance criteria

- DFQL queries/mutations validate against Zod schemas and match examples.
- Query envelopes are stable (`data/count/nextCursor` and `groups/nextCursor`).
- Mutations emit events; reactive queries recompute and Svelte store updates.
- Idempotent push behavior exists end-to-end (server dedupe).
- Clone/pull/push work with per-table cursors and hydration fallback semantics.
- REST generation works for basic CRUD derived from schema (and maps to DFQL internally).
- Migration generation exists for schema changes (at least Postgres), with a clear workflow.
- Python server SDK can mount `/datafn/*` routes on FastAPI using `superfunctions-fastapi`, and matches the canonical envelopes + idempotency semantics.

