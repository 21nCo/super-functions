## datafn — High-Precision Specification

**Status**: Draft  
**Spec ID**: `2026-01-18-spec`  
**Last updated**: 2026-01-18  
**Inputs used**: `../spec.md`, `../dfql.intent.md`, `../migration-plan-from-nucleus.md` (explicitly ignoring `../implementation.md`)

This specification defines the **DFQL protocol**, the **client/server runtime semantics**, and the **canonical I/O shapes** for `datafn`.

Normative keywords **MUST**, **SHOULD**, and **MAY** are used as defined in RFC 2119.

---

## Overview

`datafn` is a **schema-driven, local-first data runtime** that unifies:
- **Queries** over resources (tables) with explicit relation expansion.
- **Mutations** for records and relations (including relation metadata for join rows).
- **Reactivity** via an event stream and signal-backed query results (first-class Svelte adapter).
- **Offline sync** via `seed/clone/pull/push` endpoints with idempotency and deterministic conflict rules.

`DFQL` (Data Function Query Language) is the JSON-based, schema-bounded request format used across client and server.

---

## Context (assumptions + scope anchors)

- **Project name**: `datafn`
- **One-sentence goal**: Provide a schema-bounded, deterministic, local-first data runtime with DFQL query/mutation, reactivity, and sync.
- **Target users**:
  - Application developers building offline-first web apps (including browser extensions).
  - Backend developers hosting a DFQL API over SQL-like stores.
  - Superfunctions ecosystem maintainers integrating plugins (e.g. `searchfn`).
- **Target environments**:
  - Client: browser (including extension background/service-worker + content/sidepanel), optionally Node for tests.
  - Server: Node 18+ (Fetch-compatible Request/Response), optionally Python backend (server-only SDK).
  - Online/offline: clients MAY operate offline; sync requires online connectivity.
- **Languages/packages required**:
  - TypeScript packages: `@datafn/core`, `@datafn/client`, `@datafn/server`, `@datafn/svelte`.
  - Python package: `datafn` (server-only SDK).
- **Existing systems it must integrate with**:
  - HTTP routing: `@superfunctions/http` (TypeScript) / `superfunctions.http` (Python).
  - DB adapters: `@superfunctions/db` (TypeScript) / `superfunctions.db` (Python).
  - Optional plugins: `searchfn`, `filefn`, `cachefn`, `memoryfn`.
- **Data model summary**:
  - Schema defines `resources` (tables), `fields`, `indices`, and `relations` (one-many, many-one, many-many, htree).
  - Records are JSON objects with at least `id: string`.
  - Relations MAY carry metadata (join payload) for many-many relations.
- **Security model**:
  - Authentication is **host-provided** (datafn does not define how sessions/tokens are minted).
  - Authorization is **server-enforced** (see `REQUIREMENTS.md` `SEC-*`); the mechanism is host-configured.
  - PII handling is schema-directed (e.g. `encrypt: true` fields are treated as sensitive for logging).
- **Performance constraints**:
  - Servers enforce caps (max `limit`, max relation expansion depth, max transact steps, max search candidate IDs).
  - Clients SHOULD support IndexedDB as the primary persistence for local-first.
- **Non-goals / out of scope**:
  - Executing arbitrary SQL or embedded server-side code.
  - Being a GraphQL clone; DFQL is a bounded query plan.
  - Framework-specific client runtime (adapters live in separate packages).
- **Hard constraints**:
  - Schema-boundedness: DFQL MUST not reference undeclared resources/fields/relations.
  - Determinism: given the same normalized DFQL input and the same underlying data snapshot, results are deterministic (subject to explicitly-declared “volatile” outputs).

Anything not specified in this document set is explicitly **Undefined** and therefore **not required**.

---

## Glossary

- **Schema**: A JSON document defining resources, fields, indices, and relations.
- **Resource / Table**: A named collection of records described by schema (e.g. `"task"`).
- **Record**: A JSON object with `id: string` plus schema-defined fields.
- **Relation**: A schema-declared edge between resources:
  - **many-one**: many X rows point to one Y row via a foreign key on X.
  - **one-many**: one X row has many Y rows (inverse of many-one).
  - **many-many**: X and Y are connected via relation rows (join table), which may include metadata.
  - **htree**: hierarchical tree relation (typically materialized path).
