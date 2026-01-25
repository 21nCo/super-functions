## datafn — Requirements

This document is the **single source of truth** for normative requirements. All requirement IDs referenced here are testable via `TEST_VECTORS.md`.

---

## Table of contents (requirement IDs)

### P0 (MVP)

- API-001
- SCHEMA-001
- QUERY-001
- QUERY-002
- QUERY-003
- QUERY-004
- DETERMINISM-001
- MUT-001
- MUT-002
- MUT-003
- MUT-004
- TX-001
- NORM-001
- EVENTS-001
- SYNC-001
- SYNC-002
- SYNC-003
- SEC-001
- LIMIT-001

### P1 / P2

- GROUP-001
- SEARCH-001
- PLUG-001
- COMP-001
- OBS-001

---

## MVP scope (P0 only)

MVP includes **only** the following P0 requirements:

`API-001`, `SCHEMA-001`, `QUERY-001`, `QUERY-002`, `QUERY-003`, `QUERY-004`, `DETERMINISM-001`, `MUT-001`, `MUT-002`, `MUT-003`, `MUT-004`, `TX-001`, `NORM-001`, `EVENTS-001`, `SYNC-001`, `SYNC-002`, `SYNC-003`, `SEC-001`, `LIMIT-001`.

---

## Requirements

### API-001

- **ID**: API-001
- **Priority**: P0
- **Statement**: All `@datafn/server` HTTP endpoints MUST return a `DatafnEnvelope` with mutual exclusivity of `result`/`error`, deterministic `error.message`, and `error.code` in the `DatafnErrorCode` set.
- **Rationale**: A stable envelope enables interoperable clients and deterministic test vectors.
- **Acceptance criteria**:
  - For a successful request, the JSON body contains `{"ok": true, "result": ...}` and does not contain `error`.
  - For a failed request, the JSON body contains `{"ok": false, "error": {"code": "...", "message": "..."}}` and does not contain `result`.
  - `error.message` is deterministic for a given input (no stack traces, timestamps, random ids).
  - `error.details.path` is always present (use `"$"` when a more specific path is not applicable).
  - `error.code` is one of: `SCHEMA_INVALID`, `DFQL_INVALID`, `DFQL_UNKNOWN_RESOURCE`, `DFQL_UNKNOWN_FIELD`, `DFQL_UNKNOWN_RELATION`, `DFQL_UNSUPPORTED`, `LIMIT_EXCEEDED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`.
- **Test vectors**: TV-API-001, TV-API-002
- **Notes**:
  - HTTP status codes are implementation-defined; envelope shape is normative.

### SCHEMA-001

- **ID**: SCHEMA-001
- **Priority**: P0
- **Statement**: `@datafn/core.validateSchema(schema)` MUST return `ok: true` with a normalized `DatafnSchema` for valid input schemas and MUST return `ok: false` with `SCHEMA_INVALID` for invalid schemas.
- **Rationale**: Schema-boundedness is the foundational safety and correctness boundary for DFQL.
- **Acceptance criteria**:
  - A schema containing `resources[]` with unique `name` and integer `version` passes.
  - A schema missing `resources` or containing duplicate resource names fails with `SCHEMA_INVALID`.
  - On `SCHEMA_INVALID`, `error.details.path` identifies the failing top-level key (e.g. `resources`).
  - When `resource.indices` is provided as an array, it is normalized into `{ base: [...], search: [], vector: [] }`.
- **Test vectors**: TV-SCHEMA-001, TV-SCHEMA-002
- **Notes**:
  - The exact authorization model inside `resource.permissions` is Undefined in this spec version.

### QUERY-001

- **ID**: QUERY-001
- **Priority**: P0
- **Statement**: The `/datafn/query` endpoint MUST reject DFQL queries that reference unknown resources, fields, or relations with `DFQL_UNKNOWN_RESOURCE`, `DFQL_UNKNOWN_FIELD`, or `DFQL_UNKNOWN_RELATION` respectively.
- **Rationale**: Schema-bounded DFQL prevents injection of undeclared data access paths.
- **Acceptance criteria**:
  - `resource` must exist in schema.
  - Field selections (`select`) and filters (`filters`) referencing unknown fields fail.
  - Relation selections (`relation`, `relation.*`, `relation.#`, `relation.*#`, `relation.**`) referencing unknown relations fail.
  - The error `details` includes the failing `path` (e.g. `select[2]`, `filters.goalId`, `filters.links.$all`).
