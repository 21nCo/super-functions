import { describe, it, expect, vi } from "vitest";
import { createDatafnClient } from "../src/client.js";
import type { CloneUpOptions, CloneUpResult } from "../src/sync/cloneUp.js";
import type { DatafnClientError } from "../src/errors.js";
import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
  DatafnChangelogEntry,
} from "../src/storage.js";
import { DefaultHttpTransport } from "../src/transport/http.js";

class MockStorageAdapter implements DatafnStorageAdapter {
  public records = new Map<string, Map<string, Record<string, unknown>>>();
  public cursors = new Map<string, string>();
  public joinRowStore = new Map<string, Record<string, unknown>[]>();
  public changelog: DatafnChangelogEntry[] = [];

  async getRecord(resource: string, id: string) {
    return this.records.get(resource)?.get(id) ?? null;
  }
  async listRecords(resource: string) {
    const m = this.records.get(resource);
    return m ? Array.from(m.values()) : [];
  }
  async upsertRecord(resource: string, record: Record<string, unknown>) {
    if (!this.records.has(resource)) this.records.set(resource, new Map());
    this.records.get(resource)!.set(record.id as string, record);
  }
  async deleteRecord(resource: string, id: string) {
    this.records.get(resource)?.delete(id);
  }
  async getCursor(key: string) {
    return this.cursors.get(key) ?? null;
  }
  async setCursor(key: string, cursor: string) {
    this.cursors.set(key, cursor);
  }
  async getHydrationState(): Promise<DatafnHydrationState> {
    return "notStarted";
  }
  async setHydrationState() {}
  async listJoinRows(key: string) {
    return this.joinRowStore.get(key) ?? [];
  }
  async getJoinRows() {
    return [];
  }
  async getJoinRowsInverse() {
    return [];
  }
  async upsertJoinRow() {}
  async setJoinRows() {}
  async deleteJoinRow() {}
  async findRecords(resource: string, field: string, value: unknown) {
    const all = await this.listRecords(resource);
    return all.filter((r) => r[field] === value);
  }
  async changelogAppend(entry: Omit<DatafnChangelogEntry, "seq">) {
    const seq = this.changelog.length + 1;
    const full = { ...entry, seq };
    this.changelog.push(full);
    return full;
  }
  async changelogList(opts?: { limit?: number }) {
    return opts?.limit ? this.changelog.slice(0, opts.limit) : this.changelog;
  }
  async changelogAck(opts: { throughSeq: number }) {
    this.changelog = this.changelog.filter((e) => e.seq > opts.throughSeq);
  }
}

describe("cloneUp — Phase 00: Public API + types wired", () => {
  it("client.sync.cloneUp is a callable function", () => {
    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
        ],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      getTimestamp: () => 0,
    });

    expect(typeof client.sync.cloneUp).toBe("function");
  });

  it("existing sync methods still exist alongside cloneUp", () => {
    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
        ],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      getTimestamp: () => 0,
    });

    expect(typeof client.sync.seed).toBe("function");
    expect(typeof client.sync.clone).toBe("function");
    expect(typeof client.sync.pull).toBe("function");
    expect(typeof client.sync.push).toBe("function");
    expect(typeof client.sync.cloneUp).toBe("function");
  });

  it("CloneUpOptions and CloneUpResult types are importable", () => {
    const opts: CloneUpOptions = { resources: ["tasks"], batchSize: 50 };
    expect(opts.resources).toEqual(["tasks"]);

    const result: CloneUpResult = {
      ok: true,
      cursor: "0",
      stats: { resources: {}, joinStores: {}, batches: 0 },
      errors: [],
    };
    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("0");
    expect(result.stats).toBeDefined();
    expect(result.errors).toEqual([]);
  });
});

