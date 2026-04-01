import type { EventFilter } from "@datafn/client";
import type { DatafnEvent } from "@datafn/core";
import {
  createExtfnLikeError,
  type ExtfnLikeError,
} from "./shared.js";

export interface DatafnExtfnSubscriptionDelivery {
  subscriptionId: string;
  event: DatafnEvent;
}

export interface DatafnExtfnSubscriptionRegistration {
  subscriptionId: string;
  resumed: boolean;
}

export interface DatafnExtfnSubscriptionOptions {
  filter?: EventFilter;
  resumeSubscriptionId?: string;
  deliver: (
    delivery: DatafnExtfnSubscriptionDelivery,
  ) => void | Promise<void>;
  onFailure?: (
    error: ExtfnLikeError,
    subscriptionId: string,
  ) => void | Promise<void>;
}

export interface DatafnExtfnSubscriptionsOptions {
  subscribe: (
    handler: (event: DatafnEvent) => void,
    filter?: EventFilter,
  ) => () => void;
}

interface ActiveSubscription {
  filter?: EventFilter;
  deliver: DatafnExtfnSubscriptionOptions["deliver"];
  onFailure?: DatafnExtfnSubscriptionOptions["onFailure"];
  unsubscribeAuthority: () => void;
}

interface RecoverableSubscription {
  filter?: EventFilter;
}

export class DatafnExtfnSubscriptions {
  private active = new Map<string, ActiveSubscription>();
  private recoverable = new Map<string, RecoverableSubscription>();
  private nextId = 1;

  constructor(private readonly options: DatafnExtfnSubscriptionsOptions) {}

  async subscribe(
    options: DatafnExtfnSubscriptionOptions,
  ): Promise<DatafnExtfnSubscriptionRegistration> {
    const resumable = options.resumeSubscriptionId !== undefined;
    const subscriptionId =
      options.resumeSubscriptionId ?? `sub_${this.nextId++}`;

    if (this.active.has(subscriptionId)) {
      throw createExtfnLikeError(
        "E_RUNTIME_PROTOCOL",
        "Duplicate DataFn subscription registration detected after reconnect.",
        { subscriptionId },
      );
    }

    const recovered = resumable
      ? this.recoverable.get(subscriptionId)
      : undefined;

    if (resumable && !recovered) {
      throw createExtfnLikeError(
        "E_RUNTIME_PROTOCOL",
        "Cannot resume unknown DataFn subscription.",
        { subscriptionId },
      );
    }

    const filter = recovered?.filter ?? options.filter;
    const unsubscribeAuthority = this.options.subscribe((event) => {
      void Promise.resolve(
        options.deliver({
          subscriptionId,
          event,
        }),
      ).catch(async (error) => {
        if (options.onFailure) {
          try {
            await options.onFailure(
              normalizeDeliveryError(error, subscriptionId),
              subscriptionId,
            );
          } catch {
            // Ignore onFailure handler errors so detached delivery work does not
            // surface unhandled rejections when callers use a best-effort hook.
          }
        }
      });
    }, filter);

    this.active.set(subscriptionId, {
      filter,
      deliver: options.deliver,
      onFailure: options.onFailure,
      unsubscribeAuthority,
    });

    if (recovered) {
      this.recoverable.delete(subscriptionId);
    }

    return {
      subscriptionId,
      resumed: Boolean(recovered),
    };
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    const activeSubscription = this.active.get(subscriptionId);
    if (activeSubscription) {
      this.active.delete(subscriptionId);
      activeSubscription.unsubscribeAuthority();
    }

    this.recoverable.delete(subscriptionId);
  }

  async handleBackgroundRestart(): Promise<void> {
    const activeSubscriptions = Array.from(this.active.entries());
    this.active.clear();

    await Promise.all(
      activeSubscriptions.map(async ([subscriptionId, subscription]) => {
        subscription.unsubscribeAuthority();
        this.recoverable.set(subscriptionId, {
          filter: subscription.filter,
        });

        if (subscription.onFailure) {
          await subscription.onFailure(
            createExtfnLikeError(
              "E_RUNTIME_PROTOCOL",
              "DataFn background subscription state was reset.",
              { subscriptionId },
            ),
            subscriptionId,
          );
        }
      }),
    );
  }

  async closeAll(): Promise<void> {
    for (const subscription of this.active.values()) {
      subscription.unsubscribeAuthority();
    }

    this.active.clear();
    this.recoverable.clear();
  }

  getActiveSubscriptionCount(): number {
    return this.active.size;
  }

  getRecoverableSubscriptionCount(): number {
    return this.recoverable.size;
  }
}

function normalizeDeliveryError(
  error: unknown,
  subscriptionId: string,
): ExtfnLikeError {
  return error && typeof error === "object" && "code" in error && "message" in error
    ? (error as ExtfnLikeError)
    : createExtfnLikeError(
        "E_RUNTIME_PROTOCOL",
        error instanceof Error
          ? error.message
          : "DataFn subscription delivery failed.",
        { subscriptionId },
      );
}
