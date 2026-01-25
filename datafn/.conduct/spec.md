# datafn Specification

**Status**: Draft (implementation-targeted)  
**Last updated**: 2026-01-17  

## Overview

datafn is a schema-driven, local-first data runtime that unifies:
- querying (graph-like relations)
- mutations (including relation metadata)
- reactive subscriptions (events + signal-backed declarative reads)
- offline sync (clone/pull/push with idempotency + conflict defaults)

DFQL (Data Function Query Language) is the JSON-based, schema-bounded "wire format" used by both client and server.

## Goals

- **Local-first**: queries run against local storage when offlinability is enabled; remote fallback during hydration is allowed.
- **Reactive by default**:
  - imperative: event subscriptions for changes
  - declarative: signal-backed query results for Svelte binding (`@datafn/svelte` first)
- **Schema-bounded DFQL**: requests can only reference declared tables/fields/relations; server enforces authz.
- **Deterministic results**: the same DFQL input yields the same output given the same underlying data; plugin side effects must not break determinism.
- **Sync correctness**: idempotent push, monotonic ordering, and a clear conflict default.
- **Composable in the superfunctions ecosystem**:
  - routing via `@superfunctions/http` (TypeScript) / `superfunctions.http` (Python)
  - DB via `@superfunctions/db` (TypeScript) / `superfunctions.db` (Python)
  - plugin integrations: `searchfn` (query delegation + index updates), plus `filefn`, `cachefn`, `memoryfn` (as separate plugins)

## Non-goals

- Not a general-purpose execution engine (no raw SQL execution, no embedded server-side code).
- Not a GraphQL clone; DFQL is a bounded query plan designed for local-first + sync.
- Not a framework-specific runtime; adapters live in separate packages.

## Repo + package structure (proposed)

Follow superfunctions conventions (no nested monorepos; reuse `packages/*`).

```
superfunctions/
  datafn/
    .conduct/
      spec.md
      implementation.md
      dfql.intent.md                (copied for implementation reference)
      migration-plan-from-nucleus.md (optional, for downstream adoption)
    examples/
      table-schema-sample.json
      query-sample.json
      mutation-sample.json
      transact-sample.json
    core/                            (package: @datafn/core)
      src/
      package.json
      tsconfig.json
      tsup.config.ts
      vitest.config.ts
    client/                          (package: @datafn/client)
      src/
      package.json
      tsconfig.json
      tsup.config.ts
      vitest.config.ts
    server/                          (package: @datafn/server)
      src/
      package.json
      tsconfig.json
      tsup.config.ts
      vitest.config.ts
    svelte/                          (package: @datafn/svelte)
      src/
      package.json
      tsconfig.json
      tsup.config.ts
      vitest.config.ts
    react/                           (package: @datafn/react) [later]
    cli/                             (package: @datafn/cli) [optional]
    python/                          (package: datafn) [server-only SDK; parity with @datafn/server]
      datafn/
      tests/
      pyproject.toml
      README.md
```

Notes:
- Add `datafn/*` to the root `superfunctions/package.json` workspaces when implementation begins, so Turbo can build/test these packages.
- `@datafn/core` holds DFQL types/validation/normalization and shared interfaces (plugins, events, errors) so client/server can stay consistent without duplication.

## Core concepts

- **Resource/Table**: named collection of records described by schema.
- **Record**: `{ id, ...fields }`.
- **Relation**: schema-declared edge between resources (one-many, many-one, many-many, htree) with optional metadata (join payload).
- **DFQL Query**: JSON object describing select/filters/search/sort/pagination/groupBy/aggregations.
- **DFQL Mutation**: JSON object describing record changes and relation changes.
- **Change log**: local persistence of mutations for later push.
- **Cursor**: per-table sync cursor used by pull.

## Public API (TypeScript) (proposed)

The primary authoring surface is typed SDK APIs; DFQL JSON is the portable wire format/query plan shared between client and server.

