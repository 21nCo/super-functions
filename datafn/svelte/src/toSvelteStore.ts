/**
 * Convert DataFn signal to Svelte store
 */

import type { DatafnSignal, DatafnError } from "@datafn/core";
import type { Readable } from "svelte/store";
import { readable } from "svelte/store";

/**
 * A client reference that can notify subscribers when the underlying client
 * changes. Compatible with `{ subscribe: client.subscribeClient }` from a
 * unified `createDatafnClient`, or any Svelte writable store holding a client.
 */
export type ClientRef<C> = {
  subscribe(fn: (client: C) => void): () => void;
};

export type DatafnSvelteValue<T> = {
  data: T | undefined;
  loading: boolean;
  error: DatafnError | null;
  refreshing: boolean;
  nextCursor: string | null;
};

/**
 * Store type that wraps signal value with state properties.
 * Returned by both overloads.
 */
export type DatafnSvelteStore<T> = Readable<DatafnSvelteValue<T>>;

/**
 * Convert a lifecycle-aware DataFn signal directly to a Svelte readable store.
 *
 * Signals from `createDatafnClient` are lifecycle-aware — they survive
 * `switchContext()` and rebind automatically. No factory pattern or `clientRef`
 * is needed.
 *
 * ```typescript
 * const todosStore = toSvelteStore(
 *   client.todos.signal({ sort: ["-createdAt"] })
 * );
 * // Template: {#each $todosStore.data ?? [] as todo}
 * // Also: {#if $todosStore.loading} Loading... {/if}
 * ```
 */
export function toSvelteStore<T>(signal: DatafnSignal<T>): DatafnSvelteStore<T>;

/**
 * Convert a DataFn signal factory to a reactive Svelte readable store.
 *
 * Accepts a `clientRef` (anything with a `subscribe(fn)` API) and a
 * `signalFactory` that creates a new signal from the current client. The store
 * tears down its subscription to the previous signal before subscribing to the
 * next one. It does not call `dispose()` because these signals may be shared by
 * a registry outside the store's ownership.
 */
export function toSvelteStore<T, C>(
  clientRef: ClientRef<C>,
  signalFactory: (client: C) => DatafnSignal<T>,
): DatafnSvelteStore<T>;

export function toSvelteStore<T, C = any>(
  signalOrClientRef: DatafnSignal<T> | ClientRef<C>,
  signalFactory?: (client: C) => DatafnSignal<T>,
): DatafnSvelteStore<T> {
  if (signalFactory !== undefined) {
    return toSvelteStoreFactory(signalOrClientRef as ClientRef<C>, signalFactory);
  }
  return toSvelteStoreDirect(signalOrClientRef as DatafnSignal<T>);
}

/**
 * Direct signal overload: wraps a DatafnSignal as a Svelte readable store.
 * The store emits `{ data, loading, error, refreshing, nextCursor }` on each update.
 * Does NOT call signal.dispose() on teardown — the signal's lifecycle is
 * managed by the LiveSignalRegistry, allowing multiple stores to share a
 * deduplicated signal safely.
 */
function toSvelteStoreDirect<T>(signal: DatafnSignal<T>): DatafnSvelteStore<T> {
  return readable<DatafnSvelteValue<T>>(
    {
      data: signal.get(),
      loading: signal.loading,
      error: signal.error,
      refreshing: signal.refreshing,
      nextCursor: signal.nextCursor ?? null,
    },
    (set) => {
      const unsub = signal.subscribe((value: T) => {
        set({
          data: value,
          loading: signal.loading,
          error: signal.error,
          refreshing: signal.refreshing,
          nextCursor: signal.nextCursor ?? null,
        });
      });
      return () => {
        unsub();
      };
    },
  );
}

/**
 * Factory overload: subscribes to clientRef and creates a fresh signal on each
 * client change. Returns a DatafnSvelteStore with
 * `{ data, loading, error, refreshing, nextCursor }`.
 */
function toSvelteStoreFactory<T, C>(
  clientRef: ClientRef<C>,
  signalFactory: (client: C) => DatafnSignal<T>,
): DatafnSvelteStore<T> {
  return readable<DatafnSvelteValue<T>>(
    {
      data: undefined,
      loading: true,
      error: null,
      refreshing: false,
      nextCursor: null,
    },
    (set) => {
      let currentSignal: DatafnSignal<T> | null = null;
      let currentUnsubSignal: (() => void) | null = null;

      const unsubClient = clientRef.subscribe((client) => {
        // Tear down previous signal
        currentUnsubSignal?.();

        // Create a fresh signal from the new client
        currentSignal = signalFactory(client);

        // Emit the initial value immediately
        set({
          data: currentSignal.get(),
          loading: currentSignal.loading,
          error: currentSignal.error,
          refreshing: currentSignal.refreshing,
          nextCursor: currentSignal.nextCursor ?? null,
        });

        // Subscribe to future updates
        currentUnsubSignal = currentSignal.subscribe((value: T) => {
          set({
            data: value,
            loading: currentSignal!.loading,
            error: currentSignal!.error,
            refreshing: currentSignal!.refreshing,
            nextCursor: currentSignal!.nextCursor ?? null,
          });
        });
      });

      // Cleanup when all Svelte subscribers unsubscribe
      return () => {
        unsubClient();
        currentUnsubSignal?.();
        currentSignal = null;
      };
    },
  );
}
