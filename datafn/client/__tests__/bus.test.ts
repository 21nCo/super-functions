/**
 * EventBus tests - Phase 01
 * Tests TV-BUS-001, TV-BUS-001N from TEST_VECTORS.md
 */

import { describe, it, expect, vi } from "vitest";
import { EventBus } from "../src/events/bus.js";
import type { DatafnEvent } from "@datafn/core";

describe("EventBus error isolation (BUS-001)", () => {
  it("TV-BUS-001: A throwing handler does not block subsequent handlers", () => {
    const errorHandler = vi.fn();
    const bus = new EventBus({ onError: errorHandler });

    const handlerA = vi.fn(() => {
      throw new Error("boom");
    });
    const handlerB = vi.fn();

    bus.subscribe(handlerA);
    bus.subscribe(handlerB);

    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    // Emit should not throw despite handler A throwing
    expect(() => bus.emit(event)).not.toThrow();

    // Handler A should have been called
    expect(handlerA).toHaveBeenCalledWith(event);

    // Handler B should still receive the event
    expect(handlerB).toHaveBeenCalledWith(event);

    // Error handler should have been called with the error
    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      event,
    );
  });

  it("TV-BUS-001N: Event delivery order is preserved", () => {
    const bus = new EventBus();
    const callOrder: string[] = [];

    bus.subscribe(() => callOrder.push("A"));
    bus.subscribe(() => {
      callOrder.push("B-throw");
      throw new Error("handler B error");
    });
    bus.subscribe(() => callOrder.push("C"));

    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    bus.emit(event);

    // All handlers called in order despite B throwing
    expect(callOrder).toEqual(["A", "B-throw", "C"]);
  });

  it("Custom onError callback is invoked with error and event", () => {
    const customErrorHandler = vi.fn();
    const bus = new EventBus({ onError: customErrorHandler });

    const testError = new Error("test error");
    bus.subscribe(() => {
      throw testError;
    });

    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    bus.emit(event);

    expect(customErrorHandler).toHaveBeenCalledTimes(1);
    expect(customErrorHandler).toHaveBeenCalledWith(testError, event);
  });

  it("Default error handler logs to console.error", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bus = new EventBus(); // No custom onError

    bus.subscribe(() => {
      throw new Error("test error");
    });

    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    bus.emit(event);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[datafn] Event handler error:",
      expect.objectContaining({ message: "test error" }),
      "event:",
      event,
    );

    consoleErrorSpy.mockRestore();
  });

  it("Multiple throwing handlers do not affect each other or non-throwing handlers", () => {
    const errorHandler = vi.fn();
    const bus = new EventBus({ onError: errorHandler });

    const handler1 = vi.fn(() => {
      throw new Error("error 1");
    });
    const handler2 = vi.fn();
    const handler3 = vi.fn(() => {
      throw new Error("error 2");
    });
    const handler4 = vi.fn();

    bus.subscribe(handler1);
    bus.subscribe(handler2);
    bus.subscribe(handler3);
    bus.subscribe(handler4);

    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    bus.emit(event);

    // All handlers should have been called
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(handler3).toHaveBeenCalled();
    expect(handler4).toHaveBeenCalled();

    // Error handler should have been called twice
    expect(errorHandler).toHaveBeenCalledTimes(2);
  });

  it("clear() removes all subscriptions", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.subscribe(handler);
    bus.subscribe(handler);
    bus.subscribe(handler);

    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    // First emit - all handlers called
    bus.emit(event);
    expect(handler).toHaveBeenCalledTimes(3);

    // Clear all subscriptions
    bus.clear();

    // Second emit - no handlers called
    handler.mockClear();
    bus.emit(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it("Filtered subscriptions still work with error isolation", () => {
    const errorHandler = vi.fn();
    const bus = new EventBus({ onError: errorHandler });

    const taskHandler = vi.fn(() => {
      throw new Error("task handler error");
    });
    const goalHandler = vi.fn();

    bus.subscribe(taskHandler, { resource: "task" });
    bus.subscribe(goalHandler, { resource: "goal" });

    const taskEvent: DatafnEvent = {
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      action: "merge",
      timestampMs: Date.now(),
    };

    bus.emit(taskEvent);

    // taskHandler called and threw
    expect(taskHandler).toHaveBeenCalled();
    expect(errorHandler).toHaveBeenCalledTimes(1);

    // goalHandler not called (filtered out)
    expect(goalHandler).not.toHaveBeenCalled();

    // Now emit goal event
    taskHandler.mockClear();
    errorHandler.mockClear();

    const goalEvent: DatafnEvent = {
      type: "mutation_applied",
      resource: "goal",
      ids: ["goal:1"],
      mutationId: "m-2",
      action: "merge",
      timestampMs: Date.now(),
    };

    bus.emit(goalEvent);

    // goalHandler called successfully
    expect(goalHandler).toHaveBeenCalled();
    // taskHandler not called (filtered out)
    expect(taskHandler).not.toHaveBeenCalled();
    // No errors
    expect(errorHandler).not.toHaveBeenCalled();
  });
});

describe("EventBus — unsubscribe safety during emit (CLI-005)", () => {
  const makeEvent = (): DatafnEvent => ({
    type: "mutation_applied",
    resource: "task",
    ids: ["task:1"],
    mutationId: "m-1",
    action: "merge",
    timestampMs: Date.now(),
  });

  it("handler that unsubscribes itself does not prevent subsequent handlers from firing", () => {
    const bus = new EventBus();
    const order: string[] = [];
    let unsubA: () => void;

    // Subscribe A, which unsubscribes itself during the first call
    unsubA = bus.subscribe(() => {
      order.push("A");
      unsubA();
    });
    bus.subscribe(() => order.push("B"));
    bus.subscribe(() => order.push("C"));

    bus.emit(makeEvent());
    // All three fire on the first emit (snapshot taken before iteration)
    expect(order).toEqual(["A", "B", "C"]);

    // A was unsubscribed; only B and C fire on second emit
    order.length = 0;
    bus.emit(makeEvent());
    expect(order).toEqual(["B", "C"]);
  });

  it("handler that unsubscribes a later handler still delivers to that handler in the current emit", () => {
    const bus = new EventBus();
    const called: string[] = [];
    let unsubB: () => void;

    bus.subscribe(() => {
      called.push("A");
      unsubB(); // Unsubscribes B during A's execution
    });
    unsubB = bus.subscribe(() => called.push("B"));
    bus.subscribe(() => called.push("C"));

    bus.emit(makeEvent());
    // All three fire on first emit (snapshot taken before A could unsubscribe B)
    expect(called).toEqual(["A", "B", "C"]);

    // B is now unsubscribed; second emit skips B
    called.length = 0;
    bus.emit(makeEvent());
    expect(called).toEqual(["A", "C"]);
  });

  it("subscriptions added during emit are not called in the current emit", () => {
    const bus = new EventBus();
    const called: string[] = [];

    bus.subscribe(() => {
      called.push("A");
      // Add a new handler during emit
      bus.subscribe(() => called.push("late"));
    });
    bus.subscribe(() => called.push("B"));

    bus.emit(makeEvent());
    // "late" was added after the snapshot — not called this emit
    expect(called).toEqual(["A", "B"]);

    // "late" is now registered; fires on next emit
    called.length = 0;
    bus.emit(makeEvent());
    expect(called).toContain("late");
  });
});