- **Relation metadata**: Extra fields stored on a many-many relation row (join payload).
- **DFQL**: JSON request format for queries, mutations, and transactions.
- **Query**: A DFQL request that reads records (and optionally relations/aggregates).
- **Mutation**: A DFQL request that writes records and/or relations.
- **Transact**: A DFQL request that executes ordered steps (query/mutation) on the server.
- **Cursor**: A stable pagination token (query) or a per-table sync cursor (pull).
- **Change log**: Client-side persisted list of pending mutations for later push.
- **Signal**: A reactive primitive representing a value that can be subscribed to (client runtime).
- **Event**: A discrete emitted change notification (e.g. “mutation applied”) used to drive reactivity.
- **Hydrating**: Client state where initial clone data is still being fetched/applied; remote fallback MAY occur.
- **Idempotency**: Replaying the same `(clientId, mutationId)` does not apply the mutation twice.
- **Determinism**: Equivalent inputs over the same data snapshot produce equivalent outputs with stable ordering.

---

## Goals / Non-goals

### Goals

- Local-first query and mutation with offline capability (see `REQUIREMENTS.md` `CLIENT-*`, `SYNC-*`).
- Reactive by default:
  - imperative: event subscriptions (`EVENTS-*`)
  - declarative: signal-backed query results (`CLIENT-*`)
- Schema-bounded DFQL across client/server (`SCHEMA-*`, `QUERY-*`, `MUT-*`).
- Deterministic results and stable cache keys (`DETERMINISM-*`, `NORM-*`).
- Sync correctness: idempotent push, monotonic ordering, and explicit conflict defaults (`SYNC-*`).
- Composable in the superfunctions ecosystem via adapters and plugins (`API-*`, `PLUG-*`).

### Non-goals

- General-purpose execution engine.
- Implicit relation expansion; all relation reads are explicit.
- Defining a universal auth/session system (host-provided).

---

## Public API

This section defines the **canonical TypeScript and Python surface area**. If an implementation adds additional helpers, they are **Undefined** unless added to a future spec version.

### TypeScript packages

#### `@datafn/core`

Types and pure utilities shared across client/server.

```ts
export type DatafnSchema = {
  resources: DatafnResourceSchema[];
  relations?: DatafnRelationSchema[];
};

export type DatafnResourceSchema = {
  name: string;
  version: number;
  idPrefix?: string;
  isRemoteOnly?: boolean;
  fields: DatafnFieldSchema[];
  indices?: {
    base?: string[];
    search?: string[];
    vector?: string[];
  } | string[];
  permissions?: unknown; // Undefined: model is host-defined unless using a built-in authorizer
};

export type DatafnFieldSchema = {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array" | "date" | "file";
  required: boolean;
  nullable?: boolean;
  readonly?: boolean;
  default?: unknown;
  enum?: unknown[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  unique?: boolean | string;
  encrypt?: boolean;
  volatile?: boolean; // when true, value may change without data mutation (excluded from determinism)
};

export type DatafnRelationSchema = {
  from: string | string[];
  to: string | string[];
  type: "one-many" | "many-one" | "many-many" | "htree";
  relation?: string;
  inverse?: string;
  cache?: boolean;
  metadata?: Array<{ name: string; type: "string" | "number" | "boolean" | "date" | "object" }>;
  /**
   * many-one only: field name on the `from` resource that stores the `to` record id.
   * If omitted, `fkField` is inferred as `${relation}Id` (e.g. relation "goal" → fkField "goalId").
   */
  fkField?: string;
  /**
   * htree only: field name on the `from` resource that stores the materialized ancestor path.
   * If omitted, `pathField` is inferred as `${relation}Path` (e.g. relation "parent" → pathField "parentPath").
   */
  pathField?: string;
};

export type DatafnErrorCode =
  | "SCHEMA_INVALID"
  | "DFQL_INVALID"
  | "DFQL_UNKNOWN_RESOURCE"
  | "DFQL_UNKNOWN_FIELD"
  | "DFQL_UNKNOWN_RELATION"
  | "DFQL_UNSUPPORTED"
  | "LIMIT_EXCEEDED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export type DatafnError = {
  code: DatafnErrorCode;
  message: string;
  details?: unknown;
};

export type DatafnEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; error: DatafnError };

export function validateSchema(schema: unknown): DatafnEnvelope<DatafnSchema>;

export function normalizeDfql(value: unknown): unknown; // canonical JSON normalization used for caching

export function dfqlKey(value: unknown): string; // stable key = JSON.stringify(normalizeDfql(value))

export interface DatafnEvent {
  type: "mutation_applied" | "mutation_rejected" | "sync_applied" | "sync_failed";
  resource?: string;
  ids?: string[];
  mutationId?: string;
  clientId?: string;
  timestampMs: number;
  context?: unknown;
}

export type DatafnEventFilter = Partial<{
  type: DatafnEvent["type"] | Array<DatafnEvent["type"]>;
  resource: string | string[];
  ids: string | string[];
  mutationId: string | string[];
}>;

export interface DatafnSignal<T> {
  get(): T;
  subscribe(handler: (value: T) => void): () => void;
}

export interface DatafnPlugin {
  name: string;
  runsOn: Array<"client" | "server">;
  beforeQuery?: (ctx: DatafnHookContext, q: unknown) => Promise<unknown> | unknown;
  afterQuery?: (ctx: DatafnHookContext, q: unknown, result: unknown) => Promise<unknown> | unknown;
  beforeMutation?: (ctx: DatafnHookContext, m: unknown | unknown[]) => Promise<unknown> | unknown;
  afterMutation?: (ctx: DatafnHookContext, m: unknown | unknown[], result: unknown) => Promise<void> | void;
  beforeSync?: (
    ctx: DatafnHookContext,
    phase: "seed" | "clone" | "pull" | "push",
    payload: unknown
  ) => Promise<unknown> | unknown;
  afterSync?: (
    ctx: DatafnHookContext,
    phase: "seed" | "clone" | "pull" | "push",
    payload: unknown,
    result: unknown
  ) => Promise<void> | void;
}

export type DatafnHookContext = {
  env: "client" | "server";
  schema: DatafnSchema;
  // host-provided context (auth/tenant/trace) is intentionally opaque to core
  context?: unknown;
};
```