describe("cloneUp — Phase 01: Prerequisite validation + scope + record upload", () => {
  it("TV-CLONEUP-003: Missing storage prerequisite is rejected", async () => {
    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
    });

    try {
      await client.sync.cloneUp();
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: storage is required");
      expect(e.details.path).toBe("storage");
    }
  });

  it("TV-CLONEUP-004: Missing remote prerequisite is rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [],
      },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp();
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: sync.remote is required");
      expect(e.details.path).toBe("sync.remote");
    }
  });

  it("TV-CLONEUP-002: options.resources limits scope; uploads only selected resource", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", {
      id: "tasks:t1",
      title: "Build feature",
    });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: "tasks:t1", to: "tags:tag1", order: 1 },
    ]);

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: ["cloneup:rec:tags:tags:tag1:18wro6k"],
          errors: [],
          cursor: "7",
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
          {
            name: "tags",
            version: 1,
            fields: [
              { name: "name", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [
          {
            type: "many-many",
            from: "tasks",
            to: "tags",
            relation: "tags",
            metadata: [{ name: "order", type: "number" }],
          },
        ],
      },
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      resources: ["tags"],
      pullAfter: false,
    });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("7");
    expect(result.stats.resources).toEqual({
      tags: { records: 1, mutations: 1 },
    });
    expect(result.stats.batches).toBe(1);

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const pushPayload = pushSpy.mock.calls[0][0] as any;
    expect(pushPayload.mutations).toHaveLength(1);
    expect(pushPayload.mutations[0].resource).toBe("tags");
    expect(pushPayload.mutations[0].id).toBe("tags:tag1");
    expect(pushPayload.mutations[0].record).toEqual({ name: "frontend" });
    expect(pushPayload.mutations[0].mutationId).toBe(
      "cloneup:rec:tags:tags:tag1:18wro6k",
    );

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-002 negative: unknown resource is rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
          {
            name: "tags",
            version: 1,
            fields: [
              { name: "name", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ resources: ["wat"] });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_UNKNOWN_RESOURCE");
      expect(e.message).toBe("Invalid cloneUp: unknown resource");
      expect(e.details.path).toBe("resources[0]");
    }
  });

  it("TV-CLONEUP-005: Remote-only resources are rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
          {
            name: "billing",
            version: 1,
            isRemoteOnly: true,
            fields: [
              { name: "plan", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ resources: ["tasks", "billing"] });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe(
        "Invalid cloneUp: remote-only resources are not allowed",
      );
      expect(e.details.path).toBe("resources[1]");
    }
  });

  it("TV-CLONEUP-008: Records missing a string id are rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    storage.records.set("tasks", new Map([["_no_id_", { title: "Missing id" }]]));

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ includeManyMany: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: record id must be a string");
      expect(e.details.path).toBe("records[0].id");
    }
  });

  it("TV-CLONEUP-010: Deterministic ordering + batching", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t2", title: "B" });
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "A" });
    await storage.upsertRecord("tasks", { id: "tasks:t3", title: "C" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: [
            "cloneup:rec:tasks:tasks:t1:1s5wcym",
            "cloneup:rec:tasks:tasks:t2:bbqf1s",
          ],
          errors: [],
          cursor: "1",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: ["cloneup:rec:tasks:tasks:t3:1hhzg1e"],
          errors: [],
          cursor: "2",
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [
              { name: "title", type: "string" as const, required: true },
            ],
          },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
      batchSize: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("2");
    expect(result.stats.resources).toEqual({
      tasks: { records: 3, mutations: 3 },
    });
    expect(result.stats.batches).toBe(2);

    expect(pushSpy).toHaveBeenCalledTimes(2);

    const batch1 = (pushSpy.mock.calls[0][0] as any).mutations;
    expect(batch1).toHaveLength(2);
    expect(batch1[0].id).toBe("tasks:t1");
    expect(batch1[0].record).toEqual({ title: "A" });
    expect(batch1[0].mutationId).toBe("cloneup:rec:tasks:tasks:t1:1s5wcym");
    expect(batch1[1].id).toBe("tasks:t2");
    expect(batch1[1].record).toEqual({ title: "B" });
    expect(batch1[1].mutationId).toBe("cloneup:rec:tasks:tasks:t2:bbqf1s");

    const batch2 = (pushSpy.mock.calls[1][0] as any).mutations;
    expect(batch2).toHaveLength(1);
    expect(batch2[0].id).toBe("tasks:t3");
    expect(batch2[0].record).toEqual({ title: "C" });
    expect(batch2[0].mutationId).toBe("cloneup:rec:tasks:tasks:t3:1hhzg1e");

    pushSpy.mockRestore();
  });
});