Packages:
- `@datafn/core`: DFQL types + validation + normalization + shared interfaces
- `@datafn/client`: client runtime (local-first query/mutation, sync, subscriptions, signals)
- `@datafn/server`: server runtime (routing, db execution, authz, sync endpoints, migrations, API generation)
- `@datafn/svelte`: Svelte adapter for declarative bindings
- `datafn` (Python): server runtime for Python backends (parity with `@datafn/server`)

### Initialization

```typescript
import type { DatafnPlugin } from "@datafn/core";

// @datafn/client
export interface DatafnClientConfig {
  schema: unknown;
  storage: DatafnStorageAdapter;
  plugins?: DatafnPlugin[];
  sync?: { enabled: boolean };
}

export interface DatafnClient {
  query<T = unknown>(q: unknown): Promise<DatafnQueryResult<T>>;
  mutate(m: unknown | unknown[]): Promise<DatafnMutationResult | DatafnMutationResult[]>;
  transact(t: unknown): Promise<DatafnTransactResult>;

  subscribe(handler: (e: DatafnEvent) => void, filter?: DatafnEventFilter): () => void;

  // ergonomic registry
  table<TRecord = any>(name: string): DatafnTable<TRecord>;
  // optional Proxy-powered registry: datafn.node.query(...)
}

export function createDatafnClient(config: DatafnClientConfig): DatafnClient;

// @datafn/server
export interface DatafnServerConfig {
  schema: unknown;
  db: unknown; // @superfunctions/db adapter
  plugins?: DatafnPlugin[];
}

export interface DatafnServer {
  // expose router for @superfunctions/http adapters
  createRouter(): unknown;
}

export function createDatafnServer(config: DatafnServerConfig): DatafnServer;
```

### Table handle

```typescript
export interface DatafnTable<TRecord = any> {
  name: string;

  query(q: unknown): Promise<DatafnQueryResult<TRecord>>;
  mutate(m: unknown | unknown[]): Promise<DatafnMutationResult | DatafnMutationResult[]>;

  // reactive query primitive
  signal(q: unknown): DatafnSignal<DatafnQueryResult<TRecord>>;

  // imperative event subscription scoped to this table
  subscribe(handler: (e: DatafnEvent) => void, filter?: DatafnEventFilter): () => void;
}
```

### Signals + Svelte adapter

```typescript
export interface DatafnSignal<T> {
  get(): T;
  subscribe(handler: (value: T) => void): () => void;
}
```

Svelte adapter should expose:

```typescript
import type { Readable } from "svelte/store";

export function toSvelteStore<T>(signal: DatafnSignal<T>): Readable<T>;
```

## Public API (Python) (proposed, server-only)

Package:
- `datafn` (from `datafn/python/`) — server-only SDK for Python backends, parity with `@datafn/server` endpoint contract + DFQL semantics.

Core surface (shape):

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, List, Optional, Protocol

from superfunctions.db import Adapter
from superfunctions.http import Route


class DatafnPlugin(Protocol):
    name: str

    # All hooks are optional; when present they may be sync or async.
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


class DatafnServer(Protocol):
    routes: List[Route]