#### `@datafn/client`

```ts
import type { DatafnEnvelope, DatafnEvent, DatafnEventFilter, DatafnPlugin, DatafnSchema, DatafnSignal } from "@datafn/core";

export type DatafnQuery = unknown; // canonical DFQL query JSON (validated against schema)
export type DatafnMutation = unknown; // canonical DFQL mutation JSON (validated against schema)

export type DatafnQueryResult =
  | { data: unknown[]; count?: number; nextCursor: unknown | null }
  | { groups: unknown[]; nextCursor: unknown | null };

export type DatafnMutationResult = {
  ok: boolean;
  mutationId?: string;
  clientId?: string;
  resource?: string;
  operation?: string;
  affectedIds: string[];
  errors: Array<{ code: string; message: string; path?: string; retryable?: boolean }>;
  deduped: boolean;
};

export type DatafnTransact = unknown;
export type DatafnTransactResult = { ok: boolean; results: unknown[]; errors?: unknown[] };

export interface DatafnStorageAdapter {
  // Undefined: adapter interface is specified in `REQUIREMENTS.md` (STORAGE-*)
}

export interface DatafnRemoteAdapter {
  query(q: DatafnQuery | DatafnQuery[]): Promise<DatafnEnvelope<DatafnQueryResult | DatafnQueryResult[]>>;
  mutation(m: DatafnMutation | DatafnMutation[]): Promise<DatafnEnvelope<DatafnMutationResult | DatafnMutationResult[]>>;
  transact(t: DatafnTransact): Promise<DatafnEnvelope<DatafnTransactResult>>;
  seed(payload: unknown): Promise<DatafnEnvelope<unknown>>;
  clone(payload: unknown): Promise<DatafnEnvelope<unknown>>;
  pull(payload: unknown): Promise<DatafnEnvelope<unknown>>;
  push(payload: unknown): Promise<DatafnEnvelope<unknown>>;
}

export interface DatafnClientConfig {
  schema: DatafnSchema;
  storage: DatafnStorageAdapter;
  remote?: DatafnRemoteAdapter;
  plugins?: DatafnPlugin[];
  sync?: { enabled: boolean };
}

export interface DatafnClient {
  query(q: DatafnQuery | DatafnQuery[]): Promise<DatafnQueryResult | DatafnQueryResult[]>;
  mutate(m: DatafnMutation | DatafnMutation[]): Promise<DatafnMutationResult | DatafnMutationResult[]>;
  transact(t: DatafnTransact): Promise<DatafnTransactResult>;

  signal(q: DatafnQuery): DatafnSignal<DatafnQueryResult>;
  subscribe(handler: (e: DatafnEvent) => void, filter?: DatafnEventFilter): () => void;
}

export function createDatafnClient(config: DatafnClientConfig): DatafnClient;
```

