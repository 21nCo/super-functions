# @datafn/svelte

Svelte bindings for DataFn. Converts DataFn reactive signals into Svelte readable stores for seamless integration with Svelte 3, 4, and 5 components.

## Installation

```bash
npm install @datafn/svelte @datafn/core
# Peer dependency
npm install svelte
```

## Features

- **Seamless Reactivity** — Mutations and sync changes in DataFn automatically update your Svelte components
- **Automatic Cleanup** — Store subscriptions are cleaned up when components are destroyed
- **State Properties** — Stores expose `data`, `loading`, `error`, `refreshing`, and `nextCursor` for complete UI control
- **Derived Store Support** — Returns standard Svelte `Readable`, composable with `derived` stores
- **Svelte 3 / 4 / 5 Compatible** — Works with reactive declarations (`$:`) and runes

---

## Quick Start

```svelte
<script lang="ts">
  import { createDatafnClient, IndexedDbStorageAdapter } from "@datafn/client";
  import { toSvelteStore } from "@datafn/svelte";

  const client = createDatafnClient({
    schema: mySchema,
    clientId: "device-1",
    storage: new IndexedDbStorageAdapter("my-db"),
    sync: { remote: "http://localhost:3000/datafn" },
  });

  // Create a DataFn signal (reactive query)
  const signal = client.table("tasks").signal({
    filters: { completed: false },
    sort: ["-createdAt"],
  });

  // Convert to Svelte store
  const tasks = toSvelteStore(signal);
</script>

{#if $tasks.loading}
  <p>Loading...</p>
{:else if $tasks.error}
  <p>Error: {$tasks.error.message}</p>
{:else}
  {#each $tasks.data || [] as task (task.id)}
    <div>{task.title}</div>
  {/each}
{/if}
```

---

## API

### toSvelteStore\<T\>(signal): DatafnSvelteStore\<T\>

Converts a DataFn `Signal<T>` into a Svelte `Readable` store that wraps the signal value with state properties.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `signal` | `DatafnSignal<T>` | A signal from `table.signal()` or `client.kv.signal()` |

**Returns:**

A `Readable<{ data: T | undefined; loading: boolean; error: DatafnError | null; refreshing: boolean; nextCursor: string | null }>`.

| Property | Type | Description |
|----------|------|-------------|
| `data` | `T \| undefined` | The current signal value (query results, KV value, etc.) |
| `loading` | `boolean` | `true` while the initial fetch is in progress |
| `error` | `DatafnError \| null` | Non-null if the last fetch/refresh failed |
| `refreshing` | `boolean` | `true` while a background refresh is in progress |
| `nextCursor` | `string \| null` | Cursor for the next page when the backing signal is paginated |

**Type:**

```typescript
type DatafnSvelteStore<T> = Readable<{
  data: T | undefined;
  loading: boolean;
  error: DatafnError | null;
  refreshing: boolean;
  nextCursor: string | null;
}>;
```

---

## Usage Patterns

### Table Query Signals

```svelte
<script lang="ts">
  import { toSvelteStore } from "@datafn/svelte";
  import { client } from "./lib/datafn";

  // All tasks
  const allTasks = toSvelteStore(
    client.table("tasks").signal({ sort: ["-createdAt"] })
  );

  // Filtered tasks
  const activeTasks = toSvelteStore(
    client.table("tasks").signal({
      filters: { completed: false },
      sort: ["priority", "-createdAt"],
    })
  );

  // With select and limit
  const recentTasks = toSvelteStore(
    client.table("tasks").signal({
      select: ["id", "title"],
      sort: ["-createdAt"],
      limit: 5,
    })
  );
</script>

<h2>Active Tasks ({($activeTasks.data || []).length})</h2>
{#each $activeTasks.data || [] as task (task.id)}
  <div>{task.title}</div>
{/each}
```

### KV Signal Stores

