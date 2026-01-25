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

/**
 * Simple in-process event bus
 */
export class EventBus {
  private subscriptions: Subscription[] = [];
  private nextId = 1;

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
   * Emit an event to all matching subscribers
   */
  emit(event: DatafnEvent): void {
    for (const subscription of this.subscriptions) {
      if (matchesFilter(event, subscription.filter)) {
        subscription.handler(event);
      }
    }
  }
}