#### `@datafn/server`

```ts
import type { Router } from "@superfunctions/http";
import type { DatafnPlugin, DatafnSchema } from "@datafn/core";

export interface DatafnServerConfig<TContext = any> {
  schema: DatafnSchema;
  db: unknown; // @superfunctions/db adapter (exact interface is out of scope for DFQL semantics)
  plugins?: DatafnPlugin[];
  /**
   * Authorization callback. The host is responsible for authentication and context creation.
   * If omitted, behavior is defined in `REQUIREMENTS.md` (SEC-*).
   */
  authorize?: (ctx: TContext, action: "query" | "mutation" | "transact" | "seed" | "clone" | "pull" | "push", payload: unknown) => Promise<boolean> | boolean;
}

export interface DatafnServer<TContext = any> {
  router: Router<TContext>;
}

export function createDatafnServer<TContext = any>(config: DatafnServerConfig<TContext>): DatafnServer<TContext>;
```

#### `@datafn/svelte`

```ts
import type { Readable } from "svelte/store";
import type { DatafnSignal } from "@datafn/core";

export function toSvelteStore<T>(signal: DatafnSignal<T>): Readable<T>;
```

### Python package (`datafn`) — server-only SDK

Python parity is defined at the endpoint contract level (DFQL + sync I/O). Client local-first runtime is out of scope for Python.

```py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, List, Optional, Protocol

from superfunctions.db import Adapter
from superfunctions.http import Route

class DatafnPlugin(Protocol):
    name: str
    before_query: Optional[Callable[[dict, Any], Awaitable[Any] | Any]]
    after_query: Optional[Callable[[dict, Any, Any], Awaitable[Any] | Any]]
    before_mutation: Optional[Callable[[dict, Any], Awaitable[Any] | Any]]
    after_mutation: Optional[Callable[[dict, Any, Any], Awaitable[None] | None]]
    before_sync: Optional[Callable[[dict, str, Any], Awaitable[Any] | Any]]
    after_sync: Optional[Callable[[dict, str, Any, Any], Awaitable[None] | None]]

@dataclass
class DatafnServerConfig:
    schema: Any
    db: Adapter
    plugins: Optional[List[DatafnPlugin]] = None
    authorize: Optional[Callable[[Any, str, Any], Awaitable[bool] | bool]] = None

class DatafnServer(Protocol):
    routes: List[Route]

def create_datafn_server(config: DatafnServerConfig) -> DatafnServer: ...
```

---

## Data formats / protocol

### Canonical HTTP endpoints

All endpoints use `Content-Type: application/json` and accept/return UTF-8 JSON.

- `GET /datafn/status`
- `POST /datafn/query`
- `POST /datafn/mutation`
- `POST /datafn/transact`
- `POST /datafn/seed`
- `POST /datafn/clone`
- `POST /datafn/pull`
- `POST /datafn/push`

All endpoints return a `DatafnEnvelope<...>` (see `@datafn/core` types).

### Canonical response envelope (`DatafnEnvelope`)

Success:

```json
{ "ok": true, "result": {} }
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "DFQL_INVALID",
    "message": "Invalid DFQL: expected object or array",
    "details": { "path": "$" }
  }
}
```

Rules:
- `ok: true` responses MUST NOT include `error`.
- `ok: false` responses MUST NOT include `result`.
- `error.message` MUST be deterministic for a given input (no stack traces, no random ids).
- `error.details.path` is always present (use `"$"` when a more specific path is not applicable).
- `error.details` MAY include additional machine-readable fields like `index` and `resource`.

### Error codes and deterministic messages

Unless a more specific message is defined below, the canonical `error.message` strings are:
- `SCHEMA_INVALID`: `Invalid schema: <reason>`
- `DFQL_INVALID`: `Invalid DFQL: <reason>`
- `DFQL_UNKNOWN_RESOURCE`: `Unknown resource: <resource>`
- `DFQL_UNKNOWN_FIELD`: `Unknown field: <path>`
- `DFQL_UNKNOWN_RELATION`: `Unknown relation: <path>`
- `DFQL_UNSUPPORTED`: `Unsupported DFQL feature: <feature>`
- `LIMIT_EXCEEDED`: `Limit exceeded: <reason>`
- `FORBIDDEN`: `Forbidden`
- `NOT_FOUND`: `Not found`
- `CONFLICT`: `Conflict`
- `INTERNAL`: `Internal error`

