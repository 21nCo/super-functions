## datafn — Change Spec Requirements

This document defines the **normative requirements** for the change described in `SPEC.md`.

Hard rule: Every **MUST** requirement below includes acceptance criteria and references to at least:
- one **positive** test vector
- one **negative** test vector

---

## Table of contents (requirement IDs)

### P0 (MVP)

- CLIENT-API-001
- CLIENT-REG-001
- CLIENT-REG-002
- CLIENT-REMOTE-001
- CLIENT-QUERY-001
- CLIENT-TX-001
- CLIENT-MUT-001
- CLIENT-SUB-001
- CLIENT-SIGNAL-001
- CLIENT-SYNC-001
- DOC-001
- SERVER-DB-001
- SERVER-DB-002

### P1 / P2

- SERVER-SEED-001
- SERVER-ENVELOPE-001
- SERVER-STATUS-001
- SERVER-AUTH-001
- SERVER-CONFLICT-001
- SERVER-SYNC-001
- SERVER-SYNC-002
- SERVER-SYNC-003
- PLUG-CLIENT-001
- PLUG-SERVER-001
- SUB-EXTRA-001
- DFQL-OMIT-001
- DFQL-RELIDS-001
- DFQL-NESTEDSELECT-001
- DFQL-FILTER-PATH-001
- DFQL-FILTER-RELQ-001
- DFQL-HTREE-001
- DFQL-COUNT-001
- DFQL-GROUPBY-001
- DFQL-PAGE-BEFORE-001
- DFQL-FILTER-OPS-EXTRA-001
- SEARCH-PLUGIN-001
- STORAGE-ADAPTER-001
- STORAGE-MEM-001
- STORAGE-IDB-001
- CLIENT-OFFLINE-QUERY-001
- CLIENT-OFFLINE-MUT-001
- CLIENT-CHANGELOG-001
- CLIENT-SYNC-APPLY-001
- CLIENT-HYDRATION-001
- EXT-001
- CODEGEN-TS-001
- PY-SDK-001
- MIG-001
- API-GEN-REST-001
- API-GEN-GQL-001

---

## MVP scope (P0 only)

Only the following requirements are in MVP scope:

`CLIENT-API-001`, `CLIENT-REG-001`, `CLIENT-REG-002`, `CLIENT-REMOTE-001`, `CLIENT-QUERY-001`, `CLIENT-TX-001`, `CLIENT-MUT-001`, `CLIENT-SUB-001`, `CLIENT-SIGNAL-001`, `CLIENT-SYNC-001`, `DOC-001`, `SERVER-DB-001`, `SERVER-DB-002`.

---

## Requirements

### CLIENT-API-001

- **ID**: CLIENT-API-001
- **Priority**: P0
- **Statement**: `createDatafnClient` MUST validate `config.schema` using `@datafn/core.validateSchema` and MUST throw a `DatafnClientError` with `code: "SCHEMA_INVALID"` when schema validation fails.
- **Rationale**: A validated schema is required to deterministically construct table handles and reject unknown resources.
- **Acceptance criteria**:
  - Creating a client with a valid schema succeeds.
  - Creating a client with an invalid schema throws an error object `{ code:"SCHEMA_INVALID", message:"...", details:{ path:"..." } }`.
  - The thrown error is deterministic for a given invalid schema input (message + details.path).
- **Test vectors**: TV-CLIENT-001, TV-CLIENT-002
- **Notes**:
  - Exact error message text is specified in `TEST_VECTORS.md`.

### CLIENT-REG-001

- **ID**: CLIENT-REG-001
- **Priority**: P0
- **Statement**: A `DatafnClient` instance MUST expose a table registry supporting both `client.table(name)` and `client.<tableName>` property access for schema-declared resources.
- **Rationale**: This is the original v0 authoring surface (`datafn.<table>.query/...`) required by the project intent.
- **Acceptance criteria**:
  - `client.table("task")` returns a `DatafnTable` for declared resource `"task"`.
  - `client.task` returns a `DatafnTable` for declared resource `"task"`.
  - `client.table("task")` and `client.task` return the same object identity for the same table.
- **Test vectors**: TV-REG-001, TV-REG-003
- **Notes**:
  - Reserved keys needed for runtime safety (`then`, `toJSON`, etc.) are specified in `CLIENT-REG-002`.

### CLIENT-REG-002

- **ID**: CLIENT-REG-002
- **Priority**: P0
- **Statement**: The table registry MUST deterministically reject unknown table names by throwing `DatafnClientError` with `code:"DFQL_UNKNOWN_RESOURCE"` while allowing access to reserved non-table keys without throwing.
- **Rationale**: Typos must fail fast, but the Proxy must not break common JS runtime behaviors.
- **Acceptance criteria**:
  - `client.table("nope")` throws `{ code:"DFQL_UNKNOWN_RESOURCE", details:{ path:"resource", resource:"nope" } }`.
  - `client.nope` throws the same error shape as `client.table("nope")`.
  - Accessing reserved keys (at minimum: `"then"`, `"toJSON"`, and `"inspect"`) does not throw and returns `undefined` unless the client defines those properties.
- **Test vectors**: TV-REG-003, TV-REG-004
- **Notes**:
  - This requirement applies only to **string** property names; symbol behavior is Undefined.

### CLIENT-REMOTE-001

