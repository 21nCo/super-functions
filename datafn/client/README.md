# @datafn/client

Offline-first, reactive client for DataFn. Provides fluent Table and KV APIs, reactive signals for UI binding, browser-owned IndexedDB storage, native-backed Core Data storage through `@datafn/swift-bridge`, bidirectional synchronization, an event bus, transactions, plugins, and multi-user data isolation.

## Installation

```bash
npm install @datafn/client @datafn/core
```

For Apple WebView hosts that want Swift-owned persistence and sync:

```bash
npm install @datafn/client @datafn/core @datafn/swift-bridge
```

## Topology Matrix

| Topology | Local persistence | Remote persistence | Sync owner |
|---|---|---|---|
| Browser-owned | IndexedDB | DataFn server | JavaScript |
| Native-backed DataFn-server | Core Data | DataFn server | Swift |
| Native-backed CloudKit | Core Data | CloudKit private database | Swift |

Native-backed mode is explicit. It does not silently fall back to IndexedDB if the bridge is missing.

## Features

| Feature | Description |
|---------|-------------|
| **Fluent Table API** | `client.table("resource")` — scoped queries, mutations, signals |
| **Reactive Signals** | Live queries that auto-update when data changes |
| **KV Store** | Built-in key-value API with signal support (`client.kv`) |
| **Offline Storage** | IndexedDB and Memory adapters with changelog-based offline mutations |
| **Synchronization** | Clone, pull, push, cloneUp, reconcile — with hydration plans |
| **Offline-Only Mode** | `sync.mode: "local-only"` — no server required |
| **Event Bus** | Global event stream for mutations and sync lifecycle |
| **Transactions** | Atomic multi-step operations across resources |
| **Plugin System** | Intercept queries, mutations, and sync with custom logic |
| **Date Codec** | Automatic serialization/parsing of Date fields |
| **Multi-User Isolation** | Per-user IndexedDB databases via `authContext` + storage factory |
| **Extension Adapter** | Browser-extension support via `remoteAdapter` with remote subscriptions |
| **Type-Safe** | Full TypeScript inference from your schema |

---

## Quick Start

```typescript
import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "title", type: "string", required: true },
        { name: "completed", type: "boolean", required: true, default: false },
      ],
    },
  ],
};

const client = createDatafnClient({
  schema,
  clientId: "device-" + crypto.randomUUID(),
  storage: new IndexedDbStorageAdapter("my-app-db"),
  sync: {
    offlinability: true,
    remote: "http://localhost:3000/datafn",
  },
});

// Start sync (clone + pull + push engine)
await client.sync.start();

// Insert a record
await client.table("tasks").mutate({
  operation: "insert",
  record: { title: "Hello DataFn", completed: false },
});

// Create a reactive signal
const signal = client.table("tasks").signal({
  filters: { completed: false },
  sort: ["-createdAt"],
});

signal.subscribe((result) => {
  console.log("Active tasks:", result.data);
});
```

## Native-backed Apple WebView Mode

When the same web app is embedded inside a SwiftUI host, configure the client with native-backed bridge adapters instead of IndexedDB:

```typescript
import { createDatafnClient } from "@datafn/client";
import {
  createNativeBackedRemoteAdapter,
  createNativeBackedSearchProvider,
  createNativeBackedStorageAdapter,
  createNativeSyncController,
  createWKWebViewBridgeBus,
} from "@datafn/swift-bridge";

const bus = createWKWebViewBridgeBus({ handlerName: "datafn" });

const client = createDatafnClient({
  schema,
  clientId: "apple-webview-device",
  namespace: "org-1:user-1",
  storage: createNativeBackedStorageAdapter(bus),
  searchProvider: createNativeBackedSearchProvider(bus),
  sync: {
    owner: "native",
    mode: "sync",
    offlinability: true,
    remoteAdapter: createNativeBackedRemoteAdapter(bus),
    native: {
      syncController: createNativeSyncController(bus),
      remoteMode: "datafn-server",
      expectedSchemaHash: "todo-app-example-v1",
      failIfUnavailable: true,
      remoteProfile: "default",
    },
  },
});
```

For CloudKit-backed personal apps, change `remoteMode` to `"icloud"`. In both native-backed modes:

