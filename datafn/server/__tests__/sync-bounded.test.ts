/**
 * Bounded Sync Pull tests + getLatestServerSeq fix tests
 * Tests TV-SYNC-BOUND-001, TV-SYNC-BOUND-002, TV-SYNC-BOUND-003
 * Tests TV-SEQ-001, TV-SEQ-002 (SEQ-001: getLatestServerSeq O(1) fix)
 */

import { describe, it, expect, vi } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { ChangeTrackingService, recordChangesWithRetry } from "../src/execution/sync/change-tracking.js";
import { DatabaseSequenceStore, ChainedSequenceStore } from "../src/execution/sync/sequence-store.js";
import { createDatafnServer } from "../src/server.js";

const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
  relations: [],
};

describe("Phase 04: Bounded Sync Pull", () => {
  describe("SYNC-001: Bounded getChangesSince", () => {
    it("TV-SYNC-BOUND-001: getChangesSince with limit returns bounded results", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      const changeTracking = new ChangeTrackingService(db, "datafn");

      // Create 100 change entries for resource "task"
      for (let i = 1; i <= 100; i++) {
        const seq = await changeTracking.getNextServerSeq();
        await changeTracking.recordChange({
          serverSeq: seq,
          resource: "task",
          id: `task:${i}`,
          op: "insert",
          record: { id: `task:${i}`, title: `Task ${i}` },
        });
      }

      // Fetch with limit 10
      const changes = await changeTracking.getChangesSince({
        resource: "task",
        sinceSeq: 0,
        limit: 10,
      });

      expect(changes).toHaveLength(10);
      // Verify ordered ASC by serverSeq
      expect(changes[0].serverSeq).toBe(1);
      expect(changes[9].serverSeq).toBe(10);
      for (let i = 1; i < changes.length; i++) {
        expect(changes[i].serverSeq).toBeGreaterThan(changes[i - 1].serverSeq);
      }
    });

    it("TV-SYNC-BOUND-002: getChangesSince without limit returns all (backward compat)", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      const changeTracking = new ChangeTrackingService(db, "datafn");

      // Create 100 change entries
      for (let i = 1; i <= 100; i++) {
        const seq = await changeTracking.getNextServerSeq();
        await changeTracking.recordChange({
          serverSeq: seq,
          resource: "task",
          id: `task:${i}`,
          op: "insert",
          record: { id: `task:${i}`, title: `Task ${i}` },
        });
      }

      // Fetch without limit — should return all 100
      const changes = await changeTracking.getChangesSince({
        resource: "task",
        sinceSeq: 0,
      });

      expect(changes).toHaveLength(100);
    });

    it("getChangesSince with limit and sinceSeq returns correct window", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      const changeTracking = new ChangeTrackingService(db, "datafn");

      // Create 50 change entries
      for (let i = 1; i <= 50; i++) {
        const seq = await changeTracking.getNextServerSeq();
        await changeTracking.recordChange({
          serverSeq: seq,
          resource: "task",
          id: `task:${i}`,
          op: "insert",
          record: { id: `task:${i}`, title: `Task ${i}` },
        });
      }

      // Fetch since seq 40 with limit 5
      const changes = await changeTracking.getChangesSince({
        resource: "task",
        sinceSeq: 40,
        limit: 5,
      });

      expect(changes).toHaveLength(5);
      expect(changes[0].serverSeq).toBe(41);
      expect(changes[4].serverSeq).toBe(45);
    });
  });

  describe("SYNC-002/003: Server-enforced pull limit", () => {
    it("TV-SYNC-BOUND-003: Pull canonical with large client limit gets capped by server maxPullLimit", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        database: db,
        limits: { maxPullLimit: 20 },
      });

      // Push 50 mutations to create change entries
      const mutations = [];
      for (let i = 1; i <= 50; i++) {
        mutations.push({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: `m-${i}`,
          id: `task:${i}`,
          record: { title: `Task ${i}` },
        });
      }

      await server.router.handle(
        new Request("http://localhost/datafn/push", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            mutations,
          }),
        }),
      );

      // Pull with client limit 5000 (should be capped to maxPullLimit=20)
      const res = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursors: { task: "0" },
            limit: 5000,
          }),
        }),
      );

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      // Total changes should be capped at maxPullLimit (20)
      const totalRecords = (body.result.records.task?.length || 0)
        + (body.result.merged?.task?.length || 0)
        + (body.result.deleted?.task?.length || 0);
      expect(totalRecords).toBeLessThanOrEqual(20);
      expect(totalRecords).toBe(20);
    });

    it("Pull canonical without maxPullLimit config uses default 1000", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        database: db,
        // No maxPullLimit set — default 1000
      });

      // Push a few mutations
      await server.router.handle(
        new Request("http://localhost/datafn/push", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            mutations: [
              {
                resource: "task",
                version: 1,
                operation: "insert",
                clientId: "client:1",
                mutationId: "m-1",
                id: "task:1",
                record: { title: "A" },
              },
            ],
          }),
        }),
      );

      // Pull with limit 5000 — capped by default maxPullLimit (1000)
      const res = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursors: { task: "0" },
            limit: 5000,
          }),
        }),
      );

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);
      // Only 1 change exists, so we get 1 (under the default 1000 cap)
      const taskRecords = body.result.records.task || [];
      expect(taskRecords).toHaveLength(1);
    });

    it("TV-SYNC-BOUND-003b: Pull canonical enforces per-resource limit too", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: defaultSchema,
        database: db,
        limits: { maxPullLimit: 10 },
      });

      // Push 30 mutations
      const mutations = [];
      for (let i = 1; i <= 30; i++) {
        mutations.push({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: `m-${i}`,
          id: `task:${i}`,
          record: { title: `Task ${i}` },
        });
      }

      await server.router.handle(
        new Request("http://localhost/datafn/push", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            mutations,
          }),
        }),
      );

      // Pull with no client limit (defaults to 200, but server caps to 10)
      const res = await server.router.handle(
        new Request("http://localhost/datafn/pull", {
          method: "POST",
          body: JSON.stringify({
            clientId: "client:1",
            cursors: { task: "0" },
          }),
        }),
      );

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.ok).toBe(true);

      const totalRecords = (body.result.records.task?.length || 0)
        + (body.result.merged?.task?.length || 0)
        + (body.result.deleted?.task?.length || 0);
      expect(totalRecords).toBeLessThanOrEqual(10);
      expect(totalRecords).toBe(10);
    });
  });
});

