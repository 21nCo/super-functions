/**
 * Event tests - Phase 05
 * Tests TV-EVENTS-001, TV-EVENTS-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnEvent } from "@datafn/core";

describe("@datafn/client events", () => {
  let fakeTime: number;
  let events: DatafnEvent[];

  beforeEach(() => {
    fakeTime = 1000000000000; // Fixed timestamp for testing
    events = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-EVENTS-001: Event emission and filtering", async () => {
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: { version: 1, resources: [] },
      remote,
      getTimestamp: () => fakeTime,
    });

    // Subscribe with filter for specific resource
    const goalEvents: DatafnEvent[] = [];
    client.subscribe(
      (event) => {
        goalEvents.push(event);
      },
      { resource: "goal" }
    );

    // Subscribe to all events
    const allEvents: DatafnEvent[] = [];
    client.subscribe((event) => {
      allEvents.push(event);
    });

    // Execute mutation
    await client.mutate({
      resource: "goal",
      version: 1,
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-1",
      id: "goal:g1",
      record: { label: "Updated" },
    });

    // Check filtered events
    expect(goalEvents).toHaveLength(1);
    expect(goalEvents[0].type).toBe("mutation_applied");
    expect(goalEvents[0].resource).toBe("goal");
    expect(goalEvents[0].ids).toEqual(["goal:g1"]);

    // Check all events
    expect(allEvents).toHaveLength(1);
  });

  it("TV-EVENTS-002: Mutation events with timestamps", async () => {
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async (m: any) => {
        if (m.id === "fail") {
          return {
            ok: true,
            result: {
              ok: false,
              errors: [{ code: "CONFLICT", message: "Conflict" }],
            },
          };
        }
        return { ok: true, result: { ok: true } };
      },
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: { resources: [] },
      remote,
      getTimestamp: () => fakeTime,
    });

    const receivedEvents: DatafnEvent[] = [];
    client.subscribe((event) => {
      receivedEvents.push(event);
    });

    // Successful mutation
    await client.mutate({
      resource: "task",
      version: 1,
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-success",
      id: "task:t1",
      record: { label: "New Task" },
    });

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toMatchObject({
      type: "mutation_applied",
      resource: "task",
      ids: ["task:t1"],
      mutationId: "m-success",
      timestampMs: fakeTime,
    });

    // Failed mutation
    await client.mutate({
      resource: "task",
      version: 1,
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-fail",
      id: "fail",
      record: { label: "Fail" },
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[1]).toMatchObject({
      type: "mutation_rejected",
      resource: "task",
      ids: ["fail"],
      mutationId: "m-fail",
      timestampMs: fakeTime,
    });
    expect((receivedEvents[1] as any).context).toBeDefined();
  });

  it("Event filtering by type", async () => {
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: { version: 1, resources: [] },
      remote,
      getTimestamp: () => fakeTime,
    });

    const appliedEvents: DatafnEvent[] = [];
    client.subscribe(
      (event) => {
        appliedEvents.push(event);
      },
      { type: "mutation_applied" }
    );

    // This should match
    await client.mutate({
      resource: "goal",
      version: 1,
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      id: "goal:g1",
      record: {},
    });

    expect(appliedEvents).toHaveLength(1);
  });

  it("Unsubscribe stops receiving events", async () => {
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: { version: 1, resources: [] },
      remote,
      getTimestamp: () => fakeTime,
    });

    const events: DatafnEvent[] = [];
    const unsubscribe = client.subscribe((event) => {
      events.push(event);
    });

    // First mutation - should receive
    await client.mutate({
      resource: "goal",
      version: 1,
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      id: "g1",
      record: {},
    });

    expect(events).toHaveLength(1);

    // Unsubscribe
    unsubscribe();

    // Second mutation - should NOT receive
    await client.mutate({
      resource: "goal",
      version: 1,
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-2",
      id: "g2",
      record: {},
    });

    expect(events).toHaveLength(1); // Still 1, not 2
  });
});
