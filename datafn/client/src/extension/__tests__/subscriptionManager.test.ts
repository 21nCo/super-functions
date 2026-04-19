import { describe, expect, it, vi } from "vitest";
import { ExtensionSubscriptionManager } from "../subscriptionManager.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("ExtensionSubscriptionManager", () => {
  it("waits for the initial remote subscribe before reusing the entry", async () => {
    const subscribeDeferred = deferred<string>();
    const adapter = {
      subscribeRemote: vi.fn().mockReturnValue(subscribeDeferred.promise),
      unsubscribeRemote: vi.fn().mockResolvedValue(undefined),
    };
    const manager = new ExtensionSubscriptionManager(adapter);

    const firstCleanupPromise = manager.registerSubscriber(undefined);
    const secondCleanupPromise = manager.registerSubscriber(undefined);

    let secondSettled = false;
    void secondCleanupPromise.then(() => {
      secondSettled = true;
    });
    await Promise.resolve();

    expect(adapter.subscribeRemote).toHaveBeenCalledTimes(1);
    expect(secondSettled).toBe(false);

    subscribeDeferred.resolve("remote-sub-1");

    const [firstCleanup, secondCleanup] = await Promise.all([
      firstCleanupPromise,
      secondCleanupPromise,
    ]);

    expect(manager.getActiveSubscriptionCount()).toBe(1);
    expect(manager.ownsSubscriptionId("remote-sub-1")).toBe(true);

    await firstCleanup();
    await secondCleanup();
  });

  it("preserves local subscription state until remote unsubscribe succeeds", async () => {
    const unsubscribeDeferred = deferred<void>();
    const adapter = {
      subscribeRemote: vi.fn().mockResolvedValue("remote-sub-2"),
      unsubscribeRemote: vi.fn().mockReturnValue(unsubscribeDeferred.promise),
    };
    const manager = new ExtensionSubscriptionManager(adapter);

    const cleanup = await manager.registerSubscriber(undefined);
    const cleanupPromise = cleanup();

    await Promise.resolve();

    expect(adapter.unsubscribeRemote).toHaveBeenCalledWith("remote-sub-2");
    expect(manager.getActiveSubscriptionCount()).toBe(1);
    expect(manager.ownsSubscriptionId("remote-sub-2")).toBe(true);

    unsubscribeDeferred.resolve();
    await cleanupPromise;

    expect(manager.getActiveSubscriptionCount()).toBe(0);
    expect(manager.ownsSubscriptionId("remote-sub-2")).toBe(false);
  });

  it("waits for in-flight subscriptions before closing all remotes", async () => {
    const subscribeDeferred = deferred<string>();
    const adapter = {
      subscribeRemote: vi.fn().mockReturnValue(subscribeDeferred.promise),
      unsubscribeRemote: vi.fn().mockResolvedValue(undefined),
    };
    const manager = new ExtensionSubscriptionManager(adapter);

    const registrationPromise = manager.registerSubscriber(undefined);
    const closeAllPromise = manager.closeAll();

    await Promise.resolve();
    expect(adapter.unsubscribeRemote).not.toHaveBeenCalled();

    subscribeDeferred.resolve("remote-sub-3");

    await Promise.all([registrationPromise.catch(() => undefined), closeAllPromise]);

    expect(adapter.unsubscribeRemote).toHaveBeenCalledWith("remote-sub-3");
    expect(manager.getActiveSubscriptionCount()).toBe(0);
  });
});