- Swift owns persistence and synchronization.
- Swift also owns the SearchFn-backed local index.
- The JavaScript `SyncEngine` must stay inactive.
- DataFn must fail before persistence starts if the bridge is unavailable.
- IndexedDB must not be used as a fallback persistence or search-index layer.
- CloudKit syncs records only. Search index files remain derived local state on each device.

---

## Client Configuration

### createDatafnClient(config)

```typescript
interface DatafnClientConfig<S extends DatafnSchema> {
  /** Your DataFn schema definition */
  schema: S;

  /** Stable client/device identifier — required for offline + idempotency */
  clientId: string;

  /** Sync configuration (see below) */
  sync?: DatafnSyncConfig;

  /**
   * Local persistence adapter.
   * Can be a direct adapter instance or a factory function for multi-user isolation.
   */
  storage?: DatafnStorageAdapter | DatafnStorageFactory;

  /** Auth context for multi-user/multi-tenant data isolation */
  authContext?: AuthContext | AuthContextProvider;

  /** Optional plugins for hook execution */
  plugins?: DatafnPlugin[];

  /** Custom timestamp function (for testing) */
  getTimestamp?: () => number;

  /**
   * Custom ID generator for insert operations.
   * Default: `${idPrefix || resource}:${crypto.randomUUID()}`
   */
  generateId?: (params: { resource: string; idPrefix?: string }) => string;
}
```

### DatafnSyncConfig

```typescript
interface DatafnSyncConfig {
  /**
   * Explicit mode selection.
   * - "sync": requires remote or remoteAdapter
   * - "local-only": no server required; all tables start as "ready"
   */
  mode?: "sync" | "local-only";

  /** Enable offline support (requires storage) */
  offlinability?: boolean;

  /** Remote server URL for the default HTTP transport */
  remote?: string;

  /** Injected remote adapter (takes precedence over remote URL) */
  remoteAdapter?: DatafnRemoteAdapter;

  /** Enable WebSocket for real-time server-push updates */
  ws?: boolean;

  /** WebSocket URL (derived from remote if omitted) */
  wsUrl?: string;

  /** Push engine: interval between batches (ms). Default 2000. */
  pushInterval?: number;

  /** Push engine: records per batch. Default 100. */
  pushBatchSize?: number;

  /** Push engine: max retries per mutation. Default 3. */
  pushMaxRetries?: number;

  /** Hydration plan for large datasets */
  hydration?: {
    /** Resources that MUST be cloned before the app is considered "ready" */
    bootResources?: string[];
    /** Resources that hydrate in the background after boot */
    backgroundResources?: string[];
    /** Per-resource clone page size (or a single number for all) */
    clonePageSize?: number | Record<string, number>;
  };
}
```

---

## Table API

The `client.table(name)` method returns a scoped handle for a specific resource. You can also access tables as properties: `client.tasks` is equivalent to `client.table("tasks")`.

```typescript
const tasks = client.table("tasks");
// or equivalently:
const tasks = client.tasks;
```

### table.query(fragment)

Execute a query scoped to this resource.

```typescript
const result = await tasks.query({
  select: ["id", "title", "completed"],
  filters: { completed: false },
  sort: ["-createdAt"],
  limit: 20,
});
// result.data = [{ id: "task:...", title: "...", completed: false }, ...]
```

