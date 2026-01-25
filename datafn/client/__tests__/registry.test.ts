/**
 * Table Registry Tests - Phase 01
 * Tests TV-REG-001, TV-REG-002, TV-REG-003, TV-REG-004 from TEST_VECTORS.md
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
    {
      name: "goal",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: true }],
    },
  ],
};

// Stub remote adapter
const stubRemote = {
  query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
  mutation: async () => ({ ok: true, result: { ok: true } }),
  transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
  seed: async () => ({ ok: true, result: { ok: true } }),
  clone: async () => ({ ok: true, result: { ok: true } }),
  pull: async () => ({ ok: true, result: { ok: true } }),
  push: async () => ({ ok: true, result: { ok: true } }),
};

describe("@datafn/client table registry", () => {
  it("TV-REG-001: client.table(name) and client.<tableName> return same object identity", () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    // Get table via method
    const table1 = client.table("task");

    // Get table via property access
    const table2 = (client as any).task;

    // Both should have correct name and version
    expect(table1.name).toBe("task");
    expect(table1.version).toBe(1);
    expect(table2.name).toBe("task");
    expect(table2.version).toBe(1);

    // Should be same object identity
    expect(table1).toBe(table2);
  });

  it("TV-REG-002: Table handle methods exist as functions", () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    const table = (client as any).task;

    // Check all required methods exist
    expect(typeof table.query).toBe("function");
    expect(typeof table.mutate).toBe("function");
    expect(typeof table.signal).toBe("function");
    expect(typeof table.subscribe).toBe("function");
  });

  it("TV-REG-003: Unknown table via table() throws DFQL_UNKNOWN_RESOURCE", () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    expect(() => {
      client.table("nope");
    }).toThrow();

    try {
      client.table("nope");
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_UNKNOWN_RESOURCE");
      expect(err.message).toBe("Unknown resource: nope");
      expect(err.details).toEqual({ path: "resource", resource: "nope" });
    }
  });

  it("TV-REG-003: Unknown table via property access throws DFQL_UNKNOWN_RESOURCE", () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    expect(() => {
      (client as any).nope;
    }).toThrow();

    try {
      (client as any).nope;
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_UNKNOWN_RESOURCE");
      expect(err.message).toBe("Unknown resource: nope");
      expect(err.details).toEqual({ path: "resource", resource: "nope" });
    }
  });

  it("TV-REG-004: Reserved keys do not throw (Proxy safety)", () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    // Reserved keys should return undefined without throwing
    expect((client as any).then).toBeUndefined();
    expect((client as any).toJSON).toBeUndefined();
    expect((client as any).inspect).toBeUndefined();

    // Should not throw
    expect(() => (client as any).then).not.toThrow();
    expect(() => (client as any).toJSON).not.toThrow();
    expect(() => (client as any).inspect).not.toThrow();
  });

  it("Client methods remain accessible", () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      remote: stubRemote,
      getTimestamp: () => 0,
    });

    // Core methods should still exist
    expect(typeof client.table).toBe("function");
    expect(typeof client.mutate).toBe("function");
    expect(typeof client.subscribe).toBe("function");
  });
});
