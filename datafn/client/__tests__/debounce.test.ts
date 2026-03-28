/**
 * Debounced Mutations Tests (DEB-001)
 *
 * Tests for per-record-key mutation debouncing to reduce write amplification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnSchema } from "@datafn/core";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";

describe("Debounced Mutations (DEB-001)", () => {
  let mockRemote: any;
  let client: any;
  let storage: MemoryStorageAdapter;

  const schema: DatafnSchema = {
    version: 1,
    resources: [
      {
        name: "task",
        version: 1,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "title", type: "string" },
          { name: "status", type: "string" },
          { name: "priority", type: "number" },
        ],
      },
    ],
  };

  beforeEach(async () => {
    storage = new MemoryStorageAdapter();

    mockRemote = {
      query: vi.fn().mockResolvedValue({ ok: true, result: { data: [] } }),
      mutation: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
      transact: vi.fn().mockResolvedValue({ ok: true, results: [] }),
      seed: vi.fn().mockResolvedValue({ ok: true }),
      clone: vi.fn().mockResolvedValue({
        ok: true,
        tables: { task: { records: [], cursor: null } },
      }),
      pull: vi.fn().mockResolvedValue({
        ok: true,
        tables: { task: { records: [], cursor: null } },
      }),
      push: vi.fn().mockResolvedValue({ ok: true, acks: [] }),
      reconcile: vi.fn().mockResolvedValue({ ok: true }),
    };

    client = createDatafnClient({
      schema,
      storage,
      clientId: "test-client",
      sync: {
        mode: "sync",
        remoteAdapter: mockRemote,
        offlinability: true,
      },
    });

    // Initialize hydration state to ready for task resource
    await storage.setHydrationState("task", "hydrating");
    await storage.setHydrationState("task", "ready");
  });

  afterEach(async () => {
    if (client?.destroy) {
      await client.destroy();
    }
  });

  describe("Basic Debouncing", () => {
    it("should coalesce two merge mutations with same debounceKey into one changelog entry", async () => {
      // TV-DEB-001: Two rapid merges produce one changelog entry
      
      // First mutation
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:1",
        record: { title: "First" },
        debounceKey: "task:1",
        debounceMs: 100,
      });

      // Second mutation within debounce window
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:1",
        record: { status: "done" },
        debounceKey: "task:1",
        debounceMs: 100,
      });

      // Check storage immediately - both should be applied optimistically
      const record = await storage.getRecord("task", "task:1");
      expect(record).toMatchObject({
        id: "task:1",
        title: "First",
        status: "done",
      });

      // Wait for debounce to complete
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check changelog - should have only ONE entry
      const changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(1);
      
      // The coalesced mutation should have both fields
      const entry = changelog[0];
      expect(entry.mutation.record).toMatchObject({
        title: "First",
        status: "done",
      });
    });

    it("should update local storage immediately on each debounced call", async () => {
      // Each call should update storage optimistically
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:2",
        record: { title: "A" },
        debounceKey: "task:2",
        debounceMs: 100,
      });

      // Check storage immediately
      let record = await storage.getRecord("task", "task:2");
      expect(record?.title).toBe("A");

      // Second call
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:2",
        record: { status: "B" },
        debounceKey: "task:2",
        debounceMs: 100,
      });

      // Check storage immediately - should have both
      record = await storage.getRecord("task", "task:2");
      expect(record).toMatchObject({
        title: "A",
        status: "B",
      });
    });

    it("should emit only one mutation_applied event after debounce", async () => {
      const events: any[] = [];
      client.subscribe((event: any) => {
        if (event.type === "mutation_applied") {
          events.push(event);
        }
      });

      // Two mutations
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:3",
        record: { title: "X" },
        debounceKey: "task:3",
        debounceMs: 50,
      });

      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:3",
        record: { status: "Y" },
        debounceKey: "task:3",
        debounceMs: 50,
      });

      // No events yet
      expect(events).toHaveLength(0);

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have exactly one event
      expect(events).toHaveLength(1);
      expect(events[0].resource).toBe("task");
      expect(events[0].ids).toEqual(["task:3"]);
    });
  });

  describe("Flush Operations", () => {
    it("should flush specific debounced mutation immediately", async () => {
      // TV-DEB-001N: flush(key) forces immediate execution
      
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:4",
        record: { title: "Flush Me" },
        debounceKey: "task:4",
        debounceMs: 10000, // Very long delay
      });

      // Changelog should be empty
      let changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(0);

      // Flush immediately
      await client.flush("task:4");

      // Changelog should now have the entry
      changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(1);
      expect(changelog[0].mutation.record).toMatchObject({
        title: "Flush Me",
      });
    });

    it("should flush all pending debounced mutations", async () => {
      // Multiple debounced mutations
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:5",
        record: { title: "A" },
        debounceKey: "task:5",
        debounceMs: 10000,
      });

      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:6",
        record: { title: "B" },
        debounceKey: "task:6",
        debounceMs: 10000,
      });

      // Changelog should be empty
      let changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(0);

      // Flush all
      await client.flushAll();

      // Changelog should have both entries
      changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(2);
    });
  });

  describe("Destroy Behavior", () => {
    it("should flush all pending mutations before teardown", async () => {
      // TV-CLN-001N: Destroy flushes debounced mutations
      
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:7",
        record: { title: "Pre-Destroy" },
        debounceKey: "task:7",
        debounceMs: 10000,
      });

      // Changelog should be empty
      let changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(0);

      // Destroy client
      await client.destroy();

      // Changelog should have the entry (flushed before destroy)
      changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(1);
    });
  });

  describe("Non-Merge Operations", () => {
    it("should execute non-merge operations immediately even with debounceKey", async () => {
      // DEB-001: Only merge operations are debounced
      
      const events: any[] = [];
      client.subscribe((event: any) => {
        if (event.type === "mutation_applied") {
          events.push(event);
        }
      });

      // Insert with debounceKey should execute immediately
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:8",
        record: { id: "task:8", title: "Insert" },
        debounceKey: "task:8",
        debounceMs: 10000,
      });

      // Should have changelog entry and event immediately
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay for async operations

      const changelog = await storage.changelogList({ limit: 100 });
      expect(changelog.length).toBeGreaterThan(0);
      
      // Event should be emitted
      expect(events.length).toBeGreaterThan(0);
    });

    it("should execute delete operations immediately even with debounceKey", async () => {
      // Pre-populate a record
      await storage.upsertRecord("task", { id: "task:9", title: "To Delete" });

      await client.mutate({
        resource: "task",
        operation: "delete",
        id: "task:9",
        debounceKey: "task:9",
        debounceMs: 10000,
      });

      // Should execute immediately
      await new Promise((resolve) => setTimeout(resolve, 10));

      const changelog = await storage.changelogList({ limit: 100 });
      expect(changelog.length).toBeGreaterThan(0);
      expect(changelog[0].mutation.operation).toBe("delete");
    });
  });

  describe("Multiple Keys", () => {
    it("should debounce different keys independently", async () => {
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:10",
        record: { title: "Key1" },
        debounceKey: "task:10",
        debounceMs: 100,
      });

      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:11",
        record: { title: "Key2" },
        debounceKey: "task:11",
        debounceMs: 100,
      });

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have two changelog entries (one per key)
      const changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(2);
    });
  });

  describe("Default Debounce Delay", () => {
    it("should use default 1500ms delay when debounceMs not provided", async () => {
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:12",
        record: { title: "Default Delay" },
        debounceKey: "task:12",
        // No debounceMs provided
      });

      // Check after 100ms - should not be in changelog yet
      await new Promise((resolve) => setTimeout(resolve, 100));
      let changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(0);

      // Wait for default delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(1);
    }, 10000); // Increase test timeout
  });

  describe("Error Handling", () => {
    it("should handle changelog append failures in debounced path", async () => {
      // Create a storage adapter that fails on changelogAppend
      const failingStorage = new MemoryStorageAdapter();
      await failingStorage.setHydrationState("task", "hydrating");
      await failingStorage.setHydrationState("task", "ready");
      
      const originalAppend = failingStorage.changelogAppend.bind(failingStorage);
      let appendCallCount = 0;
      failingStorage.changelogAppend = vi.fn().mockImplementation(() => {
        appendCallCount++;
        return Promise.reject(new Error("Changelog full"));
      });

      const failingClient = createDatafnClient({
        schema,
        storage: failingStorage,
        clientId: "test-client-2",
        sync: {
          mode: "sync",
          remoteAdapter: mockRemote,
          offlinability: true,
        },
      });

      const events: any[] = [];
      failingClient.subscribe((event: any) => {
        events.push(event);
      });

      // Mutation should succeed (optimistic)
      const result = await failingClient.mutate({
        resource: "task",
        operation: "merge",
        id: "task:13",
        record: { title: "Will Fail" },
        debounceKey: "task:13",
        debounceMs: 50,
      });

      expect(result.ok).toBe(true);

      // Wait for debounce (should fail, but we catch it in the debouncer)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have a rejection event
      const rejections = events.filter(e => e.type === "mutation_rejected");
      expect(rejections.length).toBeGreaterThan(0);
      
      // Verify the append was attempted
      expect(appendCallCount).toBeGreaterThan(0);

      await failingClient.destroy();
    });
  });

  describe("Merging Behavior", () => {
    it("should properly merge multiple field updates", async () => {
      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:14",
        record: { title: "Original", priority: 1 },
        debounceKey: "task:14",
        debounceMs: 100,
      });

      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:14",
        record: { status: "inProgress" },
        debounceKey: "task:14",
        debounceMs: 100,
      });

      await client.mutate({
        resource: "task",
        operation: "merge",
        id: "task:14",
        record: { priority: 2 },
        debounceKey: "task:14",
        debounceMs: 100,
      });

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Check final state
      const record = await storage.getRecord("task", "task:14");
      expect(record).toMatchObject({
        id: "task:14",
        title: "Original",
        status: "inProgress",
        priority: 2, // Updated
      });

      // Changelog should have one entry with all fields
      const changelog = await storage.changelogList({ limit: 100 });
      expect(changelog).toHaveLength(1);
    });
  });
});
