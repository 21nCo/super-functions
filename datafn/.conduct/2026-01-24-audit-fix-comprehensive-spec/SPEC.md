# DataFn Audit Fix Comprehensive Specification

## Metadata

- **timestamp**: 2026-01-24T19:25:00Z (UTC)
- **agent_name**: factory-droid
- **model**: Claude Sonnet 4.5
- **IDE/editor**: Factory Droid
- **workspace path**: `/Users/ar/dev/superfunctions`
- **project root**: `/Users/ar/dev/superfunctions/datafn`
- **OS**: darwin 25.0.0
- **shell**: zsh
- **repo**:
  - **git repo**: yes (`/Users/ar/dev/superfunctions`)
  - **branch**: `HEAD` (detached)
  - **commit**: `ec7e3e4d5938dca77997723a0378ea58ed0ed485`
  - **dirty**: yes (datafn/ is untracked)
- **spec_folder**: `.conduct/2026-01-24-audit-fix-comprehensive-spec`
- **spec_type**: `audit-fix`
- **spec_id**: `comprehensive`
- **input paths**:
  - `/Users/ar/dev/superfunctions/datafn/.conduct/audits/audit-full-2026-01-24-unknown-agent.md` (audit report)
  - `/Users/ar/dev/superfunctions/datafn/.conduct/datafn.intent.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/dfql.intent.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/spec.md`
  - `/Users/ar/dev/superfunctions/datafn/.conduct/implementation.md`
- **audited spec bundles**:
  - Bundle A: `/Users/ar/dev/superfunctions/datafn/.conduct/2026-01-18-spec/`
  - Bundle B: `/Users/ar/dev/superfunctions/datafn/.conduct/2026-01-19-change-spec/`
  - Bundle C: `/Users/ar/dev/superfunctions/datafn/.conduct/2026-01-23-audit-fix-change-spec/`
- **audit reference**: audit-full-2026-01-24-unknown-agent.md

## Overview

This specification addresses ALL fixes and leftovers identified in the comprehensive audit of the datafn implementation against original intent and three spec bundles. The audit identified critical issues across server execution, client offline capabilities, mutation semantics, transact atomicity, determinism violations, Python parity, and documentation.

**Scope**: This is a COMPREHENSIVE fix spec covering all 59 intent items, resolving 5 spec conflicts, closing 3 major spec gaps, and addressing 10 high-priority recommendations plus all additional leftovers.

**Goal**: Bring datafn implementation to full compliance with original intent across TypeScript and Python runtimes, ensuring deterministic behavior, correct DFQL semantics, complete sync/offline capabilities, and accurate documentation.

**Target users**: Developers building local-first reactive applications requiring offline sync, schema-driven APIs, and cross-language deployment.

**Target environments**: Browser (IndexedDB-backed client), Node.js/Bun server, Python server (FastAPI/Flask), browser extensions (service worker + RPC).

**Languages/packages**: TypeScript packages (@datafn/core, @datafn/client, @datafn/server, @datafn/svelte, @datafn/cli), Python package (datafn), using @superfunctions/http and @superfunctions/db abstractions.

## Glossary

- **DFQL**: DataFn Query Language - deterministic JSON protocol for queries, mutations, and transactions
- **DatafnEnvelope**: Canonical transport wrapper `{ ok: true, result: T } | { ok: false, error: DatafnError }`
- **DatafnError**: Error shape with `code`, `message`, and `details: { path: string, ...extra }`
- **Determinism**: Identical validated schema + identical DFQL + identical data → identical output
- **Schema-bounded**: Only declared tables/fields/relations are addressable; unknown references are rejected
- **Local-first**: Client queries execute locally against storage when tables are `ready`
- **Offlinability**: Client capability to queue mutations when remote unavailable and sync when reconnected
- **Idempotency**: `(clientId, mutationId)` tuple uniquely identifies mutations for safe retries
- **serverSeq**: Monotonic server-assigned sequence number establishing ordering for conflict resolution
- **Cursor**: Opaque pagination token derived from sort keys for stable result traversal
- **Hydration state**: Per-table state: `notStarted | hydrating | ready`
- **Remote-only table**: `isRemoteOnly: true` tables excluded from clone/offline hydration
- **Plugin**: Hook-based extensibility running `before*/after*` with deterministic ordering and fail-open/closed semantics
- **Extension context**: Browser extension architecture where background worker owns runtime, content/sidepanel use RPC transport