### Request-level vs item-level failures (batch semantics)

`/datafn/query`:
- Accepts a single query object OR an array of query objects.
- Batch behavior is **fail-fast**: if any query is invalid, the response is `ok: false` and `error.details.index` identifies the failing query index.

`/datafn/mutation`:
- Accepts a single mutation object OR an array of mutation objects.
- Batch behavior is **per-item**: the response is `ok: true` with an array of per-mutation results; individual mutation failures are represented inside each result (`ok: false` with `errors[]`).

`/datafn/push`:
- Accepts a batch of mutations and returns per-mutation errors in `result.errors[]`.

### Canonical endpoint payloads

#### `GET /datafn/status`

Response (`ok: true`):

```json
{
  "ok": true,
  "result": {
    "schemaHash": "sha256:...",
    "capabilities": ["dfql.query", "dfql.mutation", "sync.clone", "sync.pull", "sync.push"],
    "limits": { "maxLimit": 100, "maxTransactSteps": 50, "maxPayloadBytes": 1048576 },
    "serverTimeMs": 1737148800000
  }
}
```

Notes:
- `schemaHash` is computed from the **validated server schema** (i.e. the output of `validateSchema`, after any schema normalizations such as `indices` expansion), using: `sha256:${hex(sha256(JSON.stringify(normalizeDfql(validatedSchema))))}`.
- Capability strings are opaque but deterministic.

#### `POST /datafn/query`

Request body:
- A DFQL query object OR an array of DFQL query objects.

Response (`ok: true`):
- Single query → `result` is a query response envelope.
- Batch query → `result` is an array of query response envelopes in request order.

#### `POST /datafn/mutation`

Request body:
- A DFQL mutation object OR an array of DFQL mutation objects.

Response (`ok: true`):
- Single mutation → `result` is a mutation result envelope.
- Batch mutation → `result` is an array of mutation result envelopes in request order.

#### `POST /datafn/transact`

Request body:

```json
{
  "transactionId": "tx-0001",
  "atomic": true,
  "steps": [
    { "query": { "resource": "goal", "version": 1, "filters": { "id": "goal:g1" }, "select": ["id", "label"] } },
    { "mutation": { "resource": "goal", "version": 1, "operation": "merge", "clientId": "client:device-1", "mutationId": "m-1", "id": "goal:g1", "record": { "label": "Updated" } } }
  ]
}
```

Response (`ok: true`):

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "results": [
      { "kind": "query", "ok": true, "result": { "data": [], "nextCursor": null } },
      { "kind": "mutation", "ok": true, "result": { "ok": true, "mutationId": "m-1", "affectedIds": ["goal:g1"], "errors": [], "deduped": false } }
    ]
  }
}
```

Rules:
- Steps are executed in order and the server stops at the first failing step.
- `results` contains one entry per executed step, in order (so `results.length` is `<= steps.length`).
- If `atomic: true` and any step fails (`ok: false`), the transaction `result.ok` is `false` and **no mutation effects** are persisted.

Step result shape (`result.results[]`):
- Query step success: `{ "kind": "query", "ok": true, "result": <QueryResult> }`
- Query step failure: `{ "kind": "query", "ok": false, "error": <DatafnError> }`
- Mutation step success: `{ "kind": "mutation", "ok": true, "result": <MutationResult> }`
- Mutation step failure (e.g. conflict / validation): `{ "kind": "mutation", "ok": false, "result": <MutationResult> }`

#### `POST /datafn/seed`

Request body:

```json
{ "clientId": "client:device-1" }
```

Response (`ok: true`):

```json
{ "ok": true, "result": { "ok": true } }
```

#### `POST /datafn/clone`

Request body:

```json
{ "clientId": "client:device-1", "tables": ["goal", "task"] }
```

Response (`ok: true`):

```json
{
  "ok": true,
  "result": { "ok": true, "data": { "goal": [], "task": [] }, "cursors": { "goal": "0", "task": "0" } }
}
```

Rules:
- For each table in `data`, the records array is ordered deterministically by `id:asc`.
- `cursors[table]` values are base-10 integer strings.

#### `POST /datafn/pull`

Request body:

```json
{ "clientId": "client:device-1", "cursors": { "goal": "0", "task": "0" } }
```

Response (`ok: true`):

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "records": { "goal": [], "task": [] },
    "deleted": { "goal": [], "task": [] },
    "cursors": { "goal": "0", "task": "0" }
  }
}
```

