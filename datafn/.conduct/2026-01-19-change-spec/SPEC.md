## datafn — Change Spec (v0 intent completion)

**Status**: Draft  
**Spec ID**: `2026-01-19-change-spec`  
**Last updated**: 2026-01-19  
**Primary source of intent**:  
- `agent/intent/datafn/datafn.intent.md`  
- `superfunctions/datafn/.conduct/spec.md`  

This document is a **change specification** to align the current `@datafn/*` implementation with the original v0 intent, including:
- the **client table registry API** (`datafn.<table>.query/mutate/subscribe/signal`)
- a full **client query + transact + sync** surface (not mutation-only)
- **signal-backed reactive queries** suitable for `@datafn/svelte`
- **server completeness** gaps required by the original intent (DB adapter integration, envelope consistency, auth payload, conflict ordering, sync correctness)
- **ecosystem features** promised by the original spec/intent (plugins, richer subscriptions, DFQL completeness, offline persistence + hydration, extension RPC, codegen, Python SDK, migrations, REST wrappers)

Normative keywords **MUST**, **SHOULD**, and **MAY** are used as defined in RFC 2119.

Anything not specified is **Undefined** and therefore not required.

---

## Overview

### Baseline (current implementation)

As of 2026-01-19, the repo contains:
- `@datafn/server`: DFQL query/mutation/transact/sync endpoints (with a `DatafnEnvelope` transport wrapper).
- `@datafn/core`: schema validation + DFQL normalization + shared types.
- `@datafn/client`: **mutation + events only** (no query, no table registry, no signals).
- `@datafn/svelte`: `toSvelteStore(signal)` adapter only.

### Problem this change spec solves

The original v0 intent requires an ergonomic client surface:
- `datafn.<table>.query(...)`
- `datafn.<table>.mutate(...)`
- `datafn.<table>.signal(...)` for reactive reads in Svelte
- `datafn.<table>.subscribe(...)` for imperative change handling

The current implementation does not provide this, making the client API incomplete and the Svelte README effectively unusable for real `datafn` usage.

This change spec explicitly enumerates all known intent-vs-code gaps as requirements (see `REQUIREMENTS.md`) and test vectors (see `TEST_VECTORS.md`).

---

## Context

- **Project name**: `datafn`
- **One-sentence goal**: Provide a schema-bounded data runtime with DFQL query/mutation, reactive signals, and sync.
- **Target users**: Superfunctions app developers (Nucleus/web + browser extension) building reactive, offline-capable apps.
- **Target environments**:
  - Client: browser + extension contexts; Node for tests.
  - Server: Node 18+ with Fetch `Request`/`Response` via `@superfunctions/http`.
- **Languages/packages**: TypeScript packages `@datafn/core`, `@datafn/client`, `@datafn/server`, `@datafn/svelte`.
- **Integrations**:
  - HTTP: `@superfunctions/http`
  - DB: `@superfunctions/db` (required by this change spec)
  - Plugins: `searchfn` integration is defined as P2 in this spec.
- **Hard constraints**:
  - Schema-boundedness and deterministic behavior.
  - No raw SQL execution or arbitrary server code embedded in DFQL.

---

## Glossary

- **Client instance**: The object returned by `createDatafnClient(...)`.
- **Table handle / DatafnTable**: Per-resource API handle returned by `client.table("task")` or `client.task`.
- **Table registry**: The mechanism that exposes table handles via `client.<tableName>`.
- **DFQL**: JSON-based query/mutation protocol described in `datafn/.conduct/dfql.intent.md`.
- **Remote adapter**: A transport layer used by the client to call server endpoints (`/datafn/query`, `/datafn/mutation`, etc.).
- **Signal**: A reactive primitive with `{ get, subscribe }` used to notify consumers of changes.

---

## Goals / Non-goals

### Goals