## Goals

1. **Fix all high-priority audit findings** (10 ranked recommendations)
2. **Resolve all FAIL-status intent items** (I05, I25, I28, I33, I35, I38, I48, I55, I56)
3. **Complete all PARTIAL-status intent items** to PASS
4. **Resolve 5 identified spec conflicts** (error paths, pagination, event filters, error code sets, search scope)
5. **Close 3 major spec gaps** (Bundle C narrow scope, Bundle A client under-specification, Bundle B SPEC.md-only semantics)
6. **Ensure determinism** across all execution paths
7. **Achieve Python-TypeScript server parity** for cross-language deployment
8. **Bring documentation to 100% accuracy** with implemented APIs

## Non-goals

- GraphQL generation (explicitly optional in bundles)
- Custom conflict resolution strategies beyond LWW (deferred; plugins may extend)
- Cascade mutation semantics (deferred; undefined in all bundles)
- Real-time push notifications via WebSocket (deferred; client-initiated sync only)
- Multi-tenant namespace isolation enforcement (host-provided; server validates namespace param when present)

## Hard Constraints

1. **Determinism is mandatory**: No `Date.now()`, `Math.random()`, or other nondeterministic sources in core execution paths
2. **Invalid JSON always returns `DFQL_INVALID`**: Authorization MUST NOT run before JSON parsing succeeds
3. **Schema-bounded validation**: Unknown resources/fields/relations MUST be rejected deterministically before adapter execution
4. **Storage adapter inputs MUST be validated**: Adapters MUST reject invalid hydration states, cursor formats, etc. deterministically
5. **Transact MUST be atomic**: When `atomic: true`, all mutation steps commit or all roll back
6. **No nested monorepos**: All packages remain in single Turbo workspace
7. **@superfunctions/http and @superfunctions/db abstractions**: Server MUST use shared packages for routing and database
8. **Tests MUST pass**: All test vectors MUST execute and pass before phase completion

## Public API

### Core Package (@datafn/core)

```typescript
// Envelope
export type DatafnEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: DatafnError };

export interface DatafnError {
  code: DatafnErrorCode;
  message: string;
  details: { path: string; [key: string]: unknown };
}

export type DatafnErrorCode =
  | "SCHEMA_INVALID"
  | "DFQL_INVALID"
  | "DFQL_UNKNOWN_RESOURCE"
  | "DFQL_UNKNOWN_FIELD"
  | "DFQL_UNKNOWN_RELATION"
  | "DFQL_UNSUPPORTED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LIMIT_EXCEEDED"
  | "TRANSPORT_ERROR"
  | "INTERNAL";

// Schema validation
export function validateSchema(schema: unknown): DatafnEnvelope<DatafnSchema>;

// DFQL normalization
export function normalizeDfql(dfql: unknown): unknown;
export function dfqlKey(dfql: unknown): string;

// Envelope unwrapping
export function unwrapEnvelope<T>(envelope: DatafnEnvelope<T>): T; // throws on ok:false

// Events
export interface DatafnEvent {
  type: "mutation_applied" | "mutation_rejected" | "sync_started" | "sync_completed" | "sync_failed";
  resource: string;
  ids?: string[];
  mutationId?: string;
  action?: "insert" | "merge" | "replace" | "delete";
  fields?: string[];
  context?: unknown;
  error?: DatafnError;
}

export interface DatafnEventFilter {
  type?: DatafnEvent["type"] | DatafnEvent["type"][];
  resource?: string | string[];
  ids?: string | string[];
  mutationId?: string | string[];
  action?: DatafnEvent["action"] | DatafnEvent["action"][];
  fields?: string[]; // intersection: event.fields includes ALL filter.fields
  contextKeys?: string[]; // all keys present: event.context is object && all filter keys exist
}
```