Rules:
- For each table in `records` and `deleted`, arrays are ordered deterministically by `id:asc`.
- Returned cursors are monotonic per table.

#### `POST /datafn/push`

Request body:

```json
{ "clientId": "client:device-1", "mutations": [] }
```

Response (`ok: true`):

```json
{ "ok": true, "result": { "ok": true, "applied": [], "errors": [] } }
```

`errors[]` entry shape (when present):

```json
{ "mutationId": null, "code": "DFQL_INVALID", "message": "Invalid DFQL: ...", "path": "$" }
```

### DFQL schema

Schema format is `DatafnSchema` as defined in `@datafn/core` (above). System fields are **implicitly present** on all resources (unless a future spec defines otherwise):
- `id: string`
- `createdAt: string | number` (server-defined canonical form)
- `updatedAt: string | number`
- `createdBy?: string`
- `updatedBy?: string`
- `isArchived?: boolean`

Canonical wire types for system timestamp fields are **Undefined** in this spec version. Test vectors avoid relying on them.

Output inclusion rule:
- Unless explicitly selected, **only `id` is guaranteed to be present** in record objects; other system fields (e.g. `createdAt`) are not returned by default.

### DFQL query

DFQL query shape (validated against schema):

```json
{
  "resource": "task",
  "version": 1,
  "select": ["id", "label", "goal.*"],
  "omit": ["secretField"],
  "filters": { "isArchived": false, "priority": { "gte": 3 } },
  "search": { "query": "offline sync", "type": "fullText", "fields": ["label", "text"] },
  "sort": ["updatedAt:desc", "id:asc"],
  "limit": 20,
  "offset": 0,
  "cursor": { "after": { "updatedAt": "2026-01-17", "id": "task:t1" } },
  "count": true,
  "groupBy": ["status"],
  "aggregations": { "count": { "op": "count" } },
  "having": { "count": { "gt": 10 } }
}
```

Cursor pagination rule:
- If `cursor.after` or `cursor.before` is present, `sort` MUST be present and MUST include `id` as the final tie-breaker key.

#### Select tokens (relation expansion)

`select` is a list of tokens. Each token is a **dot-separated path** interpreted against schema fields and relations.

Directive segments:
- `*` — expand the preceding relation as related record(s) (base fields only; no implicit relation expansion).
- `**` — only valid for `htree` inverse relations; expand the full descendant subtree.
- `#` — only valid for `many-many`; emit join rows (`from`, `to`, and metadata fields).
- `*#` — only valid for `many-many`; emit related record(s) and attach join metadata as `$relation_metadata`.

Rules:
- A plain name segment (e.g. `label`) includes a base/system field.
- A relation name segment with no directive (e.g. `tags`) emits related record id(s) only.
- Nested traversal is allowed:
  - Example: `tasks.tags.*` expands `tasks` as records and then expands `tags.*` inside each task.
  - A token that traverses into a relation (i.e. has further segments after a relation name) **implicitly expands** that relation as records (not ids-only) so nested segments can be applied.
- Field inclusion rules for expanded records:
  - Expanded records always include `id` (even if not explicitly selected).
  - If a relation is expanded with `relation.*`, the expanded record includes **all** schema-defined fields, subject to `omit`.
  - If a relation is expanded implicitly by traversal and `relation.*` is not present, the expanded record includes only the fields referenced by descendant tokens (plus `id`), subject to `omit`.
- Join row inclusion rules for `relation.#`:
  - Each join row includes `from`, `to`, and all declared `metadata` fields for that relation, subject to `omit`.
- Default ordering for arrays emitted by relation expansions:
  - Unless a future spec defines nested sort blocks, arrays are ordered deterministically by `id:asc`.
  - For `many-many` arrays emitted via `relation.*#`, if the relation defines a numeric metadata field named `order`, ordering is `order:asc` then `id:asc`.
  - For `many-many` join-row arrays emitted via `relation.#`, if the relation defines a numeric metadata field named `order`, ordering is `order:asc` then `to:asc`; otherwise ordering is `to:asc`.