describe("cloneUp — Phase 02: Many-many join row upload", () => {
  const twoResourceSchema = {
    resources: [
      {
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
      },
      {
        name: "tags",
        version: 1,
        fields: [{ name: "name", type: "string" as const, required: true }],
      },
    ],
    relations: [
      {
        type: "many-many" as const,
        from: "tasks",
        to: "tags",
        relation: "tags",
        metadata: [{ name: "order", type: "number" as const }],
      },
    ],
  };

  it("TV-CLONEUP-001 (join portion): records + join rows uploaded with correct relate mutation", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: "tasks:t1", to: "tags:tag1", order: 1 },
    ]);

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tags:tags:tag1:18wro6k"], errors: [], cursor: "11" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rel:join_tasks_tags_tags:tasks:t1:tags:tag1:uopwd"], errors: [], cursor: "12" },
      });

    const client = createDatafnClient({
      schema: twoResourceSchema,
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({ pullAfter: false });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("12");
    expect(result.stats.resources).toEqual({
      tasks: { records: 1, mutations: 1 },
      tags: { records: 1, mutations: 1 },
    });
    expect(result.stats.joinStores).toEqual({
      join_tasks_tags_tags: { rows: 1, mutations: 1 },
    });
    expect(result.stats.batches).toBe(3);
    expect(result.errors).toEqual([]);

    expect(pushSpy).toHaveBeenCalledTimes(3);

    const relateBatch = (pushSpy.mock.calls[2][0] as any).mutations;
    expect(relateBatch).toHaveLength(1);
    expect(relateBatch[0].resource).toBe("tasks");
    expect(relateBatch[0].operation).toBe("relate");
    expect(relateBatch[0].id).toBe("tasks:t1");
    expect(relateBatch[0].relations).toEqual({ tags: { $ref: "tags:tag1", order: 1 } });
    expect(relateBatch[0].mutationId).toBe("cloneup:rel:join_tasks_tags_tags:tasks:t1:tags:tag1:uopwd");

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-007: Missing join stores are treated as empty", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    // No joinRowStore entries — storage.listJoinRows returns []

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tags:tags:tag1:18wro6k"], errors: [], cursor: "11" },
      });

    const client = createDatafnClient({
      schema: twoResourceSchema,
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({ pullAfter: false });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("11");
    expect(result.stats.resources).toEqual({
      tasks: { records: 1, mutations: 1 },
      tags: { records: 1, mutations: 1 },
    });
    expect(result.stats.joinStores).toEqual({
      join_tasks_tags_tags: { rows: 0, mutations: 0 },
    });
    expect(result.stats.batches).toBe(2);

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-009: Unknown join metadata keys are rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: "tasks:t1", to: "tags:tag1", order: 1, wat: "x" },
    ]);

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tags:tags:tag1:18wro6k"], errors: [], cursor: "11" },
      });

    const client = createDatafnClient({
      schema: twoResourceSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ pullAfter: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(e.message).toBe("Invalid cloneUp: unknown join metadata field");
      expect(e.details.path).toBe("joinRows[0].wat");
    }

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-009 negative: join row with null from is rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: null, to: "tags:tag1" },
    ]);

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tags:tags:tag1:18wro6k"], errors: [], cursor: "11" },
      });

    const client = createDatafnClient({
      schema: twoResourceSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ pullAfter: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: join row from/to must be a string");
      expect(e.details.path).toBe("joinRows[0].from");
    }

    pushSpy.mockRestore();
  });
});

