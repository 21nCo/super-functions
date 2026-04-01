import { EventBus } from "@datafn/client";
import type { DatafnEvent } from "@datafn/core";
import { describe, expect, it } from "vitest";
import { DatafnExtfnSubscriptions } from "../src/index.js";

function createMutationEvent(seq: number): DatafnEvent {
  return {
    type: "mutation_applied",
    resource: "clip",
    ids: [`clip:${seq}`],
    timestampMs: seq,
    context: {
      seq,
    },
  };
}

describe("@datafn/extfn subscriptions", () => {
  it("fans out ordered events to multiple active listeners", async () => {
    const eventBus = new EventBus();
    const subscriptions = new DatafnExtfnSubscriptions({
      subscribe: (handler, filter) => eventBus.subscribe(handler, filter),
    });
    const popupReceived: number[] = [];
    const sidepanelReceived: number[] = [];

    await subscriptions.subscribe({
      deliver: async ({ event }) => {
        popupReceived.push((event.context as { seq: number }).seq);
      },
    });
    await subscriptions.subscribe({
      deliver: async ({ event }) => {
        sidepanelReceived.push((event.context as { seq: number }).seq);
      },
    });

    eventBus.emit(createMutationEvent(1));
    eventBus.emit(createMutationEvent(2));

    expect(popupReceived).toEqual([1, 2]);
    expect(sidepanelReceived).toEqual([1, 2]);
  });

  it("cleans up subscriptions deterministically and does not leak registrations", async () => {
    const eventBus = new EventBus();
    const subscriptions = new DatafnExtfnSubscriptions({
      subscribe: (handler, filter) => eventBus.subscribe(handler, filter),
    });
    const received: number[] = [];

    const registration = await subscriptions.subscribe({
      deliver: async ({ event }) => {
        received.push((event.context as { seq: number }).seq);
      },
    });

    expect(subscriptions.getActiveSubscriptionCount()).toBe(1);
    await subscriptions.unsubscribe(registration.subscriptionId);
    expect(subscriptions.getActiveSubscriptionCount()).toBe(0);

    eventBus.emit(createMutationEvent(1));
    expect(received).toEqual([]);
  });

  it("fails active subscriptions explicitly on background restart and resumes only once without duplicates", async () => {
    const eventBus = new EventBus();
    const subscriptions = new DatafnExtfnSubscriptions({
      subscribe: (handler, filter) => eventBus.subscribe(handler, filter),
    });
    const failures: string[] = [];
    const resumed: number[] = [];

    const registration = await subscriptions.subscribe({
      deliver: async () => undefined,
      onFailure: async (error) => {
        failures.push(error.code);
      },
    });

    await subscriptions.handleBackgroundRestart();

    expect(failures).toEqual(["E_RUNTIME_PROTOCOL"]);
    expect(subscriptions.getActiveSubscriptionCount()).toBe(0);
    expect(subscriptions.getRecoverableSubscriptionCount()).toBe(1);

    const restored = await subscriptions.subscribe({
      resumeSubscriptionId: registration.subscriptionId,
      deliver: async ({ event }) => {
        resumed.push((event.context as { seq: number }).seq);
      },
    });

    expect(restored).toEqual({
      subscriptionId: registration.subscriptionId,
      resumed: true,
    });
    expect(subscriptions.getActiveSubscriptionCount()).toBe(1);
    expect(subscriptions.getRecoverableSubscriptionCount()).toBe(0);

    eventBus.emit(createMutationEvent(3));
    expect(resumed).toEqual([3]);

    await expect(
      subscriptions.subscribe({
        resumeSubscriptionId: registration.subscriptionId,
        deliver: async () => undefined,
      }),
    ).rejects.toMatchObject({
      code: "E_RUNTIME_PROTOCOL",
      message:
        "Duplicate DataFn subscription registration detected after reconnect.",
    });
  });

  it("routes delivery rejections through onFailure", async () => {
    const eventBus = new EventBus();
    const subscriptions = new DatafnExtfnSubscriptions({
      subscribe: (handler, filter) => eventBus.subscribe(handler, filter),
    });
    const failures: Array<{ code: string; subscriptionId: string }> = [];

    const registration = await subscriptions.subscribe({
      deliver: async () => {
        throw new Error("delivery failed");
      },
      onFailure: async (error, subscriptionId) => {
        failures.push({
          code: error.code,
          subscriptionId,
        });
      },
    });

    eventBus.emit(createMutationEvent(4));
    await Promise.resolve();
    await Promise.resolve();

    expect(failures).toEqual([
      {
        code: "E_RUNTIME_PROTOCOL",
        subscriptionId: registration.subscriptionId,
      },
    ]);
  });

  it("swallows onFailure rejections from detached delivery work", async () => {
    const eventBus = new EventBus();
    const subscriptions = new DatafnExtfnSubscriptions({
      subscribe: (handler, filter) => eventBus.subscribe(handler, filter),
    });

    await expect(
      subscriptions.subscribe({
        deliver: async () => {
          throw new Error("delivery failed");
        },
        onFailure: async () => {
          throw new Error("handler failed");
        },
      }),
    ).resolves.toMatchObject({
      subscriptionId: expect.any(String),
      resumed: false,
    });

    expect(() => {
      eventBus.emit(createMutationEvent(5));
    }).not.toThrow();

    await Promise.resolve();
    await Promise.resolve();
  });
});