- **ID**: CLIENT-REMOTE-001
- **Priority**: P0
- **Statement**: The client MUST accept successful remote responses in either wrapped `DatafnEnvelope` form or unwrapped form and MUST throw `DatafnClientError` with `code:"TRANSPORT_ERROR"` when the remote response cannot be interpreted.
- **Rationale**: Current server returns `DatafnEnvelope`, but legacy consumers may return unwrapped results; the client must interoperate.
- **Acceptance criteria**:
  - If remote returns `{ ok:true, result:<X> }`, the client treats `<X>` as the result.
  - If remote returns an object containing `data` and `nextCursor` (unwrapped query result), the client treats it as the result.
  - If remote returns `{ ok:false, error:{code,message,details} }`, the client throws `{ code:<mapped>, message, details:{ path: details.path } }`.
  - If remote returns any other shape, the client throws `{ code:"TRANSPORT_ERROR", details:{ path:"$" } }`.
- **Test vectors**: TV-REMOTE-001, TV-REMOTE-002
- **Notes**:
  - Error handling for unwrapped error shapes is Undefined; they are treated as transport errors.

### CLIENT-QUERY-001

- **ID**: CLIENT-QUERY-001
- **Priority**: P0
- **Statement**: `DatafnTable.query` MUST merge `resource` and `version` from the table handle, call `remote.query`, and return a `DatafnQueryResult` (or array) preserving request order.
- **Rationale**: Table handles must provide a safe, ergonomic query surface without repeating resource/version.
- **Acceptance criteria**:
  - `table.query({ select:["id"] })` sends `{ resource: table.name, version: table.version, select:["id"] }` to remote.
  - If the query fragment includes `resource` or `version`, those keys are ignored in favor of the table’s values.
  - Batch queries preserve ordering: the i-th response corresponds to the i-th request.
  - On remote error (`ok:false` envelope), `table.query` throws `DatafnClientError` with mapped code and deterministic message/path.
- **Test vectors**: TV-QUERY-001, TV-QUERY-002
- **Notes**:
  - Local-first execution is specified separately (CLIENT-OFFLINE-001) and is out of MVP.

### CLIENT-TX-001

- **ID**: CLIENT-TX-001
- **Priority**: P0
- **Statement**: `client.transact(...)` and `DatafnTable.transact(...)` MUST delegate to `remote.transact(...)`, unwrap wrapped `DatafnEnvelope` responses, and MUST throw `DatafnClientError` with `code:"TRANSPORT_ERROR"` for unexpected response shapes.
- **Rationale**: Transactions are part of the original v0 surface and are required for multi-step updates without bespoke endpoints.
- **Acceptance criteria**:
  - `client.transact(t)` calls `remote.transact(t)` exactly once.
  - `table.transact(t)` calls `remote.transact(t)` exactly once and does not modify the payload.
  - Wrapped success responses are unwrapped to the transaction result object.
  - Wrapped error responses (`ok:false`) are thrown as `DatafnClientError` with mapped code/message/path.
  - Unrecognized remote response shapes throw `TRANSPORT_ERROR` with `details.path:"$"`.
- **Test vectors**: TV-TX-001, TV-TX-002
- **Notes**:
  - Table transact does not inject `resource`/`version` (it is an alias to client transact).

### CLIENT-MUT-001

- **ID**: CLIENT-MUT-001
- **Priority**: P0
- **Statement**: `DatafnTable.mutate` MUST merge `resource` and `version`, call `remote.mutation`, return the unwrapped mutation result(s), and MUST emit deterministic `mutation_applied`/`mutation_rejected` events.
- **Rationale**: Mutations are the key driver of reactivity and sync; events are required for UI updates.
- **Acceptance criteria**:
  - For `ok:true` mutation results, the client emits `mutation_applied` with `resource`, `ids`, `mutationId`, `clientId` (when present), and `timestampMs`.
  - For `ok:false` mutation results or thrown remote errors, the client emits `mutation_rejected` with an error object in `context`.
  - Event `ids` is always an array of strings (even for a single id).
  - `timestampMs` equals `config.getTimestamp()` when provided.
- **Test vectors**: TV-MUT-001, TV-MUT-002
- **Notes**:
  - Offline mutation logging is specified separately (CLIENT-OFFLINE-001).

### CLIENT-SUB-001

- **ID**: CLIENT-SUB-001
- **Priority**: P0
- **Statement**: `DatafnTable.subscribe(handler, filter?)` MUST subscribe to the client’s global event bus and MUST behave as if `resource: table.name` was AND-ed into the filter.
- **Rationale**: Per-table subscriptions are required by the v0 intent for fine-grained reactivity.
- **Acceptance criteria**:
  - Events for other resources are not delivered to `table.subscribe(...)`.
  - A user-provided `filter.resource` is ignored and replaced with the table’s resource name.
  - Unsubscribe stops delivery.
- **Test vectors**: TV-SUB-001, TV-SUB-002
- **Notes**:
  - Filter semantics for `ids`, `type`, `mutationId` follow `@datafn/core` `DatafnEventFilter`.

### CLIENT-SIGNAL-001

