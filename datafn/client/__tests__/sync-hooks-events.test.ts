/**
 * Sync Hooks and Events Tests - Phase 10
 * Tests TV-HOOK-001, TV-HOOK-001N, TV-EVT-003, TV-EVT-003N
 * Implements HOOK-001 and EVT-003
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { DatafnEvent, DatafnPlugin } from "@datafn/core";
import type { DatafnStorageAdapter, DatafnHydrationState, DatafnChangelogEntry } from "../src/index.js";

// Mock storage adapter for testing
class MockStorageAdapter implements DatafnStorageAdapter {
  public records = new Map<string, Map<string, Record<string, unknown>>>();
  public changelog: Array<DatafnChangelogEntry> = [];
  public hydrationStates = new Map<string, DatafnHydrationState>();
  public cursors = new Map<string, string>();
  public joinRows = new Map<string, Array<Record<string, unknown>>>();

  async getRecord(resource: string, id: string): Promise<Record<string, unknown> | null> {
    const resourceRecords = this.records.get(resource);
    return resourceRecords?.get(id) || null;
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    const resourceRecords = this.records.get(resource);
    return resourceRecords ? Array.from(resourceRecords.values()) : [];
  }

  async upsertRecord(resource: string, record: Record<string, unknown>): Promise<void> {
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

  async setHydrationState(resource: string, state: DatafnHydrationState): Promise<void> {
    this.hydrationStates.set(resource, state);
  }

  async listJoinRows(relationKey: string): Promise<Array<Record<string, unknown>>> {
    return this.joinRows.get(relationKey) || [];
  }

  async upsertJoinRow(relationKey: string, row: Record<string, unknown>): Promise<void> {
    if (!this.joinRows.has(relationKey)) {
      this.joinRows.set(relationKey, []);
    }
    this.joinRows.get(relationKey)!.push(row);
  }

  async deleteJoinRow(relationKey: string, from: string, to: string): Promise<void> {
    const rows = this.joinRows.get(relationKey) || [];
    this.joinRows.set(
      relationKey,
      rows.filter((r) => r.from !== from || r.to !== to),
    );
  }

  async findRecords(resource: string, field: string, value: unknown): Promise<Record<string, unknown>[]> {
    const resourceRecords = this.records.get(resource);
    if (!resourceRecords) return [];
    return Array.from(resourceRecords.values()).filter((r) => r[field] === value);
  }

  async countRecords(resource: string): Promise<number> {
    return this.records.get(resource)?.size || 0;
  }

  async countJoinRows(relationKey: string): Promise<number> {
    return this.joinRows.get(relationKey)?.length || 0;
  }

  async changelogAppend(entry: Omit<DatafnChangelogEntry, "seq">): Promise<DatafnChangelogEntry> {
    const seq = this.changelog.length + 1;
    const fullEntry = { ...entry, seq };
    this.changelog.push(fullEntry);
    return fullEntry;
  }

  async changelogList(params?: { limit?: number; throughSeq?: number }): Promise<DatafnChangelogEntry[]> {
    const limit = params?.limit || 100;
    const throughSeq = params?.throughSeq;

    let filtered = this.changelog;
    if (throughSeq !== undefined) {
      filtered = filtered.filter((e) => e.seq <= throughSeq);
    }
    return filtered.slice(0, limit);
  }

  async changelogAck(params: { throughSeq: number }): Promise<void> {
    this.changelog = this.changelog.filter((e) => e.seq > params.throughSeq);
  }

  async clear(): Promise<void> {
    this.records.clear();
    this.changelog = [];
    this.hydrationStates.clear();
    this.cursors.clear();
    this.joinRows.clear();
  }
}

describe("@datafn/client sync hooks and events (Phase 10)", () => {
  let fakeTime: number;
  let storage: MockStorageAdapter;

  beforeEach(() => {
    fakeTime = 1000000000000;
    storage = new MockStorageAdapter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TV-HOOK-001: beforeSync/afterSync hooks run with correct phase", () => {
    it("should run beforeSync and afterSync hooks for pull phase", async () => {
      const beforeSyncCalls: any[] = [];
      const afterSyncCalls: any[] = [];

      const testPlugin: DatafnPlugin = {
        name: "test-plugin",
        runsOn: ["client"],
        beforeSync: (ctx, phase, payload) => {
          beforeSyncCalls.push({ phase, payload });
          return payload; // No transformation
        },
        afterSync: (ctx, phase, payload, result) => {
          afterSyncCalls.push({ phase, payload, result });
        },
      };

      // Mock remote adapter
      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({
          ok: true,
          result: { ok: true, data: { node: [] }, cursors: { node: "0" } },
        }),
        pull: vi.fn().mockResolvedValue({
          ok: true,
          result: { ok: true, records: { node: [] }, deleted: {}, cursors: { node: "1" } },
        }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, applied: [], cursor: "0" } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        plugins: [testPlugin],
        getTimestamp: () => fakeTime,
      });

      // Execute pull
      await client.sync.pull({ clientId: "client:1", cursors: { node: "0" } });

      // Verify beforeSync was called
      expect(beforeSyncCalls).toHaveLength(1);
      expect(beforeSyncCalls[0].phase).toBe("pull");
      expect(beforeSyncCalls[0].payload).toEqual({ clientId: "client:1", cursors: { node: "0" } });

      // Verify afterSync was called
      expect(afterSyncCalls).toHaveLength(1);
      expect(afterSyncCalls[0].phase).toBe("pull");
      expect(afterSyncCalls[0].result.ok).toBe(true);
    });

    it("should run hooks for clone phase", async () => {
      const beforeSyncCalls: any[] = [];
      const afterSyncCalls: any[] = [];

      const testPlugin: DatafnPlugin = {
        name: "test-plugin",
        runsOn: ["client"],
        beforeSync: (ctx, phase, payload) => {
          beforeSyncCalls.push({ phase, payload });
          return payload;
        },
        afterSync: (ctx, phase, payload, result) => {
          afterSyncCalls.push({ phase, payload, result });
        },
      };

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({
          ok: true,
          result: { ok: true, data: { node: [] }, cursors: { node: "0" } },
        }),
        pull: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        plugins: [testPlugin],
        getTimestamp: () => fakeTime,
      });

      await client.sync.clone({ clientId: "client:1", tables: ["node"] });

      expect(beforeSyncCalls).toHaveLength(1);
      expect(beforeSyncCalls[0].phase).toBe("clone");

      expect(afterSyncCalls).toHaveLength(1);
      expect(afterSyncCalls[0].phase).toBe("clone");
    });

    it("should run hooks for push phase", async () => {
      const beforeSyncCalls: any[] = [];
      const afterSyncCalls: any[] = [];

      const testPlugin: DatafnPlugin = {
        name: "test-plugin",
        runsOn: ["client"],
        beforeSync: (ctx, phase, payload) => {
          beforeSyncCalls.push({ phase, payload });
          return payload;
        },
        afterSync: (ctx, phase, payload, result) => {
          afterSyncCalls.push({ phase, payload, result });
        },
      };

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        pull: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true, applied: [], cursor: "1" } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        plugins: [testPlugin],
        getTimestamp: () => fakeTime,
      });

      await client.sync.push({ clientId: "client:1", mutations: [] });

      expect(beforeSyncCalls).toHaveLength(1);
      expect(beforeSyncCalls[0].phase).toBe("push");

      expect(afterSyncCalls).toHaveLength(1);
      expect(afterSyncCalls[0].phase).toBe("push");
    });
  });

  describe("TV-HOOK-001N: beforeSync failure is fail-closed", () => {
    it("should stop execution and throw error when beforeSync hook fails", async () => {
      const testPlugin: DatafnPlugin = {
        name: "failing-plugin",
        runsOn: ["client"],
        beforeSync: () => {
          throw { code: "INTERNAL", message: "Plugin error" };
        },
      };

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        pull: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        plugins: [testPlugin],
        getTimestamp: () => fakeTime,
      });

      // beforeSync should throw and prevent remote call
      await expect(client.sync.pull({ clientId: "client:1", cursors: { node: "0" } })).rejects.toMatchObject({
        code: "INTERNAL",
        message: "Plugin error",
        details: {
          path: "plugins.failing-plugin.beforeSync",
        },
      });

      // Verify remote was never called due to beforeSync failure
      expect(mockRemote.pull).not.toHaveBeenCalled();
    });
  });

  describe("TV-EVT-003: sync_applied emitted with phase context", () => {
    it("should emit sync_applied event with phase: pull", async () => {
      const events: DatafnEvent[] = [];

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        pull: vi.fn().mockResolvedValue({
          ok: true,
          result: { ok: true, records: { node: [] }, deleted: {}, cursors: { node: "1" } },
        }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        getTimestamp: () => fakeTime,
      });

      client.subscribe((event) => {
        if (event.type === "sync_applied" || event.type === "sync_failed") {
          events.push(event);
        }
      });

      await client.sync.pull({ clientId: "client:1", cursors: { node: "0" } });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("sync_applied");
      expect((events[0].context as any).phase).toBe("pull");
      expect(events[0].timestampMs).toBe(fakeTime);
    });

    it("should emit sync_applied event with phase: clone", async () => {
      const events: DatafnEvent[] = [];

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({
          ok: true,
          result: { ok: true, data: { node: [] }, cursors: { node: "0" } },
        }),
        pull: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        getTimestamp: () => fakeTime,
      });

      client.subscribe((event) => {
        if (event.type === "sync_applied" || event.type === "sync_failed") {
          events.push(event);
        }
      });

      await client.sync.clone({ clientId: "client:1", tables: ["node"] });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("sync_applied");
      expect((events[0].context as any).phase).toBe("clone");
    });
  });

  describe("TV-EVT-003N: sync_failed emitted with error context", () => {
    it("should emit sync_failed event when pull fails", async () => {
      const events: DatafnEvent[] = [];

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        pull: vi.fn().mockRejectedValue(new Error("Network down")),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [{ name: "node", version: 1, fields: [] }],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        getTimestamp: () => fakeTime,
      });

      client.subscribe((event) => {
        if (event.type === "sync_applied" || event.type === "sync_failed") {
          events.push(event);
        }
      });

      await expect(client.sync.pull({ clientId: "client:1", cursors: { node: "0" } })).rejects.toThrow();

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("sync_failed");
      expect((events[0].context as any).phase).toBe("pull");
      expect((events[0].context as any).error).toBeDefined();
    });
  });

  describe("Event context determinism (EVT-003)", () => {
    it("should emit sync_applied with stable key ordering for clone", async () => {
      const events: DatafnEvent[] = [];

      const mockRemote = {
        query: vi.fn().mockResolvedValue({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        transact: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        seed: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        clone: vi.fn().mockResolvedValue({
          ok: true,
          result: {
            ok: true,
            data: { zebra: [], apple: [], banana: [] },
            cursors: { zebra: "1", apple: "2", banana: "3" },
          },
        }),
        pull: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
        push: vi.fn().mockResolvedValue({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema: {
          resources: [
            { name: "zebra", version: 1, fields: [] },
            { name: "apple", version: 1, fields: [] },
            { name: "banana", version: 1, fields: [] },
          ],
        },
        sync: { remoteAdapter: mockRemote, offlinability: true },
        clientId: "client:1",
        storage,
        getTimestamp: () => fakeTime,
      });

      client.subscribe((event) => {
        if (event.type === "sync_applied") {
          events.push(event);
        }
      });

      await client.sync.clone({ clientId: "client:1", tables: ["zebra", "apple", "banana"] });

      expect(events).toHaveLength(1);
      const context = events[0].context as any;
      expect(context.phase).toBe("clone");
      // Verify resources are sorted
      expect(context.resources).toEqual(["apple", "banana", "zebra"]);
    });
  });
});