- When multiple tokens target the same output key, the most expanded form wins, in this order:
  - `*#` (related records + metadata)
  - `#` (join rows)
  - `*` (related records)
  - ids-only

Token forms outside these rules are treated as invalid DFQL and are rejected (see `REQUIREMENTS.md` `QUERY-001`).

#### Query response envelopes

Non-aggregate query:

```json
{ "data": [], "nextCursor": null }
```

If `count: true` was requested, the response includes `count` (the total number of matching rows before pagination).

Aggregate query (`groupBy` present):

```json
{ "groups": [], "nextCursor": null }
```

Batch queries return an array of query result envelopes in request order.

### DFQL mutation

DFQL mutation shape (validated against schema):

```json
{
  "resource": "task",
  "version": 1,
  "clientId": "client:device-1",
  "mutationId": "m-0001",
  "timestamp": 1737148800000,
  "context": { "source": "ui", "traceId": "t-1" },
  "operation": "merge",
  "id": "task:t1",
  "record": { "label": "Updated" },
  "if": { "updatedAt": { "eq": "2026-01-10T00:00:00.000Z" } },
  "relations": {
    "tags": [
      { "$ref": "tag:urgent", "addedAt": "2026-01-18T00:00:00.000Z", "op": "relate" }
    ]
  }
}
```

Mutation requests MAY be sent as an array; responses return an array of results in the same order.

Mutation response (per mutation):

```json
{
  "ok": true,
  "mutationId": "m-0001",
  "affectedIds": ["task:t1"],
  "errors": [],
  "deduped": false
}
```

Error entries in `errors[]` use:
- `code` (machine string)
- `message` (deterministic human string)
- `path` (optional JSON pointer-like path)
- `retryable` (optional boolean)

### Transact

`transact` bundles ordered steps into a server-side unit of work.

Request:

```json
{
  "transactionId": "tx-0001",
  "atomic": true,
  "steps": [
    { "query": { "resource": "goal", "version": 1, "filters": { "id": "goal:g1" }, "select": ["id", "label"] } },
    { "mutation": { "resource": "goal", "version": 1, "operation": "merge", "id": "goal:g1", "record": { "label": "Updated" } } }
  ]
}
```

Response:

```json
{ "ok": true, "results": [ /* per-step results */ ] }
```

### Sync (seed/clone/pull/push)

Sync payloads are canonicalized in `REQUIREMENTS.md` (`SYNC-*`). This spec defines the high-level intent:
- `seed`: initialize server-side dataset for a new account/space.
- `clone`: initial client hydration for selected tables.
- `pull`: incremental sync down by per-table cursor.
- `push`: apply client mutation log to server with idempotency and conflict rules.

Per-table sync cursors are base-10 integer strings (e.g. `"0"`, `"17"`) and are monotonic per table.

---

## Semantics (high level)

### Validation boundary

All DFQL payloads are validated against schema before execution.

### Relation materialization (server execution)

This section defines how relations are resolved for DFQL `select` expansion and for relation-crossing `filters`.

#### `many-one`

Given a relation schema entry:
- `type: "many-one"`
- `from: X`, `to: Y`
- relation name `R` (resolved from `relation` or inferred)

The foreign key field on `X` is:
- `fkField` when provided, otherwise `${R}Id`.

Semantics:
- For an `X` record, the ids-only value for `R` is `record[fkField]` (a string id) or `null` when absent.
- `R.*` expands that id to the corresponding `Y` record object or `null` if not found.

#### `one-many`

`one-many` is the inverse of `many-one`.

Semantics:
- For a `Y` record, the ids-only value for inverse `R` is the array of `X.id` values where `x[fkField] == y.id`.
- `R.*` expands to an array of `X` record objects.

#### `many-many`

For a `many-many` relation between `X` and `Y`, the server maintains a set of join rows with:
- `from: X.id`
- `to: Y.id`
- zero or more `metadata` fields declared in schema

Semantics:
- For an `X` record, ids-only `R` is an array of `to` ids for join rows where `from == x.id`.
- `R.#` emits the join rows (with `from`, `to`, and declared metadata).
- `R.*` emits expanded `Y` records for those `to` ids.
- `R.*#` emits expanded `Y` records and attaches the corresponding join row metadata under `$relation_metadata`.

#### `htree` (materialized path)