- **ID**: CLIENT-SIGNAL-001
- **Priority**: P0
- **Statement**: `DatafnTable.signal(query)` MUST return a cached `DatafnSignal` keyed by `dfqlKey(fullQuery)` and MUST re-fetch on `mutation_applied` events for the same resource with deterministic de-duplication.
- **Rationale**: Signal-backed reactive queries are the primary declarative binding mechanism (Svelte-first v0).
- **Acceptance criteria**:
  - Calling `table.signal(q)` twice with semantically equivalent queries returns the same signal object identity.
  - The first `subscribe(...)` triggers an initial fetch and eventually delivers the fetched result.
  - On a `mutation_applied` event for the same resource, the signal re-fetches and notifies subscribers if the fetch succeeds.
  - If a refresh fetch fails, the signal value remains unchanged and subscribers are not notified.
  - Multiple events while a fetch is in flight produce at most one additional fetch after the in-flight fetch completes.
- **Test vectors**: TV-SIGNAL-001, TV-SIGNAL-002
- **Notes**:
  - Refresh on related-resource mutations (relation expansion dependency tracking) is P1/P2.

### CLIENT-SYNC-001

- **ID**: CLIENT-SYNC-001
- **Priority**: P0
- **Statement**: The client MUST expose `client.sync.seed/clone/pull/push` methods that delegate to the remote adapter and return the remote responses unmodified (except for unwrapping `DatafnEnvelope` when present).
- **Rationale**: Sync methods are part of the v0 surface even before local persistence is added.
- **Acceptance criteria**:
  - Each method exists and calls the corresponding remote method exactly once.
  - Wrapped responses are unwrapped; unwrapped successes are returned as-is.
  - Missing remote methods cause a `TRANSPORT_ERROR`.
- **Test vectors**: TV-SYNC-001, TV-SYNC-002
- **Notes**:
  - Applying clone/pull results into local storage is specified in CLIENT-SYNC-APPLY-001 (P2).

### DOC-001

- **ID**: DOC-001
- **Priority**: P0
- **Statement**: The `@datafn/svelte` README MUST include an end-to-end example using `createDatafnClient`, `client.<table>.signal(query)`, and `toSvelteStore` without requiring hand-rolled signals.
- **Rationale**: The current documentation is disconnected from the intended client API and blocks adoption.
- **Acceptance criteria**:
  - README shows a minimal working snippet where a query signal is created from the client API (not manual signal creation).
  - README’s code uses the canonical server response shape it expects (wrapped or unwrapped is explicit).
  - README’s example uses a single source of truth for schema + client creation.
- **Test vectors**: TV-DOC-001, TV-DOC-003
- **Notes**:
  - This requirement is satisfied by documentation changes; verification is manual review.

### SERVER-DB-001

- **ID**: SERVER-DB-001
- **Priority**: P0
- **Statement**: `@datafn/server` MUST accept a `db` value that is a `@superfunctions/db.Adapter` and MUST execute DFQL `query`, `mutation`, and `transact` operations against that adapter (not only an in-memory store).
- **Rationale**: The original intent requires DB abstraction via `@superfunctions/db` for real persistence; the current server uses an in-memory store only.
- **Acceptance criteria**:
  - When configured with a `@superfunctions/db` memory adapter, `/datafn/mutation` inserts a record and `/datafn/query` can read it back.
  - `createDatafnServer` calls `db.initialize()` exactly once during startup.
  - If `db.isHealthy()` returns `{ healthy:false }`, `/datafn/status` returns `ok:false` with `INTERNAL` and does not claim healthy capabilities.
  - If `db` is missing, `/datafn/query|mutation|transact|clone|pull|push|seed` return `ok:false` with `INTERNAL` and deterministic message `Internal error`.
- **Test vectors**: TV-DB-001, TV-DB-002
- **Notes**:
  - Durability guarantees depend on the configured adapter (memory adapter is not durable); this requirement is about using the adapter abstraction.

### SERVER-DB-002

- **ID**: SERVER-DB-002
- **Priority**: P0
- **Statement**: When configured with a `@superfunctions/db.Adapter`, the server MUST store idempotency state for `(clientId, mutationId)` in adapter-backed storage so that dedupe survives process restarts.
- **Rationale**: Idempotency is required for offline retry and push; in-memory idempotency breaks correctness across restarts.
- **Acceptance criteria**:
  - Applying the same `(clientId, mutationId)` mutation twice returns `deduped:true` the second time even after a server restart using the same persistent adapter state.
  - The idempotency table enforces uniqueness on `(clientId, mutationId)` (duplicate inserts are handled deterministically).
- **Test vectors**: TV-IDEMP-001, TV-IDEMP-002
- **Notes**:
  - This requirement implies a canonical internal table schema; it is specified in `SPEC.md`.

---

## P1 / P2 (non-MVP) requirements

### SERVER-SEED-001

- **ID**: SERVER-SEED-001
- **Priority**: P1
- **Statement**: `@datafn/server` MUST expose `POST /datafn/seed` accepting `{ clientId: string }` and returning `DatafnEnvelope<{ ok: true }>` and MUST reject missing/invalid `clientId` with `DFQL_INVALID`.
- **Rationale**: The original intent includes `seed` as a first-class sync primitive for initial dataset creation on signup.
- **Acceptance criteria**:
  - Request body must be a JSON object with `clientId` string.
  - Success response is `{ ok:true, result:{ ok:true } }`.
  - On invalid body or missing/invalid `clientId`, response is `{ ok:false, error:{ code:"DFQL_INVALID", message:"...", details:{ path:"..." } } }`.
- **Test vectors**: TV-SEED-001, TV-SEED-002
- **Notes**:
  - Seeded data content is produced by the host app and/or plugins; the default implementation MAY be a no-op that still records that seed has been executed for idempotency.