```svelte
<script lang="ts">
  import { toSvelteStore } from "@datafn/svelte";
  import { client } from "./lib/datafn";

  // Reactive KV preference
  const theme = toSvelteStore(
    client.kv.signal<string>("pref:theme", { defaultValue: "dark" })
  );

  async function toggleTheme() {
    const next = $theme.data === "dark" ? "light" : "dark";
    await client.kv.set("pref:theme", next);
    // Store auto-updates — no manual refresh needed
  }
</script>

<button on:click={toggleTheme}>
  Theme: {$theme.data}
</button>
```

### Derived Stores

Since `toSvelteStore` returns a standard Svelte `Readable`, you can compose it with `derived`:

```typescript
import { derived } from "svelte/store";
import { toSvelteStore } from "@datafn/svelte";

const allTasks = toSvelteStore(client.table("tasks").signal({}));

// Compute statistics from the live data
const stats = derived(allTasks, ($tasks) => {
  const data = $tasks.data || [];
  return {
    total: data.length,
    completed: data.filter((t: any) => t.completed).length,
    active: data.filter((t: any) => !t.completed).length,
  };
});
```

```svelte
<p>{$stats.total} tasks — {$stats.active} active, {$stats.completed} done</p>
```

### Reactive Query Parameters (Svelte 3/4)

Re-create the store when a reactive variable changes:

```svelte
<script>
  import { toSvelteStore } from "@datafn/svelte";
  import { client } from "./lib/datafn";

  export let categoryId;

  // Re-creates the store whenever categoryId changes
  $: tasks = toSvelteStore(
    client.table("tasks").signal({
      filters: { categoryId },
      sort: ["-createdAt"],
    })
  );
</script>

{#each $tasks.data || [] as task (task.id)}
  <div>{task.title}</div>
{/each}
```

### Loading & Error States

Handle all states for a polished UX:

```svelte
<script>
  import { toSvelteStore } from "@datafn/svelte";
  import { client } from "./lib/datafn";

  const tasks = toSvelteStore(
    client.table("tasks").signal({ sort: ["-createdAt"] })
  );
</script>

{#if $tasks.loading}
  <div class="skeleton">Loading tasks...</div>
{:else if $tasks.error}
  <div class="error">
    <p>Failed to load tasks: {$tasks.error.message}</p>
    <code>{$tasks.error.code}</code>
  </div>
{:else}
  <ul>
    {#each $tasks.data || [] as task (task.id)}
      <li>{task.title}</li>
    {/each}
  </ul>

  {#if $tasks.refreshing}
    <small>Refreshing...</small>
  {/if}
{/if}
```

### Multiple Stores in a Component

```svelte
<script lang="ts">
  import { toSvelteStore } from "@datafn/svelte";
  import { client } from "./lib/datafn";

  const todos = toSvelteStore(client.table("todos").signal({ sort: ["-createdAt"] }));
  const categories = toSvelteStore(client.table("categories").signal({ sort: ["name"] }));
  const theme = toSvelteStore(client.kv.signal("pref:theme", { defaultValue: "dark" }));
</script>

<main class={$theme.data}>
  <h1>Todos ({($todos.data || []).length})</h1>
  <!-- ... -->
  <aside>
    <h2>Categories ({($categories.data || []).length})</h2>
    <!-- ... -->
  </aside>
</main>
```

---

## How It Works

1. `toSvelteStore(signal)` creates a Svelte `readable` store
2. On first subscriber, the store subscribes to the DataFn signal
3. When the signal value changes (mutation, sync, or refresh), the store updates
4. The store reads `signal.loading`, `signal.error`, and `signal.refreshing` on each update
5. When the last subscriber unsubscribes (component destroyed), the signal subscription is cleaned up

This means:
- **Lazy**: No data is fetched until a component subscribes
- **Shared**: Multiple components using the same signal share a single cached query
- **Auto-updating**: Mutations to the underlying resource trigger automatic signal refresh

---

## Exports

```typescript
export { toSvelteStore }
export type { DatafnSvelteStore, ClientRef }
```

## License

MIT
