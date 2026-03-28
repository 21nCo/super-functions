/**
 * In-process event bus
 */

import type { DatafnEvent } from "@datafn/core";
import { matchesFilter, type EventFilter } from "./filter.js";

export type EventHandler = (event: DatafnEvent) => void;

interface Subscription {
  id: number;
  handler: EventHandler;
  filter?: EventFilter;
}

export interface EventBusOptions {
  /**
   * Error handler called when a subscriber throws an error.
   * Default: logs to console.error
   */
  onError?: (error: unknown, event: DatafnEvent) => void;
}

/**
 * Simple in-process event bus with fault-tolerant delivery
 */
export class EventBus {
  private subscriptions: Subscription[] = [];
  private nextId = 1;
  private onError: (error: unknown, event: DatafnEvent) => void;

  constructor(options?: EventBusOptions) {
    this.onError =
      options?.onError ||
      ((error: unknown, event: DatafnEvent) => {
        console.error("[datafn] Event handler error:", error, "event:", event);
      });
  }

  /**
   * Subscribe to events with optional filtering
   */
  subscribe(handler: EventHandler, filter?: EventFilter): () => void {
    const subscription: Subscription = {
      id: this.nextId++,
      handler,
      filter,
    };

    this.subscriptions.push(subscription);

    // Return unsubscribe function
    return () => {
      this.subscriptions = this.subscriptions.filter(
        (s) => s.id !== subscription.id
      );
    };
  }

  /**
   * Emit an event to all matching subscribers.
   * Errors in handlers are isolated - a throwing handler will not prevent delivery to other handlers.
   */
  emit(event: DatafnEvent): void {
    // CLI-005: Copy before iteration so unsubscribes during emit don't skip/crash handlers
    const subs = [...this.subscriptions];
    for (const subscription of subs) {
      if (matchesFilter(event, subscription.filter)) {
        try {
          subscription.handler(event);
        } catch (error) {
          this.onError(error, event);
        }
      }
    }
  }

  /**
   * Remove all subscriptions
   */
  clear(): void {
    this.subscriptions = [];
  }
}