For an `htree` relation from `X` to `X` with relation name `R` (typically `"parent"`) and inverse `I` (typically `"children"`), the path field on `X` is:
- `pathField` when provided, otherwise `${R}Path` (e.g. `"parentPath"`).

Canonical path semantics:
- `record[pathField]` is either `null` / `""` for “no parents”, or a hyphen-delimited list of ancestor ids ordered from root to immediate parent.
  - Example: `"goal:g0-goal:g1"` means ancestors `["goal:g0", "goal:g1"]`.
- The ids-only value for `R` is the ancestor id array derived from splitting `record[pathField]` by `"-"` and removing empty segments.
- `R.*` expands to an array of ancestor record objects in the same order.
- The ids-only value for `I` (immediate children) is all `X.id` where:
  - `child[pathField]` equals `parent.id`, OR
  - `child[pathField]` ends with `"-" + parent.id`.
- `I.**` (all descendants) is all `X.id` where `parent.id` appears as a complete segment in `child[pathField]` (segment boundaries are `"-"`).

### Deterministic ordering

Ordering is deterministic:
- If `sort` is present, it defines ordering.
- If `sort` is absent, a deterministic default ordering applies: `id:asc`.
- For expanded relation arrays (e.g. `tasks.*`), a deterministic default ordering applies unless a future spec defines nested sort blocks.

### Relation filter semantics

When a filter path crosses a relation that yields multiple rows (one-many, many-many, htree children), the default semantics are **ANY-match**.

Explicit relation quantifiers are supported via relation filter blocks:
- `$any`, `$all`, `$none`

### Search delegation

If `query.search` is present and a `searchfn` plugin is installed, the plugin may provide a candidate id set. DFQL filters and pagination are applied deterministically on top of that candidate set.

### Idempotency

Mutations and push operations are idempotent based on `(clientId, mutationId)`.

### Conflict resolution (sync)

Default conflict behavior is server-ordered last-write-wins for overlapping writes to the same record, unless overridden by server plugins.

---

## Invariants

Determinism, idempotency, and ordering rules are specified in `REQUIREMENTS.md` under `DETERMINISM-*`, `MUT-*`, and `SYNC-*`.

---

## Security

Security requirements (authz boundaries, validation, privacy constraints, and logging restrictions) are specified in `REQUIREMENTS.md` under `SEC-*` and `OBS-*`.

---

## Limits / caps

Server limits (max `limit`, max relation expansion depth, max transact steps, etc.) are specified in `REQUIREMENTS.md` under `LIMIT-*`.

---

## Observability

Logging and event emission requirements are specified in `REQUIREMENTS.md` under `OBS-*` and `EVENTS-*`.

---

## Compatibility / versioning strategy

- Schema is versioned per resource via `resource.version`.
- DFQL protocol versioning is tied to the schema versioning and the server’s capability set.
- Backward compatibility and deprecation rules are specified in `REQUIREMENTS.md` (`COMP-*`).

---

## Undefined / Future

The following are explicitly **Undefined** in this spec version:
- GraphQL generation and GraphQL-to-DFQL mapping.
- REST auto-generation beyond the core `/datafn/*` endpoints.
- Schema migration generation and application workflows.
- Nested relation query blocks (filters/sort/limit per relation expansion).
- Advanced relation mutation ops beyond the defined set.
- Binary transport, streaming transport, or non-JSON wire formats.
- Server-driven live queries over WebSockets/SSE (events are in-process; transports are adapters).

---

## Assumptions and questions (non-blocking)

1. **Assumption**: `@datafn/server` is Fetch/Request/Response-first via `@superfunctions/http`.  
   **Question**: Should any endpoint support `GET` with query-string encoding (in addition to `POST`)?

2. **Assumption**: Query default ordering is `id:asc` when `sort` is absent (to preserve determinism).  
   **Question**: Should any resource be allowed to define a different deterministic default sort in schema?

3. **Assumption**: Relation arrays returned by expansions use a deterministic default sort (`id:asc`).  
   **Question**: Do we want a first-class DFQL syntax for nested per-relation sort/pagination in v1?

4. **Assumption**: Authorization is host-configured via `authorize(...)` and/or plugins.  
   **Question**: Should `authorize` be mandatory (fail-closed) in production builds?

5. **Assumption**: System field canonical formats are ISO-8601 strings in server responses.  
   **Question**: Should system timestamps be canonicalized to epoch milliseconds instead?

