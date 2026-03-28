/**
 * Phase 01 Tests - TV-SIG-001, TV-SIG-001N, TV-SIG-002, TV-SIG-002N
 * Signal invalidation tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";

const testSchema = {
  resources: [
    {
      name: "node",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: false }],
    },
    {
      name: "goal",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: false }],
    },
  ],
};

describe("Phase 01 - Signal Invalidation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-SIG-001: Signals refresh selectively based on footprint", async () => {
    let queryCallCount = 0;

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async (q: any) => {
        queryCallCount++;
        return {
          ok: true,
          result: { data: [], nextCursor: null },
        };
      },
    );

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-1",
        affectedIds: ["node:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    // Create signal for node resource
    const nodeSignal = client.node.signal({ select: ["id", "label"] });

    // Subscribe to  trigger initial fetch
    const unsub = nodeSignal.subscribe(() => {});

    // Wait for initial query
    await new Promise((resolve) => setTimeout(resolve, 10));
    const initialCallCount = queryCallCount;

    // Mutate goal (unrelated resource) - should NOT refresh node signal
    await client.goal.mutate({
      operation: "insert",
      id: "goal:1",
      record: { title: "Test" },
    });

    // Wait for potential refresh
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queryCallCount).toBe(initialCallCount); // No refresh

    // Mutate node (matching resource) - SHOULD refresh node signal
    await client.node.mutate({
      operation: "insert",
      id: "node:1",
      record: { label: "Test" },
    });

    // Wait for refresh
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queryCallCount).toBe(initialCallCount + 1); // One refresh

    unsub();
  });

  it("TV-SIG-001N: Signal does not refresh for unrelated resources", async () => {
    let queryCallCount = 0;

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async (q: any) => {
        queryCallCount++;
        return {
          ok: true,
          result: { data: [], nextCursor: null },
        };
      },
    );

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-1",
        affectedIds: ["goal:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    const nodeSignal = client.node.signal({ select: ["id"] });
    const unsub = nodeSignal.subscribe(() => {});

    await new Promise((resolve) => setTimeout(resolve, 10));
    const initialCallCount = queryCallCount;

    // Mutate goal (unrelated) - should NOT refresh
    await client.goal.mutate({
      operation: "insert",
      id: "goal:1",
      record: { title: "Test" },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queryCallCount).toBe(initialCallCount); // No refresh

    unsub();
  });

  it("TV-SIG-002: Multiple matching events in same tick cause one refresh", async () => {
    let queryCallCount = 0;

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async (q: any) => {
        queryCallCount++;
        return {
          ok: true,
          result: { data: [], nextCursor: null },
        };
      },
    );

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-1",
        affectedIds: ["node:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    const nodeSignal = client.node.signal({ select: ["id"] });
    const unsub = nodeSignal.subscribe(() => {});

    await new Promise((resolve) => setTimeout(resolve, 10));
    const initialCallCount = queryCallCount;

    // Trigger multiple mutations quickly (same microtask)
    client.node.mutate({
      operation: "insert",
      id: "node:1",
      record: { label: "A" },
    });
    client.node.mutate({
      operation: "insert",
      id: "node:2",
      record: { label: "B" },
    });

    // Wait for debounced refresh (should be batched into one)
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should only refresh once due to debouncing
    expect(queryCallCount).toBe(initialCallCount + 1);

    unsub();
  });

  // RC-3 fix: sync_applied with empty resources must NOT broadcast-refresh all signals
  it("TV-SIG-003: sync_applied with empty resources does not refresh unrelated signals", async () => {
    let queryCallCount = 0;

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(async () => {
      queryCallCount++;
      return { ok: true, result: { data: [], nextCursor: null } };
    });

    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      // Returning records: {} means the sync_applied event will have resources: []
      result: { ok: true, records: {}, deleted: {}, cursors: {} },
    });

    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: { node: [] }, cursors: { node: "1" } },
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    const nodeSignal = client.node.signal({ select: ["id"] });
    const unsub = nodeSignal.subscribe(() => {});

    // Wait for initial query
    await new Promise((resolve) => setTimeout(resolve, 20));
    const countAfterInit = queryCallCount;
    expect(countAfterInit).toBeGreaterThanOrEqual(1);

    // Trigger a pull that returns no records → sync_applied with resources: []
    await (client.sync as any).pull({ clientId: "test-client", cursors: {} });

    // Wait to allow any potential debounced refresh
    await new Promise((resolve) => setTimeout(resolve, 20));

    // With the RC-3 fix, empty resources must NOT trigger a refresh
    expect(queryCallCount).toBe(countAfterInit);

    unsub();
  });

  it("TV-SIG-003N: sync_applied with matching resources still refreshes the signal", async () => {
    let queryCallCount = 0;

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(async () => {
      queryCallCount++;
      return { ok: true, result: { data: [], nextCursor: null } };
    });

    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      // "node" appears in records → sync_applied with resources: ["node"]
      result: { ok: true, records: { node: [{ id: "node:1", label: "A" }] }, deleted: {}, cursors: { node: "2" } },
    });

    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: { node: [] }, cursors: { node: "1" } },
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    const nodeSignal = client.node.signal({ select: ["id"] });
    const unsub = nodeSignal.subscribe(() => {});

    await new Promise((resolve) => setTimeout(resolve, 20));
    const countAfterInit = queryCallCount;
    expect(countAfterInit).toBeGreaterThanOrEqual(1);

    // Pull returns node records → should refresh the node signal
    await (client.sync as any).pull({ clientId: "test-client", cursors: {} });

    await new Promise((resolve) => setTimeout(resolve, 20));

    // Signal must have refreshed because "node" is in its footprint
    expect(queryCallCount).toBeGreaterThan(countAfterInit);

    unsub();
  });

  it("TV-SIG-002N: A refresh queued during in-flight fetch executes once after completion", async () => {
    let queryCallCount = 0;
    let resolveFirstQuery: any;

    vi.spyOn(DefaultHttpTransport.prototype, "query").mockImplementation(
      async (q: any) => {
        queryCallCount++;
        if (queryCallCount === 1) {
          // First query - delay to simulate in-flight
          await new Promise((resolve) => {
            resolveFirstQuery = resolve;
          });
        }
        return {
          ok: true,
          result: { data: [], nextCursor: null },
        };
      },
    );

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockResolvedValue({
      ok: true,
      result: {
        ok: true,
        mutationId: "m-1",
        affectedIds: ["node:1"],
        errors: [],
        deduped: false,
      },
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    const nodeSignal = client.node.signal({ select: ["id"] });
    const unsub = nodeSignal.subscribe(() => {});

    // Wait a bit for initial query to start
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(queryCallCount).toBe(1); // Initial fetch in progress

    // Trigger mutation while first query is in-flight
    await client.node.mutate({
      operation: "insert",
      id: "node:1",
      record: { label: "A" },
    });

    // Complete the first query
    resolveFirstQuery();

    // Wait for queued refresh to execute
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should have: 1 initial + 1 queued refresh = 2 total
    expect(queryCallCount).toBe(2);

    unsub();
  });
});