- **Test vectors**: TV-QUERY-001, TV-QUERY-002
- **Notes**:
  - Batch query validation may fail-fast (whole request rejected) as long as the error identifies the failing index.

### QUERY-002

- **ID**: QUERY-002
- **Priority**: P0
- **Statement**: `/datafn/query` MUST implement DFQL filter semantics including operator objects and compound `$and` / `$or` groups.
- **Rationale**: Filters are the minimal expressive power needed for real-world data access.
- **Acceptance criteria**:
  - A filter value `field: "x"` is treated as `eq`.
  - A filter value `field: ["a","b"]` is treated as `in`.
  - Operator objects support at least: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is_null`, `is_not_null`.
  - `$and` is an array of filter blocks and all blocks must match.
  - `$or` is an array of filter blocks and any block may match.
- **Test vectors**: TV-QUERY-005, TV-QUERY-006
- **Notes**:
  - Relation quantifiers `$any/$all/$none` are specified in `SPEC.md` and are optional unless separately required.

### QUERY-003

- **ID**: QUERY-003
- **Priority**: P0
- **Statement**: `/datafn/query` MUST implement DFQL `select` token semantics for base fields and the defined relation expansion tokens (`relation`, `relation.*`, `relation.#`, `relation.*#`, `relation.**`).
- **Rationale**: Explicit relation expansion is the primary ergonomic feature of DFQL.
- **Acceptance criteria**:
  - If `select` is omitted, the response includes all base fields for the resource and no relation expansions.
  - `relation` returns ids or id arrays (shape depends on relation type).
  - `relation.*` returns expanded related record(s).
  - `relation.#` returns join rows for many-many (including metadata).
  - `relation.*#` returns expanded related records and includes `$relation_metadata`.
- **Test vectors**: TV-QUERY-007, TV-QUERY-008
- **Notes**:
  - Nested select tokens (e.g. `tasks.tags.*`) are supported via dot-path traversal as defined in `SPEC.md`.

### QUERY-004

- **ID**: QUERY-004
- **Priority**: P0
- **Statement**: `/datafn/query` MUST support deterministic pagination via `limit`/`offset` and via `cursor.after` when `sort` is specified.
- **Rationale**: Pagination stability is required for local-first UI lists and sync-heavy datasets.
- **Acceptance criteria**:
  - `limit` bounds the number of top-level rows returned.
  - `offset` skips the first N rows of the ordered result set.
  - If `cursor.after` is provided, it contains the sort key values for the last seen row and pagination resumes strictly after it.
  - `nextCursor` is `null` when there is no next page; otherwise it is a JSON object.
- **Test vectors**: TV-QUERY-009, TV-QUERY-004
- **Notes**:
  - Backward pagination (`cursor.before`) is Undefined unless added in a future spec.

### DETERMINISM-001

- **ID**: DETERMINISM-001
- **Priority**: P0
- **Statement**: Given the same validated schema, the same normalized DFQL query, and the same underlying data snapshot, `/datafn/query` MUST return identical JSON results (excluding fields explicitly marked `volatile: true` in schema) and MUST reject cursor pagination requests whose `sort` omits `id` as the final tie-breaker key.
- **Rationale**: Determinism enables cache keys, reactivity correctness, and reproducible test vectors.
- **Acceptance criteria**:
  - When `sort` is omitted, a deterministic default sort is applied for top-level rows.
  - Expanded relation arrays use deterministic ordering.
  - If `cursor.after` or `cursor.before` is provided, `sort` MUST include `id` as the final tie-breaker key; otherwise the query is rejected with `DFQL_INVALID`.
- **Test vectors**: TV-QUERY-003, TV-QUERY-004
- **Notes**:
  - “Underlying data snapshot” means the same logical record contents and relation rows.

