# @datafn/client

A comprehensive, offline-first client for DataFn with reactive signals, event bus, and synchronization support.

## Installation

```bash
npm install @datafn/client @datafn/core
```

## Features

- **Fluent Table API**: Ergonomic interface for querying and mutating specific resources.
- **Reactive Signals**: Subscribable data sources that automatically update on changes (perfect for UI binding).
- **Offline Storage**: Built-in support for persistent storage (IndexedDB, Memory) with hydration.
- **Synchronization**: Integrated `clone`, `pull`, and `push` mechanisms that automatically update local storage.
- **Event Bus**: Global event system for mutations, sync lifecycle, and error handling.
- **Transaction Support**: Atomic operations across multiple resources.
- **Plugins**: Extensible architecture for custom behavior.
- **Type-Safe**: Built with TypeScript for full type inference.

## Quick Start

```typescript
import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";

// 1. Configure the client
const client = createDatafnClient({
  clientId: "device-uuid-123", // Required for offline/sync
  schema: mySchema,            // Your DataFn schema definition
  storage: new IndexedDbStorageAdapter("my-app-db"), // Persist data locally
  remote: {
    // Your network layer (fetch, axios, etc.) to talk to DataFn server
    async query(q) { /* ... */ },
    async mutation(m) { /* ... */ },
    async pull(p) { /* ... */ },
    // ... other methods
  },
});

// 2. Work with a specific table (Resource)
const tasks = client.table("task");

// 3. Create a reactive signal (Auto-updates when data changes)
const activeTasksSignal = tasks.signal({
  select: ["id", "title"],
  filters: { completed: false }
});

// Subscribe to changes
const unsubscribe = activeTasksSignal.subscribe((data) => {
  console.log("Active tasks:", data);
});

// 4. Mutate data (Optimistic updates & Event emission)
await tasks.mutate({
  operation: "insert",
  record: { title: "New Task", completed: false }
});
// -> activeTasksSignal listeners are automatically notified!
```

## Core Concepts

### 1. The Client Instance

The client is the central hub. It coordinates the **Schema**, **Storage**, **Remote** adapter, and **Event Bus**.

```typescript
const client = createDatafnClient({
  schema: DatafnSchema;
  remote: DatafnRemoteAdapter;
  storage?: DatafnStorageAdapter; // Optional: Enable offline mode
  plugins?: DatafnPlugin[];       // Optional: Custom logic
  clientId?: string;              // Optional: Unique ID for this client
});
```

### 2. Table API

The `client.table(name)` method provides a scoped interface for a specific resource defined in your schema. It delegates to the main client but automatically handles resource naming and versioning.

```typescript
const users = client.table("user");

// Query
const allUsers = await users.query({ select: ["id", "name"] });

// Mutate
await users.mutate({
  operation: "merge",
  id: "user:123",
  record: { name: "New Name" }
});

// Subscribe to events for this table only
users.subscribe(event => console.log("User changed:", event));
```

### 3. Reactive Signals

Signals are the bridge between your data and your UI. A signal represents a live query. When data changes (locally or via sync), signals automatically re-run and notify subscribers.

```typescript
const query = { select: ["id"], filters: { status: "active" } };
const signal = client.table("todo").signal(query);

// Get current value
console.log(signal.get());

// Subscribe
const unsub = signal.subscribe(newValue => {
  // Update UI efficiently
});
```

### 4. Offline & Storage

Pass a `storage` adapter to enable offline capabilities. The client will automatically:
- Hydrate signals from local storage on load.
- Apply `clone` and `pull` results to local storage.
- (Future) Queue mutations when offline.

**Available Adapters:**
- `MemoryStorageAdapter`: Transient, in-memory storage (great for testing).
- `IndexedDbStorageAdapter`: Persistent browser storage.

```typescript
import { IndexedDbStorageAdapter } from "@datafn/client";

const storage = new IndexedDbStorageAdapter("my-db");
```

### 5. Synchronization

The `client.sync` facade manages data consistency with the server.

```typescript
// Initial data load
await client.sync.clone({ ... });

// Fetch incremental updates
await client.sync.pull({ ... });

// Push local changes (if using offline queue)
await client.sync.push({ ... });
```

If `storage` is configured, `clone` and `pull` operations automatically update the local database, which in turn triggers all relevant reactive signals.

### 6. Event Bus

Listen to global or scoped events.

```typescript
client.subscribe((event) => {
  if (event.type === "mutation_applied") {
    console.log(`Resource ${event.resource} updated!`);
  }
});
```

## API Reference

### `DatafnClient`

- `table(name: string): DatafnTable` - Get a table handle.
- `query(q: unknown): Promise<unknown>` - Execute a raw query.
- `mutate(m: unknown): Promise<unknown>` - Execute a raw mutation.
- `transact(t: unknown): Promise<unknown>` - Execute a transaction.
- `sync`: Sync facade (`clone`, `pull`, `push`, `seed`).
- `subscribe(handler, filter?)`: Global event subscription.

### `DatafnTable`

- `query(fragment)`: Execute query for this resource.
- `mutate(fragment)`: Execute mutation for this resource.
- `signal(fragment)`: Create a reactive signal.
- `subscribe(handler)`: Subscribe to events for this resource.

### `DatafnRemoteAdapter`

Interface for your network layer. You must implement this to connect `datafn/client` to your backend.

```typescript
interface DatafnRemoteAdapter {
  query(q: unknown): Promise<unknown>;
  mutation(m: unknown): Promise<unknown>;
  transact(t: unknown): Promise<unknown>;
  seed(p: unknown): Promise<unknown>;
  clone(p: unknown): Promise<unknown>;
  pull(p: unknown): Promise<unknown>;
  push(p: unknown): Promise<unknown>;
}
```

## License

MIT