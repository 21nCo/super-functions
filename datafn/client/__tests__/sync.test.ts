/**
 * Sync Facade Tests - Phase 04
 * Tests TV-SYNC-001, TV-SYNC-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
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
  ],
};

describe("@datafn/client sync", () => {
  it("TV-SYNC-001: Sync methods delegate and unwrap", async () => {
    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
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

    const results: unknown[] = [];

    // Call all sync methods
    results.push(await client.sync.seed({ clientId: "client:1" }));
    results.push(await client.sync.clone({ clientId: "client:1" }));
    results.push(await client.sync.pull({ clientId: "client:1" }));
    results.push(await client.sync.push({ clientId: "client:1" }));

    // Verify all returned unwrapped results
    expect(results).toHaveLength(4);
    results.forEach((result) => {
      expect(result).toEqual({ ok: true });
    });
  });

  it("TV-SYNC-002: Missing remote method throws TRANSPORT_ERROR", async () => {
    const mockRemote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
      // seed is missing
      clone: async () => ({ ok: true, result: { ok: true } }),
      pull: async () => ({ ok: true, result: { ok: true } }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: defaultSchema,
      remote: mockRemote as any,
      getTimestamp: () => 0,
    });

    // Should throw when calling missing method
    await expect(async () => {
      await client.sync.seed({ clientId: "client:1" });
    }).rejects.toThrow();

    try {
      await client.sync.seed({ clientId: "client:1" });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("TRANSPORT_ERROR");
      expect(err.message).toBe("Transport error: remote method missing: seed");
      expect(err.details).toEqual({ path: "sync.seed" });
    }
  });
});