### MUT-001

- **ID**: MUT-001
- **Priority**: P0
- **Statement**: The `/datafn/mutation` endpoint MUST support record mutations for `insert`, `merge`, `replace`, and `delete` operations.
- **Rationale**: These operations form the minimal CRUD surface for apps.
- **Acceptance criteria**:
  - `insert` creates new record(s) with provided `id` or schema-defined id prefix rules.
  - `merge` updates provided fields without removing unspecified fields.
  - `replace` overwrites the full record (unspecified base fields become defaults or null per schema rules).
  - `delete` removes the record (and optionally cascades per request if defined).
- **Test vectors**: TV-MUT-001, TV-MUT-002
- **Notes**:
  - `cascade` semantics are Undefined beyond the ability to reject unknown cascade relations.

### MUT-002

- **ID**: MUT-002
- **Priority**: P0
- **Statement**: The server MUST provide idempotency for write operations by deduplicating replays of the same `(clientId, mutationId)` pair.
- **Rationale**: Offline-first clients and sync require safe retries.
- **Acceptance criteria**:
  - If a mutation with `(clientId, mutationId)` is applied successfully, replaying the same mutation returns `deduped: true` and does not re-apply changes.
  - If `clientId` or `mutationId` is missing for `/datafn/mutation`, the server returns a per-mutation error with code `DFQL_INVALID`.
- **Test vectors**: TV-MUT-003, TV-MUT-004
- **Notes**:
  - Dedupe storage is implementation-defined but must be durable for the configured server persistence.

### MUT-003

- **ID**: MUT-003
- **Priority**: P0
- **Statement**: When a mutation includes an `if` guard, the server MUST only apply the mutation if the guard matches the current record state and MUST otherwise fail the mutation with `CONFLICT`.
- **Rationale**: Optimistic concurrency avoids silent lost updates.
- **Acceptance criteria**:
  - If the guard matches, the mutation applies and `ok: true`.
  - If the guard does not match, the mutation result is `ok: false` with an error entry code `CONFLICT`.
  - Guard operator semantics match DFQL filter operator semantics.
- **Test vectors**: TV-MUT-005, TV-MUT-006
- **Notes**:
  - Guard evaluation is performed against the server’s authoritative state.

### MUT-004

- **ID**: MUT-004
- **Priority**: P0
- **Statement**: The `/datafn/mutation` endpoint MUST support relation mutations via `relate`, `modifyRelation`, and `unrelate` with relation metadata for many-many relations.
- **Rationale**: Many apps depend on join tables with ordering and timestamps.
- **Acceptance criteria**:
  - `relate` creates relation rows between records.
  - `modifyRelation` merges metadata fields on existing relation rows.
  - `unrelate` removes relation rows.
  - Relation payloads accept `$ref` and metadata fields and are validated against relation schema metadata definitions.
- **Test vectors**: TV-MUT-007, TV-MUT-008
- **Notes**:
  - Targeting join rows via `where` is Undefined unless added in a future spec.

### TX-001

- **ID**: TX-001
- **Priority**: P0
- **Statement**: The `/datafn/transact` endpoint MUST execute steps in order and, when `atomic: true`, MUST apply an all-or-nothing commit across all mutation steps.
- **Rationale**: Transactions are required for invariant-preserving multi-step updates.
- **Acceptance criteria**:
  - Results are returned in the same order as `steps`.
  - If any step fails, the server MUST stop executing subsequent steps and return results only up to and including the failing step.
  - If any step fails and `atomic: true`, no mutation effects are persisted.
  - If `atomic: false`, steps before the failing step may persist (and this behavior is deterministic).
- **Test vectors**: TV-TX-001, TV-TX-002
- **Notes**:
  - The exact DB transaction mechanism is adapter-dependent but the externally observable behavior is normative.

### NORM-001

