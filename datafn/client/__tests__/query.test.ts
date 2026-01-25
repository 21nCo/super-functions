/**
 * Query Tests - Phase 02
 * Tests TV-QUERY-001, TV-QUERY-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnClientError } from "../src/errors.js";

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

describe("@datafn/client query", () => {
  it("TV-QUERY-001: DatafnTable.query merges resource/version and ignores overrides", async () => {
    const remoteCalls: Array<{ method: string; arg: unknown }> = [];

    const mockRemote = {
      query: vi.fn(async (q: unknown) => {
        remoteCalls.push({ method: "query", arg: q });
        return { ok: true, result: { data: [], nextCursor: null } };
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

    // Call table.query with resource/version overrides (should be ignored)
    const table = (client as any).task;
    const result = await table.query({
      resource: "goal", // Should be ignored
      version: 999, // Should be ignored
      select: ["id"],
    });

    // Verify the remote was called with correct merged query
    expect(remoteCalls).toHaveLength(1);
    expect(remoteCalls[0].method).toBe("query");
    expect(remoteCalls[0].arg).toEqual({
      resource: "task", // From table, not from query fragment
      version: 1, // From table, not from query fragment
      select: ["id"],
    });

    // Verify result is unwrapped correctly
    expect(result).toEqual({ data: [], nextCursor: null });
  });

  it("TV-QUERY-002: Remote ok:false errors become thrown DatafnClientError", async () => {
    const mockRemote = {
      query: async () => ({
        ok: false,
        error: {
          code: "DFQL_INVALID",
          message: "Invalid DFQL: resource must be string",
          details: { path: "resource" },
        },
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

    // Should throw when remote returns ok:false
    await expect(async () => {
      await table.query({ select: ["id"] });
    }).rejects.toThrow();

    try {
      await table.query({ select: ["id"] });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe("Invalid DFQL: resource must be string");
      expect(err.details).toEqual({ path: "resource" });
    }
  });

  it("client.query delegates to remote and unwraps", async () => {
    const mockRemote = {
      query: vi.fn(async () => ({
        ok: true,
        result: { data: [{ id: "task:1" }], nextCursor: null },
      })),
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

    const result = await client.query({
      resource: "task",
      version: 1,
      select: ["id"],
    });

    expect(mockRemote.query).toHaveBeenCalledWith({
      resource: "task",
      version: 1,
      select: ["id"],
    });

    expect(result).toEqual({ data: [{ id: "task:1" }], nextCursor: null });
  });
});
