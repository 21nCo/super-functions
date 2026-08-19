/**
 * Offline Query Tests
 * Tests TV-OFFLINE-QUERY-001, TV-OFFLINE-QUERY-002 from TEST_VECTORS.md
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatafnClient } from "../src/index.js";
import { DefaultHttpTransport } from "../src/transport/http.js";
import { getJoinStoreKey } from "@datafn/core";
import type {
  DatafnStorageAdapter,
  DatafnHydrationState,
} from "../src/index.js";
import { MemoryStorageAdapter } from "../src/index.js";

// Mock storage adapter for testing
class MockStorageAdapter implements DatafnStorageAdapter {
  private records = new Map<string, Map<string, Record<string, unknown>>>();
  private cursors = new Map<string, string>();
  private hydrationStates = new Map<string, DatafnHydrationState>();
  private changelog: Array<any> = [];

  // Initialize with state for testing
  constructor(initialState?: {
    records?: Record<string, Array<Record<string, unknown>>>;
    hydration?: Record<string, DatafnHydrationState>;
  }) {
    if (initialState?.records) {
      for (const [resource, resourceRecords] of Object.entries(
        initialState.records,
      )) {
        const recordMap = new Map<string, Record<string, unknown>>();
        for (const record of resourceRecords) {
          recordMap.set(record.id as string, record);
        }
        this.records.set(resource, recordMap);
      }
    }
    if (initialState?.hydration) {
      for (const [resource, state] of Object.entries(initialState.hydration)) {
        this.hydrationStates.set(resource, state);
      }
    }
  }

  async getRecord(
    resource: string,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const resourceRecords = this.records.get(resource);
    return resourceRecords?.get(id) || null;
  }

  async listRecords(resource: string): Promise<Record<string, unknown>[]> {
    const resourceRecords = this.records.get(resource);
    if (!resourceRecords) return [];
    // Return sorted by id for determinism
    return Array.from(resourceRecords.values()).sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
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
    if (state !== "notStarted" && state !== "hydrating" && state !== "ready") {
      throw {
        code: "INTERNAL",
        message: "Storage error: invalid hydration state",
        details: { path: "storage.setHydrationState.state" },
      };
    }
    this.hydrationStates.set(resource, state);
  }

  async listJoinRows(
    relationKey: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async getJoinRows(
    relationKey: string,
    fromId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async upsertJoinRow(
    relationKey: string,
    row: Record<string, unknown>,
  ): Promise<void> {}

  async setJoinRows(
    relationKey: string,
    rows: Array<Record<string, unknown>>,
  ): Promise<void> {}

  async deleteJoinRow(
    relationKey: string,
    from: string,
    to: string,
  ): Promise<void> {}

  async getJoinRowsInverse(
    relationKey: string,
    toId: string,
  ): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async findRecords(
    resource: string,
    field: string,
    value: unknown,
  ): Promise<Record<string, unknown>[]> {
    const records = await this.listRecords(resource);
    return records.filter((r) => r[field] === value);
  }

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

  async countRecords(resource: string): Promise<number> {
    const records = await this.listRecords(resource);
    return records.length;
  }

  async countJoinRows(relationKey: string): Promise<number> {
    const rows = await this.listJoinRows(relationKey);
    return rows.length;
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

describe("Offline Query Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TV-OFFLINE-QUERY-001: When hydration is ready, queries are local-first (no remote call)", async () => {
    // Create storage with preloaded data and ready state
    const storage = new MockStorageAdapter({
      records: {
        task: [{ id: "task:1", title: "Local" }],
      },
      hydration: {
        task: "ready",
      },
    });

    const querySpy = vi
      .spyOn(DefaultHttpTransport.prototype, "query")
      .mockResolvedValue({
        ok: true,
        result: { data: [{ id: "task:1", title: "Remote" }], nextCursor: null },
      });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Execute query via table handle
    const result = (await client.table("task").query({
      select: ["id", "title"],
      filters: { id: "task:1" },
    })) as any;

    // Verify result came from local storage (not remote)
    expect(result.data).toEqual([{ id: "task:1", title: "Local" }]);
    expect(result.nextCursor).toBe(null);

    // Verify remote was NOT called (local-first)
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("TV-OFFLINE-QUERY-002: When hydration is hydrating, queries use remote fallback", async () => {
    // Create storage with hydrating state (no records)
    const storage = new MockStorageAdapter({
      hydration: {
        task: "hydrating",
      },
    });

    // Track remote calls
    const queryCalls: any[] = [];
    const querySpy = vi
      .spyOn(DefaultHttpTransport.prototype, "query")
      .mockImplementation(async (q: any) => {
        queryCalls.push(q);
        return {
          ok: true,
          result: {
            data: [{ id: "task:1", title: "Remote" }],
            nextCursor: null,
          },
        };
      });

    const client = createDatafnClient({
      schema: testSchema,
      sync: { remote: "http://example.com" },
      clientId: "client:1",
      storage,
    });

    // Execute query via table handle
    const result = (await client.table("task").query({
      select: ["id", "title"],
      filters: { id: "task:1" },
    })) as any;

    // Verify result came from remote
    expect(result.data).toEqual([{ id: "task:1", title: "Remote" }]);
    expect(result.nextCursor).toBe(null);

    // Verify remote WAS called (remote fallback)
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(queryCalls[0]).toEqual({
      resource: "task",
      version: 1,
      select: ["id", "title"],
      filters: { id: "task:1" },
    });
  });

  // New tests for Phase 10: Expanded DFQL Coverage
  describe("Expanded Local DFQL Features", () => {
    let storage: MemoryStorageAdapter;
    let client: any;

    const dataset = [
      { id: "1", title: "Task A", prio: 1, tags: ["work"] },
      { id: "2", title: "Task B", prio: 2, tags: ["home", "urgent"] },
      { id: "3", title: "Task C", prio: 1, tags: ["work", "urgent"] },
      { id: "4", title: "Task D", prio: 3, tags: ["home"] },
    ];

    beforeEach(async () => {
      // Use real MemoryStorageAdapter
      storage = new MemoryStorageAdapter();
      // Preload data
      for (const record of dataset) {
        await storage.upsertRecord("task", record);
      }
      await storage.setHydrationState("task", "hydrating");
      await storage.setHydrationState("task", "ready");

      client = createDatafnClient({
        schema: testSchema,
        sync: { remote: "http://example.com" }, // Should not be called
        clientId: "test-client",
        storage,
      });
    });

    it("Supports operator filters ($eq, $gt, $in, $contains)", async () => {
      // $gt
      const res1 = await client.table("task").query({
        filters: { prio: { $gt: 1 } },
      });
      expect(res1.data.map((r: any) => r.id).sort()).toEqual(["2", "4"]);

      // $in
      const res2 = await client.table("task").query({
        filters: { id: { $in: ["1", "3"] } },
      });
      expect(res2.data.map((r: any) => r.id).sort()).toEqual(["1", "3"]);

      // $contains (array)
      const res3 = await client.table("task").query({
        filters: { tags: { $contains: "urgent" } },
      });
      expect(res3.data.map((r: any) => r.id).sort()).toEqual(["2", "3"]);
    });

    it("Supports sorting (multi-field + id tie-breaker)", async () => {
      // Sort by prio asc, then title desc
      // 1 (A), 1 (C), 2 (B), 3 (D) -> title desc -> C, A, B, D
      // IDs: 3, 1, 2, 4
      const res = await client.table("task").query({
        sort: ["prio:asc", "title:desc"],
      });

      const ids = res.data.map((r: any) => r.id);
      expect(ids).toEqual(["3", "1", "2", "4"]);
    });

    it("Supports pagination (limit/offset)", async () => {
      // Sort by id: 1, 2, 3, 4
      // Offset 1, Limit 2 -> 2, 3
      const res = await client.table("task").query({
        sort: ["id:asc"],
        offset: 1,
        limit: 2,
      });

      expect(res.data.map((r: any) => r.id)).toEqual(["2", "3"]);
    });

    it("Supports field selection", async () => {
      const res = await client.table("task").query({
        select: ["title"], // id is implicit
      });

      const rec = res.data[0];
      expect(Object.keys(rec).sort()).toEqual(["id", "title"]);
      expect(rec.prio).toBeUndefined();
    });
  });

  describe("Relation query routing", () => {
    it("queries inverse many-many relations through the join inverse index", async () => {
      const schema = {
        resources: [
          {
            name: "node",
            version: 1,
            fields: [
              { name: "id", type: "string" as const, required: true },
              { name: "title", type: "string" as const, required: false },
            ],
          },
        ],
        relations: [
          {
            from: "node",
            to: "node",
            type: "many-many" as const,
            relation: "links",
            inverse: "backlinks",
            metadata: [{ name: "linkType", type: "string" as const }],
          },
        ],
      };
      const storage = new MemoryStorageAdapter();
      await storage.upsertRecord("node", { id: "node:target", title: "Target" });
      await storage.upsertRecord("node", { id: "node:source-a", title: "Source A" });
      await storage.upsertRecord("node", { id: "node:source-b", title: "Source B" });
      await storage.upsertJoinRow(getJoinStoreKey("node", "links", "node"), {
        from: "node:source-a",
        to: "node:target",
        linkType: "direct",
      });
      await storage.upsertJoinRow(getJoinStoreKey("node", "links", "node"), {
        from: "node:source-b",
        to: "node:target",
        linkType: "reference",
      });
      await storage.setHydrationState("node", "hydrating");
      await storage.setHydrationState("node", "ready");
      const listRecordsSpy = vi
        .spyOn(storage, "listRecords")
        .mockImplementation(async (resource: string) => {
          if (resource === "node") {
            throw new Error("node table scan should not happen");
          }
          return [];
        });
      const inverseSpy = vi.spyOn(storage, "getJoinRowsInverse");
      const client = createDatafnClient({
        schema,
        sync: { mode: "local-only" as const, offlinability: true },
        clientId: "client:relation-query",
        storage,
      });

      const result = await client.node.relation("backlinks").query("node:target", {
        select: ["#"],
      });

      expect(result.data).toEqual([
        { from: "node:source-a", to: "node:target", linkType: "direct" },
        { from: "node:source-b", to: "node:target", linkType: "reference" },
      ]);
      expect(inverseSpy).toHaveBeenCalledWith(
        getJoinStoreKey("node", "links", "node"),
        "node:target",
      );
      expect(listRecordsSpy).not.toHaveBeenCalledWith("node");
    });
  });

  // Phase 08: TV-OFFQ-001 and TV-OFFQ-002
  describe("TV-OFFQ-001: Index-aware local query routing", () => {
    let storage: MockStorageAdapter;
    let client: any;

    beforeEach(async () => {
      storage = new MockStorageAdapter({
        records: {
          node: [
            { id: "node:1", label: "X" },
            { id: "node:2", label: "Y" },
            { id: "node:3", label: "X" },
          ],
        },
        hydration: {
          node: "ready",
        },
      });

      const schema = {
        resources: [
          {
            name: "node",
            version: 1,
            fields: [
              { name: "id", type: "string" as const, required: true },
              { name: "label", type: "string" as const, required: false },
            ],
          },
        ],
        relations: [],
      };

      client = createDatafnClient({
        schema,
        sync: { mode: "local-only" as const, offlinability: true },
        clientId: "client:1",
        storage,
      });
    });

    it("TV-OFFQ-001: Local query routes `id eq` to getRecord", async () => {
      // Spy on getRecord
      const getRecordSpy = vi.spyOn(storage, "getRecord");

      const result = await client.table("node").query({
        resource: "node",
        version: 1,
        filters: { id: { eq: "node:1" } },
      });

      expect(getRecordSpy).toHaveBeenCalledWith("node", "node:1");
      expect(result.data).toEqual([{ id: "node:1", label: "X" }]);
    });

    it("TV-OFFQ-001: Indexed field eq uses findRecords", async () => {
      const findRecordsSpy = vi.spyOn(storage, "findRecords");

      const result = await client.table("node").query({
        resource: "node",
        version: 1,
        filters: { label: { eq: "X" } },
      });

      expect(findRecordsSpy).toHaveBeenCalledWith("node", "label", "X");
      expect(result.data.map((r: any) => r.id).sort()).toEqual([
        "node:1",
        "node:3",
      ]);
    });

    it("TV-OFFQ-001: Fallback to scan with deterministic ordering", async () => {
      const listRecordsSpy = vi.spyOn(storage, "listRecords");

      // Complex filter that cannot use index
      const result = await client.table("node").query({
        resource: "node",
        version: 1,
        filters: { label: { $ne: "Z" } },
      });

      expect(listRecordsSpy).toHaveBeenCalledWith("node");
      // Should be ordered by id:asc deterministically
      expect(result.data.map((r: any) => r.id)).toEqual([
        "node:1",
        "node:2",
        "node:3",
      ]);
    });
  });

  describe("TV-OFFQ-001N: Unsupported operator rejection", () => {
    let storage: MockStorageAdapter;
    let client: any;

    beforeEach(() => {
      storage = new MockStorageAdapter({
        records: { node: [{ id: "node:1", label: "X" }] },
        hydration: { node: "ready" },
      });

      const schema = {
        resources: [
          {
            name: "node",
            version: 1,
            fields: [{ name: "label", type: "string" as const, required: false }],
          },
        ],
        relations: [],
      };

      client = createDatafnClient({
        schema,
        sync: { mode: "local-only" as const, offlinability: true },
        clientId: "client:1",
        storage,
      });
    });

    it("TV-OFFQ-001N: Unsupported operator is rejected", async () => {
      await expect(
        client.table("node").query({
          resource: "node",
          version: 1,
          filters: { label: { $regex: "x" } },
        }),
      ).rejects.toMatchObject({
        code: "DFQL_UNSUPPORTED",
        message: expect.stringContaining("filters.label"),
      });
    });
  });

  describe("TV-OFFQ-002: Local filter operator coverage", () => {
    let storage: MockStorageAdapter;
    let client: any;

    beforeEach(() => {
      storage = new MockStorageAdapter({
        records: {
          node: [
            { id: "node:1", label: "A" },
            { id: "node:2", label: "B" },
            { id: "node:3", label: "C" },
          ],
        },
        hydration: { node: "ready" },
      });

      const schema = {
        resources: [
          {
            name: "node",
            version: 1,
            fields: [{ name: "label", type: "string" as const, required: false }],
          },
        ],
        relations: [],
      };

      client = createDatafnClient({
        schema,
        sync: { mode: "local-only" as const, offlinability: true },
        clientId: "client:1",
        storage,
      });
    });

    it("TV-OFFQ-002: $or works deterministically", async () => {
      const result = await client.table("node").query({
        resource: "node",
        version: 1,
        filters: { $or: [{ label: { eq: "A" } }, { label: { eq: "B" } }] },
      });

      expect(result.data.map((r: any) => r.id).sort()).toEqual([
        "node:1",
        "node:2",
      ]);
    });

    it("TV-OFFQ-002: Supports $and, $ne, $gt, $gte, $lt, $lte, $in, $nin", async () => {
      // $ne
      const res1 = await client.table("node").query({
        filters: { label: { $ne: "A" } },
      });
      expect(res1.data.map((r: any) => r.id).sort()).toEqual([
        "node:2",
        "node:3",
      ]);

      // $gte
      const res2 = await client.table("node").query({
        filters: { label: { $gte: "B" } },
      });
      expect(res2.data.map((r: any) => r.id).sort()).toEqual([
        "node:2",
        "node:3",
      ]);

      // $lt
      const res3 = await client.table("node").query({
        filters: { label: { $lt: "C" } },
      });
      expect(res3.data.map((r: any) => r.id).sort()).toEqual([
        "node:1",
        "node:2",
      ]);

      // $in
      const res4 = await client.table("node").query({
        filters: { id: { $in: ["node:1", "node:3"] } },
      });
      expect(res4.data.map((r: any) => r.id).sort()).toEqual([
        "node:1",
        "node:3",
      ]);

      // $nin
      const res5 = await client.table("node").query({
        filters: { id: { $nin: ["node:2"] } },
      });
      expect(res5.data.map((r: any) => r.id).sort()).toEqual([
        "node:1",
        "node:3",
      ]);

      // $and
      const res6 = await client.table("node").query({
        filters: {
          $and: [{ label: { $gte: "A" } }, { label: { $lte: "B" } }],
        },
      });
      expect(res6.data.map((r: any) => r.id).sort()).toEqual([
        "node:1",
        "node:2",
      ]);
    });
  });

  describe("TV-OFFQ-002N: $or must be array", () => {
    let storage: MockStorageAdapter;
    let client: any;

    beforeEach(() => {
      storage = new MockStorageAdapter({
        records: { node: [{ id: "node:1", label: "A" }] },
        hydration: { node: "ready" },
      });

      const schema = {
        resources: [
          {
            name: "node",
            version: 1,
            fields: [{ name: "label", type: "string" as const, required: false }],
          },
        ],
        relations: [],
      };

      client = createDatafnClient({
        schema,
        sync: { mode: "local-only" as const, offlinability: true },
        clientId: "client:1",
        storage,
      });
    });

    it("TV-OFFQ-002N: $or must be array; otherwise invalid", async () => {
      await expect(
        client.table("node").query({
          resource: "node",
          version: 1,
          filters: { $or: { label: { eq: "A" } } },
        }),
      ).rejects.toMatchObject({
        code: "DFQL_INVALID",
        message: expect.stringContaining("$or must be array"),
      });
    });
  });
});
