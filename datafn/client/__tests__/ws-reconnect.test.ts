/**
 * WebSocket Reconnection Tests - Phase 07
 * Tests WS-001: WebSocket reconnection with exponential backoff and jitter
 * Tests TV-WS-001, TV-WS-001N
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../src/index.js";

// Mock WebSocket with manual control over lifecycle
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: () => void = () => {};
  onmessage: (event: { data: string }) => void = () => {};
  onclose: () => void = () => {};
  onerror: (e: any) => void = () => {};
  send = vi.fn();
  close = vi.fn(() => {
    // Simulate close event when close() is called
    setTimeout(() => this.onclose(), 0);
  });

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    // Auto-trigger onopen after a delay to simulate real WebSocket behavior
    setTimeout(() => this.onopen(), 0);
  }

  // Manual trigger for testing
  triggerOpen() {
    this.onopen();
  }

  triggerClose() {
    this.onclose();
  }

  triggerError(error: any) {
    this.onerror(error);
  }
}

// Mock storage adapter for testing
class MockStorageAdapter implements DatafnStorageAdapter {
  public records = new Map<string, Map<string, Record<string, unknown>>>();
  public changelog: Array<DatafnChangelogEntry> = [];
  public hydrationStates = new Map<string, DatafnHydrationState>();
  public cursors = new Map<string, string>();

  async getRecord(
    resource: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const resourceRecords = this.records.get(resource);
    return resourceRecords?.get(id) || null;
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    const resourceRecords = this.records.get(resource);
    return resourceRecords ? Array.from(resourceRecords.values()) : [];
  }

  async upsertRecord(
    resource: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    if (!this.records.has(resource)) {
      this.records.set(resource, new Map());
    }
    this.records.get(resource)!.set(record.id as string, record);
  }

  async deleteRecord(resource: string, id: string): Promise<void> {
    this.records.get(resource)?.delete(id);
  }

  async getCursor(resource: string): Promise<string | null> {
    return this.cursors.get(resource) || null;
  }
  async setCursor(resource: string, cursor: string): Promise<void> {
    this.cursors.set(resource, cursor);
  }
  async getHydrationState(resource: string): Promise<DatafnHydrationState> {
    return this.hydrationStates.get(resource) || "notStarted";
  }
  async setHydrationState(
    resource: string,
    state: DatafnHydrationState,
  ): Promise<void> {
    this.hydrationStates.set(resource, state);
  }

  async listJoinRows(
    relationKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [];
  }
  async upsertJoinRow(
    relationKey: string,
    row: Record<string, unknown>,
  ): Promise<void> {}
  async deleteJoinRow(
    relationKey: string,
    from: string,
    to: string,
  ): Promise<void> {}

  async changelogAppend(
    entry: Omit<DatafnChangelogEntry, "seq">,
  ): Promise<DatafnChangelogEntry> {
    const seq = this.changelog.length + 1;
    const fullEntry = { ...entry, seq };
    this.changelog.push(fullEntry);
    return fullEntry;
  }

  async changelogList(options?: {
    limit?: number;
  }): Promise<DatafnChangelogEntry[]> {
    return options?.limit
      ? this.changelog.slice(0, options.limit)
      : this.changelog;
  }

  async changelogAck(options: { throughSeq: number }): Promise<void> {
    this.changelog = this.changelog.filter((e) => e.seq > options.throughSeq);
  }

  async getJoinRows(
    relationKey: string,
    fromId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async setJoinRows(
    relationKey: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {}

  async findRecords(
    resource: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]> {
    const records = await this.listRecords(resource);
    return records.filter((r) => r[field] === value);
  }

  async countRecords(resource: string): Promise<number> {
    return (await this.listRecords(resource)).length;
  }

  async countJoinRows(relationKey: string): Promise<number> {
    return (await this.listJoinRows(relationKey)).length;
  }
}

// Default schema for testing
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "user",
      version: 1,
      fields: [{ name: "name", type: "string" as const, required: true }],
    },
  ],
};

describe("WebSocket Reconnection (Phase 07)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("TV-WS-001: WebSocket reconnects automatically after disconnection", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");
    await storage.setHydrationState("user", "ready");
    await storage.setCursor("task", "5");
    await storage.setCursor("user", "3");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const events: any[] = [];
    
    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          enabled: true,
          baseDelayMs: 1000,
          multiplier: 2,
          maxDelayMs: 60000,
          jitterMs: 500,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 12345,
    });

    // Capture events
    client.subscribe((event) => {
      events.push(event);
    });

    await client.sync.start();

    // Wait for WebSocket to be created
    await vi.runAllTimersAsync();
    expect(MockWebSocket.instances.length).toBe(1);

    const ws1 = MockWebSocket.instances[0];

    // Check that ws_connected event was emitted (triggerOpen happens automatically in constructor)
    const connectedEvent = events.find(e => e.type === "ws_connected");
    expect(connectedEvent).toBeDefined();
    expect(connectedEvent?.timestampMs).toBe(12345);

    // Check that hello was sent with current cursors (includes kv resource automatically)
    expect(ws1.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "hello",
        clientId: "test-client",
        cursors: {
          task: "5",
          user: "3",
          kv: "0",
          __datafn_actor_feed__: "0",
        },
      })
    );

    // Simulate disconnection
    ws1.triggerClose();
    
    // Let the close event fire
    await vi.advanceTimersByTimeAsync(10);

    // Check that ws_disconnected event was emitted
    const disconnectedEvent = events.find(e => e.type === "ws_disconnected");
    expect(disconnectedEvent).toBeDefined();
    expect(disconnectedEvent?.timestampMs).toBe(12345);

    // Advance time to trigger first reconnection attempt (~1000ms + jitter up to 500ms)
    // The new WebSocket will auto-trigger onopen after creation
    await vi.advanceTimersByTimeAsync(1500);

    // Check that a new WebSocket was created (reconnection attempt)
    expect(MockWebSocket.instances.length).toBe(2);

    const ws2 = MockWebSocket.instances[1];

    // The MockWebSocket auto-triggers onopen, so wait for it to process
    await vi.advanceTimersByTimeAsync(10);

    // Check that hello was re-sent with current cursors (includes kv resource automatically)
    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "hello",
        clientId: "test-client",
        cursors: {
          task: "5",
          user: "3",
          kv: "0",
          __datafn_actor_feed__: "0",
        },
      })
    );

    // Check that another ws_connected event was emitted
    const reconnectedEvents = events.filter(e => e.type === "ws_connected");
    expect(reconnectedEvents.length).toBe(2);

    client.sync.stop();
  });

  it("Reconnection backoff delay increases on successive failures", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");
    await storage.setHydrationState("user", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          enabled: true,
          baseDelayMs: 100,
          multiplier: 2,
          maxDelayMs: 10000,
          jitterMs: 0, // No jitter for predictable testing
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate initial connection and close
    const ws1 = MockWebSocket.instances[0];
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // First reconnection attempt should be after ~100ms (baseDelayMs * 2^0)
    await vi.advanceTimersByTimeAsync(120); // 100ms + margin
    expect(MockWebSocket.instances.length).toBe(2); // New attempt created
    await vi.advanceTimersByTimeAsync(10); // Let auto-onopen fire

    // Close again immediately
    const ws2 = MockWebSocket.instances[1];
    ws2.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Second reconnection attempt should be after ~200ms (baseDelayMs * 2^1)
    await vi.advanceTimersByTimeAsync(220); // 200ms + margin
    expect(MockWebSocket.instances.length).toBe(3); // New attempt created
    await vi.advanceTimersByTimeAsync(10); // Let auto-onopen fire

    // Close again
    const ws3 = MockWebSocket.instances[2];
    ws3.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Third reconnection attempt should be after ~400ms (baseDelayMs * 2^2)
    await vi.advanceTimersByTimeAsync(420); // 400ms + margin
    expect(MockWebSocket.instances.length).toBe(4); // New attempt created

    client.sync.stop();
  });

  it("Reconnection disabled when stop() called", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          baseDelayMs: 100,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    const ws1 = MockWebSocket.instances[0];

    // Stop sync (should disable reconnection)
    client.sync.stop();

    // Simulate close after stop
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Advance time past reconnection delay
    await vi.advanceTimersByTimeAsync(500);

    // No new WebSocket should be created
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("Hello re-sent with cursors after reconnect", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");
    await storage.setHydrationState("user", "ready");
    await storage.setCursor("task", "10");
    await storage.setCursor("user", "7");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          baseDelayMs: 100,
          jitterMs: 0,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    const ws1 = MockWebSocket.instances[0];

    // Verify initial hello (includes kv resource automatically)
    expect(ws1.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "hello",
        clientId: "test-client",
        cursors: {
          task: "10",
          user: "7",
          kv: "0",
          __datafn_actor_feed__: "0",
        },
      })
    );

    ws1.send.mockClear();

    // Close and wait for reconnection
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire
    await vi.advanceTimersByTimeAsync(150);

    expect(MockWebSocket.instances.length).toBe(2);

    const ws2 = MockWebSocket.instances[1];
    ws2.triggerOpen();
    await vi.advanceTimersByTimeAsync(10); // Let open event process

    // Verify hello was re-sent with current cursors (includes kv resource automatically)
    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "hello",
        clientId: "test-client",
        cursors: {
          task: "10",
          user: "7",
          kv: "0",
          __datafn_actor_feed__: "0",
        },
      })
    );

    client.sync.stop();
  });

  it("ws_disconnected and ws_connected events emitted", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const events: any[] = [];

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          baseDelayMs: 100,
          jitterMs: 0,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => Date.now(),
    });

    client.subscribe((event) => {
      if (event.type === "ws_connected" || event.type === "ws_disconnected") {
        events.push(event);
      }
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    const ws1 = MockWebSocket.instances[0];

    // Should have ws_connected event
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("ws_connected");

    // Close connection
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Should have ws_disconnected event
    expect(events.length).toBe(2);
    expect(events[1].type).toBe("ws_disconnected");

    // Wait for reconnection (WebSocket will auto-open after creation)
    await vi.advanceTimersByTimeAsync(150);

    const ws2 = MockWebSocket.instances[1];
    await vi.advanceTimersByTimeAsync(10); // Let auto-onopen fire

    // Should have another ws_connected event
    expect(events.length).toBe(3);
    expect(events[2].type).toBe("ws_connected");

    client.sync.stop();
  });

  it("TV-WS-001N: wsReconnect.enabled: false disables reconnection", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          enabled: false,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    expect(MockWebSocket.instances.length).toBe(1);

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Wait past typical reconnection delay
    await vi.advanceTimersByTimeAsync(2000);

    // No new WebSocket should be created
    expect(MockWebSocket.instances.length).toBe(1);

    client.sync.stop();
  });

  it("Backoff resets on successful connection", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          baseDelayMs: 100,
          multiplier: 2,
          jitterMs: 0,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // First reconnection after ~100ms
    await vi.advanceTimersByTimeAsync(150);
    expect(MockWebSocket.instances.length).toBe(2);

    const ws2 = MockWebSocket.instances[1];
    ws2.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Second reconnection after ~200ms (backoff increased)
    await vi.advanceTimersByTimeAsync(250);
    expect(MockWebSocket.instances.length).toBe(3);

    const ws3 = MockWebSocket.instances[2];
    // This time, successfully connect
    ws3.triggerOpen();
    await vi.advanceTimersByTimeAsync(10); // Let open event process

    // Now close again
    ws3.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Next reconnection should be after ~100ms again (backoff reset)
    await vi.advanceTimersByTimeAsync(150);
    expect(MockWebSocket.instances.length).toBe(4);

    client.sync.stop();
  });

  it("Reconnection timer cleared on stop", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          baseDelayMs: 100,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Stop immediately after close (while reconnection timer is scheduled)
    client.sync.stop();

    // Advance time past reconnection delay
    await vi.advanceTimersByTimeAsync(500);

    // No new WebSocket should be created (timer was cleared)
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("Max delay cap is respected", async () => {
    const storage = new MockStorageAdapter();
    await storage.setHydrationState("task", "ready");

    // Mock HTTP transport methods
    vi.spyOn(DefaultHttpTransport.prototype, "clone").mockResolvedValue({
      ok: true,
      result: { ok: true, data: {}, cursors: {} },
    });
    vi.spyOn(DefaultHttpTransport.prototype, "pull").mockResolvedValue({
      ok: true,
      result: { ok: true, records: {}, cursors: {} },
    });

    const client = createDatafnClient({
      schema: defaultSchema,
      sync: { 
        offlinability: true,
        remote: "http://example.com",
        ws: true,
        wsReconnect: {
          baseDelayMs: 100,
          multiplier: 2,
          maxDelayMs: 250,
          jitterMs: 0,
        },
      },
      storage,
      clientId: "test-client",
      getTimestamp: () => 0,
    });

    await client.sync.start();
    await vi.runAllTimersAsync();

    const ws1 = MockWebSocket.instances[0];
    ws1.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // First: 100ms
    await vi.advanceTimersByTimeAsync(120); // 100ms + margin
    expect(MockWebSocket.instances.length).toBe(2);
    await vi.advanceTimersByTimeAsync(10); // Let auto-onopen fire

    const ws2 = MockWebSocket.instances[1];
    ws2.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Second: 200ms
    await vi.advanceTimersByTimeAsync(220); // 200ms + margin
    expect(MockWebSocket.instances.length).toBe(3);
    await vi.advanceTimersByTimeAsync(10); // Let auto-onopen fire

    const ws3 = MockWebSocket.instances[2];
    ws3.triggerClose();
    await vi.advanceTimersByTimeAsync(10); // Let close event fire

    // Third: would be 400ms, but capped at 250ms
    await vi.advanceTimersByTimeAsync(270); // 250ms + margin
    expect(MockWebSocket.instances.length).toBe(4); // Now reconnected (cap verified)

    client.sync.stop();
  });
});
