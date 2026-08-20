import { describe, expect, it } from "vitest";
import {
  createObservability,
  instrumentMethods,
  readObservationGroup,
} from "./index.js";

describe("superfunction observability", () => {
  it("preserves synchronous method return values", () => {
    const observability = createObservability({ service: "test-service" });
    const observed = instrumentMethods({
      target: {
        capabilitiesForTarget() {
          return { transactions: true };
        },
      },
      observability,
      kind: "db",
      component: "test.db",
    });

    const result = observed.capabilitiesForTarget();

    expect(result).toEqual({ transactions: true });
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("records async method metrics into the active request", async () => {
    const observability = createObservability({
      service: "test-service",
    });
    const target = {
      async findOne(input: { model: string }) {
        return { id: input.model };
      },
    };
    const observed = instrumentMethods({
      target,
      observability,
      kind: "db",
      component: "test.db",
      extract: ({ property, args }) => ({
        operation: String(property),
        resource: (args[0] as { model?: string }).model,
      }),
    });
    const request = observability.startRequest({
      requestId: "req_test",
      method: "GET",
      path: "/test",
    });

    await observability.runWithRequest(request, () => observed.findOne({ model: "users" }));
    const snapshot = request.finish({ status: 200 });
    const db = readObservationGroup(snapshot, "db");

    expect(snapshot.requestId).toBe("req_test");
    expect(db.count).toBe(1);
    expect(db.errorCount).toBe(0);
    expect(snapshot.metrics[0]?.component).toBe("test.db");
    expect(snapshot.metrics[0]?.resource).toBe("users");
  });

  it("shares active request state across child scopes", async () => {
    const observability = createObservability({
      service: "test-service",
    });
    const child = observability.child({ component: "child" });
    const request = observability.startRequest({
      requestId: "req_child",
      method: "POST",
      path: "/child",
    });

    await observability.runWithRequest(request, async () => {
      child.record({
        kind: "lookup",
        operation: "get",
        durationMs: 2,
        ok: true,
      });
    });

    const snapshot = request.finish({ status: 200 });
    const lookup = readObservationGroup(snapshot, "lookup");

    expect(lookup.count).toBe(1);
    expect(snapshot.metrics[0]?.component).toBe("child");
  });

  it("keeps overlapping async requests isolated by default in Node", async () => {
    const observability = createObservability({
      service: "test-service",
    });
    const firstRequest = observability.startRequest({
      requestId: "req_first",
    });
    const secondRequest = observability.startRequest({
      requestId: "req_second",
    });
    let enterSecondRequest!: () => void;
    let recordFirstMetric!: () => void;
    const secondRequestEntered = new Promise<void>((resolve) => {
      enterSecondRequest = resolve;
    });
    const firstMetricRecorded = new Promise<void>((resolve) => {
      recordFirstMetric = resolve;
    });

    await Promise.all([
      observability.runWithRequest(firstRequest, async () => {
        await secondRequestEntered;
        observability.record({
          kind: "db",
          operation: "first",
          durationMs: 1,
          ok: true,
        });
        recordFirstMetric();
      }),
      observability.runWithRequest(secondRequest, async () => {
        enterSecondRequest();
        await firstMetricRecorded;
        observability.record({
          kind: "cache",
          operation: "second",
          durationMs: 1,
          ok: true,
        });
      }),
    ]);

    const firstSnapshot = firstRequest.finish({ status: 200 });
    const secondSnapshot = secondRequest.finish({ status: 200 });

    expect(readObservationGroup(firstSnapshot, "db").count).toBe(1);
    expect(readObservationGroup(firstSnapshot, "cache").count).toBe(0);
    expect(readObservationGroup(secondSnapshot, "db").count).toBe(0);
    expect(readObservationGroup(secondSnapshot, "cache").count).toBe(1);
  });

  it("routes typed domain events through the events channel", async () => {
    type TestEvent = {
      domain: "test";
      type: "test.started";
      requestId?: string;
      metadata?: { value: number };
    };
    const events: TestEvent[] = [];
    const observability = createObservability<TestEvent>({
      service: "test-service",
      events: {
        emit: (event) => events.push(event),
      },
    });
    const request = observability.startRequest({
      requestId: "req_event",
    });

    await observability.runWithRequest(request, () =>
      request.event({
        domain: "test",
        type: "test.started",
        metadata: { value: 1 },
      })
    );

    expect(events).toEqual([
      {
        domain: "test",
        type: "test.started",
        requestId: "req_event",
        metadata: { value: 1 },
      },
    ]);
  });
});
