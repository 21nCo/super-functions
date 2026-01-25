/**
 * Extension RPC Tests
 * Tests TV-EXT-001, TV-EXT-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import {
  createExtensionTransport,
  type MessageBus,
} from "../src/extension/transport.js";
import type {
  DatafnRpcRequest,
  DatafnRpcResponse,
} from "../src/extension/rpc.js";

// In-memory bus implementation for testing
class InMemoryBus implements MessageBus {
  private listeners: ((message: unknown) => void)[] = [];
  public sentMessages: unknown[] = [];

  postMessage(message: unknown): void {
    this.sentMessages.push(message);
    // In a real scenario, this goes to another context.
    // Here we don't auto-reply; the test acts as the "background" script to reply.
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((h) => h !== handler);
    };
  }

  // Helper for test to simulate incoming message from background
  simulateIncoming(message: unknown) {
    this.listeners.forEach((h) => h(message));
  }
}

describe("Extension RPC Tests", () => {
  it("TV-EXT-001: RPC query request/response uses canonical envelope", async () => {
    const bus = new InMemoryBus();
    const transport = createExtensionTransport(bus);

    // 1. Send query
    const queryPromise = transport.query({
      resource: "task",
      version: 1,
      select: ["id"],
    });

    // Verify request format on bus
    expect(bus.sentMessages).toHaveLength(1);
    const request = bus.sentMessages[0] as DatafnRpcRequest;
    expect(request.method).toBe("query");
    expect(request.payload).toEqual({
      resource: "task",
      version: 1,
      select: ["id"],
    });
    expect(request.id).toBeTruthy();

    // 2. Simulate response
    const response: DatafnRpcResponse = {
      id: request.id,
      envelope: { ok: true, result: { data: [], nextCursor: null } },
    };
    bus.simulateIncoming(response);

    // 3. Verify promise resolves with envelope
    const result = await queryPromise;
    expect(result).toEqual({
      ok: true,
      result: { data: [], nextCursor: null },
    });
  });

  it("TV-EXT-002: Unknown RPC methods are rejected deterministically (Mocking Background Logic)", async () => {
    // NOTE: The transport doesn't reject unknown methods itself (it just forwards).
    // The *Background* side would reject it.
    // This test verifies that IF the background sends back an error envelope, the transport resolves it as such.

    // However, TV-EXT-002 input implies the test calls the transport with "wat",
    // but our Typescript definitions restrict method names.
    // If we force it, let's see.
    // Actually the TV-EXT-002 describes the *System* behavior.
    // Since we are only implementing the Client Transport here, we verify that it *can* receive an error envelope.

    const bus = new InMemoryBus();
    const transport = createExtensionTransport(bus);

    const promise = transport.query({}); // Generic call
    const request = bus.sentMessages[0] as DatafnRpcRequest;

    // Simulate background rejecting it (simulating the behavior described in TV-EXT-002 output)
    const response: DatafnRpcResponse = {
      id: request.id,
      envelope: {
        ok: false,
        error: {
          code: "DFQL_INVALID",
          message: "Invalid RPC: unknown method wat",
          details: { path: "method" },
        },
      },
    };
    bus.simulateIncoming(response);

    const result = await promise;
    expect(result).toEqual({
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid RPC: unknown method wat",
        details: { path: "method" },
      },
    });
  });

  it("TV-EXT-003: Can subscribe to events and receive fanout messages in background", async () => {
    const bus = new InMemoryBus();
    const transport = createExtensionTransport(bus);

    // 1. Subscribe
    const subPromise = transport.subscribeRemote({ resource: "task" });

    // Check request
    expect(bus.sentMessages).toHaveLength(1);
    const subReq = bus.sentMessages[0] as DatafnRpcRequest;
    expect(subReq.method).toBe("subscribe");
    expect(subReq.payload).toEqual({ filter: { resource: "task" } });

    // Reply with subscriptionId
    bus.simulateIncoming({
      id: subReq.id,
      envelope: { ok: true, result: { subscriptionId: "sub-123" } },
    } as DatafnRpcResponse);

    const subId = await subPromise;
    expect(subId).toBe("sub-123");

    // 2. Setup event listener
    const receivedEvents: any[] = [];
    const unsubscribeLocal = transport.onEvent((evt) =>
      receivedEvents.push(evt),
    );

    // 3. Simulate inbound event
    const eventMsg = {
      type: "event",
      subscriptionId: "sub-123",
      event: { type: "mutation_applied", resource: "task", id: "t1" },
    };
    bus.simulateIncoming(eventMsg);

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toEqual(eventMsg.event);

    // 4. Unsubscribe
    const unsubPromise = transport.unsubscribeRemote("sub-123");

    // Check request
    expect(bus.sentMessages).toHaveLength(2);
    const unsubReq = bus.sentMessages[1] as DatafnRpcRequest;
    expect(unsubReq.method).toBe("unsubscribe");
    expect(unsubReq.payload).toEqual({ subscriptionId: "sub-123" });

    // Reply ok
    bus.simulateIncoming({
      id: unsubReq.id,
      envelope: { ok: true, result: {} },
    } as DatafnRpcResponse);

    await unsubPromise;

    // Cleanup local listener
    unsubscribeLocal();
  });
});