### Client Package (@datafn/client)

```typescript
export interface DatafnClientConfig {
  schema: DatafnSchema;
  remote: DatafnRemoteAdapter;
  storage?: DatafnStorageAdapter;
  plugins?: DatafnPlugin[];
  offlinability?: boolean; // default false
}

export function createDatafnClient(config: DatafnClientConfig): DatafnClient;

export interface DatafnClient {
  // Table registry
  table(name: string): DatafnTable;
  [tableName: string]: DatafnTable | unknown; // proxy access

  // Sync
  sync: {
    seed(params: { clientId: string }): Promise<{ ok: true }>;
    clone(params: { clientId: string; tables?: string[] }): Promise<DatafnCloneResult>;
    pull(params: { clientId: string; cursors?: Record<string, string> }): Promise<DatafnPullResult>;
    push(params: { clientId: string; mutations: DatafnMutation[] }): Promise<DatafnPushResult>;
  };

  // Transact
  transact(request: DatafnTransactRequest): Promise<DatafnTransactResult>;

  // Events
  subscribe(handler: (event: DatafnEvent) => void, filter?: DatafnEventFilter): () => void;
}

export interface DatafnTable {
  name: string;
  version: string;
  query(query: DatafnQuery | DatafnQuery[]): Promise<DatafnQueryResult | DatafnQueryResult[]>;
  mutate(mutation: Omit<DatafnMutation, "resource" | "version">): Promise<DatafnMutationResult>;
  transact(request: Omit<DatafnTransactRequest, "resource" | "version">): Promise<DatafnTransactResult>;
  subscribe(handler: (event: DatafnEvent) => void, filter?: Omit<DatafnEventFilter, "resource">): () => void;
  signal(query: DatafnQuery): DatafnSignal<DatafnQueryResult>;
}

export interface DatafnSignal<T> {
  get(): T | undefined;
  loading: boolean;
  error: DatafnError | null;
  refresh(): Promise<void>;
  subscribe(callback: () => void): () => void;
}
```

### Server Package (@datafn/server)

```typescript
export interface DatafnServerConfig {
  schema: DatafnSchema;
  db: Adapter; // @superfunctions/db.Adapter
  authorize?: (ctx: unknown, action: string, payload: unknown) => Promise<boolean | { ok: boolean; reason?: string }>;
  plugins?: DatafnPlugin[];
  limits?: {
    maxLimit?: number; // default 1000
    maxTransactSteps?: number; // default 100
    maxPayloadBytes?: number; // default 10MB
  };
  namespace?: string; // optional tenant/workspace isolation key
  rest?: boolean; // enable REST wrappers (default true)
}

export function createDatafnServer(config: DatafnServerConfig): DatafnServer;

export interface DatafnServer {
  routes: HttpRoute[]; // @superfunctions/http routes
  // GET /datafn/status
  // POST /datafn/seed
  // POST /datafn/query
  // POST /datafn/mutation
  // POST /datafn/transact
  // POST /datafn/clone
  // POST /datafn/pull
  // POST /datafn/push
  // (optional REST wrappers):
  // GET /datafn/resources/:table
  // POST /datafn/resources/:table
  // PUT /datafn/resources/:table/:id
  // DELETE /datafn/resources/:table/:id
}
```

### Svelte Package (@datafn/svelte)

```typescript
export function toSvelteStore<T>(signal: DatafnSignal<T>): Readable<T | undefined>;
```

### CLI Package (@datafn/cli)

```typescript
// Programmatic API
export function validateSchemaFile(path: string): DatafnEnvelope<DatafnSchema>;
export function generateTypes(schema: DatafnSchema, options?: CodegenOptions): string;
export function diffSchemas(oldSchema: DatafnSchema, newSchema: DatafnSchema): SchemaDiff;
export function renderMigration(diff: SchemaDiff, dialect: "postgres" | "mysql" | "sqlite"): string;

// CLI commands
// datafn validate <schema.json>
// datafn codegen <schema.json> --output <path>
// datafn migrate diff <old.json> <new.json>
// datafn migrate render <diff.json> --dialect postgres
```