**Query features:**
- `select` / `omit` — field selection
- `filters` — operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is_null`, `is_not_null`, `in`, `nin`, `contains`
- Logical groups: `$and`, `$or`
- `sort` — multi-field: `["name", "-createdAt"]` (prefix `-` = descending)
- `limit` / `offset` — offset-based pagination
- `cursor` — cursor-based pagination (`{ after: {...} }`)
- `count` — return count only
- `groupBy` / `aggregations` / `having` — aggregation queries
- `search` — full-text search

### Search (Provider-Backed, Local-First)

DataFn search is provider-backed when `searchProvider` is configured. In sync mode, search is local-first after hydration is ready.

Topology-specific search ownership:

- Browser-owned mode: use a JavaScript SearchFn provider, typically `@searchfn/datafn-provider` with `@searchfn/adapter-indexeddb`.
- Native-backed Apple WebView mode: use `createNativeBackedSearchProvider(bus)` so Swift executes search against the shared native SearchFn backend.
- Native-backed CloudKit mode: the same native SearchFn backend is used, but CloudKit syncs records only; index files are rebuilt and maintained locally per device.

`table.query()` search block options:

```typescript
const result = await tasks.query({
  search: {
    query: "test",
    prefix: true,
    fuzzy: 0.2,
    fieldBoosts: { title: 2, description: 1 },
  },
});
```

Cross-resource search with explicit source routing:

```typescript
const result = await client.search({
  query: "test",
  resources: ["tasks", "projects"],
  prefix: true,
  fuzzy: 0.2,
  fieldBoosts: { title: 2, name: 1 },
  source: "auto", // auto | local | remote
});
```

`source` semantics:

- `auto` (default): local-first; falls back to remote if local provider path is unavailable.
- `local`: force local provider execution.
- `remote`: force remote `/datafn/search` execution.

If the requested source is unavailable, DataFn returns `DFQL_UNSUPPORTED`.

MiniSearch-only plugin mode is still supported for compatibility, but provider-backed mode is the recommended path.

### table.mutate(fragment)

Execute a mutation scoped to this resource.

```typescript
// Insert
await tasks.mutate({
  operation: "insert",
  record: { title: "New task", completed: false },
});

// Merge (partial update)
await tasks.mutate({
  operation: "merge",
  id: "task:abc",
  record: { completed: true },
});

// Replace (full update)
await tasks.mutate({
  operation: "replace",
  id: "task:abc",
  record: { title: "Updated", completed: true },
});

// Delete
await tasks.mutate({
  operation: "delete",
  id: "task:abc",
});
```

**Mutation operations:**

| Operation | Description |
|-----------|-------------|
| `insert` | Create a new record |
| `merge` | Partial update (only specified fields) |
| `replace` | Full update (replaces entire record) |
| `delete` | Delete a record |

**Relation operations** (use `client.mutate()` with full resource/version):

| Operation | Description |
|-----------|-------------|
| `relate` | Create a relation between records |
| `unrelate` | Remove a relation between records |
| `modifyRelation` | Update relation metadata |

```typescript
// Tag a todo with a category (many-many relation)
await client.mutate({
  resource: "todos",
  version: 1,
  operation: "relate",
  id: "todo:1",
  relation: "tags",
  targetId: "cat:work",
});

// Remove a tag
await client.mutate({
  resource: "todos",
  version: 1,
  operation: "unrelate",
  id: "todo:1",
  relation: "tags",
  targetId: "cat:work",
});
```

**Advanced mutation features:**
- **Idempotency**: `clientId` + `mutationId` for deduplication
- **Optimistic concurrency**: `if` guards prevent conflicts
- **Context**: pass arbitrary context data to plugins and events

### table.signal(fragment)

Create a reactive signal — a live query that auto-refreshes when data changes.

```typescript
const activeTasks = tasks.signal({
  filters: { completed: false },
  sort: ["-createdAt"],
});

// Get current value
console.log(activeTasks.get());

// Subscribe to changes
const unsub = activeTasks.subscribe((result) => {
  console.log("Tasks:", result.data);
  console.log("Loading:", result.loading);
});

// Check states
activeTasks.loading;     // true while initial fetch is in progress
activeTasks.error;       // non-null if last fetch failed
activeTasks.refreshing;  // true while background refresh is in progress
```

**Signal features:**
- Lazy fetch: only loads data when first subscribed
- Auto-refresh: re-runs when mutations affect the query footprint
- Debounced batching: multiple rapid mutations trigger a single refresh
- Caching: signals with the same query share a single cached instance (via `dfqlKey`)

### table.subscribe(handler, filter?)

Subscribe to events for this resource only.

```typescript
tasks.subscribe((event) => {
  console.log(`${event.action} on ${event.resource}:`, event.ids);
});
```

---

## KV API

The built-in key-value store provides a schemaless storage layer that syncs alongside your typed resources. Access it via `client.kv`.

```typescript
// Set a value
await client.kv.set("user:theme", "dark");

// Get a value
const theme = await client.kv.get<string>("user:theme");
// → "dark"

