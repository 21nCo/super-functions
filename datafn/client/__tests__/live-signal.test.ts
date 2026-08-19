import { describe, it, expect, vi } from "vitest";
import type { DatafnSignal } from "@datafn/core";
import { LiveSignal, LiveSignalRegistry } from "../src/signals/liveSignal.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockSignal(id: number): DatafnSignal<any> & { _subs: Set<(v: any) => void> } {
  const value = { id, data: [`item-${id}`] };
  const subs = new Set<(v: any) => void>();
  return {
    _subs: subs,
    get: () => value,
    subscribe: (handler) => {
      subs.add(handler);
      handler(value); // immediate delivery per Svelte store contract
      return () => subs.delete(handler);
    },
    loading: false,
    error: null,
    refreshing: false,
    dispose: vi.fn(),
  };
}

/** A factory that produces signals with increasing IDs and tracks call count */
function createMockFactory() {
  let callCount = 0;
  const signals: Array<ReturnType<typeof createMockSignal>> = [];
  return {
    factory: (): DatafnSignal<any> => {
      callCount++;
      const sig = createMockSignal(callCount);
      signals.push(sig);
      return sig;
    },
    getCallCount: () => callCount,
    getSignal: (i: number) => signals[i],
  };
}

/** A factory that throws on the Nth call (1-indexed) */
function createThrowingFactory(throwOnCall: number) {
  let callCount = 0;
  return {
    factory: (): DatafnSignal<any> => {
      callCount++;
      if (callCount === throwOnCall) {
        throw new Error(`Factory error on call ${callCount}`);
      }
      return createMockSignal(callCount);
    },
  };
}

/** A factory that produces a raw signal with no initial value (async load) */
function createPendingMockSignal(): DatafnSignal<any> & { deliver(v: any): void } {
  let currentValue: any = undefined;
  const subs = new Set<(v: any) => void>();
  return {
    get: () => currentValue,
    subscribe: (handler) => {
      subs.add(handler);
      // No synchronous delivery — value arrives later
      return () => subs.delete(handler);
    },
    deliver(v: any) {
      currentValue = v;
      subs.forEach((fn) => fn(v));
    },
    loading: true,
    error: null,
    refreshing: false,
    dispose: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// TV-LIVE-001: LiveSignal implements DatafnSignal interface
// ---------------------------------------------------------------------------

describe("LiveSignal implements DatafnSignal interface", () => {
  it("exposes get, subscribe, dispose, loading, error, refreshing", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    expect(typeof signal.get).toBe("function");
    expect(typeof signal.subscribe).toBe("function");
    expect(typeof signal.dispose).toBe("function");
    expect(typeof signal.loading).toBe("boolean");
    expect(signal.error).toBe(null);
    expect(typeof signal.refreshing).toBe("boolean");
  });

  it("get() returns the raw signal value", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});
    const value = signal.get();
    expect(value).toEqual({ id: 1, data: ["item-1"] });
  });

  it("loading and refreshing are false for mock raw signal", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});
    expect(signal.loading).toBe(false);
    expect(signal.refreshing).toBe(false);
  });

  it("subscribe delivers values and returns unsubscribe fn", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});
    const received: any[] = [];
    const unsub = signal.subscribe((v) => received.push(v));

    expect(typeof unsub).toBe("function");
    // lastValue was set during bindRaw, so handler receives it synchronously
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ id: 1, data: ["item-1"] });

    unsub();
  });
});

// ---------------------------------------------------------------------------
// TV-LIVE-007: LiveSignal delivers current value on subscribe
// ---------------------------------------------------------------------------

describe("TV-LIVE-007: LiveSignal delivers current value on subscribe", () => {
  it("new subscriber receives current value synchronously if available", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    // lastValue is set after factory creates signal and subscribe delivers immediately
    const received: any[] = [];
    signal.subscribe((v) => received.push(v));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ id: 1, data: ["item-1"] });
  });

  it("subscriber added after pending signal does not receive value until delivery", () => {
    const pending = createPendingMockSignal();
    const signal = new LiveSignal(() => pending, () => {});

    const received: any[] = [];
    signal.subscribe((v) => received.push(v));

    // No value yet
    expect(received).toHaveLength(0);

    // Value arrives asynchronously
    pending.deliver({ id: 99, data: ["async-item"] });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ id: 99, data: ["async-item"] });
  });
});