### Python Package (datafn)

```python
from datafn import create_datafn_server, DatafnServerConfig, DatafnSchema

def create_datafn_server(config: DatafnServerConfig) -> DatafnServer:
    """
    Create a datafn server instance with FastAPI/Flask route handlers.
    Returns a server object with .routes list for mounting.
    """
    pass

class DatafnServer:
    routes: List[Route]  # Framework-specific route objects
    # Same endpoint semantics as TypeScript server
```

## Data Formats / Protocol

### DFQL Query Request

```typescript
interface DatafnQuery {
  resource: string;
  version: string;
  select?: string[]; // field names + relation tokens
  filters?: Record<string, unknown>; // field equality, arrays (in), operators, $and/$or
  search?: {
    query: string;
    type: "fullText" | "semantic";
    fields?: string[];
    topK?: number;
  };
  sort?: (string | { field: string; direction: "asc" | "desc" })[]; // "field:asc", "field:desc", or object form
  limit?: number;
  offset?: number;
  cursor?: {
    after?: Record<string, unknown>; // sort key values
    before?: Record<string, unknown>;
  };
  count?: boolean;
  omit?: string[];
  groupBy?: string[];
  aggregations?: Record<string, { op: "count" | "countDistinct" | "sum" | "avg" | "min" | "max"; field?: string }>;
  having?: Record<string, unknown>;
}
```

### DFQL Query Response

```typescript
// Non-aggregate
interface DatafnQueryResult {
  data: Record<string, unknown>[];
  count?: number; // when count: true
  nextCursor?: Record<string, unknown> | null; // null when no more pages
}

// Aggregate (when groupBy present)
interface DatafnAggregateResult {
  groups: Array<Record<string, unknown>>; // group keys + aggregation aliases
  nextCursor?: Record<string, unknown> | null;
}
```

### DFQL Mutation Request

```typescript
interface DatafnMutation {
  resource: string;
  version: string;
  mutationId: string;
  clientId: string;
  timestamp?: string; // ISO 8601; client-provided for ordering context
  context?: unknown; // arbitrary metadata for event filtering
  operation: "insert" | "merge" | "replace" | "delete" | "relate" | "modifyRelation" | "unrelate";
  id?: string | string[]; // target record id(s)
  record?: Record<string, unknown>; // for insert/merge/replace
  records?: Record<string, unknown>[]; // bulk insert alternative
  if?: Record<string, unknown>; // optimistic concurrency guard (filter-like)
  relations?: Record<string, RelationMutationPayload>; // relation name → payload
}

type RelationMutationPayload =
  | string // shorthand: id
  | string[] // shorthand: ids
  | { $ref: string; [metadataKey: string]: unknown } // many-many join metadata
  | { $ref: string; [metadataKey: string]: unknown }[];
```

### DFQL Mutation Response

```typescript
interface DatafnMutationResult {
  ok: boolean;
  mutationId: string;
  affectedIds: string[];
  errors?: Array<{
    code: DatafnErrorCode;
    message: string;
    path: string; // JSONPath-like
    retryable: boolean;
  }>;
}
```

### DFQL Transact Request/Response

```typescript
interface DatafnTransactRequest {
  transactionId?: string; // optional idempotency key
  atomic?: boolean; // default true
  steps: Array<{ query: DatafnQuery } | { mutation: Omit<DatafnMutation, "resource" | "version"> & { resource: string; version: string } }>;
}

interface DatafnTransactResult {
  ok: boolean;
  transactionId?: string;
  results: Array<DatafnQueryResult | DatafnMutationResult>; // corresponds to steps order
}
```

### Sync Requests/Responses