// Merge into an object value
await client.kv.set("user:prefs", { fontSize: 14, lang: "en" });
await client.kv.merge("user:prefs", { fontSize: 16 });
// → { fontSize: 16, lang: "en" }

// Delete a key
await client.kv.delete("user:theme");

// Reactive signal for a key
const themeSignal = client.kv.signal<string>("user:theme", {
  defaultValue: "dark",
});

themeSignal.subscribe((value) => {
  document.body.className = value; // Updates reactively
});
```

### KV API Reference

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `get<T>(key): Promise<T \| null>` | Read a value |
| `set` | `set<T>(key, value, params?): Promise<Result>` | Write a value (replace semantics) |
| `merge` | `merge(key, patch, params?): Promise<Result>` | Shallow-merge into existing object |
| `delete` | `delete(key, params?): Promise<Result>` | Remove a key |
| `signal` | `signal<T>(key, options?): DatafnSignal<T>` | Reactive signal for a key |

KV data is stored in the built-in `kv` resource and participates in sync (clone/pull/push) like any other resource.

---

## Offline-Only Mode

Run the client with no server at all. All data lives in local storage only.

```typescript
const client = createDatafnClient({
  schema,
  clientId: "local-device",
  storage: new IndexedDbStorageAdapter("my-app-local"),
  sync: {
    mode: "local-only",
  },
});

// No sync.start() needed — all tables are immediately "ready"
// Queries and mutations work against local storage
await client.table("tasks").mutate({
  operation: "insert",
  record: { title: "Offline task" },
});
```

When in `local-only` mode:
- All resource hydration states are set to `"ready"` immediately
- Queries execute against local storage only
- Mutations apply optimistically to local storage
- No network calls are made
- The sync facade methods (`clone`, `pull`, `push`) throw if called

---

## Synchronization

### Sync Facade

```typescript
client.sync.seed(payload)       // Seed data to server
client.sync.clone(payload)      // Full data download
client.sync.pull(payload)       // Incremental sync (cursor-based)
client.sync.push(payload)       // Upload local mutations
client.sync.cloneUp(options?)   // Upload local data to server
```

### Sync Engine

When `offlinability` is true, the sync engine manages the full lifecycle:

```typescript
await client.sync.start();       // Start sync engine (clone → pull loop → push loop)
client.sync.stop();              // Stop sync engine
await client.sync.pullNow();     // Trigger immediate pull
await client.sync.cloneNow();    // Trigger immediate clone
await client.sync.reconcileNow(); // Trigger reconcile
```

**Sync engine behavior:**
- On `start()`: clones boot resources, then starts pull and push intervals
- Pull on visibility change: re-fetches when tab becomes visible
- Push batching: queues mutations and pushes in batches at `pushInterval`
- Push retries: retries failed pushes up to `pushMaxRetries` times

### Hydration States

Each resource tracks its hydration state:

| State | Description |
|-------|-------------|
| `notStarted` | No data has been cloned yet |
| `hydrating` | Clone is in progress |
| `ready` | Data is available for queries |

Configure boot vs background resources to control app readiness:

```typescript
sync: {
  hydration: {
    bootResources: ["tasks", "projects"],     // Must clone before app is ready
    backgroundResources: ["audit_log"],        // Hydrates after boot
    clonePageSize: { tasks: 500, audit_log: 100 },
  },
}
```

### CloneUp

Upload local data to the server (e.g. after working offline):

```typescript
const result = await client.sync.cloneUp({
  resources: ["tasks"],         // Which resources to upload (default: all)
  includeManyMany: true,        // Upload join rows too
  recordOperation: "merge",     // "merge" | "replace" | "insert"
  batchSize: 100,               // Records per batch
  maxRetries: 3,                // Retries per batch
  failFast: false,              // Stop on first error?
  clearChangelogOnSuccess: true, // Drain changelog after upload
  setGlobalCursorOnSuccess: true,// Update cursors
  pullAfter: true,              // Pull new data after upload
});

console.log(result.uploadedCount);
```

---

## Event Bus

Subscribe to global events or filter by resource, type, action, and more.

```typescript
// Global subscription
const unsub = client.subscribe((event) => {
  console.log(event.type, event.resource, event.ids);
});

