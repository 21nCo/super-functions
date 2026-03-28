/**
 * Sync Apply Tests
 * Tests TV-CLIENT-SYNC-APPLY-001, TV-CLIENT-SYNC-APPLY-002, TV-HYDRATION-001, TV-HYDRATION-002 from TEST_VECTORS.md
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnClient } from "../src/index.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
import { applyPullResult } from "../src/sync/apply.js";
import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
} from "../src/index.js";

// Mock storage adapter for testing
class MockStorageAdapter implements DatafnStorageAdapter {
  private records = new Map<string, Map<string, Record<string, unknown>>>();
  private cursors = new Map<string, string>();
  private hydrationStates = new Map<string, DatafnHydrationState>();
  private changelog: Array<any> = [];
  public calls: Array<{
    op: string;
    resource?: string;
    state?: string;
    [key: string]: any;
  }> = [];
  public recordCalls: boolean = false;

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

  async mergeRecord(
    resource: string,
    id: string,
    partial: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.records.has(resource)) {
      this.records.set(resource, new Map());
    }
    const existing = this.records.get(resource)!.get(id) || {};
    const merged = { ...existing, ...partial, id };
    this.records.get(resource)!.set(id, merged);
    return merged;
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
    // Validate state
    if (state !== "notStarted" && state !== "hydrating" && state !== "ready") {
      throw {
        code: "INTERNAL",
        message: "Storage error: invalid hydration state",
        details: { path: "storage.setHydrationState.state" },
      };
    }

    this.hydrationStates.set(resource, state);

    // Record calls if tracking enabled
    if (this.recordCalls) {
      this.calls.push({ op: "setHydrationState", resource, state });
    }
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

  async changelogAppend(entry: any): Promise<any> {
    const seq = this.changelog.length + 1;
    const fullEntry = { ...entry, seq };
    this.changelog.push(fullEntry);
    return fullEntry;
  }

  async changelogList(options?: { limit?: number }): Promise<any[]> {
    return this.changelog;
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
}

// Test schema
const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "id", type: "string" as const, required: true },
        { name: "title", type: "string" as const, required: true },
      ],
    },
  ],
  relations: [],
};

describe("Sync Apply Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-CLIENT-SYNC-APPLY-001: Clone results are applied to local storage and cursors are updated", async () => {
    const storage = new MockStorageAdapter();
    const cloneSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "clone")
      .mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          data: { task: [{ id: "task:1", title: "A" }] },
          cursors: { task: "5" },
        },
      });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Call clone
    await client.sync.clone({ clientId: "client:1", tables: ["task"] });

    // Verify remote was called
    expect(cloneSpy).toHaveBeenCalledTimes(1);

    // Verify record was stored
    const record = await storage.getRecord("task", "task:1");
    expect(record).toEqual({ id: "task:1", title: "A" });

    // Verify per-resource cursor was set
    const cursor = await storage.getCursor("task");
    expect(cursor).toBe("5");

    // Verify global cursor was set
    const globalCursor = await storage.getCursor("__global_cursor__");
    expect(globalCursor).toBe("5");

    // Verify hydration state is ready
    const hydrationState = await storage.getHydrationState("task");
    expect(hydrationState).toBe("ready");
  });

  it("TV-CLIENT-SYNC-APPLY-002: Cursor updates are monotonic (do not move backwards)", async () => {
    const storage = new MockStorageAdapter();

    // Set initial global cursor to 10
    await storage.setCursor("__global_cursor__", "10");
    await storage.setHydrationState("task", "ready");

    const pullSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "pull")
      .mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          changes: [],
          nextCursor: "5", // Lower than existing cursor (10)
        },
      });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Call pull with lower cursor (simulated re-pull or out of order response)
    await expect(
      client.sync.pull({ clientId: "client:1", cursor: "10" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      details: { path: "nextCursor" },
    });

    // Verify remote was called
    expect(pullSpy).toHaveBeenCalledTimes(1);

    // Verify global cursor was NOT updated (stayed at 10)
    const cursor = await storage.getCursor("__global_cursor__");
    expect(cursor).toBe("10");
  });

  it("TV-HYDRATION-001: Hydration state transitions are recorded during clone application", async () => {
    const storage = new MockStorageAdapter();
    storage.recordCalls = true; // Enable call tracking

    const cloneSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "clone")
      .mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          data: { task: [] },
          cursors: { task: "0" },
        },
      });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Call clone
    await client.sync.clone({ clientId: "client:1", tables: ["task"] });

    // Verify state transitions were recorded
    const hydrationCalls = storage.calls.filter(
      (c) => c.op === "setHydrationState",
    );
    expect(hydrationCalls).toEqual([
      { op: "setHydrationState", resource: "task", state: "hydrating" },
      { op: "setHydrationState", resource: "task", state: "ready" },
    ]);
  });

  it("TV-HYDRATION-002: Invalid hydration states are rejected deterministically", async () => {
    const storage = new MockStorageAdapter();

    // Attempt to set invalid state
    await expect(
      storage.setHydrationState("task", "wat" as any),
    ).rejects.toEqual({
      code: "INTERNAL",
      message: "Storage error: invalid hydration state",
      details: { path: "storage.setHydrationState.state" },
    });
  });

  // PHASE_05 Tests

  it("TV-REL-002: Pull/clone hydrates join rows into client join stores", async () => {
    const storage = new MockStorageAdapter();
    const joinStoreData = new Map<string, Array<Record<string, unknown>>>();
    
    // Override join store methods to track calls
    storage.upsertJoinRow = vi.fn(async (relationKey: string, row: Record<string, unknown>) => {
      if (!joinStoreData.has(relationKey)) {
        joinStoreData.set(relationKey, []);
      }
      joinStoreData.get(relationKey)!.push(row);
    });

    const cloneSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "clone")
      .mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          data: {
            node: [{ id: "node:1" }],
            property: [{ id: "property:1" }],
          },
          joins: {
            join_node_properties_property: [
              { from: "node:1", to: "property:1", value: "v" },
            ],
          },
          cursors: { node: "1", property: "1" },
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "node", version: 1, fields: [] },
          { name: "property", version: 1, fields: [] },
        ],
        relations: [
          { from: "node", to: "property", type: "many-many", relation: "properties" },
        ],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Call clone
    await client.sync.clone({
      clientId: "client:1",
      tables: ["node", "property"],
    });

    // Verify join rows were applied
    expect(storage.upsertJoinRow).toHaveBeenCalledWith(
      "join_node_properties_property",
      { from: "node:1", to: "property:1", value: "v" },
    );
    expect(joinStoreData.get("join_node_properties_property")).toHaveLength(1);
  });

  // FIX-A: Merge pull tests

  it("TV-MERGE-PULL-001: applyPullResult with merged entry calls mergeRecord (not upsertRecord) preserving existing fields", async () => {
    const storage = new MockStorageAdapter();

    // Pre-populate storage with a full todo record
    await storage.upsertRecord("todo", {
      id: "todo:1",
      name: "Buy groceries",
      completed: false,
      updatedAt: 1000,
    });

    const mergeRecordSpy = vi.spyOn(storage, "mergeRecord");
    const upsertRecordSpy = vi.spyOn(storage, "upsertRecord");

    // Apply a canonical pull result with a merged entry (only partial fields)
    await applyPullResult(storage, {
      ok: true,
      records: {},
      merged: {
        todo: [{ id: "todo:1", completed: true, updatedAt: 1500 }],
      },
      deleted: {},
      cursors: { todo: "5" },
    });

    // mergeRecord must have been called for the merge delta
    expect(mergeRecordSpy).toHaveBeenCalledTimes(1);
    expect(mergeRecordSpy).toHaveBeenCalledWith(
      "todo",
      "todo:1",
      { id: "todo:1", completed: true, updatedAt: 1500 },
    );

    // upsertRecord should NOT have been called for the merge entry
    // (it may be called zero times or from initial setup, but not for merge entry)
    const upsertCallsAfterApply = upsertRecordSpy.mock.calls.filter(
      ([res, rec]) => rec.id === "todo:1" && rec.completed === true,
    );
    expect(upsertCallsAfterApply).toHaveLength(0);

    // Verify that the existing field 'name' was preserved (not overwritten)
    const result = await storage.getRecord("todo", "todo:1");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Buy groceries"); // preserved
    expect(result!.completed).toBe(true); // merged
    expect(result!.updatedAt).toBe(1500); // merged
  });

  it("TV-MERGE-PULL-002: applyPullResult with records entry (insert) uses upsertRecord (full replace)", async () => {
    const storage = new MockStorageAdapter();

    const mergeRecordSpy = vi.spyOn(storage, "mergeRecord");
    const upsertRecordSpy = vi.spyOn(storage, "upsertRecord");

    // Apply a canonical pull result with records (insert/replace)
    await applyPullResult(storage, {
      ok: true,
      records: {
        todo: [{ id: "todo:1", name: "New todo", completed: false, updatedAt: 1000 }],
      },
      deleted: {},
      cursors: { todo: "3" },
    });

    // upsertRecord should have been called (not mergeRecord)
    expect(upsertRecordSpy).toHaveBeenCalledWith(
      "todo",
      { id: "todo:1", name: "New todo", completed: false, updatedAt: 1000 },
    );
    expect(mergeRecordSpy).not.toHaveBeenCalled();

    const result = await storage.getRecord("todo", "todo:1");
    expect(result).toEqual({ id: "todo:1", name: "New todo", completed: false, updatedAt: 1000 });
  });

  it("TV-MERGE-PULL-003: Per-table cursors are updated after applying merged pull result", async () => {
    const storage = new MockStorageAdapter();

    await applyPullResult(storage, {
      ok: true,
      records: {},
      merged: { todo: [{ id: "todo:1", completed: true }] },
      deleted: {},
      cursors: { todo: "7" },
    });

    const cursor = await storage.getCursor("todo");
    expect(cursor).toBe("7");
  });

  it("TV-MERGE-PULL-004: Pull with merged and records in same result applies both correctly", async () => {
    const storage = new MockStorageAdapter();

    // Pre-populate existing record for merge target
    await storage.upsertRecord("todo", {
      id: "todo:existing",
      name: "Keep me",
      completed: false,
    });

    await applyPullResult(storage, {
      ok: true,
      records: {
        todo: [{ id: "todo:new", name: "Brand new", completed: false }],
      },
      merged: {
        todo: [{ id: "todo:existing", completed: true }],
      },
      deleted: {},
      cursors: { todo: "10" },
    });

    // New record created via upsert
    const newRecord = await storage.getRecord("todo", "todo:new");
    expect(newRecord).toEqual({ id: "todo:new", name: "Brand new", completed: false });

    // Existing record merged (name preserved)
    const existingRecord = await storage.getRecord("todo", "todo:existing");
    expect(existingRecord!.name).toBe("Keep me"); // preserved
    expect(existingRecord!.completed).toBe(true); // merged
  });

  it("TV-REL-002N: Join store delta with missing store is rejected deterministically", async () => {
    const storage = new MockStorageAdapter();
    
    // Override to throw error for unknown join store
    storage.upsertJoinRow = vi.fn(async (relationKey: string) => {
      if (relationKey === "join_missing_store") {
        throw new Error("Store not found");
      }
    });

    const pullSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "pull")
      .mockResolvedValue({
        ok: true,
        result: {
          ok: true,
          records: {},
          deleted: {},
          joins: {
            join_missing_store: {
              upsert: [{ from: "a", to: "b" }],
              delete: [],
            },
          },
          cursors: {},
        },
      });

    const client = createDatafnClient({
      schema: { resources: [{ name: "task", version: 1, fields: [] }] },
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Attempt pull with missing join store
    await expect(
      client.sync.pull({ clientId: "client:1", cursors: { task: "0" } }),
    ).rejects.toThrow("Store not found: join_missing_store");
  });
});
