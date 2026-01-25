/**
 * Offline Mutation Tests
 * Tests TV-OFFLINE-MUT-001, TV-OFFLINE-MUT-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnClient } from "../src/index.js";
import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../src/index.js";

// Mock storage adapter for testing
class MockStorageAdapter implements DatafnStorageAdapter {
  public records = new Map<string, Map<string, Record<string, unknown>>>();
  public changelog: Array<DatafnChangelogEntry> = [];
  public failChangelogAppend = false;

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
    return null;
  }
  async setCursor(resource: string, cursor: string): Promise<void> {}
  async getHydrationState(resource: string): Promise<DatafnHydrationState> {
    return "ready";
  }
  async setHydrationState(
    resource: string,
    state: DatafnHydrationState,
  ): Promise<void> {}

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
    if (this.failChangelogAppend) {
      throw {
        code: "INTERNAL",
        message: "Storage error: changelogAppend failed",
        details: { path: "storage.changelogAppend" },
      };
    }
    const seq = this.changelog.length + 1;
    const fullEntry = { ...entry, seq };
    this.changelog.push(fullEntry);
    return fullEntry;
  }

  async changelogList(options?: {
    limit?: number;
  }): Promise<DatafnChangelogEntry[]> {
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
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
  relations: [],
};

describe("Offline Mutation Tests", () => {
  it("TV-OFFLINE-MUT-001: When remote fails with TRANSPORT_ERROR, apply local write + changelog append + success", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 10;

    // Remote fails with legitimate transport error
    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => {
        const err: any = new Error("Network down");
        err.code = "TRANSPORT_ERROR";
        throw err;
      },
      transact: async () => ({ ok: true, result: { ok: true } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({
        ok: true,
        result: { ok: true, data: {}, cursors: {} },
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
      getTimestamp: () => timestampMs,
    });

    // ... (rest of test 1 setup)

    const mutation = {
      resource: "task",
      version: 1,
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-off-1",
      id: "task:1",
      record: { id: "task:1", title: "Offline" },
    };

    // Execute mutation
    const result: any = await client.table("task").mutate(mutation);

    // Verify optimistic success result
    expect(result).toMatchObject({
      ok: true,
      mutationId: "m-off-1",
      affectedIds: ["task:1"],
      deduped: false,
    });

    // Verify local storage update
    const record = await storage.getRecord("task", "task:1");
    expect(record).toEqual({ id: "task:1", title: "Offline" });

    // Verify changelog append
    const log = await storage.changelogList();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      seq: 1,
      clientId: "client:1",
      mutationId: "m-off-1",
    });
  });

  it("TV-OFFLINE-MUT-002: If changelog append fails, mutation fails", async () => {
    // ... (keep existing implementation, but update remote error to trigger fallback attempt)
    const storage = new MockStorageAdapter();
    storage.failChangelogAppend = true;

    const remote = {
      query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
      mutation: async () => {
        const err: any = new Error("Network down");
        err.code = "TRANSPORT_ERROR";
        throw err;
      },
      transact: async () => ({ ok: true, result: { ok: true } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({
        ok: true,
        result: { ok: true, data: {}, cursors: {} },
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

    const mutation = {
      resource: "task",
      version: 1,
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-off-2",
      id: "task:1",
      record: { title: "X" },
    };

    // Should throw storage error
    await expect(client.table("task").mutate(mutation)).rejects.toMatchObject({
      code: "INTERNAL",
      message: "Storage error: changelogAppend failed",
    });
  });

  it("TV-OFFLINE-MUT-003: Logic errors (non-transport) do NOT trigger offline fallback", async () => {
    const storage = new MockStorageAdapter();

    const remote = {
      query: async () => ({ ok: true, result: {} }),
      mutation: async () => {
        // Throw a logic error (not transport)
        throw { code: "DFQL_INVALID", message: "Invalid input" };
      },
      transact: async () => ({ ok: true, result: { ok: true } }),
      seed: async () => ({ ok: true, result: { ok: true } }),
      clone: async () => ({ ok: true, result: {} }),
      pull: async () => ({ ok: true, result: {} }),
      push: async () => ({ ok: true, result: {} }),
    } as any;

    const client = createDatafnClient({
      schema: testSchema,
      remote,
      clientId: "client:1",
      storage,
    });

    const mutation = {
      resource: "task",
      version: 1,
      operation: "insert",
      clientId: "client:1",
      mutationId: "m-off-3",
      id: "task:1",
      record: { title: "Bad" },
    };

    // Should throw the original logic error, NOT succeed offline
    await expect(client.table("task").mutate(mutation)).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: "Invalid input",
    });

    // Verify NO changelog + NO local write
    const log = await storage.changelogList();
    expect(log).toHaveLength(0);
    const rec = await storage.getRecord("task", "task:1");
    expect(rec).toBeNull();
  });
});