- The client API MUST provide **table handles** and **table registry** (`client.table(name)` and `client.<table>`) (CLIENT-REG-001, CLIENT-REG-002).
- The client API MUST provide **queries** and **signal-backed reactive queries** (CLIENT-QUERY-001, CLIENT-SIGNAL-001).
- `@datafn/svelte` documentation MUST show usage with real `datafn` signals (not hand-rolled placeholders) (DOC-001).
- The server MUST have durable persistence via `@superfunctions/db` and consistent envelopes (SERVER-DB-001, SERVER-DB-002, SERVER-ENVELOPE-001).
- The server MUST support deterministic sync conflict defaults (SERVER-CONFLICT-001) and persistent clone/pull/push semantics (SERVER-SYNC-001..003).
- The runtime MUST support plugins and richer subscriptions as described by original intent (PLUG-CLIENT-001, PLUG-SERVER-001, SUB-EXTRA-001).
- The change SHOULD be implementable incrementally via phases.

### Non-goals

- GraphQL generation is optional (API-GEN-GQL-001 is SHOULD).
- Advanced reactive dependency tracking (refreshing signals based on relation expansion graphs) is out of scope for v0; signals refresh on same-resource mutations only.

---

## Public API (TypeScript)

### `@datafn/client`

#### `createDatafnClient`

```ts
import type {
  DatafnSchema,
  DatafnEvent,
  DatafnEventFilter,
  DatafnPlugin,
  DatafnSignal,
} from "@datafn/core";

export type DatafnQuery = Record<string, unknown>;
export type DatafnMutation = Record<string, unknown>;
export type DatafnTransact = Record<string, unknown>;

export type DatafnQueryResult =
  | { data: unknown[]; count?: number; nextCursor: unknown | null }
  | { groups: unknown[]; nextCursor: unknown | null };

export type DatafnMutationResult = {
  ok: boolean;
  mutationId: string;
  affectedIds: string[];
  errors?: Array<{ code: string; message: string; path?: string; retryable?: boolean }>;
  deduped?: boolean;
};

export type DatafnTransactResult = { ok: boolean; results: unknown[] };

export type DatafnClientError = {
  code:
    | "SCHEMA_INVALID"
    | "DFQL_INVALID"
    | "DFQL_UNKNOWN_RESOURCE"
    | "DFQL_UNKNOWN_FIELD"
    | "DFQL_UNSUPPORTED"
    | "FORBIDDEN"
    | "TRANSPORT_ERROR"
    | "INTERNAL";
  message: string;
  details: { path: string; [k: string]: unknown };
};

export interface DatafnRemoteAdapter {
  query(q: DatafnQuery | DatafnQuery[]): Promise<unknown>; // supports wrapped or raw responses
  mutation(m: DatafnMutation | DatafnMutation[]): Promise<unknown>;
  transact(t: DatafnTransact): Promise<unknown>;
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
}

export type DatafnHydrationState = "notStarted" | "hydrating" | "ready";

export type DatafnChangelogEntry = {
  /** Monotonic local sequence (assigned by storage adapter). */
  seq: number;
  clientId: string;
  mutationId: string;
  mutation: DatafnMutation;
  timestampMs: number;
};

export interface DatafnStorageAdapter {
  // Records (by resource)
  getRecord(resource: string, id: string): Promise<Record<string, unknown> | null>;
  listRecords(resource: string): Promise<Record<string, unknown>[]>;
  upsertRecord(resource: string, record: Record<string, unknown>): Promise<void>;
  deleteRecord(resource: string, id: string): Promise<void>;

  // Join rows (many-many)
  listJoinRows(relationKey: string): Promise<Array<Record<string, unknown>>>;
  upsertJoinRow(relationKey: string, row: Record<string, unknown>): Promise<void>;
  deleteJoinRow(relationKey: string, from: string, to: string): Promise<void>;

  // Sync state
  getCursor(resource: string): Promise<string | null>;
  setCursor(resource: string, cursor: string): Promise<void>;
  getHydrationState(resource: string): Promise<DatafnHydrationState>;
  setHydrationState(resource: string, state: DatafnHydrationState): Promise<void>;

  // Offline change log
  changelogAppend(entry: Omit<DatafnChangelogEntry, "seq">): Promise<DatafnChangelogEntry>;
  changelogList(options?: { limit?: number }): Promise<DatafnChangelogEntry[]>;
  changelogAck(options: { throughSeq: number }): Promise<void>;
}

export interface DatafnClientConfig {
  schema: DatafnSchema;
  remote: DatafnRemoteAdapter;
  plugins?: DatafnPlugin[];
  /**
   * Stable client/device identifier used for idempotency and offline change logs.
   * Required when `storage` is provided.
   */
  clientId?: string;
  /**
   * Local persistence adapter. When provided, local-first query/mutation behavior is enabled
   * as specified by CLIENT-OFFLINE-* requirements.
   */
  storage?: DatafnStorageAdapter;
  /**
   * Timestamp provider (used for deterministic tests).
   * Default: () => Date.now()
   */
  getTimestamp?: () => number;
}

export interface DatafnClient {
  // DFQL surfaces
  query(q: DatafnQuery | DatafnQuery[]): Promise<DatafnQueryResult | DatafnQueryResult[]>;
  mutate(m: DatafnMutation | DatafnMutation[]): Promise<DatafnMutationResult | DatafnMutationResult[]>;
  transact(t: DatafnTransact): Promise<DatafnTransactResult>;

  // events
  subscribe(handler: (e: DatafnEvent) => void, filter?: DatafnEventFilter): () => void;

  // table registry
  table<TRecord = unknown>(name: string): DatafnTable<TRecord>;

  /**
   * Sync facade.
   *
   * - Without `storage`, these delegate to remote and return responses.
   * - With `storage`, clone/pull are also applied to local storage and update hydration state.
   */
  sync: {
    seed(payload: unknown): Promise<unknown>;
    clone(payload: unknown): Promise<unknown>;
    pull(payload: unknown): Promise<unknown>;
    push(payload: unknown): Promise<unknown>;
  };
}

export interface DatafnTable<TRecord = unknown> {
  name: string;
  version: number;

  query(q: Omit<DatafnQuery, "resource" | "version">): Promise<DatafnQueryResult>;
  mutate(m: Omit<DatafnMutation, "resource" | "version"> | Array<Omit<DatafnMutation, "resource" | "version">>): Promise<DatafnMutationResult | DatafnMutationResult[]>;
  transact(t: DatafnTransact): Promise<DatafnTransactResult>;

  /**
   * Reactive query signal:
   * - value is the latest successful query result
   * - recomputes on relevant `mutation_applied` events (see Semantics)
   */
  signal(q: Omit<DatafnQuery, "resource" | "version">): DatafnSignal<DatafnQueryResult>;

  subscribe(handler: (e: DatafnEvent) => void, filter?: DatafnEventFilter): () => void;
}

export function createDatafnClient(config: DatafnClientConfig): DatafnClient;
```