### SERVER-ENVELOPE-001

- **ID**: SERVER-ENVELOPE-001
- **Priority**: P1
- **Statement**: All `@datafn/server` endpoints MUST return top-level `DatafnEnvelope` responses and MUST represent request-level failures using `ok:false` envelopes (not `ok:true` with embedded `result.ok:false`).
- **Rationale**: Today’s sync endpoints use inconsistent “nested ok/error” shapes that break client error handling and determinism.
- **Acceptance criteria**:
  - Invalid JSON bodies yield `{ ok:false, error:{ code:"DFQL_INVALID", message:"Invalid JSON", details:{ path:"$" } } }`.
  - Missing required fields yield `{ ok:false, error:{ code:"DFQL_INVALID", message:"...", details:{ path:"<field>" } } }`.
  - Endpoints that return per-item results (e.g. `/datafn/mutation`) MAY use `ok:true` at the top level and represent item errors inside `result`, but parse/validation failures MUST still be `ok:false`.
- **Test vectors**: TV-SERVER-ENV-001, TV-SERVER-ENV-002
- **Notes**:
  - This requirement does not change the inner DFQL envelopes (`QueryResult`, `MutationResult`, etc.); it standardizes the HTTP response wrapper behavior.

### SERVER-STATUS-001

- **ID**: SERVER-STATUS-001
- **Priority**: P1
- **Statement**: `GET /datafn/status` MUST advertise accurate `capabilities[]` for the configured server and MUST return `ok:false` with `INTERNAL` when the configured DB adapter is unhealthy.
- **Rationale**: Clients need a reliable capability/health signal to safely use query/mutation/sync features.
- **Acceptance criteria**:
  - When the server is configured with working query+mutation+transact+sync routes, `capabilities` includes: `dfql.query`, `dfql.mutation`, `dfql.transact`, `sync.seed`, `sync.clone`, `sync.pull`, `sync.push`.
  - When `db.isHealthy().healthy === false`, the response is `ok:false` with `error.code:"INTERNAL"` and deterministic `error.message:"Internal error"`.
- **Test vectors**: TV-STATUS-001, TV-STATUS-002
- **Notes**:
  - Capability naming is normative here (string set is fixed).

### SERVER-AUTH-001

- **ID**: SERVER-AUTH-001
- **Priority**: P1
- **Statement**: The server MUST call `authorize(ctx, action, payload)` with the parsed request payload for every `/datafn/*` endpoint and MUST return `FORBIDDEN` when authorization denies.
- **Rationale**: The current implementation passes `payload: null`, preventing hosts from implementing meaningful policies.
- **Acceptance criteria**:
  - `authorize` is called exactly once per request before any execution side effects.
  - `payload` equals the parsed JSON body for `POST` endpoints and `null` for `GET /datafn/status`.
  - When authorization denies, response is `ok:false` with `error.code:"FORBIDDEN"` and `details.path:"$"`.
- **Test vectors**: TV-AUTH-001, TV-AUTH-002
- **Notes**:
  - Field-level authorization is implemented via plugins and/or host request shaping and is specified separately (PLUG-SERVER-001, SUB-EXTRA-001).

### SERVER-CONFLICT-001

- **ID**: SERVER-CONFLICT-001
- **Priority**: P1
- **Statement**: The server MUST assign a monotonic `serverSeq` ordering per namespace for all applied mutations and MUST resolve concurrent writes to the same record using last-write-wins by `serverSeq`.
- **Rationale**: The original intent requires deterministic LWW by server ordering for sync conflict defaults.
- **Acceptance criteria**:
  - Each applied mutation increments `serverSeq` and persists it in the change tracking log.
  - When two mutations write the same field of the same record, the mutation with higher `serverSeq` is the final stored value.
  - Client-provided timestamps MUST NOT affect conflict ordering.
- **Test vectors**: TV-CONFLICT-001, TV-CONFLICT-002
- **Notes**:
  - `serverSeq` is an integer counter stored per namespace.

### SERVER-SYNC-001

- **ID**: SERVER-SYNC-001
- **Priority**: P1
- **Statement**: `POST /datafn/clone` MUST accept `{ clientId, tables? }` and MUST return a full snapshot of requested tables and per-table cursors derived from the server’s change tracking state.
- **Rationale**: Clone is required for initial hydration.
- **Acceptance criteria**:
  - Request body must include `clientId: string`.
  - Response `result.data[table]` is ordered deterministically by `id:asc`.
  - Response `result.cursors[table]` is a base-10 integer string representing the latest `serverSeq` observed for that table.
  - Tables marked `isRemoteOnly:true` are rejected with `DFQL_INVALID`.
- **Test vectors**: TV-SERVER-CLONE-001, TV-SERVER-CLONE-002
- **Notes**:
  - Snapshot is scoped to the namespace resolved from request context.

### SERVER-SYNC-002

- **ID**: SERVER-SYNC-002
- **Priority**: P1
- **Statement**: `POST /datafn/pull` MUST accept `{ clientId, cursors }` and MUST return all changes since per-table cursors using the server’s change tracking log and MUST advance cursors monotonically.
- **Rationale**: Pull is the core incremental sync-down primitive.
- **Acceptance criteria**:
  - Request body must include `clientId: string`.
  - Response includes `records`, `deleted`, and updated `cursors` for each requested table.
  - Returned cursors are monotonic per table.
  - Invalid cursor values are rejected with `DFQL_INVALID`.
