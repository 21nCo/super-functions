/**
 * Signal Tests - Phase 04
 * Tests TV-SIGNAL-001, TV-SIGNAL-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnEvent } from "@datafn/core";
import * as core from "@datafn/core";

// Default schema for testing
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

describe("@datafn/client signals", () => {
  it("TV-SIGNAL-001: Caching by dfqlKey, lazy fetch, auto-refresh on mutation", async () => {
    let queryCallCount = 0;
    const queryResponses = [
      { data: [{ id: "task:1" }], nextCursor: null },
      { data: [{ id: "task:2" }], nextCursor: null },
    ];

    const mockRemote = {
      query: vi.fn(async () => {
        const response = queryResponses[queryCallCount];
        queryCallCount++;
        return { ok: true, result: response };
      }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
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

    // Create two signals with equivalent queries (different key order)
    const signal1 = table.signal({
      select: ["id"],
      filters: { isArchived: false },
    });
    const signal2 = table.signal({
      filters: { isArchived: false },
      select: ["id"],
    });

    // Verify same object identity (caching)
    expect(signal1).toBe(signal2);

    // Subscribe and collect values
    const observedValues: unknown[] = [];
    signal1.subscribe((value: unknown) => {
      observedValues.push(value);
    });

    // Wait for initial fetch
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify initial value
    expect(observedValues).toHaveLength(1);
    expect(observedValues[0]).toEqual({
      data: [{ id: "task:1" }],
      nextCursor: null,
    });

    // Emit mutation_applied event (should trigger refresh)
    (client as any).subscribe((event: DatafnEvent) => {
      // Just to emit event through eventBus
    });

    // Trigger mutation to emit event
    await table.mutate({
      operation: "insert",
      mutationId: "m1",
      clientId: "client:1",
      id: "task:1",
      record: { title: "A" },
    });

    // Wait for refresh
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify refresh happened
    expect(observedValues).toHaveLength(2);
    expect(observedValues[1]).toEqual({
      data: [{ id: "task:2" }],
      nextCursor: null,
    });
  });

  it("TV-SIGNAL-002: Failed refresh doesn't notify subscribers", async () => {
    let queryCallCount = 0;

    const mockRemote = {
      query: vi.fn(async () => {
        queryCallCount++;
        if (queryCallCount === 1) {
          // First query succeeds
          return {
            ok: true,
            result: { data: [{ id: "task:1" }], nextCursor: null },
          };
        } else {
          // Refresh fails
          return {
            ok: false,
            error: {
              code: "DFQL_INVALID",
              message: "Invalid DFQL: expected object or array",
              details: { path: "$" },
            },
          };
        }
      }),
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

    const table = (client as any).task;
    const signal = table.signal({ select: ["id"] });

    const observedValues: unknown[] = [];
    signal.subscribe((value: unknown) => {
      observedValues.push(value);
    });

    // Wait for initial fetch
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify initial value
    expect(observedValues).toHaveLength(1);
    expect(observedValues[0]).toEqual({
      data: [{ id: "task:1" }],
      nextCursor: null,
    });

    // Trigger mutation to emit event and cause refresh
    await table.mutate({
      operation: "insert",
      mutationId: "m1",
      clientId: "client:1",
      id: "task:1",
      record: { title: "A" },
    });

    // Wait for potential refresh
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Verify NO new notification (refresh failed silently)
    expect(observedValues).toHaveLength(1);
    expect(observedValues[0]).toEqual({
      data: [{ id: "task:1" }],
      nextCursor: null,
    });
  });

  it("Delegates to @datafn/core.dfqlKey for cache key generation", () => {
    // Spy on core.dfqlKey
    const spy = vi.spyOn(core, "dfqlKey");

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: { query: async () => ({}) } as any,
      getTimestamp: () => 0,
    }); // Fix: Missing closing parenthesis and semicolon

    const table = (client as any).task;

    // Creating a signal should call dfqlKey
    table.signal({ select: ["id"] });

    expect(spy).toHaveBeenCalledWith({
      select: ["id"],
      resource: "task",
      version: 1,
    });
  });
});
