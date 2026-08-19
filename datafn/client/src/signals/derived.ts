import type { DatafnError, DatafnSignal } from "@datafn/core";

export function mapSignal<TSource, TValue>(
  source: DatafnSignal<TSource>,
  mapper: (value: TSource) => TValue,
): DatafnSignal<TValue> {
  let lastValue: TValue | undefined;
  let currentError: DatafnError | null = null;

  return {
    get(): TValue {
      const value = source.get();
      lastValue = mapper(value);
      return lastValue;
    },
    subscribe(handler: (value: TValue) => void): () => void {
      return source.subscribe((value) => {
        try {
          lastValue = mapper(value);
          currentError = null;
          handler(lastValue);
        } catch (error: any) {
          currentError = {
            code: "INTERNAL",
            message: error?.message ?? "Derived signal mapping failed",
            details: error,
          };
        }
      });
    },
    get loading(): boolean {
      return source.loading;
    },
    get error(): DatafnError | null {
      return currentError ?? source.error;
    },
    get refreshing(): boolean {
      return source.refreshing;
    },
    get nextCursor(): string | null | undefined {
      return source.nextCursor;
    },
    dispose(): void {
      source.dispose();
    },
  };
}

export type CombineSignalsOptions<TValue> = {
  equals?: (previous: TValue | undefined, next: TValue) => boolean;
};

export function emptySignal<TValue>(value: TValue): DatafnSignal<TValue> {
  return {
    get(): TValue {
      return value;
    },
    subscribe(handler: (value: TValue) => void): () => void {
      handler(value);
      return () => {};
    },
    get loading(): boolean {
      return false;
    },
    get error(): DatafnError | null {
      return null;
    },
    get refreshing(): boolean {
      return false;
    },
    get nextCursor(): string | null | undefined {
      return null;
    },
    dispose(): void {}
  };
}

export function combineSignals<TValue>(
  sources: readonly DatafnSignal<unknown>[],
  compute: () => TValue,
  options: CombineSignalsOptions<TValue> = {},
): DatafnSignal<TValue> {
  let lastValue: TValue | undefined;
  let currentError: DatafnError | null = null;
  let allUnsubs: Array<() => void> = [];
  let disposed = false;

  const emit = (handler: (value: TValue) => void, force = false) => {
    try {
      const nextValue = compute();
      currentError = null;
      if (!force && options.equals?.(lastValue, nextValue)) return;
      lastValue = nextValue;
      handler(lastValue);
    } catch (error: any) {
      currentError = {
        code: "INTERNAL",
        message: error?.message ?? "Combined signal computation failed",
        details: error,
      };
    }
  };

  return {
    get(): TValue {
      lastValue = compute();
      return lastValue;
    },
    subscribe(handler: (value: TValue) => void): () => void {
      if (disposed) return () => {};
      let subscriptionActive = true;
      let pending = false;
      const flush = () => {
        pending = false;
        if (!subscriptionActive || disposed) return;
        emit(handler);
      };
      const scheduleEmit = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(flush);
      };
      const unsubs = sources.map((source) => source.subscribe(scheduleEmit));
      allUnsubs.push(...unsubs);
      scheduleEmit();
      return () => {
        subscriptionActive = false;
        for (const unsub of unsubs) unsub();
        allUnsubs = allUnsubs.filter((unsub) => !unsubs.includes(unsub));
      };
    },
    get loading(): boolean {
      return sources.some((source) => source.loading);
    },
    get error(): DatafnError | null {
      return currentError ?? sources.find((source) => source.error)?.error ?? null;
    },
    get refreshing(): boolean {
      return sources.some((source) => source.refreshing);
    },
    get nextCursor(): string | null | undefined {
      return null;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const unsub of allUnsubs) unsub();
      allUnsubs = [];
      for (const source of sources) source.dispose();
    },
  };
}
