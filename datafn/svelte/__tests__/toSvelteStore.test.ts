/**
 * Svelte store adapter tests - Phase 03
 */

import { describe, it, expect, vi } from "vitest";
import { toSvelteStore } from "../src/toSvelteStore.js";
import type { DatafnSignal, DatafnError } from "@datafn/core";

/** Helper: create a mock DatafnSignal<T> */
function createMockSignal<T>(initialValue: T) {
  let value = initialValue;
  const subscribers: Array<(val: T) => void> = [];
  let _loading = false;
  let _error: DatafnError | null = null;
  let _refreshing = false;
  let _disposed = false;

  const signal: DatafnSignal<T> = {
    get() { return value; },
    subscribe(handler: (val: T) => void) {
      subscribers.push(handler);
      return () => {
        const index = subscribers.indexOf(handler);
        if (index >= 0) subscribers.splice(index, 1);
      };
    },
    get loading() { return _loading; },
    get error() { return _error; },
    get refreshing() { return _refreshing; },
    dispose() { _disposed = true; },
  };

  const controls = {
    emit(newValue: T) {
      value = newValue;
      subscribers.forEach((sub) => sub(value));
    },
    setLoading(v: boolean) { _loading = v; },
    setError(e: DatafnError | null) { _error = e; },
    setRefreshing(v: boolean) { _refreshing = v; },
    isDisposed() { return _disposed; },
    subscriberCount() { return subscribers.length; },
  };

  return { signal, controls };
}

describe("@datafn/svelte toSvelteStore — direct overload", () => {
  it("TV-SVELTE-001a: creates a store with { data, loading, error, refreshing } shape", () => {
    const { signal } = createMockSignal(10);
    const store = toSvelteStore(signal);

    const received: any[] = [];
    const unsub = store.subscribe((val) => received.push(val));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ data: 10, loading: false, error: null, refreshing: false, nextCursor: null });

    unsub();
  });

  it("TV-SVELTE-001b: updates store when signal emits new value", () => {
    const { signal, controls } = createMockSignal(10);
    const store = toSvelteStore(signal);

    const received: any[] = [];
    const unsub = store.subscribe((val) => received.push(val));

    expect(received[0]).toEqual({ data: 10, loading: false, error: null, refreshing: false, nextCursor: null });

    controls.emit(20);
    expect(received[1]).toEqual({ data: 20, loading: false, error: null, refreshing: false, nextCursor: null });

    controls.emit(30);
    expect(received[2]).toEqual({ data: 30, loading: false, error: null, refreshing: false, nextCursor: null });

    unsub();
  });

  it("TV-SVELTE-001c: reflects signal loading/error/refreshing state on update", () => {
    const { signal, controls } = createMockSignal("hello");
    const store = toSvelteStore(signal);

    const received: any[] = [];
    const unsub = store.subscribe((val) => received.push(val));

    // Set error then emit
    controls.setError({ code: "INTERNAL", message: "oops" });
    controls.emit("world");

    expect(received[1]).toEqual({
      data: "world",
      loading: false,
      error: { code: "INTERNAL", message: "oops" },
      refreshing: false,
      nextCursor: null,
    });

    // Set refreshing then emit
    controls.setError(null);
    controls.setRefreshing(true);
    controls.emit("world2");

    expect(received[2]).toEqual({
      data: "world2",
      loading: false,
      error: null,
      refreshing: true,
      nextCursor: null,
    });

    unsub();
  });

  it("TV-SVELTE-001d: multiple subscribers work independently", () => {
    const { signal, controls } = createMockSignal("initial");
    const store = toSvelteStore(signal);

    const values1: any[] = [];
    const values2: any[] = [];

    const unsub1 = store.subscribe((val) => values1.push(val));
    const unsub2 = store.subscribe((val) => values2.push(val));

    expect(values1[0].data).toBe("initial");
    expect(values2[0].data).toBe("initial");

    controls.emit("updated");
    expect(values1[1].data).toBe("updated");
    expect(values2[1].data).toBe("updated");

    // Unsubscribe first
    unsub1();
    controls.emit("final");

    expect(values1).toHaveLength(2); // No "final"
    expect(values2[2].data).toBe("final");

    unsub2();
  });

  it("TV-SVELTE-001e: unsubscribe stops updates", () => {
    const { signal, controls } = createMockSignal(100);
    const store = toSvelteStore(signal);

    const received: any[] = [];
    const unsub = store.subscribe((val) => received.push(val));

    controls.emit(200);
    expect(received).toHaveLength(2);

    unsub();
    controls.emit(300);

    expect(received).toHaveLength(2); // No 300
  });

  it("TV-SVELTE-001f: store receives loading:false alongside data when signal notifies", () => {
    const { signal, controls } = createMockSignal(undefined as any);

    // Simulate the fixed behavior: loading is false at notification time
    controls.setLoading(false);
    const store = toSvelteStore(signal);

    const received: any[] = [];
    const unsub = store.subscribe((val) => received.push(val));

    // Simulate data arriving with loading already cleared (fixed behavior)
    controls.setLoading(false);
    controls.emit([{ id: "task:1" }]);

    expect(received[received.length - 1]).toEqual({
      data: [{ id: "task:1" }],
      loading: false,
      error: null,
      refreshing: false,
      nextCursor: null,
    });

    unsub();
  });

  it("does NOT dispose signal on store teardown (lifecycle managed by registry)", () => {
    const { signal, controls } = createMockSignal(42);
    const store = toSvelteStore(signal);

    // Subscribe then fully unsubscribe
    const unsub = store.subscribe(() => {});
    unsub();

    // Signal must NOT be disposed — it may be shared by multiple stores
    expect(controls.isDisposed()).toBe(false);
  });
});

describe("@datafn/svelte toSvelteStore — factory overload (deprecated)", () => {
  it("TV-SVELTE-002: factory overload still works", () => {
    const { signal } = createMockSignal([1, 2, 3]);

    let clientCallback: ((c: any) => void) | null = null;
    const clientRef = {
      subscribe(fn: (client: any) => void) {
        clientCallback = fn;
        // Call immediately (like subscribeClient does)
        fn({ getSignal: () => signal });
        return () => { clientCallback = null; };
      },
    };

    const store = toSvelteStore(clientRef, (c) => c.getSignal());
    const received: any[] = [];
    const unsub = store.subscribe((val) => received.push(val));

    expect(received[0]).toEqual({
      data: [1, 2, 3],
      loading: false,
      error: null,
      refreshing: false,
      nextCursor: null,
    });

    unsub();
  });

  it("TV-SVELTE-002b: factory overload does not dispose shared signals on switch or teardown", () => {
    const first = createMockSignal([1]);
    const second = createMockSignal([2]);

    let emitClient!: (client: { getSignal: () => DatafnSignal<number[]> }) => void;
    const clientRef = {
      subscribe(fn: (client: { getSignal: () => DatafnSignal<number[]> }) => void) {
        emitClient = fn;
        fn({ getSignal: () => first.signal });
        return () => {};
      },
    };

    const store = toSvelteStore(clientRef, (client) => client.getSignal());
    const unsub = store.subscribe(() => {});

    emitClient({ getSignal: () => second.signal });
    unsub();

    expect(first.controls.isDisposed()).toBe(false);
    expect(second.controls.isDisposed()).toBe(false);
  });
});
