/**
 * Query Signal Implementation
 *
 * Reactive query signals with caching, lazy fetch, and auto-refresh on mutations.
 */

import type { DatafnSignal } from "@datafn/core";
import { dfqlKey } from "@datafn/core";
import type { EventBus } from "../events/bus.js";

/**
 * Signal registry for caching signals by dfqlKey
 */
export class SignalRegistry {
  private signals = new Map<string, DatafnSignal<any>>();
  private client: any;
  private eventBus: EventBus;

  constructor(client: any, eventBus: EventBus) {
    this.client = client;
    this.eventBus = eventBus;
  }

  getSignal<T>(fullQuery: unknown): DatafnSignal<T> {
    const key = dfqlKey(fullQuery);

    // Return cached signal if exists
    if (this.signals.has(key)) {
      return this.signals.get(key) as DatafnSignal<T>;
    }

    // Create new signal
    const signal = createQuerySignal<T>(this.client, this.eventBus, fullQuery);
    this.signals.set(key, signal);
    return signal;
  }
}

/**
 * Create a reactive query signal
 */
function createQuerySignal<T>(
  client: any,
  eventBus: EventBus,
  fullQuery: any,
): DatafnSignal<T> {
  let currentValue: T | undefined;
  let status: "idle" | "loading" | "error" = "idle";
  const subscribers = new Set<(value: T) => void>();
  let inFlight = false;
  let queuedRefresh = false;
  const resource = fullQuery.resource;

  const fetchQuery = async (isRefresh = false): Promise<void> => {
    if (inFlight) {
      // Queue a refresh to happen after current fetch completes
      if (isRefresh) {
        queuedRefresh = true;
      }
      return;
    }

    inFlight = true;
    queuedRefresh = false;

    try {
      const result = await client.query(fullQuery);
      currentValue = result as T;
      status = "idle";

      // Only notify subscribers if this is not a silent refresh or it succeeded
      if (!isRefresh || currentValue !== undefined) {
        subscribers.forEach((fn) => fn(currentValue as T));
      }
    } catch (error) {
      // On refresh error, swallow and keep last value (don't notify)
      if (!isRefresh) {
        status = "error";
        throw error;
      }
      // Refresh errors are silent - keep old value, don't notify
    } finally {
      inFlight = false;

      // If a refresh was queued, execute it now
      if (queuedRefresh) {
        queuedRefresh = false;
        fetchQuery(true);
      }
    }
  };

  // Listen for mutation_applied events for auto-refresh
  eventBus.subscribe((event) => {
    if (event.type === "mutation_applied" && event.resource === resource) {
      // Trigger refresh
      fetchQuery(true);
    }
  });

  return {
    subscribe(fn: (value: T) => void): () => void {
      subscribers.add(fn);

      // Lazy fetch on first subscribe
      if (
        subscribers.size === 1 &&
        status === "idle" &&
        currentValue === undefined
      ) {
        fetchQuery(false).catch(() => {
          // Initial fetch errors are handled internally
        });
      } else if (currentValue !== undefined) {
        // Immediately deliver current value to new subscriber
        fn(currentValue);
      }

      // Return unsubscribe function
      return () => {
        subscribers.delete(fn);
      };
    },

    get(): T {
      // Return current value or undefined as T (signals can have undefined state)
      return currentValue as T;
    },
  };
}