#### Table registry via property access

The returned `DatafnClient` MUST be a `Proxy` that implements (CLIENT-REG-001, CLIENT-REG-002):
- `client.<tableName>` returning the same `DatafnTable` as `client.table("<tableName>")` for declared resources.
- Unknown table property access MUST throw a `DatafnClientError` with `code: "DFQL_UNKNOWN_RESOURCE"` unless the property is a known non-table property (`query`, `mutate`, `subscribe`, `table`, `sync`, etc.) or a safe reserved key (`then`, `inspect`, `toJSON`) (CLIENT-REG-002).

This requirement exists to satisfy the original v0 authoring surface (`datafn.<table>.query/...`).

---

## Data formats / protocol

### DFQL wire shapes

DFQL shapes are defined in `datafn/.conduct/dfql.intent.md`. This spec change does not redefine DFQL itself; it defines the **client-facing SDK behavior**.

### Remote adapter response compatibility

The client MUST accept **either** of these server response shapes from the remote adapter (CLIENT-REMOTE-001):

1) **Wrapped** (`DatafnEnvelope`, current server behavior):

```json
{ "ok": true, "result": { "data": [], "nextCursor": null } }
```

```json
{ "ok": false, "error": { "code": "DFQL_INVALID", "message": "Invalid DFQL: ...", "details": { "path": "$" } } }
```

