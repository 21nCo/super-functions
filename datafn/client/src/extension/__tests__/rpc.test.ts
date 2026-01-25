import { describe, it, expect, beforeEach } from "vitest";
import { createExtensionTransport, type MessageBus } from "../transport.js";

class MockMessageBus implements MessageBus {
  public listeners: ((msg: unknown) => void)[] = [];
  public sent: unknown[] = [];

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== handler);
    };
  }

  // Helper to simulate incoming message
  receive(message: unknown) {
    this.listeners.forEach((l) => l(message));
  }
}

describe("Extension RPC", () => {
  let bus: MockMessageBus;
  let adapter: any;

  beforeEach(() => {
    bus = new MockMessageBus();
    adapter = createExtensionTransport(bus);
  });

  it("TV-DETERM-RPC-ID-001: RPC IDs are deterministic", async () => {
    // We can't await result because we don't reply. Just check sent message.
    const p1 = adapter.query({});
    const req1 = bus.sent[0] as any;
    expect(req1.id).toBe("req-1");

    const p2 = adapter.query({});
    const req2 = bus.sent[1] as any;
    expect(req2.id).toBe("req-2");
  });

  it("TV-EXT-SUB-ID-001: Event delivery includes subscriptionId", () => {
    const received: any[] = [];
    adapter.onEvent((evt: any) => received.push(evt));

    // Simulate incoming event
    const inbound = {
      type: "event",
      subscriptionId: "sub-123",
      event: { type: "mutation", data: "test" },
    };
    bus.receive(inbound);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      subscriptionId: "sub-123",
      event: { type: "mutation", data: "test" },
    });
  });

  it("TV-EXT-SUB-MULTI-001: Multiple subscriptions are distinguished", () => {
    const received: any[] = [];
    adapter.onEvent((evt: any) => received.push(evt));

    // Event 1 for sub A
    bus.receive({
      type: "event",
      subscriptionId: "sub-A",
      event: { id: 1 },
    });

    // Event 2 for sub B
    bus.receive({
      type: "event",
      subscriptionId: "sub-B",
      event: { id: 2 },
    });

    expect(received).toHaveLength(2);
    expect(received[0].subscriptionId).toBe("sub-A");
    expect(received[1].subscriptionId).toBe("sub-B");
  });
});
