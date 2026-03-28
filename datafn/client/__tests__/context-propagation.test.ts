/**
 * Phase 01 Tests - TV-CTX-001, TV-CTX-001N, TV-EVT-001, TV-EVT-001N
 * Context propagation and event payload completeness tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
import type { DatafnEvent } from "@datafn/core";

const defaultSchema = {
  resources: [
    {
      name: "node",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: false }],
    },
  ],
};

describe("Phase 01 - Context Propagation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-CTX-001: Mutation context is propagated to emitted events", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 1000;

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
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => mockTimestamp,
    });

    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const table = client.node;
    await table.mutate({
      operation: "merge",
      id: "node:1",
      record: { label: "X" },
      clientId: "client:1",
      mutationId: "m-1",
      context: { tag: "ComponentBaseLayer", pane: "left" },
    });

    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_applied",
      resource: "node",
      ids: ["node:1"],
      action: "merge",
      fields: ["label"],
      mutationId: "m-1",
      clientId: "client:1",
      context: { tag: "ComponentBaseLayer", pane: "left" },
    });
  });

  it("TV-CTX-001N: Non-serializable context is rejected", async () => {
    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
    });

    const table = client.node;

    // Test with a circular reference (non-serializable)
    const circular: any = { a: 1 };
    circular.self = circular;

    await expect(
      table.mutate({
        operation: "merge",
        id: "node:1",
        record: { label: "X" },
        clientId: "client:1",
        mutationId: "m-1",
        context: circular,
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Invalid mutation: context must be JSON-serializable",
      details: { path: "context" },
    });
  });

  it("TV-EVT-001: Mutation event includes full metadata deterministically", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 123;

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
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => mockTimestamp,
    });

    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const table = client.node;
    await table.mutate({
      operation: "merge",
      id: "node:1",
      record: { label: "X", notes: "Y" },
      clientId: "client:1",
      mutationId: "m-1",
    });

    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toEqual({
      type: "mutation_applied",
      resource: "node",
      ids: ["node:1"],
      mutationId: "m-1",
      clientId: "client:1",
      timestampMs: mockTimestamp,
      action: "merge",
      fields: ["label", "notes"],
      record: { label: "X", notes: "Y" }, // SIG-003: record included for optimistic patching
    });
  });

  it("TV-EVT-001N: Thrown transport error emits mutation_rejected with deterministic context", async () => {
    const observedEvents: DatafnEvent[] = [];
    const mockTimestamp = 5;

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { remote: "http://example.com" },
      clientId: "test-client",
      getTimestamp: () => mockTimestamp,
    });

    client.subscribe((event) => {
      observedEvents.push(event);
    });

    const table = client.node;
    await expect(
      table.mutate({
        operation: "merge",
        id: "node:1",
        record: { label: "X" },
        clientId: "client:1",
        mutationId: "m-1",
      }),
    ).rejects.toBeDefined();

    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      type: "mutation_rejected",
      resource: "node",
      ids: ["node:1"],
      mutationId: "m-1",
      clientId: "client:1",
      action: "merge",
      fields: ["label"],
      context: {
        code: "TRANSPORT_ERROR",
        message: "Network down",
        path: "$",
      },
    });
  });
});
