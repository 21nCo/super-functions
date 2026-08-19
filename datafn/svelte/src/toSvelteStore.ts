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

export type DatafnSignalFactory<T> = () => DatafnSignal<T>;

export type DeferredSubscription =
  | number
  | "idle"
  | {
      delayMs?: number;
      strategy?: "timeout" | "idle";
    };

export type DatafnSvelteValue<T> = {
  data: T | undefined;
  loading: boolean;
  error: DatafnError | null;
  refreshing: boolean;
  nextCursor: string | null;
};

export type DatafnSvelteReadyValue<T> = Omit<DatafnSvelteValue<T>, "data"> & {
  data: T;
};

export type DatafnSvelteDataEquals<T> = {
  bivarianceHack(
    previous: T | undefined,
    next: T | undefined,
  ): boolean;
}["bivarianceHack"];

export type ToSvelteStoreOptions<T> = {
  initialData?: T;
  defer?: DeferredSubscription;
  equals?: DatafnSvelteDataEquals<T>;
};

/**
 * Store type that wraps signal value with state properties.
 * Returned by both overloads.
 */
export type DatafnSvelteStore<T> = Readable<DatafnSvelteValue<T>>;
export type DatafnSvelteReadyStore<T> = Readable<DatafnSvelteReadyValue<T>>;
export type DatafnSvelteDataStore<T> = Readable<T | undefined>;
export type DatafnSvelteReadyDataStore<T> = Readable<T>;

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
export function toSvelteStore<T>(
  signal: DatafnSignal<T | undefined>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyStore<T>;
export function toSvelteStore<T, S = unknown>(
  signal: DatafnSignal<S>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyStore<T>;
export function toSvelteStore<T>(
  signal: DatafnSignal<any>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyStore<T>;
export function toSvelteStore<T>(
  signal: DatafnSignal<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteStore<T>;
export function toSvelteStore<T = unknown>(
  signal: DatafnSignal<any>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteStore<T>;
export function toSvelteStore<T>(
  signalFactory: DatafnSignalFactory<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteStore<T>;
export function toSvelteStore<T>(
  signalFactory: DatafnSignalFactory<T | undefined>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyStore<T>;

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
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteStore<T>;

export function toSvelteStore<T, C = any>(
  signalOrClientRef: DatafnSignal<T> | ClientRef<C> | DatafnSignalFactory<T>,
  signalFactoryOrOptions?:
    | ((client: C) => DatafnSignal<T>)
    | ToSvelteStoreOptions<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteStore<T> {
  if (
    typeof signalOrClientRef === "function" &&
    typeof signalFactoryOrOptions !== "function"
  ) {
    return toSvelteStoreSignalFactory(
      signalOrClientRef as DatafnSignalFactory<T>,
      signalFactoryOrOptions,
    );
  }
  if (typeof signalFactoryOrOptions === "function") {
    return toSvelteStoreFactory(
      signalOrClientRef as ClientRef<C>,
      signalFactoryOrOptions,
      options,
    );
  }
  return toSvelteStoreDirect(
    signalOrClientRef as DatafnSignal<T>,
    signalFactoryOrOptions,
  );
}

export function toSvelteDataStore<T>(
  signal: DatafnSignal<T | undefined>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyDataStore<T>;
export function toSvelteDataStore<T, S = unknown>(
  signal: DatafnSignal<S>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyDataStore<T>;
export function toSvelteDataStore<T>(
  signal: DatafnSignal<any>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyDataStore<T>;
export function toSvelteDataStore<T>(
  signal: DatafnSignal<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteDataStore<T>;
export function toSvelteDataStore<T = unknown>(
  signal: DatafnSignal<any>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteDataStore<T>;
export function toSvelteDataStore<T>(
  signalFactory: DatafnSignalFactory<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteDataStore<T>;
export function toSvelteDataStore<T>(
  signalFactory: DatafnSignalFactory<T | undefined>,
  options: ToSvelteStoreOptions<T> & { initialData: T },
): DatafnSvelteReadyDataStore<T>;
export function toSvelteDataStore<T, C>(
  clientRef: ClientRef<C>,
  signalFactory: (client: C) => DatafnSignal<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteDataStore<T>;

export function toSvelteDataStore<T, C = any>(
  signalOrClientRef: DatafnSignal<T> | ClientRef<C> | DatafnSignalFactory<T>,
  signalFactoryOrOptions?:
    | ((client: C) => DatafnSignal<T>)
    | ToSvelteStoreOptions<T>,
  options?: ToSvelteStoreOptions<T>,
): DatafnSvelteDataStore<T> {
  if (
    typeof signalOrClientRef === "function" &&
    typeof signalFactoryOrOptions !== "function"
  ) {
    return toSvelteDataStoreSignalFactory(
      signalOrClientRef as DatafnSignalFactory<T>,
      signalFactoryOrOptions,
    );
  }
  if (typeof signalFactoryOrOptions === "function") {
    return toSvelteDataStoreFactory(
      signalOrClientRef as ClientRef<C>,
      signalFactoryOrOptions,
      options,
    );
  }
  return toSvelteDataStoreDirect(
    signalOrClientRef as DatafnSignal<T>,
    signalFactoryOrOptions,
  );
}

/**
 * Direct signal overload: wraps a DatafnSignal as a Svelte readable store.
 * The store emits `{ data, loading, error, refreshing, nextCursor }` on each update.
 * Does NOT call signal.dispose() on teardown — the signal's lifecycle is
 * managed by the LiveSignalRegistry, allowing multiple stores to share a
 * deduplicated signal safely.
 */
function toSvelteStoreDirect<T>(
  signal: DatafnSignal<T>,
  options: ToSvelteStoreOptions<T> = {},
): DatafnSvelteStore<T> {
  const createValue = (data: T) => ({
    data: normalizeData(data, options.initialData),
    loading: signal.loading,
    error: signal.error,
    refreshing: signal.refreshing,
    nextCursor: signal.nextCursor ?? null,
  });

  const initialValue = createValue(signal.get());

  return readable<DatafnSvelteValue<T>>(
    initialValue,
    (set) => {
      let lastValue: DatafnSvelteValue<T> = initialValue;
      const emit = (value: T) => {
        const nextValue = createValue(value);
        if (areSvelteValuesEqual(lastValue, nextValue, options.equals)) return;
        lastValue = nextValue;
        set(nextValue);
      };
      const unsub = signal.subscribe((value: T) => {
        emit(value);
      });
      return () => {
        unsub();
      };
    },
  );
}

function toSvelteStoreSignalFactory<T>(
  signalFactory: DatafnSignalFactory<T>,
  options: ToSvelteStoreOptions<T> = {},
): DatafnSvelteStore<T> {
  const initialValue: DatafnSvelteValue<T> = {
    data: normalizeData(undefined as T, options.initialData),
    loading: false,
    error: null,
    refreshing: false,
    nextCursor: null,
  };

  return readable<DatafnSvelteValue<T>>(
    initialValue,
    (set) => {
      let currentSignal: DatafnSignal<T> | null = null;
      let currentUnsubSignal: (() => void) | null = null;
      let lastValue: DatafnSvelteValue<T> = initialValue;

      const emit = (nextValue: DatafnSvelteValue<T>) => {
        if (areSvelteValuesEqual(lastValue, nextValue, options.equals)) return;
        lastValue = nextValue;
        set(nextValue);
      };

      const start = () => {
        currentSignal = signalFactory();

        const createValue = (data: T) => ({
          data: normalizeData(data, options.initialData),
          loading: currentSignal!.loading,
          error: currentSignal!.error,
          refreshing: currentSignal!.refreshing,
          nextCursor: currentSignal!.nextCursor ?? null,
        });

        emit(createValue(currentSignal.get()));
        currentUnsubSignal = currentSignal.subscribe((value: T) => {
          emit(createValue(value));
        });
      };

      const cancelStart = scheduleStart(options.defer, start);

      return () => {
        cancelStart();
        currentUnsubSignal?.();
        currentSignal = null;
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
  options: ToSvelteStoreOptions<T> = {},
): DatafnSvelteStore<T> {
  const initialValue: DatafnSvelteValue<T> = {
    data: normalizeData(undefined as T, options.initialData),
    loading: true,
    error: null,
    refreshing: false,
    nextCursor: null,
  };

  return readable<DatafnSvelteValue<T>>(
    initialValue,
    (set) => {
      let currentSignal: DatafnSignal<T> | null = null;
      let currentUnsubSignal: (() => void) | null = null;
      let lastValue: DatafnSvelteValue<T> = initialValue;

      const emit = (nextValue: DatafnSvelteValue<T>) => {
        if (areSvelteValuesEqual(lastValue, nextValue, options.equals)) return;
        lastValue = nextValue;
        set(nextValue);
      };

      const unsubClient = clientRef.subscribe((client) => {
        currentUnsubSignal?.();

        currentSignal = signalFactory(client);

        const createValue = (data: T) => ({
          data: normalizeData(data, options.initialData),
          loading: currentSignal!.loading,
          error: currentSignal!.error,
          refreshing: currentSignal!.refreshing,
          nextCursor: currentSignal!.nextCursor ?? null,
        });

        emit(createValue(currentSignal.get()));

        currentUnsubSignal = currentSignal.subscribe((value: T) => {
          emit(createValue(value));
        });
      });

      return () => {
        unsubClient();
        currentUnsubSignal?.();
        currentSignal = null;
      };
    },
  );
}

function toSvelteDataStoreSignalFactory<T>(
  signalFactory: DatafnSignalFactory<T>,
  options: ToSvelteStoreOptions<T> = {},
): DatafnSvelteDataStore<T> {
  const initialValue: T | undefined = normalizeData(
    undefined as T,
    options.initialData,
  );

  return readable<T | undefined>(
    initialValue,
    (set) => {
      let currentUnsubSignal: (() => void) | null = null;
      let lastValue: T | undefined = initialValue;

      const emit = (nextValue: T | undefined) => {
        if (areDataValuesEqual(lastValue, nextValue, options.equals)) return;
        lastValue = nextValue;
        set(nextValue);
      };

      const start = () => {
        const currentSignal = signalFactory();
        emit(normalizeData(currentSignal.get(), options.initialData));

        currentUnsubSignal = currentSignal.subscribe((value: T) => {
          emit(normalizeData(value, options.initialData));
        });
      };

      const cancelStart = scheduleStart(options.defer, start);

      return () => {
        cancelStart();
        currentUnsubSignal?.();
      };
    },
  );
}

function toSvelteDataStoreDirect<T>(
  signal: DatafnSignal<T>,
  options: ToSvelteStoreOptions<T> = {},
): DatafnSvelteDataStore<T> {
  const initialValue: T | undefined = normalizeData(
    signal.get(),
    options.initialData,
  );

  return readable<T | undefined>(
    initialValue,
    (set) => {
      let lastValue: T | undefined = initialValue;
      const emit = (nextValue: T | undefined) => {
        if (areDataValuesEqual(lastValue, nextValue, options.equals)) return;
        lastValue = nextValue;
        set(nextValue);
      };
      const unsub = signal.subscribe((value: T) => {
        emit(normalizeData(value, options.initialData));
      });
      return () => {
        unsub();
      };
    },
  );
}

function toSvelteDataStoreFactory<T, C>(
  clientRef: ClientRef<C>,
  signalFactory: (client: C) => DatafnSignal<T>,
  options: ToSvelteStoreOptions<T> = {},
): DatafnSvelteDataStore<T> {
  const initialValue: T | undefined = normalizeData(
    undefined as T,
    options.initialData,
  );

  return readable<T | undefined>(
    initialValue,
    (set) => {
      let currentUnsubSignal: (() => void) | null = null;
      let lastValue: T | undefined = initialValue;

      const emit = (nextValue: T | undefined) => {
        if (areDataValuesEqual(lastValue, nextValue, options.equals)) return;
        lastValue = nextValue;
        set(nextValue);
      };

      const unsubClient = clientRef.subscribe((client) => {
        currentUnsubSignal?.();

        const currentSignal = signalFactory(client);
        emit(normalizeData(currentSignal.get(), options.initialData));

        currentUnsubSignal = currentSignal.subscribe((value: T) => {
          emit(normalizeData(value, options.initialData));
        });
      });

      return () => {
        unsubClient();
        currentUnsubSignal?.();
      };
    },
  );
}

function normalizeData<T>(data: T, initialData?: T): T {
  const value = data ?? initialData;
  if (Array.isArray(value)) return [...value] as T;
  return value as T;
}

function areSvelteValuesEqual<T>(
  previous: DatafnSvelteValue<T>,
  next: DatafnSvelteValue<T>,
  equals?: (previous: T | undefined, next: T | undefined) => boolean,
): boolean {
  return (
    previous.loading === next.loading &&
    previous.refreshing === next.refreshing &&
    previous.error === next.error &&
    previous.nextCursor === next.nextCursor &&
    areDataValuesEqual(previous.data, next.data, equals)
  );
}

function areDataValuesEqual<T>(
  previous: T | undefined,
  next: T | undefined,
  equals?: (previous: T | undefined, next: T | undefined) => boolean,
): boolean {
  return equals ? equals(previous, next) : Object.is(previous, next);
}

function scheduleStart(
  defer: DeferredSubscription | undefined,
  start: () => void,
): () => void {
  if (defer === undefined) {
    start();
    return () => {};
  }

  const { delayMs, strategy } = normalizeDeferredSubscription(defer);
  const idleWindow = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (
    strategy === "idle" &&
    typeof idleWindow.requestIdleCallback === "function"
  ) {
    const handle = idleWindow.requestIdleCallback(start, {
      timeout: delayMs > 0 ? delayMs : undefined,
    });
    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const timer = globalThis.setTimeout(start, delayMs);
  return () => {
    globalThis.clearTimeout(timer);
  };
}

function normalizeDeferredSubscription(defer: DeferredSubscription): {
  delayMs: number;
  strategy: "timeout" | "idle";
} {
  if (typeof defer === "number") {
    return { delayMs: Math.max(0, defer), strategy: "timeout" };
  }
  if (defer === "idle") {
    return { delayMs: 0, strategy: "idle" };
  }
  return {
    delayMs: Math.max(0, defer.delayMs ?? 0),
    strategy: defer.strategy ?? "timeout",
  };
}