describe("cloneUp — Phase 03: Push batching + retry + server error aggregation", () => {
  it("TV-CLONEUP-013: Invalid batchSize is rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ batchSize: 0 });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: batchSize must be a positive integer");
      expect(e.details.path).toBe("batchSize");
    }
  });

  it("TV-CLONEUP-013 negative: Invalid maxRetries is rejected", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ maxRetries: -1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: maxRetries must be a non-negative integer");
      expect(e.details.path).toBe("maxRetries");
    }
  });

  it("TV-CLONEUP-011: Transport error retries succeed on second attempt", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const transportError = { code: "TRANSPORT_ERROR", message: "network down", details: { path: "sync.push" } };

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockRejectedValueOnce(transportError)
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
      maxRetries: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("10");
    expect(result.stats.resources).toEqual({ tasks: { records: 1, mutations: 1 } });
    expect(result.stats.batches).toBe(2);
    expect(result.errors).toEqual([]);

    expect(pushSpy).toHaveBeenCalledTimes(2);

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-011 negative: Transport error exhaustion throws TRANSPORT_ERROR", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const transportError = { code: "TRANSPORT_ERROR", message: "network down", details: { path: "sync.push" } };

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockRejectedValue(transportError);

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({
        includeManyMany: false,
        pullAfter: false,
        maxRetries: 0,
      });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("TRANSPORT_ERROR");
      expect(e.details.path).toBe("sync.push");
    }

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-012: Server-side push errors cause ok=false, no changelog/cursor changes", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: "tasks:t1", to: "tags:tag1", order: 1 },
    ]);
    storage.changelog = [
      {
        seq: 1,
        clientId: "client:device-1",
        mutationId: "offline:m1",
        timestampMs: 1,
        mutation: { resource: "tasks", operation: "merge", id: "tasks:t_local" },
      },
    ];

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: [],
          errors: [
            {
              mutationId: "cloneup:rec:tasks:tasks:t1:1onhffr",
              code: "DFQL_INVALID",
              message: "Invalid DFQL: title required",
              path: "record.title",
            },
          ],
          cursor: "10",
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
          { name: "tags", version: 1, fields: [{ name: "name", type: "string" as const }] },
        ],
        relations: [
          {
            type: "many-many" as const,
            from: "tasks",
            to: "tags",
            relation: "tags",
            metadata: [{ name: "order", type: "number" as const }],
          },
        ],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: true,
      pullAfter: false,
      failFast: true,
    });

    expect(result.ok).toBe(false);
    expect(result.cursor).toBe("10");
    expect(result.stats.resources).toEqual({
      tasks: { records: 1, mutations: 1 },
    });
    expect(result.stats.batches).toBe(1);
    expect(result.errors).toEqual([
      {
        mutationId: "cloneup:rec:tasks:tasks:t1:1onhffr",
        code: "DFQL_INVALID",
        message: "Invalid DFQL: title required",
        path: "record.title",
      },
    ]);

    expect(pushSpy).toHaveBeenCalledTimes(1);
    const pushPayload = (pushSpy.mock.calls[0][0] as any);
    expect(pushPayload.mutations[0].mutationId).toBe("cloneup:rec:tasks:tasks:t1:1onhffr");

    expect(storage.cursors.get("__global_cursor__")).toBe("0");
    expect(storage.changelog).toHaveLength(1);

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-012 (state): Failure leaves cursor and changelog unchanged", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "5");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    storage.changelog = [
      {
        seq: 1,
        clientId: "client:device-1",
        mutationId: "offline:m1",
        timestampMs: 1,
        mutation: { resource: "tasks", operation: "merge", id: "tasks:t_local" },
      },
    ];

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: [],
          errors: [{ mutationId: "m1", code: "ERR", message: "fail", path: "x" }],
          cursor: "20",
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
      failFast: true,
    });

    expect(result.ok).toBe(false);
    expect(storage.cursors.get("__global_cursor__")).toBe("5");
    expect(storage.changelog).toHaveLength(1);

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-014: Missing remote push method throws TRANSPORT_ERROR", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      clientId: "client:device-1",
      storage,
    });

    try {
      await client.sync.cloneUp({ includeManyMany: false });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as DatafnClientError;
      expect(e.code).toBe("DFQL_INVALID");
      expect(e.message).toBe("Invalid cloneUp: sync.remote is required");
      expect(e.details.path).toBe("sync.remote");
    }
  });
});

