/**
 * Mutation Tests - Phase 03
 * Tests TV-MUT-001, TV-MUT-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi } from "vitest";
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
  ],
};

describe("@datafn/client mutations", () => {
  it("TV-MUT-001: Successful mutation emits mutation_applied with deterministic timestamp", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 123;

    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: vi.fn(async () => ({
        ok: true,
        result: {
          ok: true,
          mutationId: "m-1",
          affectedIds: ["task:1"],
          errors: [],
          deduped: false,
        },
      })),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote,
      getTimestamp: () => mockTimestamp,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute mutation via table
    const table = (client as any).task;
    const result = await table.mutate({
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-1",
      id: "task:1",
      record: { title: "A" },
    });

    // Verify result
    expect(result).toEqual({
      ok: true,
      mutationId: "m-1",
      affectedIds: ["task:1"],
      errors: [],
      deduped: false,
    });

    // Verify mutation_applied event was emitted
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toEqual({
      type: "mutation_applied",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-1",
      clientId: "client:1",
      timestampMs: mockTimestamp,
      action: "insert", // CLIENT-EVENT-001
      fields: ["title"], // CLIENT-EVENT-001
    });
  });

  it("TV-MUT-002: Failed mutation emits mutation_rejected with error context", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 5;

    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: vi.fn(async () => ({
        ok: true,
        result: {
          ok: false,
          mutationId: "m-2",
          affectedIds: [],
          errors: [
            {
              code: "DFQL_INVALID",
              message: "Invalid DFQL: missing clientId or mutationId",
              path: "$",
            },
          ],
        },
      })),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote,
      getTimestamp: () => mockTimestamp,
    });

    // Subscribe to all events
    client.subscribe((event) => {
      observedEvents.push(event);
    });

    // Execute mutation via table
    const table = (client as any).task;
    const result = await table.mutate({
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-2",
      id: "task:1",
      record: { title: "B" },
    });

    // Verify result
    expect(result).toEqual({
      ok: false,
      mutationId: "m-2",
      affectedIds: [],
      errors: [
        {
          code: "DFQL_INVALID",
          message: "Invalid DFQL: missing clientId or mutationId",
          path: "$",
        },
      ],
    });

    // Verify mutation_rejected event was emitted
    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_rejected",
      resource: "task",
      ids: ["task:1"],
      mutationId: "m-2",
      clientId: "client:1",
      timestampMs: mockTimestamp,
      action: "merge", // CLIENT-EVENT-001
      fields: ["title"], // CLIENT-EVENT-001
    });

    // Verify the error context
    expect((observedEvents[0] as any).context).toEqual({
      code: "DFQL_INVALID",
      message: "Invalid DFQL: missing clientId or mutationId",
      path: "$",
    });
  });
});
