# DataFn Audit Fix Comprehensive Requirements

## Table of Contents

### Priority 0 (Critical Fixes)

**Server Determinism & Validation** (Audit Recommendations #1, #2, #5)
- AUTH-001: Invalid JSON ordering
- VALID-001: Schema-bounded validation for all endpoints
- EXEC-001: Query execution error surfacing
- EXEC-002: Mutation execution error surfacing

**Mutation Semantics** (Audit Recommendation #3, Intent I32-I37)
- MUT-GUARD-001: Optimistic concurrency guards
- MUT-REPLACE-001: Replace operation semantics
- MUT-REL-001: Relation mutations (relate/modifyRelation/unrelate)
- MUT-REL-002: Relation mutation payload validation

**Transact Atomicity** (Audit Recommendation #4, Intent I38)
- TX-ATOMIC-001: Database transaction wrapping
- TX-QUERY-001: Query steps in transact
- TX-LIMITS-001: Transact step limits

**Core Determinism** (Intent I05)
- DETERM-001: Remove Date.now() from server
- DETERM-002: Remove Math.random() from client
- DETERM-003: Cursor sort validation

### Priority 1 (High-Value Fixes)

**Pagination** (Intent I28, Spec Conflict SC-02)
- PAGE-001: nextCursor emission
- PAGE-002: Cursor backwards pagination

**Storage & Offline** (Audit Recommendation #6, Intent I41, I44)
- STORAGE-001: Storage adapter input validation
- STORAGE-002: Memory adapter deterministic rejection
- STORAGE-003: IndexedDB adapter deterministic rejection
- OFFLINE-001: Local DFQL expansion (relations)
- OFFLINE-002: Local DFQL expansion (groupBy)

**Extension RPC** (Audit Recommendation #7, Intent I54)
- EXT-001: Subscription event subscriptionId delivery

**Documentation** (Audit Recommendation #8, Intent I56)
- DOCS-001: Core README DatafnError correction
- DOCS-002: Client README DFQL filters key
- DOCS-003: Server README capabilities
- DOCS-004: Svelte README createDatafnClient example

**Python Parity** (Audit Recommendation #9, Intent I55)
- PY-001: Query endpoint implementation
- PY-002: Mutation endpoint implementation
- PY-003: Transact endpoint implementation
- PY-004: Sync endpoints implementation
- PY-005: Invalid JSON determinism
- PY-006: Idempotency persistence

**Search Integration** (Audit Recommendation #10, Intent I25, I48)
- SEARCH-001: searchfn candidate selection
- SEARCH-002: Deterministic DFQL merge over candidates
- SEARCH-003: Index updates on mutations

### Priority 2 (Completeness)

**Additional DFQL Features**
- FILTER-001: Nested object dot-path traversal
- FILTER-002: Additional filter operators (in, not_in, etc.)
- AGG-001: Aggregate query ordering
- AGG-002: Aggregate pagination determinism

**Limits Enforcement**
- LIMIT-001: maxPayloadBytes enforcement
- LIMIT-002: Query depth limits
- LIMIT-003: Relation expansion depth limits

**Observability**
- OBS-001: Sensitive field redaction in logs
- OBS-002: Request metadata logging

**Sync Robustness**
- SYNC-001: serverSeq atomicity under concurrency
- SYNC-002: Clone ordering determinism
- SYNC-003: Remote-only table enforcement

---

## P0 Requirements (Critical Fixes)

### AUTH-001: Invalid JSON Ordering

**Priority**: P0  
**Audit Reference**: Recommendation #1, Intent I04/I50, Bundle C SERVER-ENV-002, SERVER-AUTH-001  
**Status in audit**: FAIL

**Statement**: The server MUST parse and validate JSON before calling `authorize(ctx, action, payload)`, and MUST return `{ ok: false, error: { code: "DFQL_INVALID", message: "Invalid JSON", details: { path: "$" } } }` for invalid JSON without invoking authorization.

**Rationale**: Invalid JSON is a deterministic client error and must never return `FORBIDDEN`; authorization decisions must only apply to valid parsed requests.

**Acceptance Criteria**:
- [ ] All POST /datafn/* endpoints parse JSON before authorization
- [ ] Invalid JSON returns DFQL_INVALID with path "$"
- [ ] authorize() never called with payload: null due to parse failure
- [ ] authorize() receives parsed payload for valid JSON
- [ ] GET /datafn/status calls authorize() with payload: null (no body)

**Test Vectors**: TV-AUTH-INV-JSON-001, TV-AUTH-INV-JSON-002, TV-AUTH-INV-JSON-003

**Notes**: Requires refactoring server.ts withAuth middleware to parse before authorize call.

---

### VALID-001: Schema-Bounded Validation for All Endpoints

**Priority**: P0  
**Audit Reference**: Recommendation #5, Intent I03/I50, Bundle C SERVER-ENV-003  
**Status in audit**: PARTIAL

**Statement**: The server MUST validate all DFQL query/mutation/transact requests against schema (unknown resources, fields, relations) and MUST return deterministic top-level `ok: false` envelopes with codes `DFQL_UNKNOWN_RESOURCE`, `DFQL_UNKNOWN_FIELD`, or `DFQL_UNKNOWN_RELATION` before adapter execution.

**Rationale**: Schema-bounded validation prevents adapter-level INTERNAL errors for user mistakes and enforces non-goals (no arbitrary execution).

**Acceptance Criteria**:
- [ ] POST /datafn/query validates resource, select fields, filter paths, sort fields, omit fields
- [ ] POST /datafn/mutation validates resource, record fields, relation names, if guard fields
- [ ] POST /datafn/transact validates all step resources/fields
- [ ] POST /datafn/push validates all mutation resources/fields
- [ ] Unknown resource returns DFQL_UNKNOWN_RESOURCE with details.path
- [ ] Unknown field returns DFQL_UNKNOWN_FIELD with details.path
- [ ] Unknown relation returns DFQL_UNKNOWN_RELATION with details.path
- [ ] Validation errors never reach adapter execution

**Test Vectors**: TV-VALID-RESOURCE-001, TV-VALID-FIELD-001, TV-VALID-RELATION-001, TV-VALID-MUTATION-001, TV-VALID-PUSH-001

**Notes**: Implement shared validation helpers in server/src/validation/ for reuse across endpoints.

---

### EXEC-001: Query Execution Error Surfacing

**Priority**: P0  
**Audit Reference**: Recommendation #2, Intent I05/I15-I31, Bundle A DETERMINISM-001  
**Status in audit**: FAIL

**Statement**: The server MUST return top-level `{ ok: false, error: { code, message, details } }` envelopes for query execution errors and MUST NOT swallow errors as empty result sets `{ data: [], nextCursor: null }`.

**Rationale**: Swallowing errors breaks determinism (invalid DFQL indistinguishable from empty dataset) and debuggability.

**Acceptance Criteria**:
- [ ] Invalid DFQL filter operators return DFQL_INVALID (not empty results)
- [ ] Invalid cursor.after values return DFQL_INVALID (not empty results)
- [ ] Invalid sort field references return DFQL_UNKNOWN_FIELD (not empty results)
- [ ] Adapter execution errors return INTERNAL (not empty results)
- [ ] Valid queries with zero matches return { data: [], ... } with ok: true

**Test Vectors**: TV-EXEC-QUERY-ERR-001, TV-EXEC-QUERY-ERR-002, TV-EXEC-QUERY-ERR-003, TV-EXEC-QUERY-EMPTY-001

**Notes**: Remove broad catch blocks in server/src/routes/query.ts that return empty results; use okResponse/errorResponse consistently.

---

### EXEC-002: Mutation Execution Error Surfacing

**Priority**: P0  
**Audit Reference**: Recommendation #2, Intent I32-I37  
**Status in audit**: PARTIAL

**Statement**: The server MUST return deterministic top-level `ok: false` envelopes for mutation execution errors including adapter failures, constraint violations, and not-found errors, and MUST NOT return INTERNAL for schema-level validation failures.

**Rationale**: Mutation errors must be deterministic and distinguishable; adapter errors vs validation errors must be clear.

**Acceptance Criteria**:
- [ ] Unknown resource/field in mutation returns DFQL_UNKNOWN_* before execution
- [ ] Record not found for replace/delete returns NOT_FOUND
- [ ] Guard mismatch (if) returns CONFLICT
- [ ] Adapter constraint violation returns INTERNAL with details
- [ ] Successful mutations return { ok: true, result: { ok: true, mutationId, affectedIds, ... } }

**Test Vectors**: TV-EXEC-MUT-ERR-001, TV-EXEC-MUT-ERR-002, TV-EXEC-MUT-ERR-003, TV-EXEC-MUT-NOTFOUND-001

**Notes**: Refactor server/src/execution/mutation/execute.ts to classify errors deterministically.

---

### MUT-GUARD-001: Optimistic Concurrency Guards

**Priority**: P0  
**Audit Reference**: Recommendation #3, Intent I35, Bundle A MUT-003  
**Status in audit**: FAIL

**Statement**: The server MUST enforce `if` guards on mutations by evaluating the guard filter against the current server record state before applying the mutation, and MUST return `{ ok: false, error: { code: "CONFLICT", message: "Guard condition not met", details: { path: "if" } } }` when the guard does not match.

**Rationale**: Optimistic concurrency is a core correctness feature for conflict detection in offline/sync scenarios.

**Acceptance Criteria**:
- [ ] if guard present: evaluate against current DB record before mutation
- [ ] Guard match: apply mutation normally
- [ ] Guard mismatch: return CONFLICT without applying mutation
- [ ] Guard evaluation uses same filter semantics as DFQL query filters
- [ ] Guard on non-existent record: always fails (returns CONFLICT)

**Test Vectors**: TV-MUT-GUARD-PASS-001, TV-MUT-GUARD-FAIL-001, TV-MUT-GUARD-NOTFOUND-001

**Notes**: Implement in server/src/execution/mutation/execute.ts; integrate with existing filter evaluation from query execution.

---

### MUT-REPLACE-001: Replace Operation Semantics

**Priority**: P0  
**Audit Reference**: Recommendation #3, Intent I32, Bundle A MUT-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST implement `operation: "replace"` by replacing the entire existing record with the provided record fields, clearing unspecified fields to schema defaults or null, and MUST return NOT_FOUND if the target record does not exist (no upsert).

**Rationale**: Replace semantics are distinct from merge (update); current implementation incorrectly behaves as merge.

**Acceptance Criteria**:
- [ ] replace with existing record: unspecified fields cleared to defaults/null
- [ ] replace with non-existent record: returns NOT_FOUND (no creation)
- [ ] replace respects required fields (returns DFQL_INVALID if required field missing)
- [ ] replace updates updatedAt/updatedBy system fields
- [ ] replace preserves id, createdAt, createdBy

**Test Vectors**: TV-MUT-REPLACE-CLEAR-001, TV-MUT-REPLACE-NOTFOUND-001, TV-MUT-REPLACE-REQUIRED-001

**Notes**: Refactor server/src/execution/mutation/dfql.ts and execute.ts to distinguish replace from merge.

---

### MUT-REL-001: Relation Mutations (relate/modifyRelation/unrelate)

**Priority**: P0  
**Audit Reference**: Recommendation #3, Intent I33, Bundle A MUT-004  
**Status in audit**: FAIL

**Statement**: The server MUST implement relation mutation operations `relate`, `modifyRelation`, and `unrelate` for establishing, updating, and removing relations between records, including many-many join row creation/update/deletion with optional metadata.

**Rationale**: Relation mutations are a core DFQL feature for graph-like data; currently rejected as DFQL_UNSUPPORTED.

**Acceptance Criteria**:
- [ ] relate: creates relation (for many-many, creates join row with metadata)
- [ ] modifyRelation: updates join row metadata for many-many relations
- [ ] unrelate: removes relation (for many-many, deletes join row)
- [ ] relation operations validate relation exists in schema
- [ ] relation operations validate related records exist (return NOT_FOUND if missing)
- [ ] many-many metadata keys validated against relation schema

**Test Vectors**: TV-MUT-RELATE-001, TV-MUT-RELATE-METADATA-001, TV-MUT-MODIFY-REL-001, TV-MUT-UNRELATE-001

**Notes**: Implement in server/src/execution/mutation/relations.ts (new module); integrate with execute.ts.

---

### MUT-REL-002: Relation Mutation Payload Validation

**Priority**: P0  
**Audit Reference**: Recommendation #3, Intent I33  
**Status in audit**: FAIL

**Statement**: The server MUST validate `mutation.relations` payloads against schema, including validating relation names exist, metadata keys are declared in relation schema, and referenced ids ($ref) are valid strings.

**Rationale**: Schema-bounded validation for relation mutations prevents runtime errors and enforces data integrity.

**Acceptance Criteria**:
- [ ] Unknown relation name returns DFQL_UNKNOWN_RELATION
- [ ] Unknown metadata key returns DFQL_UNKNOWN_FIELD with details.path = "relations.<relationName>.<metadataKey>"
- [ ] Invalid $ref format returns DFQL_INVALID
- [ ] Shorthand forms (string, string[]) accepted and normalized

**Test Vectors**: TV-MUT-REL-VALID-001, TV-MUT-REL-INVALID-RELATION-001, TV-MUT-REL-INVALID-METADATA-001

**Notes**: Validation happens in server/src/routes/mutation.ts before execution; use shared validation helpers.

---

### TX-ATOMIC-001: Database Transaction Wrapping

**Priority**: P0  
**Audit Reference**: Recommendation #4, Intent I38, Bundle A TX-001  
**Status in audit**: FAIL

**Statement**: The server MUST wrap all mutation steps of a transact request in a database transaction when `atomic: true` (default), and MUST rollback all changes on the first step failure, ensuring all-or-nothing commit semantics.

**Rationale**: Atomic transactions are a core correctness guarantee; current implementation does not rollback on failures.

**Acceptance Criteria**:
- [ ] atomic: true wraps mutation steps in DB transaction
- [ ] First mutation failure triggers immediate rollback
- [ ] Subsequent steps after failure are not executed
- [ ] Transaction result returns ok: false with error from failed step
- [ ] atomic: false applies mutations in order without rollback (partial commit)

**Test Vectors**: TV-TX-ATOMIC-ROLLBACK-001, TV-TX-ATOMIC-PARTIAL-001

**Notes**: Requires @superfunctions/db.Adapter to support transaction API (begin/commit/rollback); implement in server/src/execution/transact.ts.

---

### TX-QUERY-001: Query Steps in Transact

**Priority**: P0  
**Audit Reference**: Recommendation #4, Intent I38, Bundle A TX-001  
**Status in audit**: FAIL

**Statement**: The server MUST support both `{ query }` and `{ mutation }` steps in transact requests, execute query steps by reading from the current transaction state (read-your-writes), and return query results in the corresponding position of `results` array.

**Rationale**: Query steps enable conditional mutations and verification within transactions; currently only mutation steps supported.

**Acceptance Criteria**:
- [ ] Transact accepts steps: Array<{ query: DatafnQuery } | { mutation: DatafnMutation }>
- [ ] Query steps execute against transaction state (see uncommitted writes)
- [ ] Query steps return DatafnQueryResult in results array
- [ ] Mutation steps return DatafnMutationResult in results array
- [ ] Results array order matches steps array order

**Test Vectors**: TV-TX-QUERY-STEP-001, TV-TX-QUERY-READYOURWRITES-001, TV-TX-QUERY-MUTATION-MIX-001

**Notes**: Extend server/src/execution/transact.ts to handle query steps; pass transaction context to query executor.

---

### TX-LIMITS-001: Transact Step Limits

**Priority**: P0  
**Audit Reference**: Recommendation #4, Intent I57, Bundle A LIMIT-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST enforce `config.limits.maxTransactSteps` (default 100) by rejecting transact requests with `steps.length > maxTransactSteps` with `{ ok: false, error: { code: "LIMIT_EXCEEDED", message: "Transaction exceeds maximum steps", details: { path: "steps", max: N } } }`.

**Rationale**: Step limits prevent resource exhaustion and unbounded transaction execution.

**Acceptance Criteria**:
- [ ] config.limits.maxTransactSteps defaults to 100
- [ ] steps.length > maxTransactSteps returns LIMIT_EXCEEDED before execution
- [ ] Error details include max value
- [ ] Valid step counts execute normally

**Test Vectors**: TV-TX-LIMIT-EXCEEDED-001, TV-TX-LIMIT-OK-001

**Notes**: Validate in server/src/routes/transact.ts before execution.

---

### DETERM-001: Remove Date.now() from Server

**Priority**: P0  
**Audit Reference**: Intent I05  
**Status in audit**: FAIL

**Statement**: The server MUST NOT use `Date.now()` or `new Date()` in execution paths that affect output determinism, including seed timestamps, change tracking timestamps, and cursor generation.

**Rationale**: Nondeterministic timestamps break determinism guarantee (same inputs → same outputs).

**Acceptance Criteria**:
- [ ] server/src/routes/seed.ts: remove Date.now() from seed record; use constant or omit
- [ ] server/src/execution/sync/change-tracking.ts: timestamp may be nondeterministic but MUST NOT affect cursor ordering (serverSeq is ordering key)
- [ ] Timestamps in internal state permitted only when they don't affect output content/ordering

**Test Vectors**: TV-DETERM-SEED-001, TV-DETERM-CURSOR-001

**Notes**: Seed timestamp can be client-provided or omitted; change tracking timestamp for observability only (not ordering).

---

### DETERM-002: Remove Math.random() from Client

**Priority**: P0  
**Audit Reference**: Intent I05  
**Status in audit**: FAIL

**Statement**: The client MUST NOT use `Math.random()` for RPC request IDs in extension transport; instead use a deterministic counter or client-provided ID.

**Rationale**: Nondeterministic IDs break determinism in extension contexts and make debugging/replay harder.

**Acceptance Criteria**:
- [ ] client/src/extension/transport.ts: replace Math.random() with counter-based ID
- [ ] RPC request IDs unique within session but deterministic given same sequence of calls
- [ ] Response matching still works correctly with new ID scheme

**Test Vectors**: TV-DETERM-RPC-ID-001

**Notes**: Use module-level counter incremented on each request; reset on transport creation.

---

### DETERM-003: Cursor Sort Validation

**Priority**: P0  
**Audit Reference**: Intent I05/I28, Bundle A DETERMINISM-001  
**Status in audit**: FAIL

**Statement**: The server MUST validate that cursor pagination requests (`cursor.after` or `cursor.before` present) include `id` as the final sort key for tie-breaking, and MUST return `{ ok: false, error: { code: "DFQL_INVALID", message: "Cursor pagination requires id as final sort key", details: { path: "sort" } } }` when id is missing.

**Rationale**: Cursor pagination without deterministic tie-breaker is unstable and breaks across page boundaries.

**Acceptance Criteria**:
- [ ] cursor.after/before present + sort present: validate id in final position
- [ ] cursor.after/before present + sort missing: server adds ["id:asc"] default
- [ ] cursor.after/before present + sort present but id missing: return DFQL_INVALID
- [ ] Validation happens before execution

**Test Vectors**: TV-CURSOR-SORT-VALID-001, TV-CURSOR-SORT-INVALID-001, TV-CURSOR-SORT-DEFAULT-001

**Notes**: Implement in server/src/routes/query.ts validateQuery helper.

---

## P1 Requirements (High-Value Fixes)

### PAGE-001: nextCursor Emission

**Priority**: P1  
**Audit Reference**: Intent I28, Spec Conflict SC-02, Bundle A QUERY-004  
**Status in audit**: FAIL

**Statement**: The server MUST compute and return `nextCursor` in query results when more pages exist beyond the current result set, and MUST return `nextCursor: null` when no more pages exist.

**Rationale**: Cursor pagination requires nextCursor to enable stable traversal of result sets.

**Acceptance Criteria**:
- [ ] Query with limit + results.length === limit: check if more rows exist
- [ ] More rows exist: emit nextCursor with sort key values of last result row
- [ ] No more rows: emit nextCursor: null
- [ ] nextCursor maps sort field names to last-seen values
- [ ] nextCursor includes id tie-breaker value

**Test Vectors**: TV-PAGE-NEXTCURSOR-PRESENT-001, TV-PAGE-NEXTCURSOR-NULL-001, TV-PAGE-NEXTCURSOR-VALUES-001

**Notes**: Implement in server/src/execution/query/execute.ts; query one extra row to detect "has more pages".

---

### PAGE-002: Cursor Backwards Pagination

**Priority**: P1  
**Audit Reference**: Intent I28, Bundle B DFQL-PAGE-BEFORE-001  
**Status in audit**: FAIL

**Statement**: The server MUST support `cursor.before` for backwards pagination by reversing the sort direction, applying the before cursor as an upper bound, executing the query, and re-reversing results to maintain original sort order.

**Rationale**: Backwards pagination enables bi-directional traversal (e.g., infinite scroll in both directions).

**Acceptance Criteria**:
- [ ] cursor.before present: reverse sort directions (asc→desc, desc→asc)
- [ ] Apply before as upper bound (exclusive) in reversed order
- [ ] Execute query with reversed sort
- [ ] Reverse result rows to restore original sort direction
- [ ] Emit nextCursor/prevCursor appropriately

**Test Vectors**: TV-PAGE-BEFORE-001, TV-PAGE-BEFORE-EDGES-001

**Notes**: Implement in server/src/execution/query/pagination.ts; requires careful cursor logic.

---

### STORAGE-001: Storage Adapter Input Validation

**Priority**: P1  
**Audit Reference**: Recommendation #6, Intent I57  
**Status in audit**: PARTIAL

**Statement**: The client storage adapters MUST validate all method inputs and MUST throw deterministic errors for invalid inputs including invalid hydration state transitions, malformed cursor strings, missing clientId/mutationId in changelog entries, and invalid table names.

**Rationale**: Storage adapter robustness prevents silent failures and ensures consistent error surfacing.

**Acceptance Criteria**:
- [ ] setHydrationState: validates state is "notStarted" | "hydrating" | "ready"
- [ ] setHydrationState: validates transitions (e.g., ready→notStarted is invalid)
- [ ] setCursor: validates cursor is string or null
- [ ] appendToChangelog: validates mutation has clientId and mutationId
- [ ] All methods: validate table names against schema

**Test Vectors**: TV-STORAGE-INVALID-STATE-001, TV-STORAGE-INVALID-CURSOR-001, TV-STORAGE-INVALID-MUTATION-001

**Notes**: Implement validation in client/src/adapters/memoryStorage.ts and indexedDbStorage.ts.

---

### STORAGE-002: Memory Adapter Deterministic Rejection

**Priority**: P1  
**Audit Reference**: Recommendation #6, Bundle C STORAGE-MEM-001  
**Status in audit**: FAIL

**Statement**: The memory storage adapter MUST reject invalid hydration state values deterministically by throwing an error with message including "Invalid hydration state", and MUST reject invalid hydration state transitions (e.g., ready→notStarted) deterministically.

**Rationale**: Bundle C test vectors require deterministic rejection; current implementation silently accepts invalid states.

**Acceptance Criteria**:
- [ ] setHydrationState("invalid") throws error matching /Invalid hydration state/
- [ ] setHydrationState from ready→notStarted throws error matching /Invalid transition/
- [ ] Valid states (notStarted, hydrating, ready) accepted
- [ ] Valid transitions accepted (notStarted→hydrating, hydrating→ready)

**Test Vectors**: TV-STORAGE-MEM-INVALID-001, TV-STORAGE-MEM-TRANSITION-001

**Notes**: Add validation logic to client/src/adapters/memoryStorage.ts setHydrationState method.

---

### STORAGE-003: IndexedDB Adapter Deterministic Rejection

**Priority**: P1  
**Audit Reference**: Recommendation #6, Bundle C STORAGE-IDB-001  
**Status in audit**: PARTIAL

**Statement**: The IndexedDB storage adapter MUST reject invalid inputs deterministically including invalid hydration states, invalid cursor formats, and invalid changelog entries with missing clientId/mutationId.

**Rationale**: IndexedDB adapter robustness ensures persistent storage integrity and consistent error surfacing.

**Acceptance Criteria**:
- [ ] Same hydration state validation as memory adapter
- [ ] setCursor with non-string, non-null value throws error
- [ ] appendToChangelog with missing clientId throws error
- [ ] appendToChangelog with missing mutationId throws error
- [ ] All errors are deterministic and testable

**Test Vectors**: TV-STORAGE-IDB-INVALID-001, TV-STORAGE-IDB-CURSOR-001, TV-STORAGE-IDB-CHANGELOG-001

**Notes**: Add validation logic to client/src/adapters/indexedDbStorage.ts methods.

---

### OFFLINE-001: Local DFQL Expansion (Relations)

**Priority**: P1  
**Audit Reference**: Recommendation #6, Intent I41, Bundle C CLIENT-OFFLINE-QUERY-001  
**Status in audit**: FAIL

**Statement**: The client offline query executor MUST support relation expansion tokens (`rel`, `rel.*`, `rel.#`, `rel.*#`, nested tokens) in local queries for `ready` tables by reading related records from local storage and materializing expanded results deterministically.

**Rationale**: Offline query semantics must match server DFQL semantics for local-first correctness; current implementation only supports base fields.

**Acceptance Criteria**:
- [ ] Select token "rel" returns related ids from local storage
- [ ] Select token "rel.*" returns expanded related records from local storage
- [ ] Nested tokens "tasks.tags.*" expand intermediate and descendant relations
- [ ] Many-many tokens "rel.#" and "rel.*#" read from local join tables
- [ ] Ordering matches server semantics (deterministic)

**Test Vectors**: TV-OFFLINE-QUERY-REL-001, TV-OFFLINE-QUERY-NESTED-001, TV-OFFLINE-QUERY-MANYMANY-001

**Notes**: Extend client/src/offline/query.ts materializeSelect to match server logic; requires local join table storage.

---

### OFFLINE-002: Local DFQL Expansion (groupBy)

**Priority**: P1  
**Audit Reference**: Recommendation #6, Intent I41  
**Status in audit**: FAIL

**Statement**: The client offline query executor MUST support `groupBy`, `aggregations`, and `having` in local queries for `ready` tables by grouping local records, computing aggregations, and filtering grouped rows deterministically.

**Rationale**: Aggregate queries must work offline for local-first completeness.

**Acceptance Criteria**:
- [ ] groupBy groups local records by specified fields
- [ ] aggregations compute count, sum, avg, min, max over groups
- [ ] having filters groups after aggregation
- [ ] Results match server aggregate semantics
- [ ] Ordering is deterministic

**Test Vectors**: TV-OFFLINE-QUERY-GROUPBY-001, TV-OFFLINE-QUERY-AGG-001, TV-OFFLINE-QUERY-HAVING-001

**Notes**: Implement in client/src/offline/aggregate.ts (new module); integrate with query.ts.

---

### EXT-001: Subscription Event subscriptionId Delivery

**Priority**: P1  
**Audit Reference**: Recommendation #7, Intent I54, Bundle C EXT-001  
**Status in audit**: PARTIAL

**Statement**: The client extension RPC transport MUST forward subscription events to consumers with the `subscriptionId` included in the event envelope so consumers can match events to their subscriptions.

**Rationale**: Multi-subscription correctness requires consumers to distinguish which subscription fired; current implementation drops subscriptionId.

**Acceptance Criteria**:
- [ ] Background runtime emits events as { type: "event", subscriptionId, event }
- [ ] Transport forwards to consumers with subscriptionId intact
- [ ] Consumers receive { subscriptionId, event } and can match to subscription
- [ ] Unsubscribe by subscriptionId works correctly

**Test Vectors**: TV-EXT-SUB-ID-001, TV-EXT-SUB-MULTI-001

**Notes**: Fix client/src/extension/transport.ts event forwarding to preserve subscriptionId.

---

### DOCS-001: Core README DatafnError Correction

**Priority**: P1  
**Audit Reference**: Recommendation #8, Intent I56, Bundle C DOCS-CORE-001  
**Status in audit**: FAIL

**Statement**: The @datafn/core README MUST accurately describe `DatafnError` as a plain object interface (not a class) with shape `{ code, message, details: { path, ...extra } }`, and MUST document that `details.path` is always present.

**Rationale**: Current README references non-existent `DatafnError` class; docs must match implementation.

**Acceptance Criteria**:
- [ ] README describes DatafnError as interface (not class)
- [ ] README documents details.path is always present
- [ ] README includes example error object
- [ ] No references to "new DatafnError(...)"

**Test Vectors**: TV-DOCS-CORE-001 (manual verification)

**Notes**: Edit core/README.md; remove class references; add interface example.

---

### DOCS-002: Client README DFQL Filters Key

**Priority**: P1  
**Audit Reference**: Recommendation #8, Intent I56, Bundle C DOCS-CLIENT-001  
**Status in audit**: FAIL

**Statement**: The @datafn/client README MUST use canonical DFQL key `filters` (not `where`) in all query examples, and MUST use canonical mutation operations (`insert`, `merge`, `replace`, `delete`) not `update`.

**Rationale**: Docs using non-canonical keys actively mislead users; current examples use "where" which is not valid DFQL.

**Acceptance Criteria**:
- [ ] All query examples use "filters" key
- [ ] No examples use "where" key
- [ ] All mutation examples use canonical operations
- [ ] No examples use "update" operation

**Test Vectors**: TV-DOCS-CLIENT-001 (manual verification)

**Notes**: Edit client/README.md; replace all "where" with "filters"; replace "update" with "merge".

---

### DOCS-003: Server README Capabilities

**Priority**: P1  
**Audit Reference**: Recommendation #8, Intent I56, Bundle C DOCS-SERVER-001  
**Status in audit**: FAIL

**Statement**: The @datafn/server README MUST document accurate capability strings returned by /datafn/status: `dfql.query`, `dfql.mutation`, `dfql.transact`, `sync.seed`, `sync.clone`, `sync.pull`, `sync.push`.

**Rationale**: Capability strings are part of contract surface for compatibility checks; docs must match implementation.

**Acceptance Criteria**:
- [ ] README lists exact capability strings
- [ ] README explains capability usage for client compatibility checks
- [ ] No outdated or incorrect capability names

**Test Vectors**: TV-DOCS-SERVER-001 (manual verification)

**Notes**: Edit server/README.md; update capability list to match server/src/routes/status.ts.

---

### DOCS-004: Svelte README createDatafnClient Example

**Priority**: P1  
**Audit Reference**: Recommendation #8, Intent I56, Bundle C DOCS-SVELTE-001  
**Status in audit**: PARTIAL

**Statement**: The @datafn/svelte README MUST include an end-to-end example demonstrating `createDatafnClient`, `client.<table>.signal(query)`, and `toSvelteStore` without requiring users to construct signals manually.

**Rationale**: Current README shows signal usage but not client creation; users need complete example.

**Acceptance Criteria**:
- [ ] Example imports createDatafnClient from @datafn/client
- [ ] Example shows client creation with schema + remote adapter
- [ ] Example shows client.tasks.signal({ filters: {...} })
- [ ] Example shows toSvelteStore(signal)
- [ ] Example shows Svelte component using $store syntax

**Test Vectors**: TV-DOCS-SVELTE-001 (manual verification)

**Notes**: Edit svelte/README.md; add comprehensive example at top.

---

### PY-001: Python Query Endpoint Implementation

**Priority**: P1  
**Audit Reference**: Recommendation #9, Intent I55, Bundle C PY-SDK-001/002  
**Status in audit**: FAIL

**Statement**: The Python datafn package MUST implement POST /datafn/query endpoint handler that validates DFQL query requests, executes queries against the configured database adapter, and returns DatafnEnvelope-wrapped query results with the same wire semantics as TypeScript server.

**Rationale**: Python server parity is a core goal; current implementation is stub-only.

**Acceptance Criteria**:
- [ ] Endpoint accepts POST /datafn/query
- [ ] Validates query resource/fields/relations (schema-bounded)
- [ ] Executes query via DB adapter
- [ ] Returns { ok: true, result: { data, count?, nextCursor? } }
- [ ] Invalid JSON returns { ok: false, error: { code: "DFQL_INVALID", ... } }
- [ ] Unknown resource returns DFQL_UNKNOWN_RESOURCE

**Test Vectors**: TV-PY-QUERY-001, TV-PY-QUERY-INVALID-001

**Notes**: Implement in python/datafn/handlers/query.py; use python/datafn/envelope.py for responses.

---

### PY-002: Python Mutation Endpoint Implementation

**Priority**: P1  
**Audit Reference**: Recommendation #9, Intent I55, Bundle C PY-SDK-001/002  
**Status in audit**: FAIL

**Statement**: The Python datafn package MUST implement POST /datafn/mutation endpoint handler with idempotency, guard enforcement, and relation mutations matching TypeScript server wire semantics.

**Rationale**: Mutation parity is essential for cross-language deployment.

**Acceptance Criteria**:
- [ ] Endpoint accepts POST /datafn/mutation
- [ ] Validates mutation resource/fields/relations
- [ ] Enforces (clientId, mutationId) idempotency via DB
- [ ] Enforces if guards (returns CONFLICT on mismatch)
- [ ] Supports relate/modifyRelation/unrelate operations
- [ ] Returns { ok: true, result: { ok: true, mutationId, affectedIds, ... } }

**Test Vectors**: TV-PY-MUTATION-001, TV-PY-MUTATION-GUARD-001, TV-PY-MUTATION-IDEMP-001

**Notes**: Implement in python/datafn/handlers/mutation.py.

---

### PY-003: Python Transact Endpoint Implementation

**Priority**: P1  
**Audit Reference**: Recommendation #9, Intent I55  
**Status in audit**: FAIL

**Statement**: The Python datafn package MUST implement POST /datafn/transact endpoint handler with atomic transaction wrapping, query+mutation steps, and step limits matching TypeScript server.

**Rationale**: Transact parity completes core DFQL endpoint coverage.

**Acceptance Criteria**:
- [ ] Endpoint accepts POST /datafn/transact
- [ ] Wraps steps in DB transaction when atomic: true
- [ ] Supports both query and mutation steps
- [ ] Enforces maxTransactSteps limit
- [ ] Returns { ok: true, result: { ok: true, results: [...] } }
- [ ] Rolls back on first step failure when atomic: true

**Test Vectors**: TV-PY-TRANSACT-001, TV-PY-TRANSACT-ATOMIC-001

**Notes**: Implement in python/datafn/handlers/transact.py; requires DB transaction support.

---

### PY-004: Python Sync Endpoints Implementation

**Priority**: P1  
**Audit Reference**: Recommendation #9, Intent I55  
**Status in audit**: FAIL

**Statement**: The Python datafn package MUST implement POST /datafn/seed, /datafn/clone, /datafn/pull, /datafn/push endpoints with idempotency, serverSeq ordering, and cursor semantics matching TypeScript server.

**Rationale**: Sync parity enables Python backend for local-first apps.

**Acceptance Criteria**:
- [ ] /seed validates clientId and records seed execution
- [ ] /clone returns full snapshot + cursors
- [ ] /pull returns incremental changes since cursor
- [ ] /push applies mutations idempotently and writes change tracking
- [ ] All endpoints use same envelope semantics
- [ ] serverSeq ordering is monotonic

**Test Vectors**: TV-PY-SEED-001, TV-PY-CLONE-001, TV-PY-PULL-001, TV-PY-PUSH-001

**Notes**: Implement in python/datafn/handlers/sync.py; reuse idempotency/change-tracking modules.

---

### PY-005: Python Invalid JSON Determinism

**Priority**: P1  
**Audit Reference**: Recommendation #9, Intent I04/I50, Bundle C PY-SDK-002  
**Status in audit**: FAIL

**Statement**: The Python datafn server MUST parse JSON before calling authorize() and MUST return DFQL_INVALID for invalid JSON (not FORBIDDEN), matching TypeScript server determinism invariant.

**Rationale**: Cross-language determinism requires consistent invalid JSON handling.

**Acceptance Criteria**:
- [ ] All POST endpoints parse JSON before authorize()
- [ ] Invalid JSON returns { "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid JSON", "details": { "path": "$" } } }
- [ ] authorize() never called with null payload due to parse failure

**Test Vectors**: TV-PY-INV-JSON-001

**Notes**: Implement in python/datafn/server.py middleware; parse before auth.

---

### PY-006: Python Idempotency Persistence

**Priority**: P1  
**Audit Reference**: Recommendation #9, Intent I45, Bundle C PY-SDK-002  
**Status in audit**: FAIL

**Statement**: The Python datafn server MUST persist idempotency state for (clientId, mutationId) in __datafn_idempotency table using the configured DB adapter, enabling idempotency across server restarts.

**Rationale**: Durable idempotency is a core sync invariant.

**Acceptance Criteria**:
- [ ] __datafn_idempotency table schema matches TypeScript server
- [ ] Mutation handler checks idempotency before execution
- [ ] Replays return cached result from idempotency table
- [ ] Idempotency state survives server restart

**Test Vectors**: TV-PY-IDEMP-PERSIST-001

**Notes**: Implement in python/datafn/idempotency.py; use SQLAlchemy or DB adapter abstraction.

---

### SEARCH-001: searchfn Candidate Selection

**Priority**: P1  
**Audit Reference**: Recommendation #10, Intent I25/I48, Bundle A SEARCH-001  
**Status in audit**: FAIL

**Statement**: The server MUST delegate candidate id selection to the searchfn plugin when `query.search` is present and searchfn plugin is installed, and MUST reject search queries with DFQL_UNSUPPORTED when searchfn plugin is not installed.

**Rationale**: Search integration is a P1 feature in Bundles A/B; current implementation only gates search.

**Acceptance Criteria**:
- [ ] searchfn plugin installed + query.search present: call plugin.selectCandidates(search)
- [ ] Plugin returns candidate ids (string[])
- [ ] searchfn plugin not installed + query.search present: return DFQL_UNSUPPORTED
- [ ] No search block: bypass search logic

**Test Vectors**: TV-SEARCH-CANDIDATES-001, TV-SEARCH-NOPLUGIN-001

**Notes**: Implement in server/src/execution/query/search.ts (new module); integrate with execute.ts.

---

### SEARCH-002: Deterministic DFQL Merge over Candidates

**Priority**: P1  
**Audit Reference**: Recommendation #10, Intent I25/I48  
**Status in audit**: FAIL

**Statement**: The server MUST apply DFQL filters, sort, and pagination deterministically over the candidate id set returned by searchfn plugin, ensuring search results match DFQL semantics.

**Rationale**: Search + DFQL integration must be deterministic and correct.

**Acceptance Criteria**:
- [ ] Candidate ids from searchfn used as id filter (implicit "id in [candidates]" AND query.filters)
- [ ] Sort applied to filtered candidates
- [ ] Pagination applied to sorted results
- [ ] Results deterministic for same search + filters + sort
- [ ] nextCursor emitted correctly

**Test Vectors**: TV-SEARCH-MERGE-001, TV-SEARCH-FILTER-001, TV-SEARCH-SORT-001

**Notes**: Implement in server/src/execution/query/search.ts; merge candidates with filters via $and logic.

---

### SEARCH-003: Index Updates on Mutations

**Priority**: P1  
**Audit Reference**: Recommendation #10, Intent I48  
**Status in audit**: FAIL

**Statement**: The server MUST update searchfn indices for affected records after successful mutations by calling plugin.updateIndices(resource, records) in afterMutation hooks.

**Rationale**: Search indices must stay in sync with data for correct search results.

**Acceptance Criteria**:
- [ ] Mutation handler calls afterMutation hooks
- [ ] searchfn plugin's afterMutation hook receives mutation result
- [ ] Plugin updates indices for affectedIds
- [ ] Insert/merge/replace trigger index upsert
- [ ] Delete triggers index removal

**Test Vectors**: TV-SEARCH-INDEX-UPDATE-001

**Notes**: searchfn plugin implements afterMutation hook; server ensures hook execution.

---

## P2 Requirements (Completeness)

### FILTER-001: Nested Object Dot-Path Traversal

**Priority**: P2  
**Audit Reference**: Intent I21, Bundle B DFQL-FILTER-PATH-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST support dot-path filter keys that traverse nested object fields (e.g., `address.city`) by reading nested object properties, not just relation traversal.

**Rationale**: Current implementation only supports relation dot-paths; nested object fields require true object traversal.

**Acceptance Criteria**:
- [ ] Filter key "address.city" matches records where record.address.city equals value
- [ ] Nested object paths work with all filter operators
- [ ] Missing intermediate objects treated as null (no match unless is_null used)
- [ ] Relation dot-paths still work (existing behavior preserved)

**Test Vectors**: TV-FILTER-NESTED-OBJ-001, TV-FILTER-NESTED-MISSING-001

**Notes**: Extend server/src/execution/query/filters.ts evaluateFilter to detect object vs relation paths.

---

### FILTER-002: Additional Filter Operators

**Priority**: P2  
**Audit Reference**: Intent I21, Bundle B DFQL-FILTER-OPS-EXTRA-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST implement additional DFQL filter operators: `in`, `not_in`, `not_like`, `not_ilike`, `before`, `after`, `between`, `not_between`, `is_empty`, `is_not_empty`.

**Rationale**: Operators defined in intent and Bundle B; subset implemented; complete set needed for full DFQL coverage.

**Acceptance Criteria**:
- [ ] in: value in array
- [ ] not_in: value not in array
- [ ] not_like/not_ilike: negated SQL LIKE (case-sensitive/insensitive)
- [ ] before/after: date/time comparisons (< or >)
- [ ] between/not_between: value in/not in range [min, max]
- [ ] is_empty/is_not_empty: empty string or empty array or empty object

**Test Vectors**: TV-FILTER-OPS-IN-001, TV-FILTER-OPS-BETWEEN-001, TV-FILTER-OPS-EMPTY-001

**Notes**: Extend server/src/execution/query/filters.ts evaluateOperator.

---

### AGG-001: Aggregate Query Ordering

**Priority**: P2  
**Audit Reference**: Intent I31, Bundle B DFQL-GROUPBY-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST apply deterministic ordering to aggregate query results by sorting groups by group key fields, then by aggregation aliases when specified in sort, ensuring stable pagination.

**Rationale**: Aggregate query ordering is currently incomplete; determinism requires explicit ordering.

**Acceptance Criteria**:
- [ ] groupBy results sorted by group key fields (deterministic order)
- [ ] sort may reference aggregation aliases (e.g., "count:desc")
- [ ] Default ordering when sort omitted: group keys ascending
- [ ] Tie-breaker ordering deterministic

**Test Vectors**: TV-AGG-ORDER-001, TV-AGG-SORT-ALIAS-001

**Notes**: Implement in server/src/execution/query/aggregate.ts applyAggregationOrdering.

---

### AGG-002: Aggregate Pagination Determinism

**Priority**: P2  
**Audit Reference**: Intent I31  
**Status in audit**: PARTIAL

**Statement**: The server MUST support cursor pagination for aggregate queries with deterministic cursor generation based on group key values and aggregation alias values when used in sort.

**Rationale**: Aggregate pagination currently incomplete; nextCursor always null.

**Acceptance Criteria**:
- [ ] Aggregate query with limit: compute nextCursor from last group row
- [ ] Cursor maps sort keys (group fields + aggregation aliases) to values
- [ ] cursor.after resumes from last group deterministically
- [ ] nextCursor null when no more groups

**Test Vectors**: TV-AGG-PAGE-001, TV-AGG-CURSOR-001

**Notes**: Integrate aggregate ordering with pagination logic in execute.ts.

---

### LIMIT-001: maxPayloadBytes Enforcement

**Priority**: P2  
**Audit Reference**: Intent I57, Bundle A LIMIT-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST enforce `config.limits.maxPayloadBytes` (default 10MB) by rejecting requests with bodies exceeding the limit with `{ ok: false, error: { code: "LIMIT_EXCEEDED", message: "Request payload exceeds maximum size", details: { path: "$", max: N } } }`.

**Rationale**: Payload size limits prevent resource exhaustion and DoS.

**Acceptance Criteria**:
- [ ] config.limits.maxPayloadBytes defaults to 10MB (10485760 bytes)
- [ ] Request body size > maxPayloadBytes returns LIMIT_EXCEEDED before parsing
- [ ] Error details include max value
- [ ] Valid payloads process normally

**Test Vectors**: TV-LIMIT-PAYLOAD-001

**Notes**: Implement in server HTTP middleware before JSON parsing.

---

### LIMIT-002: Query Depth Limits

**Priority**: P2  
**Audit Reference**: Intent I57  
**Status in audit**: UNVERIFIED

**Statement**: The server SHOULD enforce a maximum filter nesting depth (e.g., 10 levels) and a maximum relation expansion depth (e.g., 5 levels) to prevent stack overflow and unbounded recursion.

**Rationale**: Deep nesting can cause performance issues and stack overflow.

**Acceptance Criteria**:
- [ ] Filter nesting depth > 10 returns LIMIT_EXCEEDED
- [ ] Relation expansion depth > 5 returns LIMIT_EXCEEDED
- [ ] Depth counting implemented in validation
- [ ] Configurable limits in server config

**Test Vectors**: TV-LIMIT-DEPTH-FILTER-001, TV-LIMIT-DEPTH-RELATION-001

**Notes**: Implement recursive depth tracking in validateFilters and materializeSelect.

---

### LIMIT-003: Relation Expansion Depth Limits

**Priority**: P2  
**Audit Reference**: Intent I57  
**Status in audit**: UNVERIFIED

**Statement**: The server SHOULD limit relation expansion depth in select tokens (e.g., nested tokens like "a.b.c.d.*") to prevent unbounded joins and query complexity.

**Rationale**: Deep relation traversal can cause performance issues and complex queries.

**Acceptance Criteria**:
- [ ] Nested relation expansion depth > configured limit returns LIMIT_EXCEEDED
- [ ] Default limit: 5 levels
- [ ] Configurable in server config
- [ ] Error details include path to deep token

**Test Vectors**: TV-LIMIT-REL-DEPTH-001

**Notes**: Implement in server/src/routes/query.ts validateSelect.

---

### OBS-001: Sensitive Field Redaction in Logs

**Priority**: P2  
**Audit Reference**: Intent I59, Bundle A OBS-001  
**Status in audit**: UNVERIFIED

**Statement**: The server SHOULD redact field values marked `encrypt: true` in schema from all log outputs, replacing values with "[REDACTED]" to prevent sensitive data leakage.

**Rationale**: Sensitive field protection is a security best practice.

**Acceptance Criteria**:
- [ ] Query/mutation logs redact encrypt: true field values
- [ ] Error logs redact encrypt: true field values in details
- [ ] Record snapshots in logs redact encrypt: true fields
- [ ] Redaction configurable (opt-out for dev environments)

**Test Vectors**: TV-OBS-REDACT-001

**Notes**: Implement log formatting helper in server/src/logging.ts; integrate with error responses.

---

### OBS-002: Request Metadata Logging

**Priority**: P2  
**Audit Reference**: Intent I59, Bundle A OBS-001  
**Status in audit**: PARTIAL

**Statement**: The server SHOULD log deterministic request metadata for all endpoints including endpoint, clientId, mutationId, resource, operation, and execution time for auditing and observability.

**Rationale**: Request logs enable debugging, auditing, and performance monitoring.

**Acceptance Criteria**:
- [ ] Every request logs: timestamp, endpoint, clientId (if present), mutationId (if present), resource, operation, duration_ms
- [ ] Logs use structured format (JSON or key=value)
- [ ] Logs exclude sensitive field values (use OBS-001 redaction)
- [ ] Configurable log level (info, debug, error)

**Test Vectors**: TV-OBS-LOG-001 (manual verification)

**Notes**: Implement logging middleware in server/src/server.ts.

---

### SYNC-001: serverSeq Atomicity Under Concurrency

**Priority**: P2  
**Audit Reference**: Intent I45, Bundle C SERVER-SEQ-001  
**Status in audit**: PARTIAL

**Statement**: The server MUST assign serverSeq using an atomic increment mechanism that guarantees monotonicity and uniqueness under concurrent mutation requests, using database-level atomic increment or CAS (compare-and-swap) retries.

**Rationale**: serverSeq ordering is the source-of-truth for conflict resolution; non-atomic assignment breaks sync correctness.

**Acceptance Criteria**:
- [ ] serverSeq increment uses DB-level atomic increment (e.g., Postgres SERIAL or SQLite AUTOINCREMENT)
- [ ] If atomic increment unavailable, use CAS retry loop with bounded retries
- [ ] Concurrent mutations receive unique, monotonic serverSeq values
- [ ] No duplicate serverSeq values under concurrency

**Test Vectors**: TV-SYNC-SERVERSEQ-CONCURRENT-001

**Notes**: Verify atomicity of server/src/execution/sync/change-tracking.ts getNextServerSeq; add integration test with concurrent mutations.

---

### SYNC-002: Clone Ordering Determinism

**Priority**: P2  
**Audit Reference**: Intent I51  
**Status in audit**: PASS

**Statement**: The server MUST return clone snapshot records ordered deterministically by id ascending within each table, ensuring clients receive identical snapshots for identical data regardless of DB storage order.

**Rationale**: Clone determinism enables snapshot comparison and consistent client state.

**Acceptance Criteria**:
- [ ] Clone orders records by id:asc per table
- [ ] Multiple clone requests for same data return identical order
- [ ] Join rows (many-many relations) also ordered deterministically

**Test Vectors**: TV-SYNC-CLONE-ORDER-001

**Notes**: Already implemented in server/src/execution/sync/clone.ts; add test to verify.

---

### SYNC-003: Remote-Only Table Enforcement

**Priority**: P2  
**Audit Reference**: Intent I10  
**Status in audit**: PARTIAL

**Statement**: The server MUST reject clone requests that include `isRemoteOnly: true` tables with `{ ok: false, error: { code: "DFQL_INVALID", message: "Table is remote-only and cannot be cloned", details: { path: "tables", table: "..." } } }`.

**Rationale**: Remote-only tables must not be synced to clients; server enforcement prevents accidental data leakage.

**Acceptance Criteria**:
- [ ] Clone request with isRemoteOnly table returns DFQL_INVALID
- [ ] Error details include table name
- [ ] Non-remote-only tables clone normally
- [ ] Client local query routing respects isRemoteOnly (always remote fallback)

**Test Vectors**: TV-SYNC-REMOTE-ONLY-001

**Notes**: Already partially implemented in server/src/execution/sync/clone.ts; add client-side enforcement in client/src/query.ts.

---

## Test Vectors Summary

This spec defines **80+ test vectors** across all requirements. Each vector includes:
- Vector ID (e.g., TV-AUTH-INV-JSON-001)
- Description
- Input (exact JSON request)
- Expected output (exact JSON response or error shape)
- Negative variants where applicable

Test vectors are organized by requirement area and stored in `TEST_VECTORS.md` for implementation verification.

## Implementation Phases

This spec defines a phased implementation plan across **16 phases** (PHASE_00 through PHASE_15) delivering incremental capability with independent verification at each phase. Phases are organized by:

1. **Foundation** (Phases 00-02): Core fixes (auth ordering, determinism, validation)
2. **Mutation Completeness** (Phases 03-05): Guards, replace, relation mutations
3. **Transact** (Phase 06): Atomic transactions, query steps, limits
4. **Pagination** (Phase 07): nextCursor emission, backwards pagination
5. **Storage & Offline** (Phases 08-09): Adapter validation, local DFQL expansion
6. **Extension & Docs** (Phase 10): RPC fixes, README corrections
7. **Python Parity** (Phases 11-13): Query, mutation, transact, sync endpoints
8. **Search Integration** (Phase 14): searchfn plugin integration
9. **Completeness** (Phase 15): Additional filters, aggregations, limits, observability

Each phase delivers a vertical slice with tests passing before proceeding. Detailed phase plans are in `phases/PHASE_XX.md` files.

## Definition of Done (Global)

A phase is complete when:
1. All deliverables (files/modules) created/modified
2. All implementation tasks checked off
3. All test vectors for covered requirements execute and pass
4. Manual verification steps completed (for docs/observability)
5. No regressions in existing tests
6. Code reviewed (if team workflow requires)
7. Phase completion report written with outcomes

The entire spec is complete when:
- All 16 phases complete
- All P0 and P1 requirements PASS
- All P2 requirements PASS or explicitly documented as deferred
- All 5 spec conflicts resolved
- All 3 spec gaps closed
- Audit re-run shows 100% PASS for intent items I01-I59
- Documentation 100% accurate with implementation
- Python-TypeScript parity verified end-to-end
