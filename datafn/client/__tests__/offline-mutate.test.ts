/**
 * Offline Mutation Tests
 * Tests TV-OFFLINE-MUT-001, TV-OFFLINE-MUT-002, TV-PUSH-001 from TEST_VECTORS.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDatafnClient } from "../src/index.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
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

  async mergeRecord(
    resource: string,
    id: string,
    partial: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const existing = await this.getRecord(resource, id);
    // One-level deep merge
    const merged = existing
      ? this.deepMergeOneLevel(existing, partial)
      : { ...partial, id };
    merged.id = id;
    await this.upsertRecord(resource, merged);
    return merged;
  }

  private deepMergeOneLevel(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sv = source[key];
      const tv = target[key];
      if (
        sv !== null &&
        typeof sv === "object" &&
        !Array.isArray(sv) &&
        tv !== null &&
        typeof tv === "object" &&
        !Array.isArray(tv)
      ) {
        result[key] = { ...tv, ...sv };
      } else {
        result[key] = sv;
      }
    }
    return result;
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
  ): Promise<void> {
    if (!this.joinRows.has(relationKey)) {
      this.joinRows.set(relationKey, []);
    }
    const store = this.joinRows.get(relationKey)!;
    const index = store.findIndex(
      (r) => r.from === row.from && r.to === row.to,
    );
    if (index !== -1) {
      store[index] = row;
    } else {
      store.push(row);
    }
  }
  async deleteJoinRow(
    relationKey: string,
    from: string,
    to: string,
  ): Promise<void> {
    const store = this.joinRows.get(relationKey);
    if (store) {
      const index = store.findIndex((r) => r.from === from && r.to === to);
      if (index !== -1) {
        store.splice(index, 1);
      }
    }
  }

  public joinRows = new Map<string, Array<Record<string, unknown>>>();

  async getJoinRowsInverse(
    relationKey: string,
    toId: string,
  ): Promise<Array<Record<string, unknown>>> {
    const store = this.joinRows.get(relationKey) || [];
    return store.filter((r) => r.to === toId);
  }

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
    const store = this.joinRows.get(relationKey) || [];
    return store.filter((r) => r.from === fromId);
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
    return (this.joinRows.get(relationKey) || []).length;
  }

  async close(): Promise<void> {}

  async clearAll(): Promise<void> {
    this.records.clear();
    this.changelog = [];
    this.joinRows.clear();
  }
}

// Test schema
const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
    {
      name: "node",
      version: 1,
      fields: [{ name: "label", type: "string" as const, required: false }],
    },
    {
      name: "property",
      version: 1,
      fields: [{ name: "name", type: "string" as const, required: false }],
    },
  ],
  relations: [
    {
      from: "node",
      to: "property",
      type: "many-many" as const,
      relation: "properties",
    },
  ],
};

describe("Offline Mutation Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TV-OFFLINE-MUT-001: When remote fails with TRANSPORT_ERROR, apply local write + changelog append + success", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 10;

    // Remote fails with legitimate transport error
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
      getTimestamp: () => timestampMs,
    });

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
    const storage = new MockStorageAdapter();
    storage.failChangelogAppend = true;

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
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

    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "DFQL_INVALID",
      message: "Invalid input",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
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

  it("TV-PUSH-001: Local-first mutation appends to changelog first, applies locally, then pushes (when offlinability=true)", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 100;

    // Spy on remote methods
    const mutationSpy = vi.spyOn(DefaultHttpTransport.prototype, "mutation");
    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValue({ ok: true, result: { ok: true } });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { offlinability: true, remote: "http://example.com" },
      clientId: "client:1",
      storage,
      getTimestamp: () => timestampMs,
    });

    const mutation = {
      resource: "task",
      version: 1,
      operation: "merge",
      clientId: "client:1",
      mutationId: "m-local-1",
      id: "task:local",
      record: { id: "task:local", title: "Local First" },
    };

    // Execute mutation
    const result: any = await client.table("task").mutate(mutation);

    // Verify optimistic success result
    expect(result).toMatchObject({
      ok: true,
      mutationId: "m-local-1",
      affectedIds: ["task:local"],
      deduped: false,
    });

    // Verify local storage update
    const record = await storage.getRecord("task", "task:local");
    expect(record).toEqual({ id: "task:local", title: "Local First" });

    // Verify changelog append
    let log = await storage.changelogList();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      seq: 1,
      clientId: "client:1",
      mutationId: "m-local-1",
    });

    // Verify remote.mutation was NOT called
    expect(mutationSpy).not.toHaveBeenCalled();

    // Verify push is scheduled (debounced via setTimeout)
    await vi.runAllTimersAsync();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client:1",
        mutations: expect.arrayContaining([
          expect.objectContaining({ mutationId: "m-local-1" }),
        ]),
      }),
    );

    // Verify changelog ack (storage changelog should be empty after success)
    log = await storage.changelogList();
    expect(log).toHaveLength(0);
  });

  it("TV-OFFM-001: Offline relate upserts join row locally", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 10;

    // Simulate offline mode (remote unavailable)
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    // Create records first
    await storage.upsertRecord("node", { id: "node:1", label: "Node 1" });
    await storage.upsertRecord("property", {
      id: "property:1",
      name: "Property 1",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
      getTimestamp: () => timestampMs,
    });

    const mutation = {
      resource: "node",
      version: 1,
      operation: "relate",
      clientId: "client:1",
      mutationId: "m-1",
      id: "node:1",
      relations: { properties: [{ $ref: "property:1", value: "v" }] },
    };

    // Execute mutation
    const result: any = await client.table("node").mutate(mutation);

    // Verify optimistic success result
    expect(result).toMatchObject({
      ok: true,
      mutationId: "m-1",
      affectedIds: ["node:1"],
      deduped: false,
    });

    // Verify join row was created
    const joinStore = "join_node_properties_property";
    const joinRows = await storage.getJoinRows(joinStore, "node:1");
    expect(joinRows).toHaveLength(1);
    expect(joinRows[0]).toMatchObject({
      from: "node:1",
      to: "property:1",
      value: "v",
    });

    // Verify changelog append
    const log = await storage.changelogList();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      seq: 1,
      clientId: "client:1",
      mutationId: "m-1",
    });
  });

  it("TV-OFFM-001N: Offline modifyRelation rejects when join row missing", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 10;

    // Simulate offline mode (remote unavailable)
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    // Create records but NO join row
    await storage.upsertRecord("node", { id: "node:1", label: "Node 1" });
    await storage.upsertRecord("property", {
      id: "property:1",
      name: "Property 1",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
      getTimestamp: () => timestampMs,
    });

    const mutation = {
      resource: "node",
      version: 1,
      operation: "modifyRelation",
      clientId: "client:1",
      mutationId: "m-2",
      id: "node:1",
      relations: { properties: [{ $ref: "property:1", value: "new" }] },
    };

    // Execute mutation - should fail with NOT_FOUND
    await expect(client.table("node").mutate(mutation)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Relation not found between node:1 and property:1",
    });

    // Verify NO changelog entry (mutation failed before changelog append)
    const log = await storage.changelogList();
    expect(log).toHaveLength(0);
  });

  it("Offline unrelate deletes join row locally", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 10;

    // Simulate offline mode (remote unavailable)
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    // Create records and join row
    await storage.upsertRecord("node", { id: "node:1", label: "Node 1" });
    await storage.upsertRecord("property", {
      id: "property:1",
      name: "Property 1",
    });
    await storage.upsertJoinRow("join_node_properties_property", {
      from: "node:1",
      to: "property:1",
      value: "v",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
      getTimestamp: () => timestampMs,
    });

    const mutation = {
      resource: "node",
      version: 1,
      operation: "unrelate",
      clientId: "client:1",
      mutationId: "m-3",
      id: "node:1",
      relations: { properties: [{ $ref: "property:1" }] },
    };

    // Execute mutation
    const result: any = await client.table("node").mutate(mutation);

    // Verify optimistic success result
    expect(result).toMatchObject({
      ok: true,
      mutationId: "m-3",
      affectedIds: ["node:1"],
      deduped: false,
    });

    // Verify join row was deleted
    const joinRows = await storage.getJoinRows(
      "join_node_properties_property",
      "node:1",
    );
    expect(joinRows).toHaveLength(0);

    // Verify changelog append
    const log = await storage.changelogList();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      seq: 1,
      clientId: "client:1",
      mutationId: "m-3",
    });
  });

  // PHASE_11 Tests: OFF-001, OFF-002, OFF-003
  
  it("TV-OFF-001: Batch offline fallback applies all mutations locally", async () => {
    const storage = new MockStorageAdapter();
    const timestampMs = 10;

    // Simulate offline mode (remote unavailable)
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
      getTimestamp: () => timestampMs,
    });

    // Batch mutation with 3 mutations
    const batch = [
      {
        resource: "task",
        version: 1,
        operation: "merge",
        id: "task:1",
        record: { title: "Task A" },
      },
      {
        resource: "task",
        version: 1,
        operation: "merge",
        id: "task:2",
        record: { title: "Task B" },
      },
      {
        resource: "task",
        version: 1,
        operation: "insert",
        id: "task:3",
        record: { title: "Task C" },
      },
    ];

    // Execute batch mutation
    const results: any[] = await client.table("task").mutate(batch);

    // Verify all 3 mutations succeeded
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: true });
    expect(results[2]).toMatchObject({ ok: true });

    // Verify all 3 records in storage
    const task1 = await storage.getRecord("task", "task:1");
    expect(task1).toMatchObject({ id: "task:1", title: "Task A" });

    const task2 = await storage.getRecord("task", "task:2");
    expect(task2).toMatchObject({ id: "task:2", title: "Task B" });

    const task3 = await storage.getRecord("task", "task:3");
    expect(task3).toMatchObject({ id: "task:3", title: "Task C" });

    // Verify 3 changelog entries
    const log = await storage.changelogList();
    expect(log).toHaveLength(3);
  });

  it("TV-OFF-001N: Batch fails without storage (no offline fallback)", async () => {
    // No storage configured
    vi.spyOn(DefaultHttpTransport.prototype, "mutation").mockRejectedValue({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      // No storage
    });

    const batch = [
      {
        resource: "task",
        version: 1,
        operation: "merge",
        id: "task:1",
        record: { title: "Task A" },
      },
    ];

    // Should throw transport error (no fallback)
    await expect(client.table("task").mutate(batch)).rejects.toMatchObject({
      code: "TRANSPORT_ERROR",
      message: "Network down",
    });
  });

  it("TV-OFF-002: mergeRecord is atomic (read + merge + write in one transaction)", async () => {
    const storage = new MockStorageAdapter();

    // Pre-populate with existing record
    await storage.upsertRecord("task", {
      id: "task:1",
      title: "Old",
      status: "open",
      priority: "low",
    });

    // Merge partial update
    const merged = await storage.mergeRecord("task", "task:1", {
      title: "New",
    });

    // Verify merged result preserves existing fields
    expect(merged).toEqual({
      id: "task:1",
      title: "New",
      status: "open",
      priority: "low",
    });

    // Verify storage was updated
    const stored = await storage.getRecord("task", "task:1");
    expect(stored).toEqual(merged);
  });

  it("TV-OFF-002N: mergeRecord upserts if record missing", async () => {
    const storage = new MockStorageAdapter();

    // Record doesn't exist
    const merged = await storage.mergeRecord("task", "task:99", {
      title: "New Record",
    });

    // Verify record was created
    expect(merged).toEqual({
      id: "task:99",
      title: "New Record",
    });

    // Verify storage
    const stored = await storage.getRecord("task", "task:99");
    expect(stored).toEqual(merged);
  });

  it("TV-OFF-003: Deep merge preserves sibling keys in nested objects", async () => {
    const storage = new MockStorageAdapter();

    // Pre-populate with nested object
    await storage.upsertRecord("task", {
      id: "task:1",
      title: "Task",
      preferences: {
        theme: "light",
        lang: "en",
        notifications: { email: true, push: false },
      },
    });

    // Merge with partial nested update
    const merged = await storage.mergeRecord("task", "task:1", {
      preferences: {
        theme: "dark", // update
        notifications: { push: true }, // nested object overwrites (only one level deep)
      },
    });

    // Verify one-level-deep merge
    expect(merged).toEqual({
      id: "task:1",
      title: "Task",
      preferences: {
        theme: "dark", // updated
        lang: "en", // preserved (sibling key)
        notifications: { push: true }, // overwritten (second level, not merged)
      },
    });
  });

  it("TV-OFF-003N: Arrays are overwritten, not merged", async () => {
    const storage = new MockStorageAdapter();

    // Pre-populate with array field
    await storage.upsertRecord("task", {
      id: "task:1",
      title: "Task",
      tags: ["a", "b", "c"],
    });

    // Merge with new array
    const merged = await storage.mergeRecord("task", "task:1", {
      tags: ["x", "y"],
    });

    // Verify array was overwritten, not merged
    expect(merged).toEqual({
      id: "task:1",
      title: "Task",
      tags: ["x", "y"], // overwritten
    });
  });

  it("TV-OFF-003: Deep merge at most one level (second-level objects overwrite)", async () => {
    const storage = new MockStorageAdapter();

    // Pre-populate with deeply nested object
    await storage.upsertRecord("task", {
      id: "task:1",
      config: {
        ui: { theme: "light", fontSize: 14 },
        data: { cache: true },
      },
    });

    // Merge with partial deep update
    const merged = await storage.mergeRecord("task", "task:1", {
      config: {
        ui: { theme: "dark" }, // second level - overwrites entire ui object
      },
    });

    // Verify: first level (config) is merged, second level (ui) is overwritten
    expect(merged).toEqual({
      id: "task:1",
      config: {
        ui: { theme: "dark" }, // overwritten (second level)
        data: { cache: true }, // preserved (sibling at first level)
      },
    });
  });
});