describe("SEQ-001: getLatestServerSeq O(1) fix", () => {
  it("TV-SEQ-001: getLatestServerSeq returns max server_seq using DESC+limit:1", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();

    const changeTracking = new ChangeTrackingService(db, "datafn");

    // Insert 5 change entries for resource "tasks" in non-sequential order
    const seqs = [1, 5, 3, 10, 7];
    for (const seq of seqs) {
      await changeTracking.recordChange({
        serverSeq: seq,
        resource: "tasks",
        id: `task:${seq}`,
        op: "insert",
        record: { id: `task:${seq}` },
      });
    }

    // Spy on db.internal.findMany to verify call args
    const findManySpy = vi.spyOn(db.internal, "findMany");

    const result = await changeTracking.getLatestServerSeq({ resource: "tasks" });

    // Verify correct value returned
    expect(result).toBe(10);

    // Verify findMany was called with DESC ordering and limit:1
    const call = findManySpy.mock.calls[0];
    expect(call[2]).toEqual({ orderBy: "-server_seq", limit: 1 });

    // Verify NOT called with ascending orderBy (no limit)
    expect(call[2]).not.toEqual({ orderBy: "server_seq" });

    findManySpy.mockRestore();
  });

  it("TV-SEQ-002: getLatestServerSeq returns 0 when no changes exist", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();

    const changeTracking = new ChangeTrackingService(db, "datafn");

    const findManySpy = vi.spyOn(db.internal, "findMany");

    const result = await changeTracking.getLatestServerSeq({ resource: "tasks" });

    expect(result).toBe(0);

    // Verify findMany returned empty array path
    expect(findManySpy).toHaveBeenCalledOnce();
    const call = findManySpy.mock.calls[0];
    expect(call[2]).toEqual({ orderBy: "-server_seq", limit: 1 });

    findManySpy.mockRestore();
  });
});