```typescript
// Seed
interface DatafnSeedRequest {
  clientId: string;
}
interface DatafnSeedResult {
  ok: true;
}

// Clone
interface DatafnCloneRequest {
  clientId: string;
  tables?: string[]; // defaults to all non-remote-only tables
}
interface DatafnCloneResult {
  data: Record<string, Record<string, unknown>[]>; // table → records
  cursors: Record<string, string>; // table → cursor (serverSeq-derived)
}

// Pull
interface DatafnPullRequest {
  clientId: string;
  cursors?: Record<string, string>; // table → last cursor
}
interface DatafnPullResult {
  records: Record<string, Record<string, unknown>[]>; // table → upserts
  deleted: Record<string, string[]>; // table → deleted ids
  cursors: Record<string, string>; // table → updated cursor
}

// Push
interface DatafnPushRequest {
  clientId: string;
  mutations: DatafnMutation[];
}
interface DatafnPushResult {
  applied: string[]; // applied mutationIds
  errors: Array<{ mutationId: string; error: DatafnError }>;
}
```

## Semantics

### DFQL Select Tokens

**Baseline**: Omitted `select` returns all base fields (no relation expansions).

**Relation tokens**:
- `relation` → ids only (string or string[] based on cardinality)
- `relation.*` → expanded related record(s)
- `relation.#` → many-many join rows `[{from, to, ...metadata}]`
- `relation.*#` → expanded records with `$relation_metadata`
- `relation.**` → htree descendants (all levels)
- `children.*` → htree immediate children
- `children.**` → htree all descendants
- `parent.*` → htree ordered ancestor chain (root → immediate parent)

**Nested tokens**: `tasks.tags.*` expands `tasks` relation, then `tags` relation on each task.

**Omit**: Removes specified fields from output (including nested expansions); `id` always preserved.

### DFQL Filters

**Scalar filters**:
- `field: value` → equality
- `field: [a, b, c]` → membership ("in")

**Operator objects**:
- `{ eq, ne, gt, gte, lt, lte, like, not_like, ilike, not_ilike }`
- `{ in, not_in }` → array membership
- `{ before, after, between, not_between }` → date/time comparisons
- `{ is_null, is_not_null, is_empty, is_not_empty }`

**Compound filters**:
- `$and: [...]` → all must match
- `$or: [...]` → any may match
- Multiple keys in single object → implicit AND

**Dot-path filters**:
- `parent.id` → scalar dot-path (nested object or relation traversal)
- Default semantics for multi-row relations: ANY-match ("exists a related row matching")

**Relation quantifiers**:
- `relationName: { $any: { ...filter } }` → at least one related row matches
- `relationName: { $all: { ...filter } }` → all related rows match (false when zero rows)
- `relationName: { $none: { ...filter } }` → no related rows match (true when zero rows)

### DFQL Sort

**Forms**:
- `"field"` or `"field:asc"` → ascending
- `"field:desc"` → descending
- `{ field, direction: "asc" | "desc" }`

**Determinism**: If `sort` omitted, server applies deterministic default (`id:asc`). For cursor pagination, `sort` MUST include `id` as final tie-breaker.

### DFQL Pagination

**Offset-based**:
- `limit` + `offset`
- Stable when combined with deterministic `sort`

**Cursor-based**:
- `cursor.after` / `cursor.before` + `sort` with `id` tie-breaker
- Server emits `nextCursor` when more pages exist, else `null`
- Cursor object maps sort keys to last-seen values

**Count**: When `count: true`, result includes total row count matching filters before pagination.

### DFQL Aggregations

- `groupBy`: Makes query aggregate, returns `groups[]` instead of `data[]`
- `aggregations`: `{ alias: { op, field? } }` where op is `count | countDistinct | sum | avg | min | max`
- `having`: Filter grouped rows after aggregations computed (may reference group keys or aggregation aliases)
- Relation expansions in `select` MUST be rejected when `groupBy` present

### DFQL Search

- When `search` block present and `searchfn` plugin installed:
  1. Plugin selects candidate ids via full-text or semantic search
  2. Server applies DFQL `filters` + `sort` + pagination deterministically over candidate set
- Search absent or plugin not installed: search block MUST be rejected with `DFQL_UNSUPPORTED`

### DFQL Mutation Operations

**insert**:
- Creates new record(s)
- `id` may be client-provided or server-generated (schema-defined)
- Server applies schema defaults and required constraints