2) **Unwrapped** (legacy/alternate transport):

```json
{ "data": [], "nextCursor": null }
```

Error handling for unwrapped transport is **Undefined**; implementations SHOULD prefer wrapped server responses for deterministic error handling.

### Extension RPC envelope (background-owned runtime)

For extension contexts (EXT-001), this spec defines a canonical JSON message envelope for DFQL RPC:

- `DatafnRpcRequest`:
  - `id: string` (required, caller-generated)
  - `method: "query" | "mutation" | "transact" | "seed" | "clone" | "pull" | "push" | "subscribe" | "unsubscribe"` (required)
  - `payload: unknown` (required)
- `DatafnRpcResponse`:
  - `id: string` (required, echoes request id)
  - `envelope: DatafnEnvelope<unknown>` (required)
- `DatafnRpcEvent` (notification):
  - `type: "event"`
  - `subscriptionId: string`
  - `event: DatafnEvent`

RPC errors are represented as `envelope.ok:false` with the same error codes used by HTTP (`DFQL_INVALID`, `FORBIDDEN`, `INTERNAL`, etc.).

---

## Semantics

### Schema validation

`createDatafnClient` MUST validate `config.schema` via `@datafn/core.validateSchema` and MUST throw a `DatafnClientError` with `code: "SCHEMA_INVALID"` if invalid (CLIENT-API-001).

### Table handle semantics

For a resource `task` with `version: 1` in schema:
- `client.table("task").version` is `1`
- `client.task.version` is `1`

`DatafnTable.query(q)` MUST create a full DFQL query by merging (CLIENT-QUERY-001):
- `resource: <table.name>`
- `version: <table.version>`
- the user-provided query fragment `q`

If the user-provided fragment contains `resource` or `version`, those keys MUST be ignored (table handle is authoritative) (CLIENT-QUERY-001).

### Query semantics (remote-first MVP)

`client.query(...)` and `DatafnTable.query(...)` are **remote-first** in MVP:
- they call `config.remote.query(...)`
- they unwrap `DatafnEnvelope` if present
- on remote `ok:false`, they throw a `DatafnClientError` with:
  - `code: "DFQL_INVALID"` (or mapped from server error.code when known)
  - `message` equal to server error.message
  - `details.path` equal to server error.details.path

Batch queries MUST preserve order (CLIENT-QUERY-001).

### Query semantics (local-first when storage is configured)

When `config.storage` is provided, `DatafnTable.query(...)` MUST follow CLIENT-OFFLINE-QUERY-001:
- For tables with hydration state `ready`, the query is executed against local storage (no remote call).
- For tables with hydration state `hydrating`, the client uses remote fallback and MUST still preserve deterministic DFQL semantics for filters/sort/pagination.
- Hydration state is stored via `DatafnStorageAdapter.getHydrationState/setHydrationState` (CLIENT-HYDRATION-001).

### Sync apply semantics (when storage is configured)

When `config.storage` is provided:
- `client.sync.clone(...)` and `client.sync.pull(...)` MUST still return the remote response (CLIENT-SYNC-001)
- and MUST apply results into local storage deterministically (CLIENT-SYNC-APPLY-001).

Hydration state transitions MUST follow CLIENT-HYDRATION-001:
- before clone: `notStarted`
- during clone application: `hydrating`
- after clone applied: `ready`

### Offline mutation semantics (when storage is configured)

When `config.storage` is provided and a remote mutation fails, `DatafnTable.mutate(...)` MUST:
- apply an optimistic local write to storage, and
- append the mutation into the offline change log
as specified by CLIENT-OFFLINE-MUT-001 and CLIENT-CHANGELOG-001.

### Plugin semantics (client)

When `config.plugins` is provided, the client MUST execute hooks as specified by PLUG-CLIENT-001:
- Hooks run in registration order.
- `beforeQuery`/`beforeMutation` are fail-closed by default.
- `afterQuery`/`afterMutation` are fail-open by default and MUST preserve determinism (no reordering, no non-deterministic values).