describe("cloneUp — Phase 04: Finalization (cursor/changelog/pullAfter)", () => {
  const twoResourceSchema = {
    resources: [
      {
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
      },
      {
        name: "tags",
        version: 1,
        fields: [{ name: "name", type: "string" as const, required: true }],
      },
      {
        name: "billing",
        version: 1,
        isRemoteOnly: true,
        fields: [{ name: "plan", type: "string" as const, required: true }],
      },
    ],
    relations: [
      {
        type: "many-many" as const,
        from: "tasks",
        to: "tags",
        relation: "tags",
        metadata: [{ name: "order", type: "number" as const, required: false }],
      },
    ],
  };

  it("TV-CLONEUP-001 (full e2e): pullAfter + changelog drain + cursor advance", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "frontend" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: "tasks:t1", to: "tags:tag1", order: 1 },
    ]);
    storage.changelog = [
      {
        seq: 1,
        clientId: "client:device-1",
        mutationId: "offline:m1",
        timestampMs: 1,
        mutation: { resource: "tasks", operation: "merge", id: "tasks:t_local", record: { title: "Local" } },
      },
      {
        seq: 2,
        clientId: "client:device-1",
        mutationId: "offline:m2",
        timestampMs: 2,
        mutation: { resource: "tags", operation: "merge", id: "tags:t_local", record: { name: "Local" } },
      },
    ];

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tags:tags:tag1:18wro6k"], errors: [], cursor: "11" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rel:join_tasks_tags_tags:tasks:t1:tags:tag1:uopwd"], errors: [], cursor: "12" },
      });

    const pullSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "pull")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          changes: [
            { serverSeq: 11, resource: "tasks", id: "tasks:t1", op: "upsert", record: { id: "tasks:t1", title: "Build feature" } },
            { serverSeq: 12, resource: "tags", id: "tags:tag1", op: "upsert", record: { id: "tags:tag1", name: "frontend" } },
          ],
          nextCursor: null,
        },
      });

    const client = createDatafnClient({
      schema: twoResourceSchema,
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp();

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("12");
    expect(result.stats.resources).toEqual({
      tasks: { records: 1, mutations: 1 },
      tags: { records: 1, mutations: 1 },
    });
    expect(result.stats.joinStores).toEqual({
      join_tasks_tags_tags: { rows: 1, mutations: 1 },
    });
    expect(result.stats.batches).toBe(3);
    expect(result.errors).toEqual([]);

    expect(pushSpy).toHaveBeenCalledTimes(3);

    expect(pullSpy).toHaveBeenCalledTimes(1);
    const pullPayload = pullSpy.mock.calls[0][0] as any;
    expect(pullPayload.clientId).toBe("client:device-1");
    expect(pullPayload.cursor).toBe("0");
    expect(pullPayload.limit).toBe(100);

    expect(storage.cursors.get("__global_cursor__")).toBe("12");

    expect(storage.changelog).toHaveLength(0);

    pushSpy.mockRestore();
    pullSpy.mockRestore();
  });

  it("TV-CLONEUP-006: Cursor update is monotonic — does not decrease", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "10");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "5" },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
    });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("5");

    expect(storage.cursors.get("__global_cursor__")).toBe("10");

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-006 (advance): Cursor advances when push cursor is higher", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "5");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
    });

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("10");
    expect(storage.cursors.get("__global_cursor__")).toBe("10");

    pushSpy.mockRestore();
  });

  it("Changelog drain clears multiple pages", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build" });
    for (let i = 1; i <= 5; i++) {
      storage.changelog.push({
        seq: i,
        clientId: "client:device-1",
        mutationId: `offline:m${i}`,
        timestampMs: i,
        mutation: { resource: "tasks", operation: "merge", id: `tasks:t${i}` },
      });
    }

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "10" },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
    });

    expect(result.ok).toBe(true);
    expect(storage.changelog).toHaveLength(0);

    pushSpy.mockRestore();
  });

  it("pullAfter applies changes and advances cursor from pull", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Old" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:pbh3dr"], errors: [], cursor: "5" },
      });

    const pullSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "pull")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          changes: [
            { serverSeq: 5, resource: "tasks", id: "tasks:t1", op: "upsert", record: { id: "tasks:t1", title: "Updated" } },
          ],
          nextCursor: null,
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
    });

    expect(result.ok).toBe(true);

    const updatedRecord = await storage.getRecord("tasks", "tasks:t1");
    expect(updatedRecord).toEqual({ id: "tasks:t1", title: "Updated" });

    expect(storage.cursors.get("__global_cursor__")).toBe("5");

    pushSpy.mockRestore();
    pullSpy.mockRestore();
  });
});

