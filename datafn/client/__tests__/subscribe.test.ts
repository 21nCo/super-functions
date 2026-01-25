/**
 * Subscription Tests - Phase 03
 * Tests TV-SUB-001, TV-SUB-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnEvent } from "@datafn/core";

// Default schema for testing
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "goal",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: true }],
    },
  ],
};

const stubRemote = {
  query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
  mutation: async () => ({ ok: true, result: { ok: true } }),
  transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
  seed: async () => ({ ok: true, result: { ok: true } }),
  clone: async () => ({ ok: true, result: { ok: true } }),
  pull: async () => ({ ok: true, result: { ok: true } }),
  push: async () => ({ ok: true, result: { ok: true } }),
};

describe("@datafn/client table subscription", () => {
  it("TV-SUB-001: table.subscribe only receives events for its own resource", async () => {
    const observedEvents: DatafnEvent[] = [];

    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m1",
          affectedIds: ["task:1"],
          errors: [],
          deduped: false,
        },
      }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote,
      getTimestamp: () => 0,
    });

    // Subscribe via task table
    const table = (client as any).task;
    table.subscribe((event: DatafnEvent) => {
      observedEvents.push(event);
    });

    // Execute mutation on task (will emit event)
    await table.mutate({
      operation: "insert",
      mutationId: "m1",
      clientId: "client:1",
      id: "task:1",
      record: { title: "A" },
    });

    // Verify task event was received
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0].resource).toBe("task");
    expect(observedEvents[0].type).toBe("mutation_applied");
  });

  it("TV-SUB-002: table.subscribe must NOT deliver other-resource events", async () => {
    const observedEvents: DatafnEvent[] = [];

    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m2",
          affectedIds: ["goal:1"],
          errors: [],
          deduped: false,
        },
      }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote,
      getTimestamp: () => 0,
    });

    // Subscribe via task table
    const taskTable = (client as any).task;
    taskTable.subscribe((event: DatafnEvent) => {
      observedEvents.push(event);
    });

    // Execute mutation on goal (should NOT be received by task subscription)
    const goalTable = (client as any).goal;
    await goalTable.mutate({
      operation: "insert",
      mutationId: "m2",
      clientId: "client:1",
      id: "goal:1",
      record: { label: "G1" },
    });

    // Verify event was NOT received (task subscription only gets task events)
    expect(observedEvents).toHaveLength(0);
  });

  it("Table subscription ignores user-provided resource filter", async () => {
    const observedEvents: DatafnEvent[] = [];

    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m3",
          affectedIds: ["task:1"],
          errors: [],
          deduped: false,
        },
      }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote,
      getTimestamp: () => 0,
    });

    // Subscribe via task table with goal resource filter (should be ignored)
    const table = (client as any).task;
    table.subscribe(
      (event: DatafnEvent) => {
        observedEvents.push(event);
      },
      { resource: "goal" } // This should be ignored
    );

    // Execute mutation on task
    await table.mutate({
      operation: "insert",
      mutationId: "m3",
      clientId: "client:1",
      id: "task:1",
      record: { title: "A" },
    });

    // Verify task event was received (filter.resource was ignored)
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0].resource).toBe("task");
  });

  it("Unsubscribe stops receiving events", async () => {
    const observedEvents: DatafnEvent[] = [];

    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m4",
          affectedIds: ["task:1"],
          errors: [],
          deduped: false,
        },
      }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote,
      getTimestamp: () => 0,
    });

    const table = (client as any).task;
    const unsubscribe = table.subscribe((event: DatafnEvent) => {
      observedEvents.push(event);
    });

    // Mutation before unsubscribe
    await table.mutate({
      operation: "insert",
      mutationId: "m4",
      clientId: "client:1",
      id: "task:1",
      record: { title: "A" },
    });

    expect(observedEvents).toHaveLength(1);

    // Unsubscribe
    unsubscribe();

    // Mutation after unsubscribe
    await table.mutate({
      operation: "insert",
      mutationId: "m5",
      clientId: "client:1",
      id: "task:2",
      record: { title: "B" },
    });

    // Should still be 1 (not 2)
    expect(observedEvents).toHaveLength(1);
  });
});