**merge**:
- Updates existing record by merging provided fields
- Leaves unspecified fields unchanged
- Creates record if not found (upsert semantics)

**replace**:
- Replaces existing record entirely
- Unspecified fields cleared to schema defaults or null
- Fails if record not found (no upsert)

**delete**:
- Soft delete (sets `isArchived: true, trashInformation: {...}`) or hard delete (schema-defined)
- May cascade on specified relations (if cascade semantics implemented; currently deferred)

**relate**:
- Establishes relation between records
- For many-many, creates join row with optional metadata

**modifyRelation**:
- Updates join row metadata for existing many-many relation
- Validates metadata keys against relation schema

**unrelate**:
- Removes relation between records
- For many-many, deletes join row

### Optimistic Concurrency (`if` guards)

- `if` uses same filter semantics as query filters
- Server applies mutation only when guard matches current server record state
- Guard mismatch returns top-level `{ ok: false, error: { code: "CONFLICT", ... } }`

### Transact Atomicity

- `atomic: true` (default): All mutation steps commit or all roll back (DB transaction)
- `atomic: false`: Mutations applied in order; partial commit allowed on failures
- Steps executed in array order
- Query steps read current transaction state (read-your-writes)
- Server enforces `maxTransactSteps` limit

### Idempotency

- All mutations require `(clientId, mutationId)` tuple
- Server deduplicates replays using `__datafn_idempotency` table
- On replay: server returns cached result with `deduped: true` metadata

### Sync Ordering & Conflicts

- Server assigns monotonic `serverSeq` per namespace for all applied mutations
- Conflict resolution: last-write-wins (LWW) by `serverSeq` ordering
- Cursors derived from `serverSeq` for stable incremental sync
- Client changelog ordered by local application time; server reorders by `serverSeq` on push

### Offlinability & Hydration

**Hydration states** (per table):
- `notStarted`: No local data
- `hydrating`: Clone/pull in progress
- `ready`: Local data complete and queryable

**Query routing**:
- `ready` tables → local execution
- `hydrating` tables → remote fallback (preserves DFQL semantics)
- `notStarted` tables → remote fallback
- Remote-only tables (`isRemoteOnly: true`) → always remote

**Mutation routing**:
- Online: remote execution → emit `mutation_applied` on success
- Offline (transport error): append to changelog → optimistic local write → emit `mutation_applied`

**Changelog**:
- Ordered list of pending DFQL mutations
- Deduplicated by `(clientId, mutationId)`
- Push sends changelog; on success, clear acknowledged entries

## Invariants

1. **Determinism**:
   - Identical schema + identical DFQL + identical data → identical output
   - No `Date.now()`, `Math.random()`, or nondeterministic sources in execution paths
   - Timestamps/IDs in internal state may be nondeterministic but MUST NOT affect output ordering/content

2. **Invalid JSON always returns `DFQL_INVALID`**:
   - Authorization MUST NOT run before JSON parsing succeeds
   - Invalid JSON MUST return `{ ok: false, error: { code: "DFQL_INVALID", message: "Invalid JSON", details: { path: "$" } } }`

3. **Schema-bounded validation**:
   - Unknown resources/fields/relations MUST be rejected with deterministic error codes before adapter execution
   - Validation errors MUST be top-level `ok: false` envelopes

4. **Execution errors surface deterministically**:
   - Query/mutation execution errors MUST NOT be swallowed as empty results
   - Adapter errors MUST be caught and returned as `{ ok: false, error: { code: "INTERNAL", ... } }`

5. **Cursor pagination stability**:
   - `sort` for cursor pagination MUST include `id` as final tie-breaker
   - `nextCursor` emitted when more pages exist, else `null`

6. **Relation expansion ordering**:
   - Many-many relations with `order` metadata: primary sort by `order`, secondary by deterministic id tie-breaker
   - Other relations: deterministic id-based ordering

7. **Storage adapter input validation**:
   - Adapters MUST reject invalid hydration state transitions
   - Adapters MUST reject invalid cursor formats
   - Adapters MUST reject invalid changelog entries (missing clientId/mutationId)

