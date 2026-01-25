/**
 * Svelte store adapter tests - Phase 05
 */

import { describe, it, expect } from "vitest";
import { toSvelteStore } from "../src/toSvelteStore.js";
import type { DatafnSignal } from "@datafn/core";

describe("@datafn/svelte toSvelteStore", () => {
  it("Creates a readable store from a signal", () => {
    // Create a mock signal
    let value = 10;
    const subscribers: Array<(val: number) => void> = [];

    const mockSignal: DatafnSignal<number> = {
      get() {
        return value;
      },
      subscribe(handler: (val: number) => void) {
        subscribers.push(handler);
        return () => {
          const index = subscribers.indexOf(handler);
          if (index >= 0) subscribers.splice(index, 1);
        };
      },
    };

    const store = toSvelteStore(mockSignal);
    const receivedValues: number[] = [];

    // Subscribe to store
    const unsubscribe = store.subscribe((val) => {
      receivedValues.push(val);
    });

    // Should receive initial value immediately
    expect(receivedValues).toEqual([10]);

    // Update signal
    value = 20;
    subscribers.forEach((sub) => sub(value));

    expect(receivedValues).toEqual([10, 20]);

    // Update again
    value = 30;
    subscribers.forEach((sub) => sub(value));

    expect(receivedValues).toEqual([10, 20, 30]);

    // Unsubscribe should stop updates
    unsubscribe();

    value = 40;
    subscribers.forEach((sub) => sub(value));

    expect(receivedValues).toEqual([10, 20, 30]); // No 40
  });

  it("Multiple subscribers work independently", () => {
    let value = "initial";
    const subscribers: Array<(val: string) => void> = [];

    const mockSignal: DatafnSignal<string> = {
      get() {
        return value;
      },
      subscribe(handler: (val: string) => void) {
        subscribers.push(handler);
        return () => {
          const index = subscribers.indexOf(handler);
          if (index >= 0) subscribers.splice(index, 1);
        };
      },
    };

    const store = toSvelteStore(mockSignal);

    const values1: string[] = [];
    const values2: string[] = [];

    const unsub1 = store.subscribe((val) => values1.push(val));
    const unsub2 = store.subscribe((val) => values2.push(val));

    expect(values1).toEqual(["initial"]);
    expect(values2).toEqual(["initial"]);

    value = "updated";
    subscribers.forEach((sub) => sub(value));

    expect(values1).toEqual(["initial", "updated"]);
    expect(values2).toEqual(["initial", "updated"]);

    // Unsubscribe first
    unsub1();

    value = "final";
    subscribers.forEach((sub) => sub(value));

    expect(values1).toEqual(["initial", "updated"]); // No final
    expect(values2).toEqual(["initial", "updated", "final"]);

    unsub2();
  });
});