// Filtered subscription
const unsub2 = client.subscribe(
  (event) => console.log("Task mutated:", event),
  {
    type: "mutation_applied",
    resource: "tasks",
    action: ["insert", "merge"],
  },
);
```

### EventFilter

```typescript
type EventFilter = {
  type?: string | string[];
  resource?: string | string[];
  ids?: string | string[];
  mutationId?: string | string[];
  action?: string | string[];
  fields?: string | string[];
  contextKeys?: string[];
  context?: Record<string, unknown>;
};
```

### matchesFilter

Utility to check if an event matches a filter programmatically:

```typescript
import { matchesFilter } from "@datafn/client";

if (matchesFilter(event, { resource: "tasks", type: "mutation_applied" })) {
  // handle
}
```

---

## Transactions

Execute atomic multi-step operations:

```typescript
const result = await client.transact({
  transactionId: "tx-complete-all",
  atomic: true,
  steps: [
    {
      query: {
        resource: "tasks",
        version: 1,
        select: ["id"],
        filters: { completed: false },
      },
    },
    {
      mutation: {
        resource: "tasks",
        version: 1,
        operation: "merge",
        id: "task:1",
        record: { completed: true },
      },
    },
    {
      mutation: {
        resource: "tasks",
        version: 1,
        operation: "delete",
        id: "task:2",
      },
    },
  ],
});
```

---

## Storage Adapters

### IndexedDbStorageAdapter

Persistent browser storage backed by IndexedDB. Supports multi-user isolation.

```typescript
import { IndexedDbStorageAdapter } from "@datafn/client";

// Simple usage
const storage = new IndexedDbStorageAdapter("my-app-db");

// Multi-user isolation
const storage = IndexedDbStorageAdapter.createForUser(
  "my-app-db",
  userId,
  tenantId, // optional
);
// Creates database: "my-app-db_tenant-456_user-123"
```

### MemoryStorageAdapter

In-memory storage for testing — data is lost on page refresh.

```typescript
import { MemoryStorageAdapter } from "@datafn/client";

const storage = new MemoryStorageAdapter();
```

### DatafnStorageAdapter Interface

Implement this interface for custom storage backends:

```typescript
interface DatafnStorageAdapter {
  // Records
  getRecord(resource: string, id: string): Promise<Record<string, unknown> | null>;
  listRecords(resource: string): Promise<Record<string, unknown>[]>;
  upsertRecord(resource: string, record: Record<string, unknown>): Promise<void>;
  deleteRecord(resource: string, id: string): Promise<void>;
  findRecords(resource: string, field: string, value: unknown): Promise<Record<string, unknown>[]>;
  countRecords(resource: string): Promise<number>;

  // Join rows (many-many relations)
  listJoinRows(relationKey: string): Promise<Array<Record<string, unknown>>>;
  getJoinRows(relationKey: string, fromId: string): Promise<Array<Record<string, unknown>>>;
  getJoinRowsInverse(relationKey: string, toId: string): Promise<Array<Record<string, unknown>>>;
  upsertJoinRow(relationKey: string, row: Record<string, unknown>): Promise<void>;
  setJoinRows(relationKey: string, rows: Array<Record<string, unknown>>): Promise<void>;
  deleteJoinRow(relationKey: string, from: string, to: string): Promise<void>;
  countJoinRows(relationKey: string): Promise<number>;

  // Sync state
  getCursor(resource: string): Promise<string | null>;
  setCursor(resource: string, cursor: string | null): Promise<void>;
  getHydrationState(resource: string): Promise<DatafnHydrationState>;
  setHydrationState(resource: string, state: DatafnHydrationState): Promise<void>;

  // Offline changelog
  changelogAppend(entry: Omit<DatafnChangelogEntry, "seq">): Promise<DatafnChangelogEntry>;
  changelogList(options?: { limit?: number }): Promise<DatafnChangelogEntry[]>;
  changelogAck(options: { throughSeq: number }): Promise<void>;
}
```

---

## Multi-User / Multi-Tenant Isolation

Isolate data per user in separate IndexedDB databases.

### Option 1: AuthContextProvider (recommended)

```typescript
import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";

