/**
 * WebSocket Manager Tests
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { WebSocketManager, type WebSocketClient } from "../src/ws.js";

describe("WebSocketManager", () => {
  it("should broadcast cursor to all connected clients", () => {
    const manager = new WebSocketManager();
    const client1: WebSocketClient = { send: vi.fn() };
    const client2: WebSocketClient = { send: vi.fn() };

    manager.addClient(client1, { namespace: "default" });
    manager.addClient(client2, { namespace: "default" });

    manager.broadcastCursor("100", "default");

    const payload1 = JSON.parse((client1.send as any).mock.calls[0][0]);
    const payload2 = JSON.parse((client2.send as any).mock.calls[0][0]);
    expect(payload1).toMatchObject({
      type: "cursor",
      cursor: "100",
      targeting: { mode: "namespace-broadcast", degraded: false },
    });
    expect(payload2).toMatchObject(payload1);
  });

  it("should remove client on send error", () => {
    const manager = new WebSocketManager();
    const client1: WebSocketClient = {
      send: vi.fn().mockImplementation(() => {
        throw new Error("closed");
      }),
      close: vi.fn(),
    };
    const client2: WebSocketClient = { send: vi.fn() };

    manager.addClient(client1, { namespace: "default" });
    manager.addClient(client2, { namespace: "default" });

    // First broadcast triggers error and removal
    manager.broadcastCursor("100", "default");

    expect(client1.send).toHaveBeenCalled();
    expect(client1.close).toHaveBeenCalledWith(1001, "Broadcast send failed");
    expect(client2.send).toHaveBeenCalled();

    // Reset send mocks only
    (client1.send as any).mockClear();
    (client2.send as any).mockClear();

    // Second broadcast should only go to client2
    manager.broadcastCursor("101", "default");

    expect(client1.send).not.toHaveBeenCalled();
    const payload = JSON.parse((client2.send as any).mock.calls[0][0]);
    expect(payload).toMatchObject({
      type: "cursor",
      cursor: "101",
      targeting: { mode: "namespace-broadcast", degraded: false },
    });
  });

  it("broadcast continues when close throws during failed-send cleanup", () => {
    const manager = new WebSocketManager();
    const client1: WebSocketClient = {
      send: vi.fn().mockImplementation(() => {
        throw new Error("closed");
      }),
      close: vi.fn().mockImplementation(() => {
        throw new Error("close failed");
      }),
    };
    const client2: WebSocketClient = { send: vi.fn(), close: vi.fn() };

    manager.addClient(client1, { namespace: "default" });
    manager.addClient(client2, { namespace: "default" });

    expect(() => manager.broadcastCursor("100", "default")).not.toThrow();
    expect(client2.send).toHaveBeenCalled();
  });

  it("should handle hello message (no-op for now but safe)", () => {
    const manager = new WebSocketManager();
    const client: WebSocketClient = { send: vi.fn() };
    manager.addClient(client, { namespace: "default" });

    // Should not throw
    manager.handleMessage(
      client,
      JSON.stringify({ type: "hello", clientId: "c1", cursor: "0" }),
    );
  });

  // -------------------------------------------------------------------------
  // SCA-005 — Connection limits (TV-SCA-007, TV-SCA-008)
  // -------------------------------------------------------------------------

  it("TV-SCA-007: rejects connection when global limit is reached (close code 4503)", () => {
    const manager = new WebSocketManager({ maxConnections: 2 });
    const c1: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c2: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c3: WebSocketClient = { send: vi.fn(), close: vi.fn() };

    expect(manager.addClient(c1, { namespace: "ns1" })).toBe(true);
    expect(manager.addClient(c2, { namespace: "ns2" })).toBe(true);
    // Third connection exceeds global limit
    expect(manager.addClient(c3, { namespace: "ns3" })).toBe(false);
    expect(c3.close).toHaveBeenCalledWith(4503, "Connection limit reached");

    // Existing clients are unaffected
    manager.broadcastCursor("1", "ns1");
    expect(c1.send).toHaveBeenCalled();
    manager.destroy();
  });

  it("TV-SCA-008: rejects connection when namespace limit is reached (close code 4503)", () => {
    const manager = new WebSocketManager({ maxConnectionsPerNamespace: 2 });
    const c1: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c2: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c3: WebSocketClient = { send: vi.fn(), close: vi.fn() };

    expect(manager.addClient(c1, { namespace: "tenant:1" })).toBe(true);
    expect(manager.addClient(c2, { namespace: "tenant:1" })).toBe(true);
    // Third connection for the same namespace exceeds per-namespace limit
    expect(manager.addClient(c3, { namespace: "tenant:1" })).toBe(false);
    expect(c3.close).toHaveBeenCalledWith(4503, "Namespace connection limit reached");

    // A different namespace is still allowed
    const c4: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    expect(manager.addClient(c4, { namespace: "tenant:2" })).toBe(true);
    manager.destroy();
  });

  // -------------------------------------------------------------------------
  // SCA-006 — Namespace-scoped broadcast (TV-SCA-009)
  // -------------------------------------------------------------------------

  it("TV-SCA-009: broadcast only reaches clients in the given namespace", () => {
    const manager = new WebSocketManager();

    // 10 clients in target namespace
    const targetClients: WebSocketClient[] = Array.from({ length: 10 }, () => ({
      send: vi.fn(),
    }));
    // 5 clients in other namespaces
    const otherClients: WebSocketClient[] = Array.from({ length: 5 }, () => ({
      send: vi.fn(),
    }));

    for (const c of targetClients) manager.addClient(c, { namespace: "target-ns" });
    for (let i = 0; i < otherClients.length; i++) {
      manager.addClient(otherClients[i]!, { namespace: `other-ns-${i}` });
    }

    manager.broadcastCursor("42", "target-ns");

    // All 10 target clients received the message
    for (const c of targetClients) {
      const payload = JSON.parse((c.send as any).mock.calls[0][0]);
      expect(payload).toMatchObject({
        type: "cursor",
        cursor: "42",
        targeting: { mode: "namespace-broadcast", degraded: false },
      });
    }
    // None of the other clients received it
    for (const c of otherClients) {
      expect(c.send).not.toHaveBeenCalled();
    }
    manager.destroy();
  });

  // -------------------------------------------------------------------------
  // REL-007 — Heartbeat (TV-REL-010)
  // -------------------------------------------------------------------------

  it("TV-REL-010: heartbeat closes dead connection after interval + timeout", () => {
    vi.useFakeTimers();
    try {
      const manager = new WebSocketManager({
        heartbeatIntervalMs: 100,
        heartbeatTimeoutMs: 50,
      });
      const deadClient: WebSocketClient = {
        send: vi.fn(),
        ping: vi.fn(), // has ping but never triggers handlePong
        close: vi.fn(),
      };

      manager.addClient(deadClient, { namespace: "ns1" });

      // Advance to trigger heartbeat tick
      vi.advanceTimersByTime(100);
      expect(deadClient.ping).toHaveBeenCalledTimes(1);

      // Advance past pong timeout — client still hasn't ponged
      vi.advanceTimersByTime(50);
      expect(deadClient.close).toHaveBeenCalledWith(1001, "Heartbeat timeout");

      // Client should have been removed — broadcast should not reach it
      vi.clearAllMocks();
      manager.broadcastCursor("100", "ns1");
      expect(deadClient.send).not.toHaveBeenCalled();

      manager.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("handlePong prevents heartbeat timeout from closing the client", () => {
    vi.useFakeTimers();
    try {
      const manager = new WebSocketManager({
        heartbeatIntervalMs: 100,
        heartbeatTimeoutMs: 50,
      });
      const liveClient: WebSocketClient = {
        send: vi.fn(),
        ping: vi.fn(),
        close: vi.fn(),
      };

      manager.addClient(liveClient, { namespace: "ns1" });

      // Trigger heartbeat tick
      vi.advanceTimersByTime(100);
      expect(liveClient.ping).toHaveBeenCalledTimes(1);

      // Client responds with pong before timeout
      manager.handlePong(liveClient);

      // Advance past timeout — should NOT close since pong was received
      vi.advanceTimersByTime(50);
      expect(liveClient.close).not.toHaveBeenCalled();

      // Client is still reachable
      manager.broadcastCursor("99", "ns1");
      expect(liveClient.send).toHaveBeenCalled();

      manager.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clients without ping() are skipped by heartbeat", () => {
    vi.useFakeTimers();
    try {
      const manager = new WebSocketManager({ heartbeatIntervalMs: 100, heartbeatTimeoutMs: 50 });
      const noPingClient: WebSocketClient = {
        send: vi.fn(),
        close: vi.fn(),
        // no ping() method
      };

      manager.addClient(noPingClient, { namespace: "ns1" });
      vi.advanceTimersByTime(200); // full interval + timeout
      expect(noPingClient.close).not.toHaveBeenCalled();

      manager.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // REL-009 (WS side) — close() sends 1001 to all clients
  // -------------------------------------------------------------------------

  it("close() sends WS close frame 1001 to all clients in all namespaces", () => {
    const manager = new WebSocketManager();
    const c1: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c2: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c3: WebSocketClient = { send: vi.fn(), close: vi.fn() };

    manager.addClient(c1, { namespace: "ns1" });
    manager.addClient(c2, { namespace: "ns2" });
    manager.addClient(c3, { namespace: "ns1" });

    manager.close();

    expect(c1.close).toHaveBeenCalledWith(1001, "Going Away");
    expect(c2.close).toHaveBeenCalledWith(1001, "Going Away");
    expect(c3.close).toHaveBeenCalledWith(1001, "Going Away");

    // After close, broadcast is a no-op
    vi.clearAllMocks();
    manager.broadcastCursor("1", "ns1");
    expect(c1.send).not.toHaveBeenCalled();
    expect(c3.send).not.toHaveBeenCalled();
  });

  it("close() permanently rejects later client admission", () => {
    const manager = new WebSocketManager();
    manager.fenceNamespace("ns1");
    manager.close();
    const lateClient: WebSocketClient = { send: vi.fn(), close: vi.fn() };

    expect(manager.addClient(lateClient, { namespace: "ns1" })).toBe(false);
    expect(lateClient.close).toHaveBeenCalledWith(1001, "Going Away");
    manager.broadcastCursor("1", "ns1");
    expect(lateClient.send).not.toHaveBeenCalled();
  });

  it("destroy() stops heartbeat without closing clients", () => {
    vi.useFakeTimers();
    try {
      const manager = new WebSocketManager({ heartbeatIntervalMs: 100, heartbeatTimeoutMs: 50 });
      const client: WebSocketClient = { send: vi.fn(), ping: vi.fn(), close: vi.fn() };
      manager.addClient(client, { namespace: "ns1" });

      manager.destroy();

      // Timer should be cleared — advancing does nothing
      vi.advanceTimersByTime(200);
      expect(client.ping).not.toHaveBeenCalled();
      expect(client.close).not.toHaveBeenCalled();

      // Client is still in the namespace map (destroy does not remove clients)
      manager.broadcastCursor("1", "ns1");
      expect(client.send).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
