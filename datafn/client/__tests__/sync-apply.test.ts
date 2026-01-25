/**
 * Sync Apply Tests
 * Tests TV-CLIENT-SYNC-APPLY-001, TV-CLIENT-SYNC-APPLY-002, TV-HYDRATION-001, TV-HYDRATION-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnClient } from "../src/index.js";
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
}

// Test schema
const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true },
        { name: "title", type: "string", required: true },
      ],
    },
  ],
  relations: [],
};

describe("Sync Apply Tests", () => {
  it("TV-CLIENT-SYNC-APPLY-001: Clone results are applied to local storage and cursors are updated", async () => {
    const storage = new MockStorageAdapter();

    let cloneCallCount = 0;
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => {
        cloneCallCount++;
        return {
          ok: true,
          result: {
            ok: true,
            data: { task: [{ id: "task:1", title: "A" }] },
            cursors: { task: "5" },
          },
        };
      },
      pull: async () => ({
        ok: true,
        result: { ok: true, records: {}, deleted: {}, cursors: {} },
      }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: testSchema,
      remote,
      clientId: "client:1",
      storage,
    });

    // Call clone
    await client.sync.clone({ clientId: "client:1", tables: ["task"] });

    // Verify remote was called
    expect(cloneCallCount).toBe(1);

    // Verify record was stored
    const record = await storage.getRecord("task", "task:1");
    expect(record).toEqual({ id: "task:1", title: "A" });

    // Verify cursor was set
    const cursor = await storage.getCursor("task");
    expect(cursor).toBe("5");

    // Verify hydration state is ready
    const hydrationState = await storage.getHydrationState("task");
    expect(hydrationState).toBe("ready");
  });

  it("TV-CLIENT-SYNC-APPLY-002: Cursor updates are monotonic (do not move backwards)", async () => {
    const storage = new MockStorageAdapter();

    // Set initial cursor to 10
    await storage.setCursor("task", "10");
    await storage.setHydrationState("task", "ready");

    let pullCallCount = 0;
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({
        ok: true,
        result: { ok: true, data: {}, cursors: {} },
      }),
      pull: async () => {
        pullCallCount++;
        return {
          ok: true,
          result: {
            ok: true,
            records: { task: [] },
            deleted: { task: [] },
            cursors: { task: "5" }, // Lower than existing cursor (10)
          },
        };
      },
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: testSchema,
      remote,
      clientId: "client:1",
      storage,
    });

    // Call pull with lower cursor
    await client.sync.pull({ clientId: "client:1", cursors: { task: "10" } });

    // Verify remote was called
    expect(pullCallCount).toBe(1);

    // Verify cursor was NOT updated (stayed at 10)
    const cursor = await storage.getCursor("task");
    expect(cursor).toBe("10");
  });

  it("TV-HYDRATION-001: Hydration state transitions are recorded during clone application", async () => {
    const storage = new MockStorageAdapter();
    storage.recordCalls = true; // Enable call tracking

    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => ({ ok: true, result: { ok: true } }),
      transact: async () => ({ ok: true, result: { ok: true } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({
        ok: true,
        result: {
          ok: true,
          data: { task: [] },
          cursors: { task: "0" },
        },
      }),
      pull: async () => ({
        ok: true,
        result: { ok: true, records: {}, deleted: {}, cursors: {} },
      }),
      push: async () => ({ ok: true, result: { ok: true } }),
    };

    const client = createDatafnClient({
      schema: testSchema,
      remote,
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
});
