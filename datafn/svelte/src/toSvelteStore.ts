/**
 * Convert DataFn signal to Svelte store
 */

import type { DatafnSignal } from "@datafn/core";
import type { Readable } from "svelte/store";

/**
 * Convert a DataFn signal to a Svelte readable store
 */
export function toSvelteStore<T>(signal: DatafnSignal<T>): Readable<T> {
  return {
    subscribe(run: (value: T) => void) {
      // Immediately call with initial value
      run(signal.get());

      // Subscribe to signal updates
      const unsubscribe = signal.subscribe((value: T) => {
        run(value);
      });

      // Return unsubscribe function
      return unsubscribe;
    },
  };
}