- **Test vectors**: TV-SERVER-PULL-001, TV-SERVER-PULL-002
- **Notes**:
  - Change tracking format is specified in `SPEC.md` as internal tables.

### SERVER-SYNC-003

- **ID**: SERVER-SYNC-003
- **Priority**: P1
- **Statement**: `POST /datafn/push` MUST accept `{ clientId, mutations }`, MUST apply a batch of mutations idempotently, and MUST write change tracking entries so subsequent `pull` calls observe the effects.
- **Rationale**: Push enables offline mutation logs and durable synchronization.
- **Acceptance criteria**:
  - Request body must include `clientId: string`.
  - Response includes `applied[]` mutationIds and `errors[]` entries for rejected mutations.
  - For each applied mutation, corresponding change tracking entries exist for affected tables and records.
  - Replaying the same `(clientId, mutationId)` does not create duplicate change tracking entries.
- **Test vectors**: TV-SERVER-PUSH-001, TV-SERVER-PUSH-002
- **Notes**:
  - Push uses the same mutation schema as `/datafn/mutation`.

### PLUG-CLIENT-001

- **ID**: PLUG-CLIENT-001
- **Priority**: P1
- **Statement**: The client MUST execute `DatafnPlugin` hooks in registration order and MUST apply deterministic fail-closed vs fail-open behavior as specified in `SPEC.md`.
- **Rationale**: Plugins are required for auth shaping, analytics, search indexing, and custom conflict policies.
- **Acceptance criteria**:
  - Hooks run in registration order.
  - `beforeQuery` and `beforeMutation` failures are fail-closed (the operation fails).
  - `afterQuery` and `afterMutation` failures are fail-open by default (operation result is returned), unless configured fail-closed for that plugin.
- **Test vectors**: TV-PLUG-CLIENT-001, TV-PLUG-CLIENT-002
- **Notes**:
  - Determinism rules for plugin post-processing are specified in `SPEC.md`.

### PLUG-SERVER-001

- **ID**: PLUG-SERVER-001
- **Priority**: P1
- **Statement**: The server MUST execute `DatafnPlugin` hooks in registration order around query/mutation/transact/sync and MUST preserve determinism for equivalent inputs.
- **Rationale**: Server-side plugins are required for `searchfn` delegation and indexing, file URL resolution, and custom policies.
- **Acceptance criteria**:
  - `beforeQuery` can transform the query but must keep it schema-valid.
  - `afterQuery` may post-process results but MUST NOT reorder arrays or inject non-deterministic values.
  - Hook ordering is deterministic.
- **Test vectors**: TV-PLUG-SERVER-001, TV-PLUG-SERVER-002
- **Notes**:
  - Determinism rules are enforced by tests for stable ordering.

### SUB-EXTRA-001

- **ID**: SUB-EXTRA-001
- **Priority**: P1
- **Statement**: Event emission and subscription filtering MUST support `action`, `fields`, and `contextKeys` filters in addition to `type/resource/ids/mutationId`.
- **Rationale**: Fine-grained subscriptions are required to avoid excessive re-fetching in reactive UIs.
- **Acceptance criteria**:
  - `mutation_applied` events include `action` equal to the mutation operation and `fields` equal to changed field names.
  - Filters can match by `action` (string or array) and by `fields` (any intersection).
  - Filters can match by `contextKeys` requiring those keys to be present in `event.context` when `context` is an object.
- **Test vectors**: TV-SUB-EXTRA-001, TV-SUB-EXTRA-002
- **Notes**:
  - This requires extending `@datafn/core` `DatafnEvent` and `DatafnEventFilter`.

### DFQL-OMIT-001

- **ID**: DFQL-OMIT-001
- **Priority**: P1
- **Statement**: The server MUST implement DFQL `omit` to remove specified fields from all returned records (including expanded relation records and join rows) deterministically.
- **Rationale**: `omit` is part of the DFQL contract and is required for privacy/performance.
- **Acceptance criteria**:
  - When `omit` contains a field, that field is absent from output even if selected implicitly.
  - Omitting `id` has no effect (id is always present).
  - Unknown omitted fields are rejected with `DFQL_UNKNOWN_FIELD`.
- **Test vectors**: TV-DFQL-OMIT-001, TV-DFQL-OMIT-002
- **Notes**:
  - `omit` applies after selection materialization.

### DFQL-RELIDS-001

- **ID**: DFQL-RELIDS-001
- **Priority**: P1
- **Statement**: The server MUST implement ids-only relation selection tokens (e.g. `tags`) returning related record id(s) according to relation cardinality.
- **Rationale**: DFQL requires explicit relation expansion; ids-only is the lightest form.
- **Acceptance criteria**:
  - For `many-one`, ids-only returns a single id or `null`.
  - For `one-many` and `many-many`, ids-only returns an array of ids.
  - For `many-many`, ids are ordered deterministically (by `order` metadata if present, else by id).
- **Test vectors**: TV-DFQL-RELIDS-001, TV-DFQL-RELIDS-002
- **Notes**:
  - This is distinct from `relation.#` join rows and `relation.*` expansions.

### DFQL-NESTEDSELECT-001