describe("cloneUp — Phase 05: Observability events", () => {
  it("TV-CLONEUP-006 (event): Success emits exactly one sync_applied with phase=cloneup", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "10");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["cloneup:rec:tasks:tasks:t1:1onhffr"], errors: [], cursor: "5" },
      });

    const events: any[] = [];
    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com", pushBatchSize: 100, pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    client.subscribe((event) => {
      events.push(event);
    });

    await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
    });

    const syncEvents = events.filter((e) => e.type === "sync_applied" || e.type === "sync_failed");
    expect(syncEvents).toHaveLength(1);

    const evt = syncEvents[0];
    expect(evt.type).toBe("sync_applied");
    expect(evt.context.phase).toBe("cloneup");
    expect(evt.context.cursor).toBe("5");
    expect(evt.context.stats).toEqual({
      resources: { tasks: { records: 1, mutations: 1 } },
      joinStores: {},
      batches: 1,
    });

    expect(evt.context.record).toBeUndefined();
    expect(evt.context.records).toBeUndefined();
    expect(evt.context.mutations).toBeUndefined();

    pushSpy.mockRestore();
  });

  it("TV-CLONEUP-012 (event): Server errors emit exactly one sync_failed with phase=cloneup", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Build feature" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: [],
          errors: [
            {
              mutationId: "cloneup:rec:tasks:tasks:t1:1onhffr",
              code: "DFQL_INVALID",
              message: "Invalid DFQL: title required",
              path: "record.title",
            },
          ],
          cursor: "10",
        },
      });

    const events: any[] = [];
    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    client.subscribe((event) => {
      events.push(event);
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
      failFast: true,
    });

    expect(result.ok).toBe(false);

    const syncEvents = events.filter((e) => e.type === "sync_applied" || e.type === "sync_failed");
    expect(syncEvents).toHaveLength(1);

    const evt = syncEvents[0];
    expect(evt.type).toBe("sync_failed");
    expect(evt.context.phase).toBe("cloneup");

    expect(evt.context.record).toBeUndefined();
    expect(evt.context.records).toBeUndefined();
    expect(evt.context.mutations).toBeUndefined();

    pushSpy.mockRestore();
  });

  it("Event context excludes record payloads on success", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Secret data" });
    await storage.upsertRecord("tags", { id: "tags:tag1", name: "confidential" });
    storage.joinRowStore.set("join_tasks_tags_tags", [
      { from: "tasks:t1", to: "tags:tag1", order: 1 },
    ]);

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["m1"], errors: [], cursor: "10" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["m2"], errors: [], cursor: "11" },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: { ok: true, applied: ["m3"], errors: [], cursor: "12" },
      });

    const events: any[] = [];
    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const, required: true }] },
          { name: "tags", version: 1, fields: [{ name: "name", type: "string" as const, required: true }] },
        ],
        relations: [
          {
            type: "many-many" as const,
            from: "tasks",
            to: "tags",
            relation: "tags",
            metadata: [{ name: "order", type: "number" as const }],
          },
        ],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    client.subscribe((event) => {
      events.push(event);
    });

    await client.sync.cloneUp({ pullAfter: false });

    const applied = events.filter((e) => e.type === "sync_applied");
    expect(applied).toHaveLength(1);

    const ctx = applied[0].context;
    const contextStr = JSON.stringify(ctx);
    expect(contextStr).not.toContain("Secret data");
    expect(contextStr).not.toContain("confidential");
    expect(ctx.record).toBeUndefined();
    expect(ctx.records).toBeUndefined();
    expect(ctx.mutations).toBeUndefined();

    pushSpy.mockRestore();
  });

  it("failFast=false with errors emits sync_failed once", async () => {
    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "A" });
    await storage.upsertRecord("tasks", { id: "tasks:t2", title: "B" });

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: [],
          errors: [{ mutationId: "m1", code: "ERR", message: "fail1", path: "x" }],
          cursor: "1",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: [],
          errors: [{ mutationId: "m2", code: "ERR", message: "fail2", path: "y" }],
          cursor: "2",
        },
      });

    const events: any[] = [];
    const client = createDatafnClient({
      schema: {
        resources: [
          { name: "tasks", version: 1, fields: [{ name: "title", type: "string" as const }] },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com" },
      clientId: "client:device-1",
      storage,
    });

    client.subscribe((event) => {
      events.push(event);
    });

    const result = await client.sync.cloneUp({
      includeManyMany: false,
      pullAfter: false,
      failFast: false,
      batchSize: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(2);

    const syncEvents = events.filter((e) => e.type === "sync_failed");
    expect(syncEvents).toHaveLength(1);
    expect(syncEvents[0].context.phase).toBe("cloneup");

    pushSpy.mockRestore();
  });
});