### Transact semantics (remote-first MVP)

`client.transact(t)` and `DatafnTable.transact(t)` MUST:
- call `config.remote.transact(t)`
- unwrap `DatafnEnvelope` when present
- on wrapped `ok:false`, throw `DatafnClientError` mapped from server error (CLIENT-TX-001)

`DatafnTable.transact` is an ergonomic alias to `client.transact` and does not inject `resource`/`version`.

### Signal semantics (reactive queries)

`DatafnTable.signal(q)` MUST (CLIENT-SIGNAL-001):
- use `@datafn/core.dfqlKey` on the full merged query to form a stable cache key.
- return a **cached** `DatafnSignal` instance for the same cache key (same object identity).
- perform an initial fetch lazily:
  - the first `subscribe(...)` MUST trigger a fetch and then notify subscribers with the fetched result (CLIENT-SIGNAL-001).
  - `get()` MUST return the latest fetched result after the first fetch completes (CLIENT-SIGNAL-001).

Refresh/invalidation:
- The signal MUST re-fetch when the client observes a `mutation_applied` event whose `resource` matches the table name (CLIENT-SIGNAL-001).
- Re-fetching MUST be de-duplicated: if multiple events arrive while a fetch is in flight, at most one additional fetch runs after the in-flight fetch completes (CLIENT-SIGNAL-001).

Error behavior on refresh:
- If a refresh fetch fails, the signal value MUST remain unchanged and subscribers MUST NOT be notified (CLIENT-SIGNAL-001).
- The client SHOULD emit a `sync_failed` event with `context` containing the error for observability.

### Subscription semantics

`DatafnTable.subscribe(handler, filter?)` is equivalent to:
- `client.subscribe(handler, { ...filter, resource: table.name })`

### Mutation event semantics

When `client.mutate(m)` returns an `ok:true` mutation result:
- the client MUST emit `DatafnEvent` including at minimum:
  - `type:"mutation_applied"`
  - `resource`
  - `ids:[...]`
  - `mutationId`
  - `clientId` (when present on the mutation)
  - `timestampMs`
  and MUST also include `action` and `fields` when the mutation operation and changed fields can be determined (SUB-EXTRA-001).

When `client.mutate(m)` returns an `ok:false` mutation result or remote throws:
- the client MUST emit `DatafnEvent` including at minimum:
  - `type:"mutation_rejected"`
  - `resource`
  - `ids:[...]`
  - `mutationId`
  - `clientId` (when present on the mutation)
  - `timestampMs`
  - `context:<error>`
  and SHOULD include `action` when available (SUB-EXTRA-001).

---

## Server semantics (delta)

### Transport wrapper (`DatafnEnvelope`)

All `/datafn/*` endpoints MUST return a top-level `DatafnEnvelope` (SERVER-ENVELOPE-001):

- **Success**: `{ ok:true, result:<payload> }`
- **Failure**: `{ ok:false, error:{ code, message, details:{ path, ... } } }`

Request parse/validation failures MUST be represented as top-level failures (`ok:false`) and MUST NOT be encoded as `ok:true` with nested failure payloads.

### Authorization

If `authorize` is configured, the server MUST call it with the parsed request payload (SERVER-AUTH-001) and return `{ ok:false, error:{ code:"FORBIDDEN", message:"Forbidden", details:{ path:"$" } } }` when denied.

### Status capabilities

`GET /datafn/status` returns a `result.capabilities: string[]` list. The following capability strings are fixed and MUST be used when supported (SERVER-STATUS-001):
- `dfql.query`
- `dfql.mutation`
- `dfql.transact`
- `sync.seed`
- `sync.clone`
- `sync.pull`
- `sync.push`

### Persistence + internal tables

When configured with `@superfunctions/db.Adapter`, the server MUST persist:
- user records for each resource
- join rows for `many-many` relations
- sync change tracking and `serverSeq`
- idempotency state for `(clientId, mutationId)`

Canonical internal model names (namespace-scoped) used by this spec:
- `__datafn_meta`:
  - `namespace: string` (PK)
  - `nextServerSeq: number`