// ---------------------------------------------------------------------------
// TV-LIVE-002 + TV-LIVE-003: LiveSignal.rebind() switches to new raw signal
// ---------------------------------------------------------------------------

describe("TV-LIVE-002 + TV-LIVE-003: LiveSignal.rebind()", () => {
  it("after rebind, get() returns value from new raw signal", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    expect(signal.get()).toEqual({ id: 1, data: ["item-1"] });

    signal.rebind();

    expect(signal.get()).toEqual({ id: 2, data: ["item-2"] });
  });

  it("after rebind, existing subscribers receive new value", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    const received: any[] = [];
    signal.subscribe((v) => received.push(v));

    // Initial value delivered on subscribe
    expect(received).toHaveLength(1);

    signal.rebind();

    // Should have received the new value
    const lastReceived = received[received.length - 1];
    expect(lastReceived).toEqual({ id: 2, data: ["item-2"] });
  });

  it("factory is called on each rebind", () => {
    const { factory, getCallCount } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    expect(getCallCount()).toBe(1);
    signal.rebind();
    expect(getCallCount()).toBe(2);
    signal.rebind();
    expect(getCallCount()).toBe(3);
  });

  it("old raw signal's unsubscribe is called on rebind", () => {
    let firstUnsub = vi.fn();
    let callCount = 0;
    const factory = (): DatafnSignal<any> => {
      callCount++;
      const id = callCount;
      const value = { id, data: [`item-${id}`] };
      return {
        get: () => value,
        subscribe: (handler) => {
          handler(value);
          return id === 1 ? firstUnsub : () => {};
        },
        loading: false,
        error: null,
        refreshing: false,
        dispose: vi.fn(),
      };
    };

    const signal = new LiveSignal(factory, () => {});
    expect(firstUnsub).not.toHaveBeenCalled();

    signal.rebind();
    expect(firstUnsub).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TV-LIVE-005: LiveSignal.dispose() cleans up
// ---------------------------------------------------------------------------

describe("TV-LIVE-005: LiveSignal.dispose() cleans up", () => {
  it("after dispose, subscribe returns no-op and handler not called", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    signal.dispose();

    const handler = vi.fn();
    const unsub = signal.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();
    expect(typeof unsub).toBe("function"); // still returns a function
  });

  it("after dispose, loading is false, error is null, refreshing is false", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});
    signal.dispose();

    expect(signal.loading).toBe(false);
    expect(signal.error).toBe(null);
    expect(signal.refreshing).toBe(false);
  });

  it("after dispose, get() returns last cached value", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});

    // Value was cached at bind time
    const cached = signal.get();
    signal.dispose();

    expect(signal.get()).toEqual(cached);
  });

  it("dispose calls removeFromRegistry", () => {
    const { factory } = createMockFactory();
    const remove = vi.fn();
    const signal = new LiveSignal(factory, remove);

    signal.dispose();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("dispose calls lifecycleUnsub if set", () => {
    const { factory } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});
    const lifecycleUnsub = vi.fn();
    signal.lifecycleUnsub = lifecycleUnsub;

    signal.dispose();
    expect(lifecycleUnsub).toHaveBeenCalledOnce();
  });

  it("rebind after dispose is a no-op", () => {
    const { factory, getCallCount } = createMockFactory();
    const signal = new LiveSignal(factory, () => {});
    signal.dispose();

    signal.rebind();
    expect(getCallCount()).toBe(1); // factory not called again
  });
});

// ---------------------------------------------------------------------------
// TV-LIVE-006: LiveSignal.dispose() is idempotent
// ---------------------------------------------------------------------------