- **ID**: NORM-001
- **Priority**: P0
- **Statement**: `@datafn/core.normalizeDfql` and `@datafn/core.dfqlKey` MUST produce the same key for semantically equivalent DFQL objects regardless of JSON key ordering.
- **Rationale**: Stable keys are required for caching and reactive invalidation.
- **Acceptance criteria**:
  - Object keys are recursively sorted for normalization.
  - Missing optional keys are normalized consistently (e.g. omitted `sort` treated as absent, not `null`).
  - `dfqlKey(x)` equals `JSON.stringify(normalizeDfql(x))`.
- **Test vectors**: TV-NORM-001, TV-NORM-002
- **Notes**:
  - `dfqlKey` is a canonical JSON string suitable for map keys and cache indices.

### EVENTS-001

- **ID**: EVENTS-001
- **Priority**: P0
- **Statement**: The client runtime MUST emit `DatafnEvent` notifications for applied and rejected mutations and MUST support `subscribe(handler, filter)` with deterministic filter semantics.
- **Rationale**: Events are the foundation for reactive queries and cross-surface updates (web + extension).
- **Acceptance criteria**:
  - When a mutation is applied, at least one `mutation_applied` event is emitted containing `resource` and `ids`.
  - When a mutation is rejected, at least one `mutation_rejected` event is emitted with `mutationId` and an error context.
  - `DatafnEventFilter` matches by `type`, `resource`, and `ids` deterministically.
- **Test vectors**: TV-EVENTS-001, TV-EVENTS-002
- **Notes**:
  - Transporting events across extension contexts is Undefined unless added in a future spec.

### SYNC-001

- **ID**: SYNC-001
- **Priority**: P0
- **Statement**: The `/datafn/clone` endpoint MUST return the requested tables’ records and per-table cursors in a single response.
- **Rationale**: Clone is required for initial hydration and offline startup.
- **Acceptance criteria**:
  - Request includes `clientId` and `tables`.
  - Response includes `data` (records per table) and `cursors` (cursor per table).
  - Each cursor value is a base-10 integer encoded as a JSON string (e.g. `"0"`, `"17"`).
  - Tables marked `isRemoteOnly: true` are rejected if requested in clone.
- **Test vectors**: TV-SYNC-001, TV-SYNC-002
- **Notes**:
  - Clone payload compression/chunking is Undefined.

### SYNC-002

- **ID**: SYNC-002
- **Priority**: P0
- **Statement**: The `/datafn/pull` endpoint MUST accept per-table cursors and MUST return `records`, `deleted`, and updated `cursors` per table.
- **Rationale**: Pull is the core incremental sync-down primitive.
- **Acceptance criteria**:
  - Request includes `clientId` and `cursors`.
  - Response includes `records`, `deleted`, and updated `cursors`.
  - Returned cursors are base-10 integer strings and are monotonic per table (never go backwards).
- **Test vectors**: TV-SYNC-003, TV-SYNC-004
- **Notes**:
  - Cursor values are opaque to clients except for equality/ordering comparisons as strings representing integers.

### SYNC-003

- **ID**: SYNC-003
- **Priority**: P0
- **Statement**: The `/datafn/push` endpoint MUST apply a batch of mutations with `(clientId, mutationId)` idempotency and MUST return `applied` mutationIds and per-mutation errors.
- **Rationale**: Push is required for offline-first mutation logs and safe retries.
- **Acceptance criteria**:
  - Request includes `clientId` and `mutations[]`.
  - Server dedupes replays using `(clientId, mutationId)`.
  - Response includes `applied[]` and `errors[]` (for rejected mutations).
- **Test vectors**: TV-SYNC-005, TV-SYNC-006
- **Notes**:
  - Conflict resolution strategy is last-write-wins by server order unless overridden (see `SPEC.md`).

### SEC-001

- **ID**: SEC-001
- **Priority**: P0
- **Statement**: `@datafn/server` MUST enforce authorization by consulting the configured `authorize(...)` function (or an equivalent built-in authorizer) and MUST reject unauthorized actions with `FORBIDDEN`.
- **Rationale**: Server-side enforcement is required regardless of client behavior.
- **Acceptance criteria**:
  - For each endpoint action (`query`, `mutation`, `transact`, `seed`, `clone`, `pull`, `push`), authorization is evaluated before execution.
  - When authorization denies, no side effects occur and the response is `ok: false` with `error.code: "FORBIDDEN"`.
  - For `FORBIDDEN`, `error.details.path` is `"$"`.