def create_datafn_server(config: DatafnServerConfig) -> DatafnServer: ...
```

Integration:
- FastAPI: mount `server.routes` using `superfunctions_fastapi.create_router(...)`
- Flask: mount `server.routes` using the `superfunctions-flask` adapter

Notes:
- The Python SDK is **server-only** (no local-first client runtime); it exists so Python backends can host `/datafn/*` endpoints and participate in sync/idempotency/plugins.

## DFQL (protocol)

The authoritative DFQL shape + examples live in:
- `datafn/.conduct/dfql.intent.md`
- `datafn/examples/*.json`

This spec restates the invariants that must hold for correctness and interoperability across client/server/adapters.

### Query

Supported request keys (see DFQL doc for full detail):
- `resource`, `version`
- `select`, `omit`
- `filters` (including nested `$and/$or`)
- `search` (delegated to `searchfn` plugin when present)
- `sort`
- pagination: `limit`, `offset` (supported), `cursor` (preferred)
- aggregates: `groupBy`, `aggregations`, `having`

#### Canonical query response envelopes

Non-aggregate:
```json
{ "data": [], "count": 0, "nextCursor": null }
```

Aggregate (groupBy):
```json
{ "groups": [], "nextCursor": null }
```

Batch query requests return an array of envelopes in the same order.

### Mutation

Supported request keys (see DFQL doc for full detail):
- `resource`, `version`
- `mutationId`, `clientId` (required for retryable operations)
- `timestamp`, `context` (optional)
- `operation`: `insert | merge | replace | delete | relate | modifyRelation | unrelate`
- `id` (string or array)
- `record` / `records`
- `if` (optimistic concurrency guard)
- `cascade` (delete cascade)
- `relations` (relation payload for relate/modifyRelation/unrelate)

#### Canonical mutation response envelope
```json
{
  "ok": true,
  "mutationId": "m-123",
  "affectedIds": ["node:abc"],
  "errors": []
}
```

Batch mutation requests return an array of envelopes in the same order.

### Transact

`/datafn/transact` executes ordered steps on the server:
- request: `{ transactionId?, atomic?, steps: [{query}|{mutation}] }`
- response: `{ ok, results: [...] }`

## Client runtime specification

### Initialization

`datafn.init({ schema, storage, plugins?, sync? })` must:
- validate schema (basic structural checks)
- register tables and relations
- initialize storage adapters
- initialize sync state (per-table cursors, hydration state)

### Query execution

datafn must support:
- local execution when offlinability is enabled and table is `ready`
- remote fallback when table is `hydrating` (or when `isRemoteOnly` tables are queried)

Remote fallback must preserve determinism:
- apply DFQL filters/sort/pagination consistently after combining local/remote as configured

### Query key normalization (required for caching/reactivity)

Reactive queries require a stable cache key.

Rules:
- normalize objects by sorting keys recursively
- apply default values where DFQL defines them (ex: missing sort tie-breakers may be normalized)
- remove undefined/null-only optional keys where safe
- treat semantically equivalent shapes as identical keys (ex: `relations.parent: "x"` and `relations.parent: { "$ref": "x" }` in mutations)

### Reactive queries (signals) - Svelte

The client must expose a stable way to bind queries declaratively in Svelte:
- a query can be represented as a cached computation keyed by a normalized DFQL object
- when relevant mutations are observed, the query recomputes and notifies subscribers

Minimum behavior:
- recompute on any mutation affecting the queried resource or referenced relations
- allow per-query `subscribe` to get updates

Svelte adapter (`datafn/svelte` or `@datafn/svelte`) should expose:
- a helper to convert a datafn signal into a Svelte store (Svelte 3/Kit)
- optionally, Svelte 5 rune integration later

### Event subscriptions

The runtime must expose an event stream:
- global stream: all changes
- per-table stream: changes for a resource
- optional filters: ids, action types, context, fields

This is required both for imperative UI flows and for powering reactive query invalidation.

### Extension environment support

datafn must support browser extension contexts (content script / side panel) without leaking transport complexity to consumers.

Recommended approach:
- background/service worker hosts the authoritative client runtime (storage + sync + plugins)
- content/sidepanel use a thin RPC transport that forwards DFQL queries/mutations/subscriptions to the background runtime
- subscription updates propagate back over extension messaging (and optionally BroadcastChannel where available)

## Storage adapters

### Client storage

Minimum adapters:
- `memory` adapter (tests/dev)
- `indexeddb` adapter (browser local-first)

Responsibilities:
- CRUD for records per table
- CRUD for change log table (pending mutations)
- indexed queries for `filters` and `orderBy` (best-effort initially, with clear constraints)

### Server storage

Server runtimes use Superfunctions DB adapters (`@superfunctions/db` in TypeScript, `superfunctions.db` in Python) and must support:
- executing DFQL queries and mutations against SQL-like backends
- transactions for `/datafn/transact`
- idempotency storage for `(clientId, mutationId)` dedupe

## Server runtime specification

The server SDK should resemble better-auth’s approach:
- plugin-first extensibility
- framework-agnostic routing
- DB-agnostic execution

### Core endpoints (generated by the server SDK)

- `/datafn/status`
- `/datafn/query`
- `/datafn/mutation`
- `/datafn/transact`
- `/datafn/seed`
- `/datafn/clone`
- `/datafn/pull`
- `/datafn/push`

### Routing + middleware

- TypeScript: `@datafn/server` must expose a router that can be mounted using `@superfunctions/http-*` adapters (Express/Hono/Fastify/Next/SvelteKit).
- Python: `datafn` must expose `superfunctions.http.Route[]` (or equivalent) so it can be mounted using `superfunctions-fastapi` / `superfunctions-flask`.
- The host app should be able to attach middleware for:
  - auth/session resolution
  - request logging
  - rate limiting
  - tenant/space routing

### Authz + validation

- Validate DFQL against the schema (tables/fields/relations).
- Enforce permissions (table-level and field-level where applicable).
- All writes must be attributed to an authenticated actor (unless explicitly configured for system operations).

### Automatic API generation (REST / GraphQL)

In addition to `/datafn/query|mutation|transact`, the server SDK should support auto-generated APIs from schema:

- REST (recommended default):
  - `GET /datafn/resources/:table` → query wrapper
  - `POST /datafn/resources/:table` → insert/merge wrapper
  - `PATCH /datafn/resources/:table/:id` → merge wrapper
  - `DELETE /datafn/resources/:table/:id` → delete wrapper

- GraphQL (optional):
  - generate GraphQL schema + resolvers from DFQL schema (tables + relations)
  - map GraphQL selection sets to DFQL `select`

Implementation note:
- treat REST/GraphQL generation as a first-class server feature or a built-in plugin, but keep DFQL semantics as the single source of truth.

### Schema migrations

The server SDK should support schema evolution:
- detect schema changes between versions
- generate migration scripts for supported DBs (at minimum Postgres; SQLite optional)
- apply migrations in a controlled way (CLI-driven or programmatic)

Recommended tool surface:
- `@datafn/cli` (optional package) to:
  - diff schema versions
  - generate migrations
  - generate TypeScript types/client helpers from schema

## Sync

### Endpoints
- `/datafn/seed`: initial dataset creation for new accounts/spaces
- `/datafn/clone`: initial dataset hydration
- `/datafn/pull`: incremental sync down
- `/datafn/push`: sync up mutations

### Endpoint payloads (recommended)

These shapes are intentionally simple and schema-bounded.

Seed:
```json
{ "clientId": "client:device-1" }
```

Seed response:
```json
{ "ok": true }
```

Clone:
```json
{ "clientId": "client:device-1", "tables": ["node", "goal"] }
```

Clone response:
```json
{ "ok": true, "data": { "node": [], "goal": [] }, "cursors": { "node": "c1", "goal": "c1" } }
```

Pull:
```json
{ "clientId": "client:device-1", "cursors": { "node": "c1", "goal": "c2" } }
```

Pull response:
```json
{ "ok": true, "records": { "node": [], "goal": [] }, "deleted": { "node": [], "goal": [] }, "cursors": { "node": "c2", "goal": "c3" } }
```

Push:
```json
{ "clientId": "client:device-1", "mutations": [] }
```

Push response:
```json
{ "ok": true, "applied": ["m-001", "m-002"], "errors": [] }
```

### Invariants (must hold)
- **Idempotency**: server dedupes retries using `(clientId, mutationId)`.
- **Ordering**: server assigns a monotonic order per account/space; this is conflict source of truth.
- **Conflict resolution**:
  - default: last-write-wins (LWW) by server ordering for overlapping writes to the same record
  - supported strategies: client-wins, server-wins, and custom resolvers (via server plugins)
- **Per-table cursors**: client stores `{ [tableName]: cursor }`; pull sends cursors and receives updated cursors.

### Query during clone/hydration
Each table transitions through:
- `notStarted` → `hydrating` → `ready`

When a query touches a table in `hydrating`:
- datafn may execute that part remotely (temporary remote fallback)
- results must still respect DFQL filters/sort/pagination deterministically

## Plugins

### Hook surface
Client and server share hook names, but execution context differs:
- `beforeQuery`, `afterQuery`
- `beforeMutation`, `afterMutation`
- `beforeSync`, `afterSync`

### Plugin interface (TypeScript)

```typescript
export interface DatafnPlugin {
  name: string;
  runsOn: Array<"client" | "server">;

  beforeQuery?: (ctx: DatafnHookContext, q: unknown) => Promise<unknown> | unknown;
  afterQuery?: (ctx: DatafnHookContext, q: unknown, result: unknown) => Promise<unknown> | unknown;

  beforeMutation?: (ctx: DatafnHookContext, m: unknown | unknown[]) => Promise<unknown> | unknown;
  afterMutation?: (ctx: DatafnHookContext, m: unknown | unknown[], result: unknown) => Promise<void> | void;

  beforeSync?: (ctx: DatafnHookContext, phase: "seed" | "clone" | "pull" | "push", payload: unknown) => Promise<unknown> | unknown;
  afterSync?: (ctx: DatafnHookContext, phase: "seed" | "clone" | "pull" | "push", payload: unknown, result: unknown) => Promise<void> | void;
}

export interface DatafnHookContext {
  env: "client" | "server";
  schema: unknown;
}
```

### Plugin interface (Python)

Python server plugins use the same hook concepts, exposed as optional (async) callables on plugin objects:
- `before_query`, `after_query`
- `before_mutation`, `after_mutation`
- `before_sync`, `after_sync`

### Ordering
Plugins run in registration order.

### Error handling defaults
- fail-closed: authz/validation/conflict hooks
- fail-open: side-effect hooks (indexing/analytics), configurable

### Mutability rules (recommended)
- `before*` hooks may transform requests (must keep them schema-valid)
- `after*` hooks may post-process responses, but should not break determinism for equivalent inputs

### searchfn plugin

Query:
- if `query.search` is present, delegate to searchfn plugin to obtain a candidate id set
- then apply DFQL filters/sort/pagination deterministically against that candidate set

Mutation:
- on successful mutations, update the search index for affected records

### filefn plugin

Purpose:
- manage file metadata stored in tables and resolve signed URLs at read time

Typical responsibilities:
- on query: replace file ids or file references with signed URLs when allowed
- on mutation: validate file metadata shape and update file indexing if needed

### cachefn plugin

Purpose:
- cache query results (client and/or server) and invalidate on relevant mutations

Notes:
- cache keys must be derived from normalized DFQL queries
- invalidation should be event-driven (table + ids + fields)

### memoryfn plugin (optional)

Purpose:
- update AI memory / embeddings when data changes (opt-in)

## Security

- Schema-bounded validation for all requests.
- Server-side authz on tables/fields/relations.
- Rate limiting (recommended when exposed publicly).
- Audit-friendly metadata: accept `context` and propagate it through hooks/logging.

## Testing strategy

Minimum test suites:
- DFQL validation + normalization tests (query/mutation/transact)
- local query execution tests (filters, sort, pagination, basic relations)
- reactive query invalidation tests (signal updates on mutation)
- idempotency tests (same mutationId replay)
- sync cursor tests (per-table cursor update behavior)
- searchfn integration tests (deterministic merge of search results + DFQL filters)

## Performance constraints

- Hard caps recommended (server-enforced):
  - max `limit`
  - max relation expansion depth / recursion
  - max transaction steps
  - max search candidate ids processed per query (when using searchfn)

## Roadmap

- Cursor-only pagination (deprecate offset for large datasets)
- More expressive relation filtering (`$any/$all/$none`) with clear backend semantics
- Better relation patch ops (`replace`, targeted `where` updates, bulk unlink)
- More adapters (React, Preact) and deeper Svelte 5 rune integration
- Code generation: schema → TypeScript record types + typed table/query builders
- Migrations: schema diff + migration generation + safe apply workflows
- API generation hardening: REST defaults + optional GraphQL generation
- Additional plugins: logfn/watchfn observability, policy engine, richer conflict resolvers

