/**
 * LiveSignal — lifecycle-aware signal wrapper that survives switchContext().
 *
 * A LiveSignal holds a factory closure that creates raw signals.
 * When rebind() is called (by LiveSignalRegistry after a context switch),
 * the factory is re-invoked to produce a new raw signal bound to the new
 * realClient, and existing subscribers continue receiving updates.
 */

import type { DatafnSignal, DatafnError } from "@datafn/core";
import { dfqlKey } from "@datafn/core";

type SignalFactory<T> = () => DatafnSignal<T>;
type UnsubscribeFn = () => void;

export class LiveSignal<T> implements DatafnSignal<T> {
  private raw: DatafnSignal<T> | null = null;
  private rawUnsub: UnsubscribeFn | null = null;
  private disposed = false;
  private lastValue: T | undefined = undefined;
  private currentError: DatafnError | null = null;
  private subscribers = new Set<(value: T) => void>();

  /**
   * Set by the Proxy layer (Phase 2) to unsubscribe from the client lifecycle.
   * null until wired in.
   */
  lifecycleUnsub: UnsubscribeFn | null = null;

  constructor(
    private factory: SignalFactory<T>,
    private removeFromRegistry: () => void,
  ) {
    this.bindRaw();
  }

  private bindRaw(): void {
    try {
      this.raw = this.factory();
      this.rawUnsub = this.raw.subscribe((value) => {
        this.lastValue = value;
        this.subscribers.forEach((fn) => fn(value));
      });
    } catch (err: any) {
      this.currentError = {
        code: "INTERNAL",
        message: err?.message ?? "Signal factory failed",
        details: err,
      };
      this.raw = null;
      this.rawUnsub = null;
    }
  }

  private unbindRaw(): void {
    this.rawUnsub?.();
    this.rawUnsub = null;
    try {
      this.raw?.dispose();
    } catch {
      // Raw signal may already be disposed by realClient.destroy() — ignore
    }
    this.raw = null;
  }

  /**
   * Rebind to a new raw signal from the factory.
   * Called by LiveSignalRegistry.rebindAll() after a context switch.
   */
  rebind(): void {
    if (this.disposed) return;
    this.unbindRaw();
    this.currentError = null;
    this.bindRaw();
    // If the new raw signal already has a value (e.g. cached), emit to subscribers.
    // Note: bindRaw's internal handler also emits when raw.subscribe() delivers synchronously.
    if (this.raw !== null) {
      const current = this.raw.get();
      if (current !== undefined) {
        this.lastValue = current;
        this.subscribers.forEach((fn) => fn(current));
      }
    }
  }

  get(): T {
    return (this.raw?.get() ?? this.lastValue) as T;
  }

  subscribe(handler: (value: T) => void): () => void {
    if (this.disposed) return () => {};
    this.subscribers.add(handler);
    if (this.lastValue !== undefined) {
      handler(this.lastValue);
    }
    return () => {
      this.subscribers.delete(handler);
    };
  }

  get loading(): boolean {
    return this.raw?.loading ?? false;
  }

  get error(): DatafnError | null {
    return this.currentError ?? this.raw?.error ?? null;
  }

  get refreshing(): boolean {
    return this.raw?.refreshing ?? false;
  }

  get nextCursor(): string | null {
    return (this.raw as any)?.nextCursor ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unbindRaw();
    this.lifecycleUnsub?.();
    this.lifecycleUnsub = null;
    this.removeFromRegistry();
    this.subscribers.clear();
  }
}

export class LiveSignalRegistry {
  private signals = new Map<string, LiveSignal<any>>();

  getOrCreateTableSignal<T>(
    name: string,
    version: number,
    query: unknown,
    options: { disableOptimistic?: boolean } | undefined,
    factory: SignalFactory<T>,
  ): DatafnSignal<T> {
    const key = dfqlKey({ resource: name, version, ...(query as object) });
    if (this.signals.has(key)) {
      return this.signals.get(key) as DatafnSignal<T>;
    }
    const signal = new LiveSignal<T>(factory, () => this.signals.delete(key));
    this.signals.set(key, signal);
    return signal;
  }

  getOrCreateKvSignal<T>(
    key: string,
    factory: SignalFactory<T>,
  ): DatafnSignal<T> {
    const registryKey = `kv:${key}`;
    if (this.signals.has(registryKey)) {
      return this.signals.get(registryKey) as DatafnSignal<T>;
    }
    const signal = new LiveSignal<T>(factory, () => this.signals.delete(registryKey));
    this.signals.set(registryKey, signal);
    return signal;
  }

  rebindAll(): void {
    const signals = Array.from(this.signals.values());
    for (const signal of signals) {
      try {
        signal.rebind();
      } catch {
        // One failure must not prevent others from rebinding
      }
    }
  }

  disposeAll(): void {
    const signals = Array.from(this.signals.values());
    for (const signal of signals) {
      signal.dispose();
    }
    this.signals.clear();
  }
}