- **Test vectors**: TV-SEC-001, TV-SEC-002
- **Notes**:
  - Authentication/session retrieval is host-defined and out of scope.

### LIMIT-001

- **ID**: LIMIT-001
- **Priority**: P0
- **Statement**: The server MUST enforce configured limits for `query.limit` and `transact.steps.length`, returning `LIMIT_EXCEEDED` when caps are violated.
- **Rationale**: Hard caps protect servers from accidental or malicious expensive requests.
- **Acceptance criteria**:
  - If `limit` exceeds the configured max, the query is rejected with `LIMIT_EXCEEDED`.
  - If `steps.length` exceeds the configured max, the transact is rejected with `LIMIT_EXCEEDED`.
  - For `LIMIT_EXCEEDED`, `error.details.path` identifies the constrained field (`limit` or `steps`).
- **Test vectors**: TV-LIMIT-001, TV-LIMIT-002
- **Notes**:
  - Additional caps (relation expansion depth, payload size) are recommended but not required in P0.

---

## P1 / P2 requirements (non-MVP)

### GROUP-001

- **ID**: GROUP-001
- **Priority**: P1
- **Statement**: `/datafn/query` SHOULD support `groupBy`, `aggregations`, and `having` with deterministic grouped-row pagination.
- **Rationale**: Aggregations reduce client-side work and network payload size.
- **Acceptance criteria**:
  - Grouped query returns `groups[]` rows containing group keys and aggregation aliases.
- **Test vectors**: TV-GROUP-001, TV-GROUP-002
- **Notes**:
  - Relation expansions inside aggregate queries are Undefined.

### SEARCH-001

- **ID**: SEARCH-001
- **Priority**: P1
- **Statement**: When a `searchfn` plugin is installed, `/datafn/query` SHOULD support a `search` block and apply DFQL filters/pagination deterministically over the plugin’s candidate set.
- **Rationale**: Search is a common requirement and should integrate cleanly without breaking determinism.
- **Acceptance criteria**:
  - Search is combined with filters using AND semantics.
- **Test vectors**: TV-SEARCH-001, TV-SEARCH-002
- **Notes**:
  - Candidate set ranking semantics are Undefined unless specified in a future version.

### PLUG-001

- **ID**: PLUG-001
- **Priority**: P1
- **Statement**: The runtime SHOULD execute plugin hooks in registration order and SHOULD define fail-closed vs fail-open behavior per hook category.
- **Rationale**: Predictable extensibility prevents subtle correctness and security bugs.
- **Acceptance criteria**:
  - Hook ordering is deterministic.
- **Test vectors**: TV-PLUG-001, TV-PLUG-002
- **Notes**:
  - Side-effect plugins (indexing/analytics) should be fail-open by default; authz/validation hooks should be fail-closed.

### COMP-001

- **ID**: COMP-001
- **Priority**: P2
- **Statement**: The server SHOULD expose its supported DFQL capability/version metadata via `/datafn/status` to enable client compatibility checks.
- **Rationale**: Clients need a safe way to detect feature support across versions.
- **Acceptance criteria**:
  - Status response includes a stable `schemaHash` and `capabilities[]`.
- **Test vectors**: TV-COMP-001, TV-COMP-002
- **Notes**:
  - Capability naming is Undefined.

### OBS-001

- **ID**: OBS-001
- **Priority**: P2
- **Statement**: Server logs SHOULD exclude field values marked `encrypt: true` in schema and SHOULD include deterministic request metadata for auditing.
- **Rationale**: Observability must not leak sensitive data.
- **Acceptance criteria**:
  - Logs contain endpoint name and high-level identifiers but not encrypted field values.
- **Test vectors**: TV-OBS-001, TV-OBS-002
- **Notes**:
  - This is a guidance requirement; exact logging framework is Undefined.

