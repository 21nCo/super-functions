## datafn — Phased implementation plan

This plan is designed to be executed by multiple agents without “checkbox completion”. Each phase is a **verifiable vertical slice** and maps directly to requirement IDs in `REQUIREMENTS.md`.

**Global rule**: No phase is complete unless its verification steps pass.

---

## Architecture sketch (target modules)

### `superfunctions/datafn/core` (`@datafn/core`)

Responsibilities:
- Schema types and validation (`validateSchema`).
- DFQL normalization (`normalizeDfql`) and stable keys (`dfqlKey`).
- Shared error types/codes (`DatafnErrorCode`, `DatafnError`, `DatafnEnvelope`).
- Shared event + plugin types (`DatafnEvent`, `DatafnPlugin`, etc.).

### `superfunctions/datafn/server` (`@datafn/server`)

Responsibilities:
- `createDatafnServer(config)` returning a `@superfunctions/http` `Router`.
- Endpoint handlers for `/datafn/*` implementing canonical envelopes and deterministic errors.
- Authorization enforcement (host-provided `authorize`).
- Limits enforcement.
- Query execution and mutation execution:
  - P0 reference execution engine over an abstract store.
  - P0: in-memory store implementation used for tests and golden vectors.
  - Post-P0: SQL execution via `@superfunctions/db` adapters.
- Sync primitives (`clone/pull/push`) and idempotency storage.

### `superfunctions/datafn/client` (`@datafn/client`)

Responsibilities:
- `createDatafnClient(config)` with local storage adapter + optional remote adapter.
- In-process event bus + `subscribe(filter)`.
- Signal abstraction (`DatafnSignal`) and invalidation (minimal P0).

### `superfunctions/datafn/svelte` (`@datafn/svelte`)

Responsibilities:
- `toSvelteStore(signal)` adapter.

---

## Dependency graph

`@datafn/core`  
→ `@datafn/server` (depends on core + `@superfunctions/http`)  
→ `@datafn/client` (depends on core)  
→ `@datafn/svelte` (depends on core + client)

Server execution engine and test fixtures are implemented **before** client signals to keep semantics grounded.

---

## Phases overview

- **Phase 00** → goal: scaffold packages + implement schema validation + DFQL normalization → delivered capability: `@datafn/core` usable + unit tests → verification: `turbo test` for core
- **Phase 01** → goal: server skeleton + canonical envelopes + authz + limits + `/status` + `/query` validation → delivered capability: server can validate DFQL and return deterministic errors → verification: server unit/integration tests for API-001/SEC-001/LIMIT-001/QUERY-001
- **Phase 02** → goal: query execution engine (filters/sort/pagination + select expansion for many-one and many-many) → delivered capability: `/query` returns correct deterministic data for Fixture F1 vectors → verification: implement + run `TV-QUERY-*` tests
- **Phase 03** → goal: mutation engine (CRUD + idempotency + `if` guards + relation ops) + `/mutation` endpoint semantics → delivered capability: `TV-MUT-*` passing → verification: unit/integration tests
- **Phase 04** → goal: `/transact` atomic semantics + `/clone` `/pull` `/push` sync primitives → delivered capability: `TV-TX-*` and `TV-SYNC-*` passing → verification: tests + fixture harness
- **Phase 05** → goal: minimal client runtime events + signals + svelte adapter → delivered capability: `TV-EVENTS-*` passing → verification: client unit tests

---

## Definition of Done (global)

A phase is Done only when:
- All listed verification steps pass locally.
- Newly added/changed files match the phase deliverables list.
- Requirements covered by the phase have **passing test vectors** in `TEST_VECTORS.md` (directly or via equivalent unit tests that assert the same I/O).
- No new “Undefined” behavior is accidentally relied on (e.g. timestamps, implicit ordering).

