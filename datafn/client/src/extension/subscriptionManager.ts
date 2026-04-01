/**
 * Extension Subscription Manager
 *
 * Manages remote subscription lifecycle for extension contexts:
 * - Opens remote subscription when first local subscriber with a filter registers
 * - Closes remote subscription when last local subscriber unsubscribes
 * - Provides deterministic filter -> remote subscription key mapping
 */

import type { EventFilter } from "../events/filter.js";
import { normalizeFilter } from "../events/filter.js";

export interface RemoteSubscriptionAdapter {
  subscribeRemote(filter?: unknown): Promise<string>;
  unsubscribeRemote(subscriptionId: string): Promise<void>;
}

interface RemoteSubscription {
  subscriptionId: string;
  filter: EventFilter | undefined;
  localSubscriberCount: number;
}

/**
 * Generates a deterministic key from an event filter for deduplication
 */
function filterToKey(filter: EventFilter | undefined): string {
  if (!filter) return "__all__";
  // Create a stable JSON representation by sorting keys
  const normalized = normalizeFilter(filter);
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}

/**
 * Manages remote subscriptions for extension context
 */
export class ExtensionSubscriptionManager {
  private remoteSubscriptions = new Map<string, RemoteSubscription>();

  constructor(private adapter: RemoteSubscriptionAdapter) {}

  /**
   * Register a local subscriber. Opens remote subscription if needed.
   * Returns a cleanup function to decrement the ref count.
   */
  async registerSubscriber(
    filter: EventFilter | undefined,
  ): Promise<() => Promise<void>> {
    const key = filterToKey(filter);
    let remoteSub = this.remoteSubscriptions.get(key);

    if (!remoteSub) {
      // First subscriber with this filter - open remote subscription
      const subscriptionId = await this.adapter.subscribeRemote(filter);
      remoteSub = {
        subscriptionId,
        filter,
        localSubscriberCount: 1,
      };
      this.remoteSubscriptions.set(key, remoteSub);
    } else {
      // Existing remote subscription - increment ref count
      remoteSub.localSubscriberCount++;
    }

    // Return cleanup function
    return async () => {
      const sub = this.remoteSubscriptions.get(key);
      if (!sub) return; // Already cleaned up

      sub.localSubscriberCount--;

      if (sub.localSubscriberCount === 0) {
        // Last subscriber removed - close remote subscription
        await this.adapter.unsubscribeRemote(sub.subscriptionId);
        this.remoteSubscriptions.delete(key);
      }
    };
  }

  /**
   * Close all remote subscriptions (for cleanup)
   */
  async closeAll(): Promise<void> {
    const subs = Array.from(this.remoteSubscriptions.values());
    this.remoteSubscriptions.clear();

    await Promise.all(
      subs.map((sub) => this.adapter.unsubscribeRemote(sub.subscriptionId)),
    );
  }

  ownsSubscriptionId(subscriptionId: string): boolean {
    for (const subscription of this.remoteSubscriptions.values()) {
      if (subscription.subscriptionId === subscriptionId) {
        return true;
      }
    }

    return false;
  }

  getActiveSubscriptionCount(): number {
    return this.remoteSubscriptions.size;
  }
}