describe("cloneUp — pushBatchWithRetry exponential backoff (CLI-010)", () => {
  it("retries twice on transport errors with exponential backoff and succeeds on third attempt", async () => {
    vi.useFakeTimers();

    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Backoff task" });

    const transportErr = {
      code: "TRANSPORT_ERROR",
      message: "network error",
      details: { path: "sync.push" },
    };

    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockRejectedValueOnce(transportErr) // attempt 1: waits 1000ms
      .mockRejectedValueOnce(transportErr) // attempt 2: waits 2000ms
      .mockResolvedValueOnce({
        ok: true,
        result: {
          ok: true,
          applied: ["cloneup:rec:tasks:tasks:t1:abc"],
          errors: [],
          cursor: "5",
        },
      });

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [{ name: "title", type: "string" as const, required: true }],
          },
        ],
        relations: [],
      },
      sync: { remote: "http://example.com", pushMaxRetries: 3 },
      clientId: "client:device-1",
      storage,
    });

    // Start cloneUp without awaiting; advance all fake timers to skip backoff delays
    const resultPromise = client.sync.cloneUp({ pullAfter: false });
    await vi.runAllTimersAsync();

    const result = await resultPromise;

    expect(result.ok).toBe(true);
    expect(result.cursor).toBe("5");
    // 2 transport failures + 1 success = 3 total push calls
    expect(pushSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
    pushSpy.mockRestore();
  });

  it("throws after exhausting maxRetries with correct attempt count", async () => {
    vi.useFakeTimers();

    const storage = new MockStorageAdapter();
    storage.cursors.set("__global_cursor__", "0");
    await storage.upsertRecord("tasks", { id: "tasks:t1", title: "Fail task" });

    const transportErr = {
      code: "TRANSPORT_ERROR",
      message: "persistent network failure",
      details: { path: "sync.push" },
    };

    // Always fail
    const pushSpy = vi
      .spyOn(DefaultHttpTransport.prototype, "push")
      .mockRejectedValue(transportErr);

    const client = createDatafnClient({
      schema: {
        resources: [
          {
            name: "tasks",
            version: 1,
            fields: [{ name: "title", type: "string" as const, required: true }],
          },
        ],
        relations: [],
      },
      // maxRetries: 2 means attempts 1,2 retry (2 <= 2), attempt 3 throws (3 > 2)
      sync: { remote: "http://example.com", pushMaxRetries: 2 },
      clientId: "client:device-1",
      storage,
    });

    const resultPromise = client.sync.cloneUp({ pullAfter: false });
    // Attach catch handler immediately to prevent unhandled-rejection warning before
    // vi.runAllTimersAsync() fires the backoff timers that settle the promise.
    resultPromise.catch(() => {});

    await vi.runAllTimersAsync();

    await expect(resultPromise).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
    // 1 initial + 2 retries = 3 total push calls (maxRetries=2)
    expect(pushSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
    pushSpy.mockRestore();
  });
});