- `__datafn_changes`:
  - `namespace: string`
  - `serverSeq: number`
  - `resource: string`
  - `id: string`
  - `op: "upsert" | "delete"`
  - `record: object | null`
  - index: `(namespace, resource, serverSeq)`
- `__datafn_idempotency`:
  - `namespace: string`
  - `clientId: string`
  - `mutationId: string`
  - `result: object` (cached mutation result)
  - unique index: `(namespace, clientId, mutationId)`
- `__datafn_seed`:
  - `namespace: string` (PK)
  - `seededAtMs: number`

### Sync cursors, `serverSeq`, and conflict defaults

- `serverSeq` is a monotonic integer counter per namespace (SERVER-CONFLICT-001).
- Sync cursors are base-10 integer strings representing the latest `serverSeq` applied/observed per table (SERVER-SYNC-001, SERVER-SYNC-002).
- Default conflict policy is last-write-wins by `serverSeq` (SERVER-CONFLICT-001).

### Sync endpoint payloads (recommended)

This spec uses the endpoint payload shapes from the original v0 spec (`.conduct/spec.md`), wrapped in `DatafnEnvelope` at the HTTP layer:

- `POST /datafn/seed` request:

```json
{ "clientId": "client:device-1" }
```

- `POST /datafn/seed` response (inner `result`):

```json
{ "ok": true }
```

- `POST /datafn/clone` request:

```json
{ "clientId": "client:device-1", "tables": ["node", "goal"] }
```

- `POST /datafn/clone` response (inner `result`):

```json
{ "ok": true, "data": { "node": [], "goal": [] }, "cursors": { "node": "0", "goal": "0" } }
```

- `POST /datafn/pull` request:

```json
{ "clientId": "client:device-1", "cursors": { "node": "0", "goal": "0" } }
```

- `POST /datafn/pull` response (inner `result`):

```json
{ "ok": true, "records": { "node": [], "goal": [] }, "deleted": { "node": [], "goal": [] }, "cursors": { "node": "0", "goal": "0" } }
```

- `POST /datafn/push` request:

```json
{ "clientId": "client:device-1", "mutations": [] }
```

- `POST /datafn/push` response (inner `result`):

```json
{ "ok": true, "applied": ["m-001"], "errors": [] }
```

### `htree` materialized path semantics

For relations with `type:"htree"`, the schema MUST specify `pathField` on the relation. The `pathField` value is a `"-"`-delimited string of ancestor ids ordered root → parent, and MUST NOT include the record’s own id.

- Root nodes use `pathField: ""` (empty string).
- `parent` ids-only (`parent`) is `pathField.split("-").filter(Boolean)`.
- `parent.*` returns records for that parent id list in the same order.
- `children.*` returns records whose `pathField`’s last segment equals the parent id.
- `children.**` returns records whose `pathField` contains the parent id as any segment; ordering is deterministic by `(pathField length asc, id asc)`.

### Plugins (server)

Server plugins use `DatafnPlugin` hooks from `@datafn/core` and MUST be executed as specified by PLUG-SERVER-001.

Error handling defaults:
- fail-closed: `beforeQuery`, `beforeMutation`, `beforeSync`
- fail-open: `afterQuery`, `afterMutation`, `afterSync` (unless explicitly configured fail-closed for that plugin)

### DFQL aggregate shape (`groupBy` / `aggregations` / `having`)

For DFQL aggregate queries (DFQL-GROUPBY-001), this spec defines the v0 aggregation shape:

- `groupBy: string[]` (field names; relation expansion tokens are not allowed)
- `aggregations: { [alias: string]: { op: "count" | "sum" | "min" | "max" | "avg", field: string | "*" } }`
- `having: { [fieldOrAlias: string]: <same operator shapes as filters> }`

Aggregate query results return `{ groups: Array<Record<string,unknown>>, nextCursor }` where each group row includes the `groupBy` fields and the aggregation aliases.

### Search (`searchfn`) integration

