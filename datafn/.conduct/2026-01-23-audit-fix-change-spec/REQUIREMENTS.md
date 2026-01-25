## datafn — Audit Fix Change Spec Requirements

This document defines the **normative requirements** for the change described in `SPEC.md`.

Hard rule (from [spec.txt](https://www.fetch.at/spec.txt)): Every **MUST** requirement below has:

- **acceptance criteria**
- **at least one positive** test vector reference
- **at least one negative** test vector reference

Anything not specified is **Undefined** and therefore not required.

---

## Table of contents (requirement IDs)

### Spec / core contract

- CORE-ENV-001
- CORE-EVENT-001
- CORE-UTIL-001

### Server: envelopes / DB / status / auth

- SERVER-ENV-001
- SERVER-ENV-002
- SERVER-ENV-003
- SERVER-DB-001
- SERVER-STATUS-001
- SERVER-AUTH-001

### Server: plugins / determinism

- SERVER-PLUG-001
- SERVER-PLUG-002

### Server: sync ordering / internal tables

- SERVER-SEQ-001
- SERVER-CHANGES-001
- SERVER-IDEMP-001
- SERVER-SEED-001
- SERVER-SYNC-CLIENTID-001

### Server: REST wrappers

- REST-001
- REST-002
- REST-003
- REST-004

### Client: plugins / events / signals

- CLIENT-PLUG-001
- CLIENT-EVENT-001
- CLIENT-FILTER-001
- CLIENT-SIGNAL-001

### Client: offline + storage adapters

- STORAGE-MEM-001
- STORAGE-IDB-001
- CLIENT-OFFLINE-QUERY-001
- CLIENT-OFFLINE-MUT-001
- CLIENT-CHANGELOG-001

### Extension RPC

- EXT-001

### Tooling: CLI + migrations/codegen determinism

- CLI-VALIDATE-001
- CLI-CODEGEN-001
- CLI-MIG-001

### Python SDK parity

- PY-SDK-001
- PY-SDK-002

### Documentation parity

- DOCS-SVELTE-001
- DOCS-CLIENT-001
- DOCS-CORE-001
- DOCS-SERVER-001

---

## Requirements

### CORE-ENV-001

- **ID**: CORE-ENV-001
- **Priority**: P0
- **Statement**: `@datafn/core` MUST define `DatafnEnvelope<T>` as the canonical transport wrapper used by `@datafn/server` (HTTP) and extension RPC, with request-level failures represented as top-level `{ ok:false, error }`.
- **Rationale**: The audit found inconsistent envelope usage across server endpoints; a single canonical wrapper is required for deterministic client behavior.
- **Acceptance criteria**:
  - `DatafnEnvelope<T>` has exactly two shapes: `{ ok:true, result:T }` or `{ ok:false, error:{ code, message, details:{ path } } }`.
  - Request-level failures (invalid JSON, missing DB, denied auth) are always returned as top-level `ok:false`.
- **Test vectors**: TV-CORE-ENV-001 (positive), TV-SERVER-ENV-001 (negative)
- **Notes**:
  - Result-level failures inside mutation/transact results are allowed only after request-level validation succeeds; see SERVER-ENV-*.

### CORE-EVENT-001

- **ID**: CORE-EVENT-001
- **Priority**: P0
- **Statement**: `@datafn/core` MUST extend `DatafnEvent` and `DatafnEventFilter` to support `action`, `fields`, and `contextKeys` filtering as described in `SPEC.md`.
- **Rationale**: Fine-grained subscriptions are required by the original intent and explicitly missing per the audit.
- **Acceptance criteria**:
  - `DatafnEvent` supports `action?: string`, `fields?: string[]`.
  - `DatafnEventFilter` supports `action`, `fields`, and `contextKeys`.
  - Filter semantics are deterministic (see CLIENT-FILTER-001).
- **Test vectors**: TV-CORE-EVENT-001 (positive), TV-CORE-EVENT-002 (negative)
- **Notes**:
  - This requirement is type-level and behavior-level; tests may validate via `@datafn/client.matchesFilter`.

### CORE-UTIL-001

- **ID**: CORE-UTIL-001
- **Priority**: P0
- **Statement**: `@datafn/core` MUST provide an `unwrapEnvelope` (or equivalently named) helper that deterministically throws a `DatafnError` when given `{ ok:false }`.
- **Rationale**: Multiple packages incorrectly treat `validateSchema` as throwing; a shared unwrapping utility is needed for deterministic tooling behavior.
- **Acceptance criteria**:
  - `unwrapEnvelope({ ok:true, result:X })` returns `X`.
  - `unwrapEnvelope({ ok:false, error:E })` throws `E` exactly.
- **Test vectors**: TV-CORE-UTIL-001 (positive), TV-CORE-UTIL-002 (negative)
- **Notes**:
  - “Throws exactly” means `code/message/details.path` match.

---

### SERVER-ENV-001

- **ID**: SERVER-ENV-001
- **Priority**: P0
- **Statement**: Every `@datafn/server` endpoint MUST return a top-level `DatafnEnvelope` response.
- **Rationale**: Mixed top-level vs nested envelopes break client transport unwrapping and determinism.
- **Acceptance criteria**:
  - Success responses are `{ ok:true, result:<payload> }`.
  - Request-level failures are `{ ok:false, error:<DatafnError> }` with appropriate HTTP status codes.
- **Test vectors**: TV-SERVER-ENV-OK-001 (positive), TV-SERVER-ENV-001 (negative)
- **Notes**:
  - Applies to REST wrappers as well when enabled.

### SERVER-ENV-002

- **ID**: SERVER-ENV-002
- **Priority**: P0
- **Statement**: Invalid JSON bodies for any `POST /datafn/*` endpoint MUST return `{ ok:false, error:{ code:"DFQL_INVALID", message:"Invalid JSON", details:{ path:"$" } } }`.
- **Rationale**: Audit identified inconsistent “Invalid DFQL” messages and nested ok:false failures.
- **Acceptance criteria**:
  - Invalid JSON yields the exact message and details.path above.
  - This is request-level and MUST NOT be returned as `{ ok:true, result:{ ok:false } }`.
- **Test vectors**: TV-SERVER-ENV-002-POS (positive), TV-SERVER-ENV-001 (negative)
- **Notes**:
  - The HTTP status code is specified in TEST_VECTORS.

### SERVER-ENV-003

- **ID**: SERVER-ENV-003
- **Priority**: P0
- **Statement**: Request-level schema/shape validation failures for `@datafn/server` endpoints MUST return top-level `ok:false` envelopes with deterministic `code/message/details.path`.
- **Rationale**: Nested failures and inconsistent paths prevent reliable clients and testing.
- **Acceptance criteria**:
  - Missing required fields yield `DFQL_INVALID` and `details.path` pointing to the missing field.
  - Unknown resources yield `DFQL_UNKNOWN_RESOURCE` and `details.path:"resource"`.
- **Test vectors**: TV-SERVER-VALID-001 (positive), TV-SERVER-VALID-002 (negative)

### SERVER-DB-001

- **ID**: SERVER-DB-001
- **Priority**: P0
- **Statement**: `@datafn/server` MUST require a configured `@superfunctions/db.Adapter` (`config.db`) and MUST return `{ ok:false, error:{ code:"INTERNAL", message:"Internal error", details:{ path:"$" } } }` for all non-status endpoints when DB is missing.
- **Rationale**: The audit found a “validation-only mode” that contradicts the intended server contract and misleads clients.
- **Acceptance criteria**:
  - `createDatafnServer` calls `db.initialize()` exactly once during startup.
  - If `db` is missing, `/datafn/query|mutation|transact|seed|clone|pull|push` return `ok:false INTERNAL` with message `Internal error`.
- **Test vectors**: TV-DB-INIT-001 (positive), TV-DB-MISSING-001 (negative)

### SERVER-STATUS-001

- **ID**: SERVER-STATUS-001
- **Priority**: P0
- **Statement**: `GET /datafn/status` MUST return accurate capability strings using the fixed names `dfql.query`, `dfql.mutation`, `dfql.transact`, `sync.seed`, `sync.clone`, `sync.pull`, `sync.push`, and MUST return `ok:false INTERNAL` when the DB adapter is unhealthy.
- **Rationale**: The audit found capability string mismatches between spec/tests/code.
- **Acceptance criteria**:
  - When DB is healthy, capabilities include exactly the fixed strings above (in deterministic order).
  - When `db.isHealthy().healthy === false`, response is `{ ok:false, error:{ code:"INTERNAL", message:"Internal error", details:{ path:"$" } } }`.
- **Test vectors**: TV-STATUS-001 (positive), TV-STATUS-002 (negative)
- **Notes**:
  - Schema hash determinism is validated in vectors.

### SERVER-AUTH-001

- **ID**: SERVER-AUTH-001
- **Priority**: P0
- **Statement**: The server MUST call `authorize(ctx, action, payload)` exactly once per request (with parsed JSON payload for POST endpoints and `null` for `GET /datafn/status`) before any execution side effects, and MUST return `ok:false FORBIDDEN` when authorization denies.
- **Rationale**: Audit noted previous implementations passing `payload:null`, preventing meaningful policies.
- **Acceptance criteria**:
  - For valid JSON POST bodies, `payload` equals parsed body.
  - Denial returns `{ ok:false, error:{ code:"FORBIDDEN", message:"Forbidden", details:{ path:"$" } } }`.
- **Test vectors**: TV-AUTH-001 (positive), TV-AUTH-002 (negative)

---

### SERVER-PLUG-001

- **ID**: SERVER-PLUG-001
- **Priority**: P1
- **Statement**: The server MUST execute `DatafnPlugin` hooks in registration order around query/mutation/transact/sync and MUST enforce `plugin.runsOn` so only `"server"` plugins run on the server.
- **Rationale**: Audit found partial server plugin execution and missing `runsOn` enforcement.
- **Acceptance criteria**:
  - Hooks run in registration order.
  - Plugins without `"server"` in `runsOn` do not run on server.
  - `before*` hook failures are fail-closed.
- **Test vectors**: TV-PLUG-SERVER-ORDER-001 (positive), TV-PLUG-SERVER-RUNSON-001 (negative)

### SERVER-PLUG-002

- **ID**: SERVER-PLUG-002
- **Priority**: P1
- **Statement**: The server MUST run `afterQuery` hooks for executed queries regardless of whether the server is DB-backed or not.
- **Rationale**: Audit found `afterQuery` only running on the “no DB” branch.
- **Acceptance criteria**:
  - For DB-backed query execution, `afterQuery` runs once with the final result.
  - `afterQuery` failures are fail-open (response is still returned).
- **Test vectors**: TV-PLUG-SERVER-AFTERQUERY-001 (positive), TV-PLUG-SERVER-AFTERQUERY-002 (negative)

---

### SERVER-SEQ-001

- **ID**: SERVER-SEQ-001
- **Priority**: P1
- **Statement**: The server MUST assign a monotonic `serverSeq` per namespace for all applied mutations using an atomic increment mechanism.
- **Rationale**: Non-atomic increments can violate ordering guarantees under concurrency.
- **Acceptance criteria**:
  - Concurrent mutation application yields strictly increasing `serverSeq` values.
  - `serverSeq` is independent of client timestamps.
- **Test vectors**: TV-SERVERSEQ-001 (positive), TV-SERVERSEQ-002 (negative)

### SERVER-CHANGES-001

- **ID**: SERVER-CHANGES-001
- **Priority**: P1
- **Statement**: The server MUST persist sync change tracking in `__datafn_changes` and MUST derive clone/pull cursors from the latest `serverSeq` per table.
- **Rationale**: Sync correctness depends on durable, monotonic change logs.
- **Acceptance criteria**:
  - Successful mutations write change rows for affected resource+id.
  - `/datafn/clone` cursors are base-10 integer strings representing latest `serverSeq` for each returned table.
- **Test vectors**: TV-SYNC-CLONE-001 (positive), TV-SYNC-CLONE-002 (negative)

### SERVER-IDEMP-001

- **ID**: SERVER-IDEMP-001
- **Priority**: P1
- **Statement**: The server MUST persist idempotency state for `(namespace, clientId, mutationId)` in `__datafn_idempotency` so dedupe survives restarts.
- **Rationale**: Offline retries require durable dedupe.
- **Acceptance criteria**:
  - Replaying identical `(clientId, mutationId)` returns `deduped:true` on second application even after restart with preserved adapter state.
  - Uniqueness is enforced per namespace.
- **Test vectors**: TV-IDEMP-001 (positive), TV-IDEMP-002 (negative)

### SERVER-SEED-001

- **ID**: SERVER-SEED-001
- **Priority**: P1
- **Statement**: `POST /datafn/seed` MUST validate `clientId` and MUST record seed execution in `__datafn_seed` per namespace for idempotency.
- **Rationale**: Audit noted seed exists but lacks durable tracking.
- **Acceptance criteria**:
  - Valid request returns `{ ok:true, result:{ ok:true } }`.
  - Re-seeding the same namespace is idempotent (does not create duplicate seed rows).
- **Test vectors**: TV-SEED-001 (positive), TV-SEED-002 (negative)

### SERVER-SYNC-CLIENTID-001

- **ID**: SERVER-SYNC-CLIENTID-001
- **Priority**: P1
- **Statement**: `POST /datafn/push` MUST reject when `request.clientId` does not match a mutation’s `clientId` (when present) with deterministic `DFQL_INVALID`.
- **Rationale**: Prevents ambiguous idempotency keys and cross-client forgery in batch push payloads.
- **Acceptance criteria**:
  - If any mutation has `clientId` that differs from request `clientId`, response is request-level `ok:false DFQL_INVALID`.
- **Test vectors**: TV-PUSH-CLIENTID-001 (positive), TV-PUSH-CLIENTID-002 (negative)

---

### REST-001

- **ID**: REST-001
- **Priority**: P1
- **Statement**: REST wrappers MUST inject the correct `version` for the target resource from schema (not hard-coded).
- **Rationale**: Audit found REST wrappers hard-coding `version:1`, which breaks schema evolution.
- **Acceptance criteria**:
  - For a resource with schema version N, wrapper sends `version:N` to DFQL execution.
- **Test vectors**: TV-REST-VERSION-001 (positive), TV-REST-VERSION-002 (negative)

### REST-002

- **ID**: REST-002
- **Priority**: P1
- **Statement**: REST mutation wrappers MUST require deterministic `clientId` and `mutationId` inputs and MUST NOT generate `mutationId` from clocks (`Date.now`) or randomness.
- **Rationale**: Audit found non-deterministic fallback mutationId generation in DELETE.
- **Acceptance criteria**:
  - Missing `clientId` or `mutationId` yields request-level `DFQL_INVALID` with deterministic path.
- **Test vectors**: TV-REST-META-001 (positive), TV-REST-META-002 (negative)

### REST-003

- **ID**: REST-003
- **Priority**: P1
- **Statement**: `GET /datafn/resources/:table` MUST parse `q` as URL-encoded JSON and MUST reject invalid `q` with `DFQL_INVALID` and deterministic `details.path:"q"`.
- **Rationale**: Wrapper input parsing must be deterministic and safe.
- **Acceptance criteria**:
  - Missing `q` is treated as `{}`.
  - Invalid JSON in `q` returns `{ ok:false, error:{ code:"DFQL_INVALID", message:"Invalid JSON", details:{ path:"q" } } }`.
- **Test vectors**: TV-REST-QUERY-001 (positive), TV-REST-QUERY-002 (negative)

### REST-004

- **ID**: REST-004
- **Priority**: P1
- **Statement**: `POST /datafn/resources/:table` MUST default the mutation operation to `merge` when the client does not specify an operation.
- **Rationale**: The audit found the REST generator defaulting to `insert`, which breaks common upsert/merge semantics for REST creation flows.
- **Acceptance criteria**:
  - A POST with `{ id, record }` and no `operation` succeeds even if the record already exists by applying a merge.
  - If the client explicitly requests `operation:"insert"` for an existing id, the server returns a deterministic conflict error (result-level, not request-level).
- **Test vectors**: TV-REST-POST-DEFAULT-001 (positive), TV-REST-POST-DEFAULT-002 (negative)
- **Notes**:
  - This requirement does not change the DFQL mutation semantics; it only defines REST wrapper defaults.

---

### CLIENT-PLUG-001

- **ID**: CLIENT-PLUG-001
- **Priority**: P0
- **Statement**: `@datafn/client` MUST accept `plugins?: DatafnPlugin[]` and MUST execute hooks in registration order while enforcing `plugin.runsOn` so only `"client"` plugins run on the client.
- **Rationale**: Audit found client plugins missing entirely.
- **Acceptance criteria**:
  - `beforeQuery` can deterministically transform outgoing query payloads.
  - A plugin that lacks `"client"` in `runsOn` does not run on client.
  - `beforeQuery` failures are fail-closed and prevent remote calls.
- **Test vectors**: TV-PLUG-CLIENT-001 (positive), TV-PLUG-CLIENT-002 (negative)

### CLIENT-EVENT-001

- **ID**: CLIENT-EVENT-001
- **Priority**: P0
- **Statement**: Client mutation events MUST include deterministic `action` and `fields` metadata when mutation inputs make them knowable, and MUST emit `mutation_rejected` on remote errors (including thrown transport errors).
- **Rationale**: Audit found missing event metadata and missing rejection events on thrown errors.
- **Acceptance criteria**:
  - For `mutation_applied`, `action` equals the mutation operation and `fields` is derived deterministically from mutation record keys (excluding `id`).
  - For thrown remote errors, a `mutation_rejected` event is emitted before the error is surfaced to the caller.
- **Test vectors**: TV-CLIENT-EVENT-001 (positive), TV-CLIENT-EVENT-002 (negative)

### CLIENT-FILTER-001

- **ID**: CLIENT-FILTER-001
- **Priority**: P0
- **Statement**: `@datafn/client` event filtering MUST support `action`, `fields`, and `contextKeys` in addition to `type/resource/ids/mutationId`.
- **Rationale**: Fine-grained subscriptions are part of the original intent and missing per audit.
- **Acceptance criteria**:
  - `action` matches by string or any-of array.
  - `fields` matches when there is a non-empty intersection between filter fields and event.fields.
  - `contextKeys` matches only when all required keys exist on `event.context` (when context is an object).
- **Test vectors**: TV-CLIENT-FILTER-001 (positive), TV-CLIENT-FILTER-002 (negative)

### CLIENT-SIGNAL-001

- **ID**: CLIENT-SIGNAL-001
- **Priority**: P0
- **Statement**: `DatafnTable.signal` MUST cache signals by `@datafn/core.dfqlKey(fullQuery)` (not a duplicated implementation) and MUST preserve object identity for semantically equivalent queries.
- **Rationale**: Audit found client using a local `dfqlKey` implementation, risking divergence from canonical normalization.
- **Acceptance criteria**:
  - Two queries with different key ordering produce the same signal object identity.
  - The cache key generation is delegated to `@datafn/core.dfqlKey`.
- **Test vectors**: TV-CLIENT-SIGNAL-001 (positive), TV-CLIENT-SIGNAL-002 (negative)

---

### STORAGE-MEM-001

- **ID**: STORAGE-MEM-001
- **Priority**: P1
- **Statement**: The repo MUST ship a deterministic in-memory `DatafnStorageAdapter` implementation suitable for tests/dev.
- **Rationale**: Audit found no shipped adapter; tests currently use ad-hoc mocks.
- **Acceptance criteria**:
  - Adapter implements the full interface including join rows, cursors, hydration state, and changelog.
  - `listRecords` ordering is deterministic (by `id:asc`).
  - Changelog is deduped by `(clientId, mutationId)`.
- **Test vectors**: TV-STORAGE-MEM-001 (positive), TV-STORAGE-MEM-002 (negative)

### STORAGE-IDB-001

- **ID**: STORAGE-IDB-001
- **Priority**: P1
- **Statement**: The repo MUST ship an IndexedDB-backed `DatafnStorageAdapter` implementation that persists data across reloads and passes the storage contract vectors.
- **Rationale**: Browser local-first requires durable IndexedDB.
- **Acceptance criteria**:
  - Data persists across adapter re-instantiation with the same DB name.
  - Deterministic ordering and changelog dedupe are preserved.
- **Test vectors**: TV-STORAGE-IDB-001 (positive), TV-STORAGE-IDB-002 (negative)

### CLIENT-OFFLINE-QUERY-001

- **ID**: CLIENT-OFFLINE-QUERY-001
- **Priority**: P1
- **Statement**: When storage is configured and a table is `ready`, `DatafnTable.query` MUST execute locally without calling the remote adapter while preserving DFQL semantics deterministically.
- **Rationale**: Audit found local execution exists but is only a minimal subset.
- **Acceptance criteria**:
  - For `ready` hydration state, no remote call occurs.
  - Local execution supports the DFQL feature set listed in `SPEC.md` for client local-first (filters/sort/pagination/select/omit/relations/count/groupBy).
- **Test vectors**: TV-OFFLINE-QUERY-001 (positive), TV-OFFLINE-QUERY-002 (negative)

### CLIENT-OFFLINE-MUT-001

- **ID**: CLIENT-OFFLINE-MUT-001
- **Priority**: P1
- **Statement**: When storage is configured and remote mutation fails due to transport unavailability, the client MUST append the mutation to the offline changelog and MUST apply a deterministic optimistic local write.
- **Rationale**: Audit found offline fallback triggers too broadly and local apply is too limited.
- **Acceptance criteria**:
  - Offline fallback triggers only for transport errors (not for schema/DFQL rejections).
  - Changelog append occurs before local apply; changelog failure fails the mutation deterministically.
- **Test vectors**: TV-OFFLINE-MUT-001 (positive), TV-OFFLINE-MUT-002 (negative)

### CLIENT-CHANGELOG-001

- **ID**: CLIENT-CHANGELOG-001
- **Priority**: P1
- **Statement**: The offline changelog MUST be an ordered list with deterministic dedupe by `(clientId, mutationId)` implemented by shipped storage adapters.
- **Rationale**: Audit noted dedupe is currently only assumed and not implemented in shipped adapters (none exist).
- **Acceptance criteria**:
  - Appending the same `(clientId, mutationId)` twice returns the same stored entry without duplication.
  - `changelogAck` removes entries through a given sequence deterministically.
- **Test vectors**: TV-CHANGELOG-001 (positive), TV-CHANGELOG-002 (negative)

---

### EXT-001

- **ID**: EXT-001
- **Priority**: P1
- **Statement**: The repo MUST provide an extension RPC transport that forwards DFQL calls and supports deterministic subscription event forwarding using the canonical RPC envelopes defined in `SPEC.md`.
- **Rationale**: Audit found forwarding exists for calls but subscription forwarding is not implemented.
- **Acceptance criteria**:
  - Requests use `{ id, method, payload }` and responses use `{ id, envelope }`.
  - Subscription events are delivered as `{ type:"event", subscriptionId, event }`.
- **Test vectors**: TV-EXT-001 (positive), TV-EXT-002 (negative)

---

### CLI-VALIDATE-001

- **ID**: CLI-VALIDATE-001
- **Priority**: P1
- **Statement**: `@datafn/cli` MUST treat `@datafn/core.validateSchema` as an envelope-returning function and MUST reject invalid schema inputs deterministically using `SCHEMA_INVALID` errors.
- **Rationale**: Audit found tooling calling `validateSchema(schema)` without checking `.ok`.
- **Acceptance criteria**:
  - Invalid schema yields a deterministic thrown error including `{ code:"SCHEMA_INVALID", details:{ path:"..." } }`.
- **Test vectors**: TV-CLI-VALIDATE-001 (positive), TV-CLI-VALIDATE-002 (negative)

### CLI-CODEGEN-001

- **ID**: CLI-CODEGEN-001
- **Priority**: P1
- **Statement**: TypeScript codegen MUST produce deterministic output for a schema and MUST deterministically reject invalid schema input.
- **Rationale**: Audit found codegen output deterministic but invalid schema rejection non-deterministic.
- **Acceptance criteria**:
  - Output ordering is stable (resources and fields sorted).
  - Invalid schema is rejected with deterministic `SCHEMA_INVALID`.
- **Test vectors**: TV-CODEGEN-001 (positive), TV-CODEGEN-002 (negative)

### CLI-MIG-001

- **ID**: CLI-MIG-001
- **Priority**: P1
- **Statement**: Migration diff/render MUST be deterministic for a schema pair and MUST deterministically reject invalid schema inputs.
- **Rationale**: Audit found invalid diffs rejected only via incidental runtime failures.
- **Acceptance criteria**:
  - `diffSchemas(from,to)` yields stable plan ordering.
  - Invalid schema inputs yield deterministic `SCHEMA_INVALID`.
- **Test vectors**: TV-MIG-001 (positive), TV-MIG-002 (negative)

---

### PY-SDK-001

- **ID**: PY-SDK-001
- **Priority**: P2
- **Statement**: The Python package `datafn` MUST expose `create_datafn_server(config)` returning a server object that includes routable `/datafn/*` endpoints with parity envelope semantics.
- **Rationale**: Audit found Python SDK is only a “route list” and lacks parity.
- **Acceptance criteria**:
  - `create_datafn_server` validates schema deterministically.
  - Returned server exposes routes for `status/query/mutation/transact/seed/clone/pull/push`.
- **Test vectors**: TV-PY-001 (positive), TV-PY-002 (negative)

### PY-SDK-002

- **ID**: PY-SDK-002
- **Priority**: P2
- **Statement**: Python server endpoints MUST match the TypeScript server’s request/response wire semantics (envelopes, error codes/messages, and sync/idempotency invariants) to the extent defined in `SPEC.md`.
- **Rationale**: Cross-language parity is part of the original `datafn` spec and required for multi-backend adoption.
- **Acceptance criteria**:
  - Invalid JSON returns deterministic `DFQL_INVALID "Invalid JSON"` with `path:"$"`.
  - Idempotency uses `(namespace, clientId, mutationId)` and survives restarts with persistent adapter state.
- **Test vectors**: TV-PY-PARITY-001 (positive), TV-PY-PARITY-002 (negative)

---

### DOCS-SVELTE-001

- **ID**: DOCS-SVELTE-001
- **Priority**: P0
- **Statement**: `@datafn/svelte` README MUST include an end-to-end example using `createDatafnClient`, `client.<table>.signal(query)`, and `toSvelteStore`.
- **Rationale**: Audit found the Svelte README teaches hand-rolled signals and blocks intended adoption.
- **Acceptance criteria**:
  - README shows `createDatafnClient` and a real `table.signal(...)` call.
  - README does not require manual signal creation for the “happy path” example.
- **Test vectors**: TV-DOCS-SVELTE-001 (positive), TV-DOCS-SVELTE-002 (negative)

### DOCS-CLIENT-001

- **ID**: DOCS-CLIENT-001
- **Priority**: P1
- **Statement**: `@datafn/client` README MUST match the implemented public API (`remote` adapter, not `executor`) and MUST document table registry, query/mutate/transact/sync, plugins, and events.
- **Rationale**: Audit found client README out of sync with code.
- **Acceptance criteria**:
  - README includes a minimal working example using `remote`.
  - README documents event filter dimensions including `action/fields/contextKeys`.
- **Test vectors**: TV-DOCS-CLIENT-001 (positive), TV-DOCS-CLIENT-002 (negative)

### DOCS-CORE-001

- **ID**: DOCS-CORE-001
- **Priority**: P1
- **Statement**: `@datafn/core` README MUST correctly describe `validateSchema` as envelope-returning and MUST document `unwrapEnvelope`, `dfqlKey`, and event/filter types.
- **Rationale**: Audit found core README claims `validateSchema` throws.
- **Acceptance criteria**:
  - README examples match actual runtime behavior.
- **Test vectors**: TV-DOCS-CORE-001 (positive), TV-DOCS-CORE-002 (negative)

### DOCS-SERVER-001

- **ID**: DOCS-SERVER-001
- **Priority**: P1
- **Statement**: `@datafn/server` README MUST match implemented server configuration (`db: @superfunctions/db.Adapter`, envelope semantics, capabilities naming, REST enabling).
- **Rationale**: Audit found server README references `MemoryStore` and incorrect capabilities.
- **Acceptance criteria**:
  - README uses the canonical capability strings (`sync.*`).
  - README does not reference removed/inexistent APIs as the primary path.
- **Test vectors**: TV-DOCS-SERVER-001 (positive), TV-DOCS-SERVER-002 (negative)

