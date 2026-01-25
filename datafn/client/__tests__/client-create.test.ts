/**
 * Client Creation Tests - Phase 00
 * Tests TV-CLIENT-001, TV-CLIENT-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnClientError } from "../src/errors.js";

// Stub remote adapter for testing
const stubRemote = {
  query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
  mutation: async () => ({ ok: true, result: { ok: true } }),
  transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
  seed: async () => ({ ok: true, result: { ok: true } }),
  clone: async () => ({ ok: true, result: { ok: true } }),
  pull: async () => ({ ok: true, result: { ok: true } }),
  push: async () => ({ ok: true, result: { ok: true } }),
};

describe("@datafn/client creation", () => {
  it("TV-CLIENT-001: Creating a client with a valid schema succeeds", () => {
    const schema = {
      resources: [
        {
          name: "task",
          version: 1,
          fields: [{ name: "title", type: "string" as const, required: true }],
        },
      ],
    };

    const client = createDatafnClient({
      schema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    expect(client).toBeDefined();
    expect(typeof client.mutate).toBe("function");
    expect(typeof client.subscribe).toBe("function");
  });

  it("TV-CLIENT-002: Invalid schema is rejected with SCHEMA_INVALID", () => {
    const invalidSchema = {
      relations: [],
      // missing 'resources'
    };

    expect(() => {
      createDatafnClient({
        schema: invalidSchema as any,
        remote: stubRemote,
      });
    }).toThrow();

    try {
      createDatafnClient({
        schema: invalidSchema as any,
        remote: stubRemote,
      });
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("SCHEMA_INVALID");
      expect(err.message).toBe("Invalid schema: missing resources");
      expect(err.details).toEqual({ path: "resources" });
    }
  });
});