If a DFQL query contains a `search` block:
- and no plugin named `"searchfn"` is installed, the server MUST reject with `DFQL_UNSUPPORTED` (SEARCH-PLUGIN-001).
- if a `"searchfn"` plugin is installed, it SHOULD implement `beforeQuery` to rewrite the query into an equivalent candidate restriction (e.g. by injecting an `id in [...]` filter) so the server then applies DFQL filters/sort/pagination deterministically.

### REST wrappers and migrations / codegen / Python

#### REST wrappers (`/datafn/resources/*`)

When REST wrappers are enabled (API-GEN-REST-001), the server exposes:

- `GET /datafn/resources/:table`
  - Query wrapper
  - Query string supports either:
    - `q=<urlencoded-json>` where `q` is a DFQL query fragment (excluding `resource`/`version`), or
    - no `q` meaning `{}` (select all base fields)
  - Server injects `resource=:table` and `version` from schema, then executes as `/datafn/query`.
- `POST /datafn/resources/:table`
  - Insert/merge wrapper
  - Body: `{ id: string, record: object, operation?: "insert" | "merge" }` (default: `"merge"`)
  - Server injects `resource=:table` and `version` and executes as `/datafn/mutation`.
- `PATCH /datafn/resources/:table/:id`
  - Merge wrapper
  - Body: `{ record: object }`
- `DELETE /datafn/resources/:table/:id`
  - Delete wrapper

All REST wrapper responses are `DatafnEnvelope`-wrapped and use the same inner DFQL result shapes as `/datafn/query` and `/datafn/mutation`.

#### TypeScript codegen

When `CODEGEN-TS-001` is implemented, the generator outputs a single `.ts` module with:
- `export type Tables = { <tableName>: <RecordType>, ... }`
- one `export interface <PascalCaseTableName>` per resource
- `export type TypedClient = DatafnClient & { <tableName>: DatafnTable<<RecordType>>, ... }`

#### Migrations

When `MIG-001` is implemented, the migration tool outputs:
- a JSON migration plan (`.json`) that is deterministic for a schema pair, and
- a DB-specific migration script (e.g. Postgres `.sql`) that applies the plan.

#### Python server SDK

When `PY-SDK-001` is implemented, the Python package exposes `create_datafn_server(schema, db, plugins, authorize)` and mounts the same `/datafn/*` routes with the same request/response semantics as the TypeScript server.

---

## Invariants

- **Deterministic cache keys**: `dfqlKey` MUST be used and MUST be stable across key ordering differences (CLIENT-SIGNAL-001).
- **Deterministic table registry**: for a given schema, the set of valid table names is fixed; unknown table accesses are rejected deterministically.
- **Deterministic signal refresh**: given the same event stream order, fetch ordering is deterministic (in-flight de-dup rules apply).

---

## Security

- The client SHOULD NOT treat schema validation as an authorization boundary (server is authoritative).
- The client SHOULD avoid logging values of fields marked `encrypt:true` (if schema is available to the logger).

---

## Limits / caps

Client-side limits are Undefined in this spec version.

---

## Observability

- The client MUST emit mutation events as defined above (CLIENT-MUT-001).
- The client SHOULD emit `sync_failed` when a reactive refresh fails.

---

## Compatibility / versioning

- The remote adapter compatibility allows current `@datafn/server` responses (`DatafnEnvelope`) without requiring server changes.
- Backward compatibility with the existing `@datafn/client` config (`executor.execute(...)`) is **Undefined** unless explicitly implemented as an adapter in a future phase.

---

## Undefined / Future

- Symbol-key property access on the client table registry `Proxy` (string-key behavior is specified by CLIENT-REG-002).
- Plugin-defined side effects outside the deterministic constraints specified by PLUG-CLIENT-001 and PLUG-SERVER-001.
- Error handling for **unwrapped** (non-`DatafnEnvelope`) remote error shapes is Undefined (CLIENT-REMOTE-001 treats them as transport errors).

---

## Assumptions

- Keeping server `DatafnEnvelope` is acceptable; client unwraps for ergonomics.
- Reactive query refresh on `mutation_applied` for same resource is sufficient for v0.