const client = createDatafnClient({
  schema,
  clientId: "device-uuid",
  authContext: authClient.contextProvider, // implements { getContext(): AuthContext }
  storage: (ctx) =>
    IndexedDbStorageAdapter.createForUser("my-app", ctx.userId, ctx.tenantId),
  sync: { remote: "http://localhost:3000/datafn" },
});
```

### Option 2: Direct AuthContext

```typescript
const client = createDatafnClient({
  schema,
  clientId: "device-uuid",
  authContext: { userId: "user-123", tenantId: "tenant-456" },
  storage: (ctx) =>
    IndexedDbStorageAdapter.createForUser("my-app", ctx.userId, ctx.tenantId),
  sync: { remote: "http://localhost:3000/datafn" },
});
```

When a user logs out and another logs in, create a new client instance. Each user's data remains isolated in their own IndexedDB database.

---

## Date Codec

Automatic serialization and parsing of `date` fields.

```typescript
import {
  serializeDateFields,
  parseDateFields,
  parseQueryResultDates,
} from "@datafn/client";

// Serialize Date objects to timestamps for mutations
const serialized = serializeDateFields(schema, "tasks", {
  title: "Hello",
  createdAt: new Date(),
});

// Parse timestamps back to Date objects
const parsed = parseDateFields(schema, "tasks", {
  title: "Hello",
  createdAt: 1707000000000,
});

// Parse all date fields in a query result
const result = parseQueryResultDates(schema, "tasks", queryResult);
```

---

## Plugins

Extend client behavior with plugins that intercept queries, mutations, and sync.

```typescript
import type { DatafnPlugin } from "@datafn/core";

const loggingPlugin: DatafnPlugin = {
  name: "logger",
  runsOn: ["client"],

  afterMutation(ctx, mutation, result) {
    console.log("Mutation:", mutation, "Result:", result);
  },

  afterSync(ctx, phase, payload, result) {
    console.log(`Sync ${phase}:`, result);
  },
};

const client = createDatafnClient({
  schema,
  clientId: "...",
  plugins: [loggingPlugin],
  // ...
});
```

---

## Remote Adapter

The default HTTP transport is used when you provide `sync.remote`. For custom transport (WebSocket-only, browser extension, etc.), implement `DatafnRemoteAdapter`:

```typescript
interface DatafnRemoteAdapter {
  query(q: unknown): Promise<unknown>;
  mutation(m: unknown): Promise<unknown>;
  transact(t: unknown): Promise<unknown>;
  seed(payload: unknown): Promise<unknown>;
  clone(payload: unknown): Promise<unknown>;
  pull(payload: unknown): Promise<unknown>;
  push(payload: unknown): Promise<unknown>;
  reconcile(payload: unknown): Promise<unknown>;
}
```

### Extension Adapter

For browser extensions, the remote adapter can include event subscription support:

```typescript
const client = createDatafnClient({
  schema,
  clientId: "extension-popup",
  sync: {
    remoteAdapter: {
      ...transportMethods,
      onEvent(handler) { /* wire inbound events */ },
      subscribeRemote(filter) { /* register subscription */ },
      unsubscribeRemote(id) { /* remove subscription */ },
    },
  },
});
```

---

## Exports

```typescript
// Client factory and types
export { createDatafnClient, type DatafnClient, type DatafnClientConfig, type DatafnRemoteAdapter }

// Table API
export { type DatafnTable }

// Event system
export { EventBus, type EventHandler }
export { matchesFilter, type EventFilter }

// Storage
export { type DatafnStorageAdapter, type DatafnStorageFactory }
export { type DatafnHydrationState, type DatafnChangelogEntry }
export { MemoryStorageAdapter }
export { IndexedDbStorageAdapter }

// KV API
export type { DatafnKvApi }
export { kvId, KV_RESOURCE_NAME }

// CloneUp
export type { CloneUpOptions, CloneUpResult }

// Date Codec
export { serializeDateFields, parseDateFields, parseQueryResultDates }

// Auth (re-exported from @superfunctions/auth)
export type { AuthContext, AuthContextProvider }

// Errors
export { type DatafnClientError, createClientError }
export { unwrapRemoteSuccess }
```

## License

MIT
