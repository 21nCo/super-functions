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
  subscriptionId?: string;
  subscribePromise?: Promise<string>;
  unsubscribePromise?: Promise<void>;
  filter: EventFilter | undefined;
  localSubscriberCount: number;
  pendingUnsubscribe?: boolean;
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

  private async startRemoteSubscription(
    key: string,
    remoteSub: RemoteSubscription,
  ): Promise<string> {
    const subscribePromise = this.adapter.subscribeRemote(remoteSub.filter);
    remoteSub.subscribePromise = subscribePromise;

    try {
      const subscriptionId = await subscribePromise;
      const current = this.remoteSubscriptions.get(key);

      if (!current) {
        await this.adapter.unsubscribeRemote(subscriptionId);
        return subscriptionId;
      }

      current.subscribePromise = undefined;
      current.subscriptionId = subscriptionId;

      if (current.localSubscriberCount === 0 && current.pendingUnsubscribe) {
        const unsubscribePromise = this.adapter.unsubscribeRemote(subscriptionId);
        current.unsubscribePromise = unsubscribePromise;
        try {
          await unsubscribePromise;
        } finally {
          current.unsubscribePromise = undefined;
          current.subscriptionId = undefined;
          if (
            this.remoteSubscriptions.get(key) === current &&
            current.localSubscriberCount === 0 &&
            current.pendingUnsubscribe
          ) {
            this.remoteSubscriptions.delete(key);
          }
        }
      }

      return subscriptionId;
    } catch (error) {
      const current = this.remoteSubscriptions.get(key);
      if (current === remoteSub) {
        current.subscribePromise = undefined;
        current.subscriptionId = undefined;
        this.remoteSubscriptions.delete(key);
      }
      throw error;
    }
  }

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
      remoteSub = {
        filter,
        localSubscriberCount: 0,
        pendingUnsubscribe: false,
      };
      this.remoteSubscriptions.set(key, remoteSub);
    }

    remoteSub.localSubscriberCount++;
    remoteSub.pendingUnsubscribe = false;

    if (remoteSub.unsubscribePromise) {
      await remoteSub.unsubscribePromise;
    }

    if (!remoteSub.subscriptionId) {
      await (remoteSub.subscribePromise ??
        this.startRemoteSubscription(key, remoteSub));
    }

    // Return cleanup function
    return async () => {
      const sub = this.remoteSubscriptions.get(key);
      if (!sub) return; // Already cleaned up

      sub.localSubscriberCount--;

      if (sub.localSubscriberCount === 0) {
        sub.pendingUnsubscribe = true;

        if (sub.unsubscribePromise) {
          await sub.unsubscribePromise;
          return;
        }

        if (sub.subscribePromise) {
          await sub.subscribePromise.catch(() => undefined);
          return;
        }

        if (sub.subscriptionId) {
          // Last subscriber removed - close remote subscription
          const subscriptionId = sub.subscriptionId;
          const unsubscribePromise = this.adapter.unsubscribeRemote(subscriptionId);
          sub.unsubscribePromise = unsubscribePromise;
          try {
            await unsubscribePromise;
          } finally {
            sub.unsubscribePromise = undefined;
            sub.subscriptionId = undefined;
            if (
              this.remoteSubscriptions.get(key) === sub &&
              sub.localSubscriberCount === 0 &&
              sub.pendingUnsubscribe
            ) {
              this.remoteSubscriptions.delete(key);
            }
          }
        } else {
          this.remoteSubscriptions.delete(key);
        }
      }
    };
  }

  /**
   * Close all remote subscriptions (for cleanup)
   */
  async closeAll(): Promise<void> {
    const entries = Array.from(this.remoteSubscriptions.entries());

    for (const [key, sub] of entries) {
      sub.localSubscriberCount = 0;
      sub.pendingUnsubscribe = true;

      if (sub.subscribePromise) {
        await sub.subscribePromise.catch(() => undefined);
      }

      if (sub.unsubscribePromise) {
        await sub.unsubscribePromise.catch(() => undefined);
      }

      const current = this.remoteSubscriptions.get(key);
      if (!current) {
        continue;
      }

      if (current.subscriptionId) {
        const unsubscribePromise = this.adapter.unsubscribeRemote(current.subscriptionId);
        current.unsubscribePromise = unsubscribePromise;
        try {
          await unsubscribePromise;
        } finally {
          current.unsubscribePromise = undefined;
          current.subscriptionId = undefined;
          if (this.remoteSubscriptions.get(key) === current) {
            this.remoteSubscriptions.delete(key);
          }
        }
      } else {
        this.remoteSubscriptions.delete(key);
      }
    }
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
