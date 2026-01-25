# datafn - Local-first data management + sync
- datafn is a schema-driven, local-first data layer for building reactive apps with offline sync.
- It provides a constrained query/mutation protocol (DFQL) plus type-safe client APIs generated from table + relation schemas.
- It includes both client runtime and server runtime surfaces (storage + sync + plugins), without forcing a single app framework.

# Problem
- Graph-like querying for joins/relations without hand-writing bespoke endpoints for every view.
- Offline sync and caching as first-class concerns.
- Optimistic UI + reactive updates.

# Non-goals / Guardrails
- DFQL is not an arbitrary execution language (no raw SQL execution, no user-defined server code embedded in queries).
- DFQL is schema-bounded: clients can only query/mutate declared tables/fields/relations (with server-side authz enforcing this).
- The public authoring surface should be typed SDK APIs; DFQL JSON is the portable "wire format"/query plan (hand-authoring is optional).
- No framework lock-in: client adapters live in separate packages (Svelte first, others later).

-------
# Solution
- Client SDK (`datafn`)
  - Framework adapters (`@datafn/svelte`, `@datafn/react` etc)
- Server SDK (`@datafn/server`)
- DFQL (Data Function Query Language) - a query language for datafn (See `dfql.intent.md` for details)

## v0 (Minimum viable, bounded scope)

### Client v0
- init: initialize once with schema + persistence adapter + optional plugins
- query: execute DFQL queries (local-first when offlinability is enabled)
- reactive queries (Svelte v0): signal-backed query results for declarative data binding, shipped via `@datafn/svelte`
- mutate: execute DFQL mutations (and persist to a local change log when offline)
- subscribe: fine-grained subscriptions for data changes (table, ids, actions, context)
- transact: run ordered query/mutation steps (delegates to server when needed)
- sync: `clone`, `pull`, `push`
- conflict default: deterministic last-write-wins (LWW) by server ordering (see Sync invariants)

### Server v0
- Endpoints: `/datafn/query`, `/datafn/mutation`, `/datafn/transact`, `/datafn/clone`, `/datafn/pull`, `/datafn/push`
- Authz: validate requested tables/fields/relations against schema + user permissions
- Idempotency: dedupe safe retries using `mutationId` + `clientId`
- Transport abstraction: uses `@superfunctions/http` for framework-agnostic routing
- Storage abstraction: uses `@superfunctions/db` for database adapters

## Canonical response envelopes (v0)
- Query:
  - non-aggregate: `{ data, count?, nextCursor? }`
  - aggregate (groupBy): `{ groups, nextCursor? }`
- Mutation: `{ ok, mutationId, affectedIds, errors? }`

DFQL details and examples live in `dfql.intent.md`.

## Usage
- Entire ResourceStore, ActiveResourceStore and flux.ts in `~/dev/nucleus` project will use datafn once completed.
- Should also work in extension context - abstract away all the complexity of background script delegation etc - can be used from content scripts and side panel of a browser extension

## Client
- Unified API for querying, mutating, subscribing to data changes and syncing on client-side.
- Two reactive layers:
  - Event subscriptions (stateless emitter) for imperative flows
  - Signal-backed reactivity for declarative data binding
- Core runtime package and separate adapter packages for different frameworks
- Should support framework-specific adapters (Svelte first, others later) similar to SignalDB’s approach.
- Should be declared and initialized once with table configuration and persistence layer.
  - Refer `~/dev/nucleus/` project `product.config` and `resource.config` for idea of how data layer is used currently.
- It should have a table registry that auto-exposes `datafn.<table>` handles for each table
  - datafn.<tablename>.query (refer sample query json)
  - datafn.<tablename>.mutation (refer sample mutation json)
  - datafn.<tablename>.subscribe for manual change subscription
- Fine-grained subscriptions (record IDs, action types, context, fields)
- It should abstract away the underlying persistence layer
- Using table definitions and declarations - it should generate type-safe query and mutation APIs


### Offlinability / Sync
- When `offlinability` option is turned on - the client should maintain a local database (e.g. IndexedDB using Dexie)
- It should use server's (server SDK exposes these endpoints) `push`, `pull`, `seed`, `clone` methods to sync
  - `push` - push new changes from client to server
  - `pull` - pull changes from server to client
  - `seed` - on signup - populate seed data for settings etc
  - `clone` - fresh login - clone entire data locally before starting to use `pull` for pulling only changes
