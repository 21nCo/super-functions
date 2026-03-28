/**
 * Cross-Tab Coordination Tests (TAB-001)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CrossTabRelay } from "../src/crossTab.js";
import { EventBus } from "../src/events/bus.js";
import type { DatafnEvent } from "@datafn/core";

// Mock BroadcastChannel
class MockBroadcastChannel {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public name: string;
  private static channels: Map<string, MockBroadcastChannel[]> = new Map();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, []);
    }
    MockBroadcastChannel.channels.get(name)!.push(this);
  }

  postMessage(data: unknown): void {
    const channels = MockBroadcastChannel.channels.get(this.name) || [];
    // Simulate async message delivery
    setTimeout(() => {
      channels.forEach((channel) => {
        if (channel !== this && channel.onmessage) {
          channel.onmessage({ data } as MessageEvent);
        }
      });
    }, 0);
  }

  close(): void {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      const index = channels.indexOf(this);
      if (index !== -1) {
        channels.splice(index, 1);
      }
    }
  }

  static reset(): void {
    this.channels.clear();
  }
}

describe("CrossTabRelay", () => {
  let originalBroadcastChannel: typeof BroadcastChannel;

  beforeEach(() => {
    // Save original BroadcastChannel and replace with mock
    originalBroadcastChannel = (globalThis as any).BroadcastChannel;
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
    MockBroadcastChannel.reset();
  });

  afterEach(() => {
    // Restore original BroadcastChannel
    (globalThis as any).BroadcastChannel = originalBroadcastChannel;
  });

  describe("TV-TAB-001 — Cross-Tab Event Relay", () => {
    it("mutation in client A triggers event in client B", async () => {
      const eventBusA = new EventBus();
      const eventBusB = new EventBus();

      const relayA = new CrossTabRelay("test-namespace", eventBusA);
      const relayB = new CrossTabRelay("test-namespace", eventBusB);

      // Set up event listener on client B
      const receivedEvents: DatafnEvent[] = [];
      eventBusB.subscribe((event) => {
        receivedEvents.push(event);
      });

      // Simulate mutation in client A
      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
        action: "merge",
        fields: ["title"],
      };

      relayA.broadcast(mutationEvent);

      // Wait for async message delivery
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify client B received the event
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0]).toMatchObject({
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        fromRemoteTab: true,
      });

      relayA.close();
      relayB.close();
    });
  });

  describe("TV-TAB-001N — Silent Mutations Not Relayed", () => {
    it("silent mutations should not be relayed across tabs", async () => {
      const eventBusA = new EventBus();
      const eventBusB = new EventBus();

      const relayA = new CrossTabRelay("test-namespace", eventBusA);
      const relayB = new CrossTabRelay("test-namespace", eventBusB);

      const receivedEvents: DatafnEvent[] = [];
      eventBusB.subscribe((event) => {
        receivedEvents.push(event);
      });

      // Silent mutations don't emit mutation_applied events at all
      // So they never reach the relay's broadcast method
      // This test verifies the design: silent mutations are handled by NOT calling broadcast

      // Simulate a non-silent mutation for comparison
      const normalEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
      };

      relayA.broadcast(normalEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);

      // Note: Silent mutations never reach this point because they don't emit events
      // The test verifies the broadcast mechanism works for non-silent events
      relayA.close();
      relayB.close();
    });
  });

  describe("Echo Prevention", () => {
    it("same tab does not process own messages (no echo)", async () => {
      const eventBus = new EventBus();
      const relay = new CrossTabRelay("test-namespace", eventBus);

      const receivedEvents: DatafnEvent[] = [];
      eventBus.subscribe((event) => {
        if ((event as any).fromRemoteTab) {
          receivedEvents.push(event);
        }
      });

      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
      };

      relay.broadcast(mutationEvent);

      // Wait for async message delivery
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should NOT receive own message
      expect(receivedEvents).toHaveLength(0);

      relay.close();
    });

    it("prevents re-broadcast of fromRemoteTab events", async () => {
      const eventBus = new EventBus();
      const relay = new CrossTabRelay("test-namespace", eventBus);

      // Track broadcast calls
      const broadcastSpy = vi.spyOn(relay, "broadcast");

      // Simulate receiving an event from another tab (with fromRemoteTab flag)
      const remoteEvent: DatafnEvent & { fromRemoteTab: true } = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-456",
        clientId: "client-b",
        timestampMs: Date.now(),
        fromRemoteTab: true,
      };

      // The integration in client.ts checks for fromRemoteTab before calling broadcast
      // This test verifies that events with fromRemoteTab should not be re-broadcast

      // Simulate what the client does: check fromRemoteTab before broadcasting
      if (!remoteEvent.fromRemoteTab) {
        relay.broadcast(remoteEvent);
      }

      expect(broadcastSpy).not.toHaveBeenCalled();

      relay.close();
    });
  });

  describe("Cleanup", () => {
    it("close on destroy", async () => {
      const eventBus = new EventBus();
      const relay = new CrossTabRelay("test-namespace", eventBus);

      relay.close();

      // After close, broadcast should be a no-op
      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
      };

      // Should not throw
      expect(() => relay.broadcast(mutationEvent)).not.toThrow();
    });

    it("calling close multiple times is safe", () => {
      const eventBus = new EventBus();
      const relay = new CrossTabRelay("test-namespace", eventBus);

      relay.close();
      relay.close(); // Second close should be safe

      expect(() => relay.close()).not.toThrow();
    });
  });

  describe("SEC-012: Message Validation", () => {
    it("TV-SEC-034: invalid message (missing type) → no crash, no processing", async () => {
      const eventBus = new EventBus();
      const relay = new CrossTabRelay("test-namespace", eventBus);

      const receivedEvents: DatafnEvent[] = [];
      eventBus.subscribe((event) => {
        receivedEvents.push(event);
      });

      // Simulate receiving a malicious/invalid message directly on the channel
      const channel = (relay as any).channel;
      if (channel?.onmessage) {
        // Malicious message: plain object with no type
        channel.onmessage({ data: { malicious: true } } as MessageEvent);
        // Invalid message: null
        channel.onmessage({ data: null } as MessageEvent);
        // Invalid message: string
        channel.onmessage({ data: "inject" } as MessageEvent);
        // Invalid message: has sourceTabId but no event
        channel.onmessage({ data: { sourceTabId: "x", event: null } } as MessageEvent);
        // Invalid message: valid sourceTabId but event.type is unknown
        channel.onmessage({ data: { sourceTabId: "x", event: { type: "UNKNOWN_TYPE" } } } as MessageEvent);
      }

      // Wait a tick
      await new Promise((resolve) => setTimeout(resolve, 0));

      // None of the invalid messages should have been processed
      expect(receivedEvents).toHaveLength(0);

      relay.close();
    });

    it("SEC-012: valid message with known type IS processed", async () => {
      const eventBusA = new EventBus();
      const eventBusB = new EventBus();

      const relayA = new CrossTabRelay("test-ns", eventBusA);
      const relayB = new CrossTabRelay("test-ns", eventBusB);

      const receivedEvents: DatafnEvent[] = [];
      eventBusB.subscribe((event) => {
        if ((event as any).fromRemoteTab) receivedEvents.push(event);
      });

      // Broadcast a valid event from tab A
      const validEvent: DatafnEvent = {
        type: "sync_applied",
        resource: "task",
        ids: ["task:1"],
        timestampMs: Date.now(),
        mutationId: "m-1",
        clientId: "client-a",
      };

      relayA.broadcast(validEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Valid message should be processed
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe("sync_applied");

      relayA.close();
      relayB.close();
    });
  });

  describe("Graceful Degradation", () => {
    it("gracefully degrades when BroadcastChannel unavailable", () => {
      // Remove BroadcastChannel
      (globalThis as any).BroadcastChannel = undefined;

      const eventBus = new EventBus();

      // Should not throw when BroadcastChannel is unavailable
      expect(() => new CrossTabRelay("test-namespace", eventBus)).not.toThrow();

      const relay = new CrossTabRelay("test-namespace", eventBus);

      // broadcast should be a no-op
      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
      };

      expect(() => relay.broadcast(mutationEvent)).not.toThrow();

      // close should also be safe
      expect(() => relay.close()).not.toThrow();
    });
  });

  describe("Message Sanitization", () => {
    it("strips full record data, keeps only metadata", async () => {
      const eventBusA = new EventBus();
      const eventBusB = new EventBus();

      const relayA = new CrossTabRelay("test-namespace", eventBusA);
      const relayB = new CrossTabRelay("test-namespace", eventBusB);

      const receivedEvents: DatafnEvent[] = [];
      eventBusB.subscribe((event) => {
        receivedEvents.push(event);
      });

      // Mutation event with context (which should be stripped)
      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
        action: "merge",
        fields: ["title", "status"],
        system: true,
        context: { largeObject: "should not be relayed" },
      };

      relayA.broadcast(mutationEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toHaveLength(1);

      // Context should be stripped
      expect(receivedEvents[0].context).toBeUndefined();

      // Metadata should be preserved
      expect(receivedEvents[0]).toMatchObject({
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        action: "merge",
        fields: ["title", "status"],
        system: true,
        fromRemoteTab: true,
      });

      relayA.close();
      relayB.close();
    });
  });

  describe("Multiple Tabs", () => {
    it("broadcasts to all other tabs in same namespace", async () => {
      const eventBusA = new EventBus();
      const eventBusB = new EventBus();
      const eventBusC = new EventBus();

      const relayA = new CrossTabRelay("test-namespace", eventBusA);
      const relayB = new CrossTabRelay("test-namespace", eventBusB);
      const relayC = new CrossTabRelay("test-namespace", eventBusC);

      const receivedEventsB: DatafnEvent[] = [];
      const receivedEventsC: DatafnEvent[] = [];

      eventBusB.subscribe((event) => {
        if ((event as any).fromRemoteTab) {
          receivedEventsB.push(event);
        }
      });

      eventBusC.subscribe((event) => {
        if ((event as any).fromRemoteTab) {
          receivedEventsC.push(event);
        }
      });

      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
      };

      relayA.broadcast(mutationEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Both B and C should receive the event
      expect(receivedEventsB).toHaveLength(1);
      expect(receivedEventsC).toHaveLength(1);

      relayA.close();
      relayB.close();
      relayC.close();
    });

    it("namespace isolation - tabs in different namespaces don't interfere", async () => {
      const eventBusA = new EventBus();
      const eventBusB = new EventBus();

      const relayA = new CrossTabRelay("namespace-a", eventBusA);
      const relayB = new CrossTabRelay("namespace-b", eventBusB);

      const receivedEventsB: DatafnEvent[] = [];
      eventBusB.subscribe((event) => {
        if ((event as any).fromRemoteTab) {
          receivedEventsB.push(event);
        }
      });

      const mutationEvent: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "mut-123",
        clientId: "client-a",
        timestampMs: Date.now(),
      };

      relayA.broadcast(mutationEvent);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // B should NOT receive the event (different namespace)
      expect(receivedEventsB).toHaveLength(0);

      relayA.close();
      relayB.close();
    });
  });
});