describe("BATCH-SEQ-001/002/003: DatabaseSequenceStore.getNextN()", () => {
  it("TV-BATCH-SEQ-001: getNextN allocates contiguous range", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();
    const store = new DatabaseSequenceStore(db);

    // First allocation starts from 1
    const result = await store.getNextN("datafn", 3);
    expect(result).toEqual([1, 2, 3]);

    // Second allocation continues from 4
    const result2 = await store.getNextN("datafn", 3);
    expect(result2).toEqual([4, 5, 6]);
  });

  it("TV-BATCH-SEQ-002: getNextN with count=1 is equivalent to getNext", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();
    const store = new DatabaseSequenceStore(db);

    const single = await store.getNextN("datafn", 1);
    expect(single).toEqual([1]);

    const next = await store.getNext("datafn");
    expect(next).toBe(2);
  });

  it("TV-BATCH-SEQ-003: getNextN rejects invalid count", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();
    const store = new DatabaseSequenceStore(db);

    await expect(store.getNextN("datafn", 0)).rejects.toThrow("count must be a positive integer");
    await expect(store.getNextN("datafn", -1)).rejects.toThrow("count must be a positive integer");
    await expect(store.getNextN("datafn", 1001)).rejects.toThrow("count must be a positive integer");
  });

  it("TV-BATCH-SEQ-004: ChainedSequenceStore.getNextN delegates to primary when healthy", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();
    const primary = new DatabaseSequenceStore(db);
    const fallbackDb = memoryAdapter({ libraryNamespace: "datafn" });
    await fallbackDb.initialize();
    const fallback = new DatabaseSequenceStore(fallbackDb);

    const fallbackStore = new ChainedSequenceStore(primary, fallback);
    const result = await fallbackStore.getNextN("datafn", 3);
    expect(result).toEqual([1, 2, 3]);

    const primaryCurrent = await primary.getCurrent("datafn");
    const fallbackCurrent = await fallback.getCurrent("datafn");
    expect(primaryCurrent).toBe(3);
    expect(fallbackCurrent).toBe(3);
  });
});