describe("TV-LIVE-006: LiveSignal.dispose() is idempotent", () => {
  it("calling dispose() twice does not throw", () => {
    const { factory } = createMockFactory();
    const remove = vi.fn();
    const signal = new LiveSignal(factory, remove);

    expect(() => {
      signal.dispose();
      signal.dispose();
    }).not.toThrow();
  });

  it("removeFromRegistry is called exactly once on double dispose", () => {
    const { factory } = createMockFactory();
    const remove = vi.fn();
    const signal = new LiveSignal(factory, remove);

    signal.dispose();
    signal.dispose();

    expect(remove).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TV-LIVE-008: LiveSignal handles factory error during rebind
// ---------------------------------------------------------------------------

describe("TV-LIVE-008: LiveSignal error handling during rebind", () => {
  it("factory error during rebind sets error property, does not throw", () => {
    const { factory: throwingFactory } = createThrowingFactory(2); // throws on second call
    const signal = new LiveSignal(throwingFactory, () => {});

    // First call succeeded
    expect(signal.error).toBe(null);

    // Rebind — second factory call throws
    expect(() => signal.rebind()).not.toThrow();

    expect(signal.error).not.toBe(null);
    expect(signal.error?.code).toBe("INTERNAL");
    expect(signal.error?.message).toContain("Factory error on call 2");
  });

  it("factory error during initial bind sets error property", () => {
    const factory = (): DatafnSignal<any> => {
      throw new Error("init failure");
    };
    const signal = new LiveSignal(factory, () => {});

    expect(signal.error).not.toBe(null);
    expect(signal.error?.code).toBe("INTERNAL");
    expect(signal.loading).toBe(false);
  });

  it("rebindAll continues rebinding other signals if one factory throws", () => {
    const registry = new LiveSignalRegistry();

    let goodCallCount = 0;
    const goodFactory = (): DatafnSignal<any> => {
      goodCallCount++;
      return createMockSignal(goodCallCount);
    };

    const { factory: throwingFactory } = createThrowingFactory(2);

    registry.getOrCreateTableSignal("good", 1, { select: ["*"] }, undefined, goodFactory);
    registry.getOrCreateTableSignal("bad", 1, { select: ["*"] }, undefined, throwingFactory);

    // rebindAll should not throw
    expect(() => registry.rebindAll()).not.toThrow();

    // Good signal should have been rebound (factory called twice total)
    expect(goodCallCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TV-REG-001: LiveSignalRegistry deduplication
// ---------------------------------------------------------------------------

describe("TV-REG-001: LiveSignalRegistry deduplication", () => {
  it("same table query returns the same LiveSignal instance", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);
    const sig2 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);

    expect(sig1).toBe(sig2);
  });

  it("different queries return different instances", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();

    const sig1 = registry.getOrCreateTableSignal("task", 1, { select: ["*"] }, undefined, factory);
    const sig2 = registry.getOrCreateTableSignal("task", 1, { select: ["title"] }, undefined, factory);

    expect(sig1).not.toBe(sig2);
  });

  it("same KV key returns the same LiveSignal instance", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();

    const sig1 = registry.getOrCreateKvSignal("theme", undefined, factory);
    const sig2 = registry.getOrCreateKvSignal("theme", undefined, factory);

    expect(sig1).toBe(sig2);
  });

  it("table and kv signals with same name string are different instances", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();

    const tableSig = registry.getOrCreateTableSignal("theme", 1, { select: ["*"] }, undefined, factory);
    const kvSig = registry.getOrCreateKvSignal("theme", undefined, factory);

    expect(tableSig).not.toBe(kvSig);
  });
});

// ---------------------------------------------------------------------------
// TV-REG-001 + TV-LIVE-003: LiveSignalRegistry.rebindAll()
// ---------------------------------------------------------------------------

describe("LiveSignalRegistry.rebindAll()", () => {
  it("rebinds all registered signals", () => {
    const registry = new LiveSignalRegistry();
    const factoryA = createMockFactory();
    const factoryB = createMockFactory();

    registry.getOrCreateTableSignal("task", 1, { select: ["*"] }, undefined, factoryA.factory);
    registry.getOrCreateTableSignal("tag", 1, { select: ["*"] }, undefined, factoryB.factory);

    expect(factoryA.getCallCount()).toBe(1);
    expect(factoryB.getCallCount()).toBe(1);

    registry.rebindAll();

    expect(factoryA.getCallCount()).toBe(2);
    expect(factoryB.getCallCount()).toBe(2);
  });

  it("after rebindAll, signals return values from new factories", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();

    const sig = registry.getOrCreateTableSignal("task", 1, { select: ["*"] }, undefined, factory);
    expect(sig.get()).toEqual({ id: 1, data: ["item-1"] });

    registry.rebindAll();

    expect(sig.get()).toEqual({ id: 2, data: ["item-2"] });
  });
});

// ---------------------------------------------------------------------------
// TV-REG-003: LiveSignalRegistry.disposeAll()
// ---------------------------------------------------------------------------

describe("TV-REG-003: LiveSignalRegistry.disposeAll()", () => {
  it("disposes all signals and clears the registry", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();

    const sig1 = registry.getOrCreateTableSignal("task", 1, { select: ["*"] }, undefined, factory);
    const sig2 = registry.getOrCreateKvSignal("theme", undefined, factory);

    registry.disposeAll();

    // Signals are disposed — subscribe returns no-op
    const handler = vi.fn();
    sig1.subscribe(handler);
    sig2.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();

    // Registry is empty — creating same key yields a new instance
    const sig1b = registry.getOrCreateTableSignal("task", 1, { select: ["*"] }, undefined, factory);
    expect(sig1b).not.toBe(sig1);
  });
});

// ---------------------------------------------------------------------------
// TV-REG-004: LiveSignalRegistry re-creation after dispose
// ---------------------------------------------------------------------------

describe("TV-REG-004: LiveSignalRegistry re-creation after dispose", () => {
  it("after dispose, same key creates a fresh LiveSignal", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);
    sig1.dispose();

    const sig2 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);

    expect(sig2).not.toBe(sig1);
    // New signal is fully functional
    const handler = vi.fn();
    sig2.subscribe(handler);
    expect(handler).toHaveBeenCalled();
  });

  it("new signal after dispose is independent of the disposed one", () => {
    const registry = new LiveSignalRegistry();
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);
    sig1.dispose();

    const sig2 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);

    // rebind on new signal works independently
    expect(() => sig2.rebind()).not.toThrow();
    expect(sig2.error).toBe(null);
  });
});

