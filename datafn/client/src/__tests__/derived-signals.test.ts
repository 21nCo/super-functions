import { describe, expect, it } from "vitest";
import type { DatafnSignal } from "@datafn/core";
import { combineSignals } from "../signals/derived.js";

function createImmediateSignal<T>(initialValue: T) {
  let value = initialValue;
  const subscribers: Array<(value: T) => void> = [];

  const signal: DatafnSignal<T> = {
    get: () => value,
    subscribe: (handler) => {
      subscribers.push(handler);
      handler(value);
      return () => {
        const index = subscribers.indexOf(handler);
        if (index >= 0) subscribers.splice(index, 1);
      };
    },
    loading: false,
    error: null,
    refreshing: false,
    nextCursor: null,
    dispose: () => {}
  };

  return {
    signal,
    emit(nextValue: T) {
      value = nextValue;
      subscribers.forEach((handler) => handler(value));
    }
  };
}

describe("combineSignals", () => {
  it("coalesces synchronous child subscribe emissions into one combined emission", async () => {
    const first = createImmediateSignal(1);
    const second = createImmediateSignal(2);
    const values: number[] = [];

    const combined = combineSignals(
      [first.signal, second.signal],
      () => first.signal.get() + second.signal.get()
    );
    const unsub = combined.subscribe((value) => values.push(value));

    await Promise.resolve();

    expect(values).toEqual([3]);
    unsub();
  });

  it("coalesces multiple same-tick source emissions", async () => {
    const first = createImmediateSignal(1);
    const second = createImmediateSignal(2);
    const values: number[] = [];

    const combined = combineSignals(
      [first.signal, second.signal],
      () => first.signal.get() + second.signal.get()
    );
    const unsub = combined.subscribe((value) => values.push(value));

    await Promise.resolve();
    first.emit(10);
    second.emit(20);
    await Promise.resolve();

    expect(values).toEqual([3, 30]);
    unsub();
  });

  it("can suppress equal computed values", async () => {
    const source = createImmediateSignal(1);
    const values: number[][] = [];

    const combined = combineSignals(
      [source.signal],
      () => [source.signal.get()],
      {
        equals: (previous, next) =>
          Array.isArray(previous) &&
          previous.length === next.length &&
          previous.every((value, index) => value === next[index])
      }
    );
    const unsub = combined.subscribe((value) => values.push(value));

    await Promise.resolve();
    source.emit(1);
    await Promise.resolve();
    source.emit(2);
    await Promise.resolve();

    expect(values).toEqual([[1], [2]]);
    unsub();
  });
});
