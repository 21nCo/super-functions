## datafn — Audit Fix Change Spec Plan

This plan is designed to eliminate “checkbox completion” by requiring each phase to be independently verifiable.

Global rule: **No phase is complete unless its verification steps pass**.

---

## Architecture sketch (modules and responsibilities)

- `@datafn/core`
  - Canonical types: schema, DFQL, envelopes, errors, plugins, events.
  - Canonical normalization: `normalizeDfql`, `dfqlKey`.
  - Canonical envelope unwrapping: `unwrapEnvelope`.

- `@datafn/server`
  - HTTP endpoint surface: `/datafn/*`
  - Request parsing/validation/authz
  - Plugin hook execution (server side)
  - DB adapter execution via `@superfunctions/db.Adapter`
  - Sync internals (idempotency, change tracking, cursors)
  - Optional REST wrappers

- `@datafn/client`
  - Client runtime: table registry, query/mutate/transact/sync
  - Local-first routing and offline changelog
  - Signal-backed queries + event invalidation
  - Plugin hook execution (client side)
  - Extension RPC transport (thin remote adapter)

- `@datafn/svelte`
  - `toSvelteStore(signal)` adapter and documentation

- `@datafn/cli`
  - Type generation and migrations
  - Deterministic schema validation handling via `unwrapEnvelope`

- `python/datafn`
  - Python server SDK parity with `@datafn/server` envelopes and endpoint shapes

---

## Dependency graph (must exist before what)

- `@datafn/core` changes (envelopes/events/unwrapEnvelope) → required before:
  - server envelope fixes
  - client event/filter fixes
  - cli deterministic error handling
  - python parity error shapes (mirrors core semantics)

- server envelope/capabilities contract → required before:
  - updating server tests
  - updating REST wrappers behavior

- shipped storage adapters → required before:
  - meaningful offline query expansion (contract tests must target real adapters)

---

## Phases overview

### Phase 00 — Core contract utilities + event/filter types

- **Goal**: Add `unwrapEnvelope` and extend core event/filter types; establish shared deterministic primitives.
- **Delivers**: CORE-ENV-001, CORE-EVENT-001, CORE-UTIL-001
- **Verification**: `npm test -- --filter=@datafn/core` and `npm test -- --filter=@datafn/client`

### Phase 01 — Server envelope correctness (request-level)

- **Goal**: Make all server endpoints return top-level `DatafnEnvelope` for request-level failures (invalid JSON, invalid DFQL).
- **Delivers**: SERVER-ENV-001, SERVER-ENV-002, SERVER-ENV-003
- **Verification**: `npm test -- --filter=@datafn/server`

### Phase 02 — Server DB requirement + status capabilities

- **Goal**: Remove “validation-only mode”; enforce DB requirement; align `/status` capability strings and DB health behavior.
- **Delivers**: SERVER-DB-001, SERVER-STATUS-001, SERVER-AUTH-001
- **Verification**: `npm test -- --filter=@datafn/server`

### Phase 03 — Server plugins correctness

- **Goal**: Enforce `runsOn` and ensure `afterQuery` runs for DB-backed execution.
- **Delivers**: SERVER-PLUG-001, SERVER-PLUG-002
- **Verification**: `npm test -- --filter=@datafn/server`

### Phase 04 — Server internal tables + idempotency + serverSeq atomicity

- **Goal**: Normalize internal table names (`__datafn_*`), guarantee atomic `serverSeq`, and ensure durable idempotency.
- **Delivers**: SERVER-SEQ-001, SERVER-CHANGES-001, SERVER-IDEMP-001, SERVER-SEED-001, SERVER-SYNC-CLIENTID-001
- **Verification**: `npm test -- --filter=@datafn/server`

### Phase 05 — REST wrapper determinism fixes

- **Goal**: Fix REST wrappers: schema version injection, deterministic parsing, deterministic required mutation metadata.
- **Delivers**: REST-001, REST-002, REST-003, REST-004
- **Verification**: `npm test -- --filter=@datafn/server`

### Phase 06 — Client plugin execution

- **Goal**: Implement client-side plugin hooks with runsOn enforcement and fail-open/closed semantics.
- **Delivers**: CLIENT-PLUG-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 07 — Client events + filter dimensions

- **Goal**: Emit `action/fields` for mutation events; emit `mutation_rejected` on thrown remote errors; implement action/fields/contextKeys filtering.
- **Delivers**: CLIENT-EVENT-001, CLIENT-FILTER-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 08 — Signal canonical keying

- **Goal**: Replace duplicated `dfqlKey` with `@datafn/core.dfqlKey` throughout signals.
- **Delivers**: CLIENT-SIGNAL-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 09 — Ship storage adapters (memory + IndexedDB)

- **Goal**: Provide real shipped adapters implementing `DatafnStorageAdapter` with deterministic ordering and changelog dedupe.
- **Delivers**: STORAGE-MEM-001, STORAGE-IDB-001, CLIENT-CHANGELOG-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 10 — Offline query semantics expansion

- **Goal**: Implement full deterministic local DFQL execution for ready tables (filters/sort/pagination/select/omit/relations/count/groupBy), matching server semantics.
- **Delivers**: CLIENT-OFFLINE-QUERY-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 11 — Offline mutation semantics hardening

- **Goal**: Restrict offline fallback to transport errors; implement deterministic optimistic local writes for supported operations; ensure changelog semantics.
- **Delivers**: CLIENT-OFFLINE-MUT-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 12 — Extension RPC subscription forwarding

- **Goal**: Support subscribe/unsubscribe + event forwarding deterministically in extension transport.
- **Delivers**: EXT-001
- **Verification**: `npm test -- --filter=@datafn/client`

### Phase 13 — CLI determinism fixes

- **Goal**: Make codegen/migrations reject invalid schemas deterministically via `unwrapEnvelope` and/or shared helpers.
- **Delivers**: CLI-VALIDATE-001, CLI-CODEGEN-001, CLI-MIG-001
- **Verification**: `npm test -- --filter=@datafn/cli`

### Phase 14 — Python SDK parity

- **Goal**: Implement Python server SDK routes with envelope semantics and parity invariants.
- **Delivers**: PY-SDK-001, PY-SDK-002
- **Verification**: `cd datafn/python && python -m pytest`

### Phase 15 — Documentation parity

- **Goal**: Update READMEs to match implemented APIs and canonical examples.
- **Delivers**: DOCS-SVELTE-001, DOCS-CLIENT-001, DOCS-CORE-001, DOCS-SERVER-001
- **Verification**: manual review against `TEST_VECTORS.md` doc vectors; optionally add greppable doc tests.

---

## Definition of Done (global)

- All requirement IDs in `REQUIREMENTS.md` are satisfied by code and tests.
- All vectors in `TEST_VECTORS.md` pass (automated where possible; manual review where specified).
- `@datafn/server` has no request-level nested error payloads.
- `/datafn/status` capability strings match the canonical list.
- Client supports plugins, rich event filters, and canonical signal keying.
- Shipped memory and IndexedDB storage adapters exist and are used by tests.
- CLI and Python SDK reject invalid schemas deterministically.
- Documentation matches actual exported APIs.