describe("LiveSignalRegistry idle cache eviction", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts an idle signal after its TTL expires", () => {
    vi.useFakeTimers();
    const registry = new LiveSignalRegistry({ defaultIdleTtlMs: 1000 });
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);
    const unsub = sig1.subscribe(() => {});
    unsub();

    vi.advanceTimersByTime(999);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).toBe(sig1);

    vi.advanceTimersByTime(1000);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).not.toBe(sig1);
  });

  it("does not evict an active signal", () => {
    vi.useFakeTimers();
    const registry = new LiveSignalRegistry({ defaultIdleTtlMs: 1000 });
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);
    const unsub = sig1.subscribe(() => {});

    vi.advanceTimersByTime(5000);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).toBe(sig1);

    unsub();
    vi.advanceTimersByTime(1000);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).not.toBe(sig1);
  });

  it("keeps idle signals with keepAlive enabled", () => {
    vi.useFakeTimers();
    const registry = new LiveSignalRegistry({ defaultIdleTtlMs: 1000 });
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, { cache: { keepAlive: true } }, factory);
    const unsub = sig1.subscribe(() => {});
    unsub();

    vi.advanceTimersByTime(5000);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).toBe(sig1);
  });

  it("applies cache overrides when reusing an existing signal", () => {
    vi.useFakeTimers();
    const registry = new LiveSignalRegistry({ defaultIdleTtlMs: 1000 });
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, undefined, factory);
    const unsub = sig1.subscribe(() => {});
    unsub();

    expect(registry.getOrCreateTableSignal("task", 1, q, { cache: { keepAlive: true } }, factory)).toBe(sig1);
    vi.advanceTimersByTime(5000);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).toBe(sig1);
  });

  it("allows per-signal idle TTL overrides", () => {
    vi.useFakeTimers();
    const registry = new LiveSignalRegistry({ defaultIdleTtlMs: 1000 });
    const { factory } = createMockFactory();
    const q = { select: ["*"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, q, { cache: { idleTtlMs: 3000 } }, factory);
    const unsub = sig1.subscribe(() => {});
    unsub();

    vi.advanceTimersByTime(2999);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).toBe(sig1);

    vi.advanceTimersByTime(3000);
    expect(registry.getOrCreateTableSignal("task", 1, q, undefined, factory)).not.toBe(sig1);
  });

  it("evicts least recently used idle signals over the idle cache cap", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const registry = new LiveSignalRegistry({ defaultIdleTtlMs: 100000, maxIdleSignals: 1 });
    const { factory } = createMockFactory();
    const firstQuery = { select: ["id"] };
    const secondQuery = { select: ["title"] };

    const sig1 = registry.getOrCreateTableSignal("task", 1, firstQuery, undefined, factory);
    vi.advanceTimersByTime(1);
    const sig2 = registry.getOrCreateTableSignal("task", 1, secondQuery, undefined, factory);

    expect(registry.getOrCreateTableSignal("task", 1, secondQuery, undefined, factory)).toBe(sig2);
    expect(registry.getOrCreateTableSignal("task", 1, firstQuery, undefined, factory)).not.toBe(sig1);
  });
});