- **ID**: DFQL-NESTEDSELECT-001
- **Priority**: P1
- **Statement**: The server MUST implement nested select traversal tokens (e.g. `tasks.tags.*`) by implicitly expanding intermediate relations and applying descendant selections deterministically.
- **Rationale**: Nested relation expansion is a core DFQL capability described in `dfql.intent.md`.
- **Acceptance criteria**:
  - A token like `tasks.tags.*` expands `tasks` as records and expands `tags.*` inside each task.
  - Intermediate expansions include at least `id` and the fields required by descendant tokens.
  - Output ordering rules for each expanded array are deterministic.
- **Test vectors**: TV-DFQL-NESTED-001, TV-DFQL-NESTED-002
- **Notes**:
  - This requirement does not add per-relation nested sort blocks; ordering defaults apply.

### DFQL-FILTER-PATH-001

- **ID**: DFQL-FILTER-PATH-001
- **Priority**: P1
- **Statement**: The server MUST support dot-path filter keys (e.g. `parent.id`) across nested objects and relations with default ANY-match semantics when traversing multi-row relations.
- **Rationale**: DFQL filters explicitly support nested field paths in the intent spec.
- **Acceptance criteria**:
  - For nested objects, `a.b` matches when the nested value matches.
  - For relation-crossing paths over `one-many`/`many-many`, a match occurs when **any** related row matches (default ANY semantics).
- **Test vectors**: TV-DFQL-FILTERPATH-001, TV-DFQL-FILTERPATH-002
- **Notes**:
  - Explicit ALL/NONE semantics are specified in DFQL-FILTER-RELQ-001.

### DFQL-FILTER-RELQ-001

- **ID**: DFQL-FILTER-RELQ-001
- **Priority**: P2
- **Statement**: The server MUST implement relation filter blocks with quantifiers `$any`, `$all`, and `$none` as defined in `dfql.intent.md`.
- **Rationale**: Complex relation filtering is required for parity with existing apps and is explicitly described in DFQL intent.
- **Acceptance criteria**:
  - `$any` matches when at least one related row matches the nested filter block.
  - `$all` matches when all related rows match the nested filter block (and false when there are zero related rows).
  - `$none` matches when no related rows match the nested filter block (and true when there are zero related rows).
- **Test vectors**: TV-DFQL-RELQ-001, TV-DFQL-RELQ-002
- **Notes**:
  - Quantifier blocks are only valid for relations that yield multiple rows (`one-many`, `many-many`, `htree` children).

### DFQL-HTREE-001

- **ID**: DFQL-HTREE-001
- **Priority**: P1
- **Statement**: The server MUST implement DFQL `htree` select semantics for `parent.*`, `children.*`, and `children.**` using materialized-path storage as specified in `SPEC.md`.
- **Rationale**: Hierarchical trees are a first-class DFQL relation type.
- **Acceptance criteria**:
  - `parent.*` returns an ordered ancestor chain (root → immediate parent) as records.
  - `children.*` returns immediate children as records.
  - `children.**` returns all descendants as records with deterministic ordering.
- **Test vectors**: TV-HTREE-001, TV-HTREE-002
- **Notes**:
  - Materialized path delimiter and field name inference rules are specified in `SPEC.md`.

### DFQL-COUNT-001

- **ID**: DFQL-COUNT-001
- **Priority**: P1
- **Statement**: When `count: true` is specified, the server MUST include `count` in the query result equal to the total number of rows matching filters before pagination.
- **Rationale**: Count is required for pagination UIs.
- **Acceptance criteria**:
  - `count` ignores `limit` and `offset`.
  - For batch queries, each result includes its own `count` when requested.
- **Test vectors**: TV-DFQL-COUNT-001, TV-DFQL-COUNT-002
- **Notes**:
  - Aggregate queries prefer aggregation counts; this requirement applies to non-aggregate queries.

### DFQL-GROUPBY-001

- **ID**: DFQL-GROUPBY-001
- **Priority**: P2
- **Statement**: The server MUST implement DFQL `groupBy`, `aggregations`, and `having` for aggregate queries and MUST reject relation expansion tokens when `groupBy` is present.
- **Rationale**: Aggregations are described in DFQL intent and reduce client-side compute.
- **Acceptance criteria**:
  - Aggregate queries return `{ groups: [...], nextCursor }`.
  - `having` filters grouped rows on group keys or aggregation aliases.
  - Relation expansions in `select` are rejected with `DFQL_UNSUPPORTED`.
- **Test vectors**: TV-DFQL-GROUP-001, TV-DFQL-GROUP-002
- **Notes**:
  - Grouped-row cursor pagination is optional and may return `nextCursor:null` in v0.

### DFQL-PAGE-BEFORE-001

- **ID**: DFQL-PAGE-BEFORE-001
- **Priority**: P2
- **Statement**: The server MUST support cursor backwards pagination using `cursor.before` when `sort` includes `id` as a tie-breaker.
- **Rationale**: Backwards pagination is part of the DFQL cursor shape.
- **Acceptance criteria**:
  - With `cursor.before`, the server returns rows strictly before the cursor.
  - The same sort validation rules apply as for `cursor.after`.
- **Test vectors**: TV-DFQL-BEFORE-001, TV-DFQL-BEFORE-002
- **Notes**:
  - Backwards pagination semantics are deterministic and do not require returning a previous cursor in v0.

### DFQL-FILTER-OPS-EXTRA-001

