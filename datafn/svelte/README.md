# @datafn/svelte

Svelte bindings for DataFn. seamless integration of DataFn's reactive signals with Svelte stores.

## Installation

```bash
npm install @datafn/svelte @datafn/core
# Peer dependencies
npm install svelte
```

## Overview

This package provides a bridge between **DataFn Client Signals** and **Svelte Stores**. It allows you to use DataFn's live queries directly in your Svelte components with full reactivity.

## Quick Start

```svelte
<script lang="ts">
  import { createDatafnClient } from '@datafn/client';
  import { toSvelteStore } from '@datafn/svelte';
  
  // 1. Initialize client (or import from a shared module)
  const client = createDatafnClient({
    schema: mySchema,
    remote: myRemoteAdapter
  });

  // 2. Create a signal from a table query
  const signal = client.tasks.signal({
    filters: { status: 'active' }
  });

  // 3. Convert to Svelte Store
  const store = toSvelteStore(signal);
</script>

<!-- 4. Use in Svelte component -->
{#each $store.data as task}
  <div>{task.title}</div>
{/each}
```

## Features

- **Seamless Reactivity**: Changes in DataFn (via mutations or sync) automatically update your Svelte components.
- **Automatic Cleanup**: Subscriptions are automatically managed. When the Svelte component is destroyed or the store has no subscribers, the underlying DataFn signal subscription is cleaned up.
- **Derived Store Support**: Since `toSvelteStore` returns a standard Svelte `Readable`, you can use it with `derived` stores to compute dependent state.

## API

### `toSvelteStore<T>(signal: DatafnSignal<T>): Readable<T>`

Converts a DataFn `Signal` into a Svelte `Readable` store.

**Parameters:**
- `signal`: A `DatafnSignal` instance (usually obtained via `client.table(...).signal(...)`).

**Returns:**
- A Svelte `Readable` store containing the current value of the signal.

## Advanced Usage

### Derived Stores

Combine DataFn data with local state or other stores.

```typescript
import { derived } from 'svelte/store';
import { toSvelteStore } from '@datafn/svelte';

const allTasks = toSvelteStore(client.table("task").signal({}));

const stats = derived(allTasks, ($tasks) => ({
  total: $tasks.length,
  completed: $tasks.filter(t => t.completed).length
}));
```

### Reactive Query Parameters

If your query depends on other reactive variables, you can wrap the signal creation in a reactive statement (Svelte 3/4) or effect (Svelte 5).

```svelte
<script>
  export let listId;
  
  // Re-create store when listId changes
  $: tasks = toSvelteStore(
    client.table("task").signal({ where: { listId } })
  );
</script>
```

## License

MIT