describe("BATCH-CHG-001/002: ChangeTrackingService.recordChanges()", () => {
  it("TV-BATCH-CHG-001: recordChanges inserts multiple entries in order", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();
    const ct = new ChangeTrackingService(db, "datafn");

    const entries = [
      { serverSeq: 10, resource: "tasks", id: "t1", op: "merge" as const, record: { id: "t1", categoryId: "c1" } },
      { serverSeq: 11, resource: "join_tasks_tags", id: "t1:tag1", op: "insert" as const, record: { from: "t1", to: "tag1" } },
      { serverSeq: 12, resource: "join_tasks_tags", id: "t1:tag2", op: "insert" as const, record: { from: "t1", to: "tag2" } },
    ];

    // EXE-018: Memory adapter has createMany, so batch path is used.
    // Spy on createMany if available, otherwise create.
    const hasBatch = typeof db.internal.createMany === "function";
    const spy = hasBatch
      ? vi.spyOn(db.internal, "createMany" as any)
      : vi.spyOn(db.internal, "create");

    await ct.recordChanges(entries);

    if (hasBatch) {
      // Batch path: one createMany call with all 3 rows
      expect(spy).toHaveBeenCalledTimes(1);
      const rows = spy.mock.calls[0][1] as any[];
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ server_seq: 10, resource: "tasks" });
      expect(rows[1]).toMatchObject({ server_seq: 11, resource: "join_tasks_tags" });
      expect(rows[2]).toMatchObject({ server_seq: 12, resource: "join_tasks_tags" });
    } else {
      // Sequential fallback: 3 individual create calls
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy.mock.calls[0][1]).toMatchObject({ server_seq: 10, resource: "tasks" });
      expect(spy.mock.calls[1][1]).toMatchObject({ server_seq: 11, resource: "join_tasks_tags" });
      expect(spy.mock.calls[2][1]).toMatchObject({ server_seq: 12, resource: "join_tasks_tags" });
    }

    // Verify all entries are stored correctly regardless of path
    const changes = await ct.getChangesSince({ resource: "tasks", sinceSeq: 0 });
    expect(changes).toHaveLength(1);
    expect(changes[0].serverSeq).toBe(10);

    spy.mockRestore();
  });

  it("TV-BATCH-CHG-002: recordChanges propagates error on failure and stops", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.initialize();
    const ct = new ChangeTrackingService(db, "datafn");

    const hasBatch = typeof db.internal.createMany === "function";

    if (hasBatch) {
      // EXE-018: Batch path — mock createMany to throw
      const originalCreateMany = db.internal.createMany!.bind(db.internal);
      db.internal.createMany = async (table: string, data: any[]) => {
        throw new Error("DB write failure");
      };

      const entries = [
        { serverSeq: 1, resource: "tasks", id: "t1", op: "insert" as const, record: null },
        { serverSeq: 2, resource: "tasks", id: "t2", op: "insert" as const, record: null },
        { serverSeq: 3, resource: "tasks", id: "t3", op: "insert" as const, record: null },
      ];

      await expect(ct.recordChanges(entries)).rejects.toThrow("DB write failure");

      // No entries written (batch is atomic)
      const changes = await ct.getChangesSince({ resource: "tasks", sinceSeq: 0 });
      expect(changes).toHaveLength(0);

      db.internal.createMany = originalCreateMany;
    } else {
      // Sequential fallback path
      let callCount = 0;
      const originalCreate = db.internal.create.bind(db.internal);
      vi.spyOn(db.internal, "create").mockImplementation(async (table, data) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("DB write failure");
        }
        return originalCreate(table, data);
      });

      const entries = [
        { serverSeq: 1, resource: "tasks", id: "t1", op: "insert" as const, record: null },
        { serverSeq: 2, resource: "tasks", id: "t2", op: "insert" as const, record: null },
        { serverSeq: 3, resource: "tasks", id: "t3", op: "insert" as const, record: null },
      ];

      await expect(ct.recordChanges(entries)).rejects.toThrow("DB write failure");

      // First entry was created, third was NOT (early exit)
      const changes = await ct.getChangesSince({ resource: "tasks", sinceSeq: 0 });
      expect(changes).toHaveLength(1);
      expect(changes[0].serverSeq).toBe(1);

      vi.restoreAllMocks();
    }
  });
});

describe("FIX-REL-002: recordChangesWithRetry()", () => {
  it("retries bulk write and succeeds on third attempt", async () => {
    const entries = [
      { serverSeq: 1, resource: "task", id: "task:1", op: "insert" as const, record: { id: "task:1" } },
    ];
    let attempts = 0;
    const changeTracking = {
      recordChanges: vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("transient failure");
        }
      }),
    } as unknown as ChangeTrackingService;

    await recordChangesWithRetry(changeTracking, entries, 2);

    expect(attempts).toBe(3);
    expect((changeTracking as any).recordChanges).toHaveBeenCalledTimes(3);
  });

  it("throws after retries are exhausted for bulk write", async () => {
    const entries = [
      { serverSeq: 2, resource: "task", id: "task:2", op: "merge" as const, record: { id: "task:2" } },
    ];
    let attempts = 0;
    const changeTracking = {
      recordChanges: vi.fn(async () => {
        attempts++;
        throw new Error("permanent failure");
      }),
    } as unknown as ChangeTrackingService;

    await expect(recordChangesWithRetry(changeTracking, entries, 2)).rejects.toThrow("permanent failure");
    expect(attempts).toBe(3);
    expect((changeTracking as any).recordChanges).toHaveBeenCalledTimes(3);
  });
});