- **ID**: DFQL-FILTER-OPS-EXTRA-001
- **Priority**: P2
- **Statement**: The server MUST implement additional DFQL filter operators defined in `dfql.intent.md` (`in`, `not_in`, `not_like`, `not_ilike`, `before`, `after`, `between`, `not_between`, `is_empty`, `is_not_empty`).
- **Rationale**: These operators are part of the DFQL contract and are needed for parity with existing apps.
- **Acceptance criteria**:
  - Each operator has deterministic semantics.
  - Unknown operators are rejected with `DFQL_UNSUPPORTED`.
- **Test vectors**: TV-DFQL-OPS-001, TV-DFQL-OPS-002
- **Notes**:
  - Date operator inputs are ISO-8601 strings in v0.

### SEARCH-PLUGIN-001

- **ID**: SEARCH-PLUGIN-001
- **Priority**: P2
- **Statement**: When a `searchfn` plugin is installed, the server MUST support the DFQL `search` block by delegating candidate selection to the plugin and then applying DFQL filters/sort/pagination deterministically to that candidate id set.
- **Rationale**: Search delegation and index updates are explicitly required by the original intent.
- **Acceptance criteria**:
  - If `search` is present and no search plugin is installed, the query is rejected with `DFQL_UNSUPPORTED`.
  - If a plugin returns candidate ids, only those ids are considered for result rows.
  - Filters and pagination are applied deterministically after candidate restriction.
- **Test vectors**: TV-SEARCH-001, TV-SEARCH-002
- **Notes**:
  - Index update on mutation is specified as a plugin hook requirement (PLUG-SERVER-001).

### STORAGE-ADAPTER-001

- **ID**: STORAGE-ADAPTER-001
- **Priority**: P2
- **Statement**: The client MUST support a storage adapter interface capable of persisting records, join rows, per-table cursors, hydration states, and an offline change log.
- **Rationale**: Local-first behavior requires a deterministic persistence interface.
- **Acceptance criteria**:
  - Adapter supports: `get/set/delete` records, query by filters/sort, read/write join rows, read/write cursors, read/write hydration state, append/list/ack change log.
  - Adapter operations are deterministic for the same inputs.
- **Test vectors**: TV-STORAGE-001, TV-STORAGE-002
- **Notes**:
  - Exact interface is specified in `SPEC.md` under “Client storage adapter”.

### STORAGE-MEM-001

- **ID**: STORAGE-MEM-001
- **Priority**: P2
- **Statement**: The client MUST provide a memory storage adapter implementation that conforms to `STORAGE-ADAPTER-001` for tests/dev.
- **Rationale**: Needed for deterministic unit tests and serverless runtimes.
- **Acceptance criteria**:
  - Memory adapter passes the storage contract vectors.
- **Test vectors**: TV-STORAGE-001, TV-STORAGE-003
- **Notes**:
  - Persistence is not durable; determinism is still required.

### STORAGE-IDB-001

- **ID**: STORAGE-IDB-001
- **Priority**: P2
- **Statement**: The client MUST provide an IndexedDB storage adapter implementation that conforms to `STORAGE-ADAPTER-001` and persists data across reloads.
- **Rationale**: Browser local-first requires IndexedDB.
- **Acceptance criteria**:
  - IndexedDB adapter passes the storage contract vectors.
  - Data persists across adapter re-instantiation with the same database name.
- **Test vectors**: TV-STORAGE-IDB-001, TV-STORAGE-IDB-002
- **Notes**:
  - Tests may use `fake-indexeddb`.

### CLIENT-OFFLINE-QUERY-001

- **ID**: CLIENT-OFFLINE-QUERY-001
- **Priority**: P2
- **Statement**: When offlinability is enabled, `DatafnTable.query` MUST execute locally against the storage adapter for tables in `ready` state and MUST use remote fallback for tables in `hydrating` state while preserving deterministic DFQL semantics.
- **Rationale**: This is required for offline-first UIs and large initial clones.
- **Acceptance criteria**:
  - For `ready` tables, queries do not call the remote adapter.
  - For `hydrating` tables, queries call remote and apply DFQL filters/sort/pagination consistently.
- **Test vectors**: TV-OFFLINE-QUERY-001, TV-OFFLINE-QUERY-002
- **Notes**:
  - Remote fallback combination rules are specified in `SPEC.md`.

### CLIENT-OFFLINE-MUT-001

- **ID**: CLIENT-OFFLINE-MUT-001
- **Priority**: P2
- **Statement**: When offlinability is enabled and remote mutation fails, `DatafnTable.mutate` MUST apply an optimistic local write and MUST append the mutation to the offline change log for later push.
- **Rationale**: Offline mutation logging is required for reliable sync.
- **Acceptance criteria**:
  - Mutation is recorded in change log with `(clientId, mutationId)` and deterministic ordering.
  - Local storage reflects the optimistic change immediately.
- **Test vectors**: TV-OFFLINE-MUT-001, TV-OFFLINE-MUT-002
- **Notes**:
  - Conflict resolution for later push is handled by server conflict rules (SERVER-CONFLICT-001).

### CLIENT-CHANGELOG-001

- **ID**: CLIENT-CHANGELOG-001
- **Priority**: P2
- **Statement**: The client MUST persist an offline change log as an ordered list of DFQL mutations with deterministic de-duplication by `(clientId, mutationId)`.
- **Rationale**: Change logs are the unit of sync-up via push.
- **Acceptance criteria**:
  - Re-adding the same `(clientId, mutationId)` is idempotent.
  - The stored ordering is stable and deterministic.
