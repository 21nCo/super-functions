/**
 * Transaction Tests - Phase 05
 * Tests TV-TX-001, TV-TX-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";

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

describe("@datafn/client transact", () => {
  it("TV-TX-001: client.transact and table.transact delegate and unwrap", async () => {
    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: vi.fn(async () => ({
        ok: true,
        result: {
          ok: true,
          results: [
            {
              kind: "query",
              ok: true,
              result: { data: [], nextCursor: null },
            },
          ],
        },
      })),
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

    // Test client.transact
    const result1 = await client.transact({
      transactionId: "tx-1",
      atomic: true,
      steps: [],
    });

    // Verify unwrapped result
    expect(result1).toEqual({
      ok: true,
      results: [
        {
          kind: "query",
          ok: true,
          result: { data: [], nextCursor: null },
        },
      ],
    });

    // Test table.transact
    const table = (client as any).task;
    const result2 = await table.transact({
      transactionId: "tx-2",
      atomic: true,
      steps: [],
    });

    // Verify same unwrapped result
    expect(result2).toEqual({
      ok: true,
      results: [
        {
          kind: "query",
          ok: true,
          result: { data: [], nextCursor: null },
        },
      ],
    });

    // Verify remote.transact was called twice
    expect(mockRemote.transact).toHaveBeenCalledTimes(2);
  });

  it("TV-TX-002: Unexpected response shape throws TRANSPORT_ERROR", async () => {
    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: vi.fn(async () => ({
        hello: "world",
      })),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote as any,
      getTimestamp: () => 0,
    });

    // Should throw TRANSPORT_ERROR
    await expect(async () => {
      await client.transact({
        transactionId: "tx-1",
        atomic: true,
        steps: [],
      });
    }).rejects.toThrow();

    try {
      await client.transact({
        transactionId: "tx-1",
        atomic: true,
        steps: [],
      });
    } catch (error: any) {
      expect(error.code).toBe("TRANSPORT_ERROR");
      expect(error.message).toBe("Transport error: unexpected response shape");
      expect(error.details).toEqual({ path: "$" });
    }
  });
});
