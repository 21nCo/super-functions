# datafn — Audit Fix Change Spec

**Status**: Draft  
**Spec ID**: `2026-01-23-audit-fix-change-spec`  
**Last updated**: 2026-01-23  

This change spec fixes all gaps and contradictions identified in the audit report:

- `datafn/.conduct/audit-2026-01-23.md`

It is written to the “high‑precision spec” bar described in [spec.txt](https://www.fetch.at/spec.txt).

## Overview

### Project name

`datafn`

### One-sentence goal

Bring the `@datafn/*` implementation, tests, and documentation into a single deterministic, schema-bounded contract that satisfies the original `datafn` intent (local-first + DFQL + signals + sync + plugins) while resolving all audit findings (envelopes, capabilities, plugins, richer subscriptions, storage adapters, extension RPC, tooling determinism, docs parity).

### Target users

- Superfunctions application developers building reactive apps (web + browser extension) with offline sync and schema-bounded DFQL.
- Superfunctions backend developers hosting `/datafn/*` endpoints (TypeScript and Python).

### Target environments

- Client: browser, extension contexts (background/service worker + content/sidepanel), Node for tests.
- Server: Node 18+.
- Python: server-only SDK (no local-first client runtime).

### Required packages (this repo)

- `@datafn/core`
- `@datafn/client`
- `@datafn/server`
- `@datafn/svelte`
- `@datafn/cli`
- Python package `datafn`

### Integrations

- TypeScript server DB abstraction: `@superfunctions/db.Adapter`
- TypeScript server routing: `@superfunctions/http`
- Python server routing: `superfunctions.http` (adapter-specific integration)
- Python server DB abstraction: `superfunctions.db.Adapter`

### Hard constraints

- **Schema-bounded**: DFQL requests MUST only reference schema-declared resources/fields/relations (server is authoritative).
- **Deterministic**: identical inputs and identical underlying data MUST produce identical outputs (including ordering and error shapes).
- **No arbitrary execution**: DFQL is not raw SQL nor embedded server code.

### Non-goals

- No new product scope beyond the original intent/spec and the audit findings.
- GraphQL API generation remains optional (see requirements; it is not required to satisfy audit findings).

---

## Glossary

- **DFQL**: Data Function Query Language (JSON) defined by `datafn/.conduct/dfql.intent.md`.
- **DatafnEnvelope**: canonical top-level success/error wrapper used by HTTP and RPC.
- **Request-level failure**: an error that prevents executing an endpoint at all (invalid JSON, missing required fields, authorization denied, server misconfigured).
- **Result-level failure**: an operation-level failure inside an otherwise valid request (e.g. a single mutation item returns `{ ok:false, ... }`).
- **Deterministic error**: an error whose `code`, `message`, and `details.path` are stable for a given invalid input.
- **Namespace**: server-side logical partition for data, idempotency, and `serverSeq`. Default namespace string is `"datafn"` unless overridden by host context.
- **serverSeq**: a monotonic integer counter per namespace used for conflict ordering and sync cursors.
- **Cursor**: a base-10 integer string representing the latest observed `serverSeq` per table.
- **Hydration state**: per-table `{ notStarted | hydrating | ready }` state used by the client to route queries locally vs remotely.
- **Plugin**: a `DatafnPlugin` object with optional hooks (`beforeQuery`, `afterQuery`, `beforeMutation`, `afterMutation`, `beforeSync`, `afterSync`).
- **runsOn**: plugin declaration of supported environments (`"client"`, `"server"`); hooks MUST only execute in the environments declared.

---

## Public API (normative)

### `@datafn/core`

#### Envelopes and errors

- `DatafnEnvelope<T>` is:
  - success: `{ ok: true, result: T }`
  - failure: `{ ok: false, error: DatafnError }`

- `DatafnError` is:

```ts
export type DatafnError = {
  code: DatafnErrorCode;
  message: string;
  details: { path: string; [k: string]: unknown };
};
```

`details.path` MUST always be present.

#### Schema helpers

`validateSchema(schema: unknown): DatafnEnvelope<DatafnSchema>` returns an envelope and MUST NOT throw.

This change spec introduces a new helper (required by tooling determinism requirements):

- `unwrapEnvelope<T>(env: DatafnEnvelope<T>): T`
  - returns `env.result` when `ok:true`
  - throws a deterministic `DatafnError` when `ok:false`

#### DFQL normalization

`dfqlKey(value: unknown): string` returns a canonical string key derived from recursively sorted object keys and `undefined`-elision as already defined by `@datafn/core`.

#### Events and filters (extended)

`DatafnEvent` MUST support richer metadata required by fine-grained subscriptions:

```ts
export interface DatafnEvent {
  type: "mutation_applied" | "mutation_rejected" | "sync_applied" | "sync_failed";
  resource?: string;
  ids?: string[];
  mutationId?: string;
  clientId?: string;
  timestampMs: number;
  /** Mutation operation, when known. */
  action?: string;
  /** Changed top-level field names (best-effort), when known. */
  fields?: string[];
  /** Error (for mutation_rejected/sync_failed) or other metadata. */
  context?: unknown;
}
```

`DatafnEventFilter` MUST support:

```ts
export type DatafnEventFilter = Partial<{
  type: DatafnEvent["type"] | Array<DatafnEvent["type"]>;
  resource: string | string[];
  ids: string | string[];
  mutationId: string | string[];
  action: string | string[];
  fields: string | string[];
  /** Required keys that MUST exist on event.context when context is an object. */
  contextKeys: string | string[];
}>;
```

### `@datafn/client`

#### `createDatafnClient`

```ts
import type { DatafnSchema, DatafnPlugin } from "@datafn/core";

export interface DatafnRemoteAdapter {
  query(q: unknown | unknown[]): Promise<unknown>;
  mutation(m: unknown | unknown[]): Promise<unknown>;
  transact(t: unknown): Promise<unknown>;
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
}

export interface DatafnClientConfig {
  schema: DatafnSchema;
  remote: DatafnRemoteAdapter;
  plugins?: DatafnPlugin[];
  storage?: DatafnStorageAdapter;
  clientId?: string;
  getTimestamp?: () => number;
}

export function createDatafnClient(config: DatafnClientConfig): DatafnClient;
```

#### Table registry

The returned `DatafnClient` MUST be a `Proxy` supporting:

- `client.table(name)` and `client.<tableName>` for schema-declared resources
- deterministic rejection of unknown tables
- reserved key safety (`then`, `toJSON`, `inspect` at minimum)

#### Signals

Signals MUST use `@datafn/core.dfqlKey` for caching and identity.

### `@datafn/server`

#### `createDatafnServer`

```ts
import type { DatafnSchema, DatafnPlugin } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";

export interface DatafnServerConfig<TContext = any> {
  schema: DatafnSchema;
  db: Adapter;
  plugins?: DatafnPlugin[];
  authorize?: (
    ctx: TContext,
    action:
      | "status"
      | "query"
      | "mutation"
      | "transact"
      | "seed"
      | "clone"
      | "pull"
      | "push"
      | "rest.query"
      | "rest.mutation",
    payload: unknown,
  ) => Promise<boolean> | boolean;
  limits?: {
    maxLimit?: number;
    maxTransactSteps?: number;
    maxPayloadBytes?: number;
  };
  getServerTime?: () => number;
  rest?: boolean;
}
```

`db` is mandatory in this change spec (the “validation-only mode” is removed; see requirements).

#### Endpoints

Server MUST expose these endpoints:

- `GET /datafn/status`
- `POST /datafn/query`
- `POST /datafn/mutation`
- `POST /datafn/transact`
- `POST /datafn/seed`
- `POST /datafn/clone`
- `POST /datafn/pull`
- `POST /datafn/push`

If `rest:true`:

- `GET /datafn/resources/:table`
- `POST /datafn/resources/:table`
- `PATCH /datafn/resources/:table/:id`
- `DELETE /datafn/resources/:table/:id`

All HTTP responses MUST be `DatafnEnvelope`-wrapped.

### `@datafn/svelte`

`@datafn/svelte` MUST export:

```ts
import type { Readable } from "svelte/store";
import type { DatafnSignal } from "@datafn/core";

export function toSvelteStore<T>(signal: DatafnSignal<T>): Readable<T>;
```

### `@datafn/cli`

`@datafn/cli` MUST provide programmatic entry points for:

- TypeScript type generation from a schema (codegen)
- Schema diff + migration plan generation

It MUST reject invalid schema inputs deterministically using the canonical envelope helpers (`unwrapEnvelope(validateSchema(...))`).

### Python package `datafn` (server-only)

Python MUST provide `create_datafn_server(config)` which returns an object that exposes routable `/datafn/*` endpoints with the same envelope semantics as the TypeScript server.

---

## Data formats / protocol (normative)

### HTTP transport envelope

All endpoints return JSON:

- success: `{ "ok": true, "result": <payload> }`
- error: `{ "ok": false, "error": { "code": "...", "message": "...", "details": { "path": "..." } } }`

Request-level failures MUST use top-level `ok:false` (never `ok:true` with a nested failure payload).

### Deterministic error messages (request-level)

These messages are fixed:

- Invalid JSON body: `DFQL_INVALID` with `message:"Invalid JSON"` and `details.path:"$"`.
- Missing server DB: `INTERNAL` with `message:"Internal error"` and `details.path:"$"`.

### Error codes (normative set)

This spec uses these error codes:

- `SCHEMA_INVALID`: schema validation failure
- `DFQL_INVALID`: DFQL payload is syntactically or structurally invalid
- `DFQL_UNKNOWN_RESOURCE`: DFQL references a resource/table not in schema
- `DFQL_UNSUPPORTED`: DFQL references a supported shape but uses an unsupported feature for the current server configuration (e.g., search without search plugin)
- `FORBIDDEN`: authorization denied
- `INTERNAL`: server misconfiguration or unexpected error

Mutation/transact *result-level* errors MAY use:

- `CONFLICT`: optimistic concurrency / insert conflict / constraint conflict
- `NOT_FOUND`: targeted id does not exist (operation-dependent)

### REST wrapper conventions (normative)

If `rest:true`:

- `GET /datafn/resources/:table`
  - reads optional query string `q` as URL-decoded JSON
  - invalid JSON in `q` returns `ok:false DFQL_INVALID "Invalid JSON" details.path:"q"`
  - the server injects `resource` and `version` automatically (client MUST NOT override)

- `POST /datafn/resources/:table`
  - requires deterministic `clientId` and `mutationId` inputs (query string or body as documented by server README)
  - defaults operation to `merge` if omitted (upsert)

- `PATCH /datafn/resources/:table/:id`
  - requires deterministic `clientId` and `mutationId`
  - defaults operation to `merge`

- `DELETE /datafn/resources/:table/:id`
  - requires deterministic `clientId` and `mutationId`
  - uses DFQL `delete`

### `/datafn/status` result shape

```json
{
  "schemaHash": "sha256:<64 hex>",
  "capabilities": [
    "dfql.query",
    "dfql.mutation",
    "dfql.transact",
    "sync.seed",
    "sync.clone",
    "sync.pull",
    "sync.push"
  ],
  "limits": { "maxLimit": 100, "maxTransactSteps": 50, "maxPayloadBytes": 1048576 },
  "serverTimeMs": 0
}
```

Capability strings are normative and fixed (see requirements).

### Extension RPC envelope

Extension RPC message envelopes are defined in `@datafn/client` as:

- `DatafnRpcRequest`: `{ id, method, payload }`
- `DatafnRpcResponse`: `{ id, envelope: DatafnEnvelope<unknown> }`
- `DatafnRpcEvent`: `{ type:"event", subscriptionId, event: DatafnEvent }`

### Server internal tables (normative)

The server MUST use these internal model names in adapter-backed storage (all namespace-scoped):

- `__datafn_meta`:
  - `id: string`
  - `namespace: string` (unique)
  - `nextServerSeq: number`

- `__datafn_changes`:
  - `id: string`
  - `namespace: string`
  - `serverSeq: number`
  - `resource: string`
  - `recordId: string`
  - `op: "upsert" | "delete"`
  - `record: string | null` (JSON)

- `__datafn_idempotency`:
  - `id: string`
  - `namespace: string`
  - `clientId: string`
  - `mutationId: string`
  - `result: string` (JSON)
  - unique constraint: `(namespace, clientId, mutationId)`

- `__datafn_seed`:
  - `id: string`
  - `namespace: string` (unique)
  - `seededAtMs: number`

---

## Semantics (normative)

### Server: authorization ordering

For `POST` endpoints:

1. Parse JSON body.
2. If parsing fails, return `ok:false DFQL_INVALID "Invalid JSON"`; authorization is not evaluated (no parsed payload exists).
3. If parsing succeeds, call `authorize(ctx, action, payload)` exactly once before any side effects.

For `GET /datafn/status`:

- Call `authorize(ctx,"status",null)` (payload is `null`).

### Server: plugin ordering and environments

- Hooks execute in registration order.
- Hooks MUST only run when `plugin.runsOn` contains `"server"`.
- `before*` hooks are fail-closed (an exception produces a request-level `ok:false` error envelope).
- `after*` hooks are fail-open by default (errors are logged; response result is not replaced unless the hook returned a replacement deterministically).

### Server: envelope semantics

- All request parse and validation failures are request-level and MUST be `ok:false`.
- Mutation/transact endpoints MAY return `ok:true` with per-item/per-step failures inside the result, but only after request-level validation succeeded.

### Server: status capabilities

When the server is healthy and fully configured, `/datafn/status` MUST advertise:

- `dfql.query`
- `dfql.mutation`
- `dfql.transact`
- `sync.seed`
- `sync.clone`
- `sync.pull`
- `sync.push`

No other strings are required by this spec.

### Server: DB requirement

With this change spec, server endpoints (except `GET /datafn/status`) require a configured DB adapter.

- When DB is missing, endpoints MUST return request-level `ok:false INTERNAL "Internal error" path:"$"`.
- “Validation-only mode” is explicitly removed.

### Client: offline fallback classification

Client offline fallback MUST be triggered only by *transport unavailability* (e.g. network failures or explicit `TRANSPORT_ERROR`), and MUST NOT treat server rejections (`ok:false` envelopes) as offline.

### Tooling: deterministic schema validation

Tooling (`@datafn/cli` and python SDK) MUST treat schema validation as envelope-returning and MUST unwrap deterministically (no incidental runtime errors).

### Documentation parity

Package READMEs are part of the contract surface: they MUST match exported APIs and canonical examples (especially client config using `remote`, not `executor`, and Svelte usage via `client.<table>.signal` + `toSvelteStore`).

### Client: plugin ordering and environments

- Hooks execute in registration order.
- Hooks MUST only run when `plugin.runsOn` contains `"client"`.
- `beforeQuery`/`beforeMutation`/`beforeSync` are fail-closed (errors reject the operation and MUST prevent remote calls).
- `afterQuery`/`afterMutation`/`afterSync` are fail-open by default.

### Client: events

Mutation events MUST include:

- `type`
- `resource`
- `ids` (always array)
- `mutationId` (when present on input mutation)
- `clientId` (when present on input mutation)
- `timestampMs` (from `getTimestamp`)
- `action` (from mutation.operation when present)
- `fields` (best-effort; derived from record keys for merge/replace/insert)

### Client: signals

- Signals MUST be cached by `@datafn/core.dfqlKey(fullQuery)`.
- Signals refresh on `mutation_applied` for the same `resource`.
- Refresh is de-duplicated: N events during an in-flight fetch trigger at most one additional fetch.

### Storage adapters

- The repo MUST ship a deterministic memory adapter and IndexedDB adapter implementing `DatafnStorageAdapter`.
- Adapters MUST implement changelog de-duplication by `(clientId, mutationId)`.

---

## Invariants

- **Deterministic envelopes**: request-level errors are always top-level `ok:false` with stable message/path.
- **Deterministic ordering**:
  - query results are stable given same underlying data and same query input
  - relation expansions have deterministic ordering
- **Idempotency**: `(clientId, mutationId)` retries are deduped.
- **Monotonicity**: `serverSeq` and per-table cursors only move forward.

---

## Security

- Server MUST enforce schema-boundedness and authorization at the server boundary.
- Plugins MUST NOT introduce non-deterministic values into query results (e.g., timestamps, random ids).

---

## Limits / caps

- Server MUST enforce `limits.maxLimit` for DFQL queries.
- Server SHOULD enforce `limits.maxPayloadBytes` for request bodies.
- Server SHOULD enforce `limits.maxTransactSteps` for `/datafn/transact`.

---

## Observability

- Client MUST emit mutation events as specified.
- Server SHOULD log plugin hook errors (after* hooks) without changing results.

---

## Compatibility / versioning

- This spec removes “validation-only mode” for the server; missing DB is a request-level `INTERNAL` error.
- This spec standardizes capability strings and request-level envelopes; clients MUST treat unexpected shapes as `TRANSPORT_ERROR`.

---

## Undefined / Explicitly user-deferred only

None.