- During `pull` with heavy data or `clone`, `.query` can temporarily use the remote instance while local tables are being hydrated (see Query during clone).
- Should maintain a change log to track local changes when offline
- During `push` - it should send local changes to server and upon success - clear the local change log
- Should maintain last sync timestamps for each table to optimize `pull` operations
- Should provide hooks/callbacks for sync events (e.g. onSyncStart, onSyncComplete, onSyncError etc)
- Should provide conflict resolution strategies (e.g. client-wins, server-wins, custom resolver etc)

#### Sync invariants (v0)
- Idempotency: `mutationId` + `clientId` are required for any mutation that may be retried (offline, network retries).
- Ordering: server assigns a monotonic ordering per account/space (implementation-defined). This ordering is the source of truth.
- Conflict default: LWW by server ordering for overlapping writes to the same record.
- Cursors: per-table cursors/timestamps are stored locally (keyed by table name). `pull` sends `{ [table]: cursor }` and server responds with updated cursors.

#### Query during clone (v0)
- Each table can be in `{ notStarted | hydrating | ready }`.
- If a query touches a table that is `hydrating`, datafn may execute that part remotely (temporary remote fallback).
- Remote fallback results must still pass through DFQL filtering/sorting/pagination so results are deterministic for the same inputs.

### Plugins
- Plugin architecture to extend functionality (e.g. logging, analytics, custom conflict resolution etc)
- Lifecycle hooks for plugins (e.g. beforeQuery, afterQuery, beforeMutation, afterMutation, beforeSync, afterSync etc)

#### Plugin semantics (v0)
- Execution: hooks run in registration order.
- Runtime: plugins can run client-side, server-side, or both; each hook must declare where it runs.
- Error handling:
  - core hooks that affect correctness (authz, validation, conflict checks) are fail-closed
  - side-effect hooks (indexing, analytics) are recommended fail-open by default (configurable)
- Mutability:
  - before* hooks may transform/augment requests
  - after* hooks may post-process responses (should be used carefully to preserve determinism)

_searchFn plugin_
- When searchFn plugin is added - datafn will update searchfn indices on data changes
- Datafn will use searchfn if `search` query is present in the query json, then deterministically apply DFQL filters/sorts/pagination against the candidate id set from searchfn.


------
## Server
- Server-side implementation should resemble like better-auth with extensibility using plugins, automatic endpoint generation, internal database abstraction etc.
- Uses `@superfunctions/http`, `@superfunctions/db` for http and db abstraction
- It should provide middleware integration
- Should generate `pull`, `push`, `seed`, `clone` sync API endpoints
- Using table definitions and declarations - It should be able to auto-generate REST or GraphQL APIs based on table schema
- Generate migration scripts based on table schema changes
  
### Endpoints

_Direct transactions when `offlinability` is disabled or during initial clone progress state_
- `/datafn/status` - health check endpoint
- `/datafn/query` - query endpoint to query single or multiple (refer query sample json)
- `/datafn/mutation` - mutation endpoint to perform mutations (refer mutation sample json)
- `/datafn/transact` - can contain multiple queries/mutations in a single transaction (refer transact sample json)


_Sync endpoints for local first and offline capability_
- `/datafn/push` will send local changes to server using `mutation` json format.
  - Each client will have a unique client identifier stored locally to identify changes from different clients.
- `/datafn/pull` will fetch changes from server since last sync timestamp.
  - Client should maintain the last sync timestamp for each table.
- `/datafn/seed` will initialize client database both locally and on server with initial data when user signs up for the first time
- `/datafn/clone` will clone the entire database from server to client on fresh logins



### Plugins
- Server SDK should support plugins to extend functionality (e.g. logging, analytics, custom endpoints etc)
- It should provide lifecycle hooks for plugins (e.g. beforeQuery, afterQuery, beforeMutation, afterMutation, beforeSync, afterSync etc)

_searchFn plugin_
- When searchFn plugin is added - datafn will update searchfn indices on data changes
- Datafn will use searchfn if `search` query is present in the query json.

Future plugins: memoryFn, cacheFn