8. **Transact atomicity**:
   - `atomic: true` → DB transaction wraps all mutation steps
   - Rollback on first failure
   - Query steps read-your-writes within transaction

9. **Plugin determinism**:
   - Hooks execute in registration order
   - `runsOn` enforcement (client-only plugins don't run on server)
   - `before*` hooks fail-closed (errors abort request)
   - `after*` hooks fail-open (errors logged but don't abort)

10. **Sync monotonicity**:
    - Cursors never move backwards
    - Pull returns changes since cursor; new cursor always ≥ old cursor

## Security

1. **Authorization boundaries**:
   - `authorize(ctx, action, payload)` called exactly once per request after JSON parsing succeeds
   - Parsed payload passed to authorize for POST endpoints; `null` for GET /datafn/status
   - Denied actions return `{ ok: false, error: { code: "FORBIDDEN", ... } }`

2. **Schema-bounded enforcement**:
   - Server validates all DFQL against schema before execution
   - Unknown resources/fields/relations rejected regardless of authorization

3. **Field-level sensitivity**:
   - Fields marked `encrypt: true` in schema MUST NOT appear in logs (deferred; currently not enforced)
   - Selection/omit semantics apply server-side after authorization

4. **Multi-tenancy** (optional):
   - Server config accepts `namespace` parameter
   - When present, all internal tables (`__datafn_*`) scoped by namespace
   - Cross-namespace data leakage prevented by namespace column in queries

5. **Input validation**:
   - All user-provided strings validated against schema constraints (maxLength, pattern, enum)
   - Array/object depth limits enforced (prevent stack overflow)

## Limits/Caps

Server config defines:
- `maxLimit`: Query result limit cap (default 1000)
- `maxTransactSteps`: Transact step count cap (default 100)
- `maxPayloadBytes`: Request body size cap (default 10MB)

Violations return `{ ok: false, error: { code: "LIMIT_EXCEEDED", ... } }`.

## Observability

1. **Logs**:
   - Server logs MUST include request metadata: endpoint, clientId, mutationId, resource, operation
   - Sensitive fields (encrypt: true) MUST be redacted (deferred; currently not enforced)

2. **Events**:
   - Client emits `mutation_applied`, `mutation_rejected`, `sync_started`, `sync_completed`, `sync_failed`
   - Events include deterministic metadata: `action`, `fields`, `contextKeys`

3. **Status endpoint**:
   - Returns schema hash + capabilities + DB health
   - Clients use for compatibility checks

## Compatibility / Versioning

1. **Schema versioning**:
   - Each resource has `version` field (e.g., "1", "1.0", "v2")
   - DFQL requests specify `version` for compatibility
   - Server validates request version against schema

2. **Capability advertisement**:
   - `/datafn/status` returns fixed capability strings: `dfql.query`, `dfql.mutation`, `dfql.transact`, `sync.seed`, `sync.clone`, `sync.pull`, `sync.push`
   - Clients check capabilities before using features

3. **Migration tooling**:
   - CLI diffs schema versions deterministically
   - Generates SQL migrations for schema changes
   - Handles field additions, renames, type changes, relation changes

## Undefined / Explicitly Deferred

The following are explicitly OUT OF SCOPE for this spec (deferred to future work):

1. **Cascade mutation semantics**: Delete cascades on relations are not specified
2. **Custom conflict resolution strategies**: Only LWW by serverSeq supported; plugins may extend
3. **Real-time push notifications**: Client-initiated sync only; no WebSocket/SSE
4. **GraphQL generation**: Explicitly optional in all bundles
5. **Field-level encryption enforcement**: Schema supports `encrypt: true` but runtime enforcement deferred
6. **Field-level permissions**: Schema supports field-level `permissions` but enforcement deferred
7. **Vector search**: `search.type: "semantic"` accepted but implementation deferred (requires vector plugin)
8. **Advanced relation mutation targeting**: Complex `where` clauses in relation mutations deferred
9. **Soft delete behavior configuration**: Currently hardcoded; configuration deferred
10. **Multi-region sync**: Single-region sync only; cross-region topology deferred