- **Test vectors**: TV-CHANGELOG-001, TV-CHANGELOG-002
- **Notes**:
  - The change log schema is specified in `SPEC.md`.

### CLIENT-SYNC-APPLY-001

- **ID**: CLIENT-SYNC-APPLY-001
- **Priority**: P2
- **Statement**: The client MUST apply `clone` and `pull` results into local storage deterministically and MUST update per-table cursors accordingly.
- **Rationale**: Without deterministic application, local-first queries diverge across clients.
- **Acceptance criteria**:
  - Records are upserted by id.
  - Deleted ids are removed.
  - Cursors are updated only forward.
- **Test vectors**: TV-CLIENT-SYNC-APPLY-001, TV-CLIENT-SYNC-APPLY-002
- **Notes**:
  - Application order rules are specified in `SPEC.md`.

### CLIENT-HYDRATION-001

- **ID**: CLIENT-HYDRATION-001
- **Priority**: P2
- **Statement**: The client MUST maintain per-table hydration state `{ notStarted | hydrating | ready }` and MUST expose this state for observability and deterministic query routing.
- **Rationale**: Required for large clones and extension contexts.
- **Acceptance criteria**:
  - On startup before clone, tables are `notStarted`.
  - During clone application, tables are `hydrating`.
  - After clone applied, tables transition to `ready`.
- **Test vectors**: TV-HYDRATION-001, TV-HYDRATION-002
- **Notes**:
  - State storage location is specified in `STORAGE-ADAPTER-001`.

### EXT-001

- **ID**: EXT-001
- **Priority**: P2
- **Statement**: The client MUST support extension contexts by providing an RPC transport that forwards DFQL queries/mutations/subscriptions to a background-owned runtime using a canonical message envelope.
- **Rationale**: Nucleus/extension adoption depends on this architecture.
- **Acceptance criteria**:
  - Content/sidepanel calls are forwarded to background and responses are returned in-order.
  - Subscription events are forwarded from background to clients deterministically.
  - Unknown RPC methods are rejected with deterministic error code.
- **Test vectors**: TV-EXT-001, TV-EXT-002
- **Notes**:
  - The canonical RPC envelope is specified in `SPEC.md`.

### CODEGEN-TS-001

- **ID**: CODEGEN-TS-001
- **Priority**: P2
- **Statement**: The project MUST provide a deterministic TypeScript code generator that converts a `DatafnSchema` into typed table handles and record types.
- **Rationale**: The original intent promises “type-safe client APIs generated from schemas”.
- **Acceptance criteria**:
  - Given a schema JSON, the generator outputs a stable `.ts` file with record interfaces and a typed client/table registry.
  - Invalid schema input is rejected deterministically.
- **Test vectors**: TV-CODEGEN-001, TV-CODEGEN-002
- **Notes**:
  - Generator may be delivered as `@datafn/cli` or a library module; output format is specified in `SPEC.md`.

### PY-SDK-001

- **ID**: PY-SDK-001
- **Priority**: P2
- **Statement**: The repo MUST include a Python server-only SDK package `datafn` that exposes `create_datafn_server` and mounts the canonical `/datafn/*` endpoints with the same wire semantics as `@datafn/server`.
- **Rationale**: The original spec includes Python parity for hosting datafn endpoints.
- **Acceptance criteria**:
  - Importing `datafn` works and `create_datafn_server` returns an object exposing `routes` with the expected paths/methods.
  - Schema validation failures are surfaced deterministically.
- **Test vectors**: TV-PY-001, TV-PY-002
- **Notes**:
  - Client runtime parity is out of scope for Python (server-only).

### MIG-001

- **ID**: MIG-001
- **Priority**: P2
- **Statement**: The project MUST provide schema migration tooling that can diff schema versions and generate deterministic migration scripts for supported DBs.
- **Rationale**: Schema evolution is required for real deployments and is promised in the original spec.
- **Acceptance criteria**:
  - Given schema v1 and v2, the tool outputs a deterministic migration plan.
  - Invalid diffs (e.g. conflicting field renames) produce deterministic errors.
- **Test vectors**: TV-MIG-001, TV-MIG-002
- **Notes**:
  - Support target DB: Postgres first; SQLite optional.

### API-GEN-REST-001

- **ID**: API-GEN-REST-001
- **Priority**: P2
- **Statement**: The server MUST support schema-driven REST wrappers for DFQL query/mutation as described in the original spec (`/datafn/resources/:table`).
- **Rationale**: REST wrappers enable incremental adoption without teaching DFQL to every consumer.
- **Acceptance criteria**:
  - `GET /datafn/resources/:table` performs a query wrapper.
  - `POST /datafn/resources/:table` performs an insert/merge wrapper.
  - Requests referencing unknown tables are rejected deterministically.
- **Test vectors**: TV-REST-001, TV-REST-002
- **Notes**:
  - Parameter encoding rules are specified in `SPEC.md`.

### API-GEN-GQL-001

- **ID**: API-GEN-GQL-001
- **Priority**: P2
- **Statement**: The server SHOULD support generating a GraphQL schema and resolvers from the datafn schema, mapping selection sets to DFQL `select`.
- **Rationale**: GraphQL support is explicitly optional in the original spec.
- **Acceptance criteria**:
  - GraphQL generation output is deterministic for a given schema.
- **Test vectors**: N/A
- **Notes**:
  - This is optional; if implemented, a future spec should add vectors.

