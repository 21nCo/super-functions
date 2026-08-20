/**
 * Memory Storage Tests
 * Tests STORAGE-MEM-001, CLIENT-CHANGELOG-001
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";

describe("MemoryStorageAdapter", () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe("Records", () => {
    it("TV-STORAGE-MEM-001: Deterministic ordering by id:asc", async () => {
      // Upsert records in random order
      await storage.upsertRecord("task", { id: "task:3", title: "C" });
      await storage.upsertRecord("task", { id: "task:1", title: "A" });
      await storage.upsertRecord("task", { id: "task:2", title: "B" });

      const records = await storage.listRecords("task");
      expect(records).toHaveLength(3);
      // Expect sorted order
      expect(records[0].id).toBe("task:1");
      expect(records[1].id).toBe("task:2");
      expect(records[2].id).toBe("task:3");
    });

    it("CRUD operations work", async () => {
      // Create
      await storage.upsertRecord("task", { id: "t1", val: 1 });
      const r1 = await storage.getRecord("task", "t1");
      expect(r1).toEqual({ id: "t1", val: 1 });

      // Update
      await storage.upsertRecord("task", { id: "t1", val: 2 });
      const r2 = await storage.getRecord("task", "t1");
      expect(r2).toEqual({ id: "t1", val: 2 });

      // Delete
      await storage.deleteRecord("task", "t1");
      const r3 = await storage.getRecord("task", "t1");
      expect(r3).toBeNull();
    });

    it("applies missing-record defaults atomically without overwriting a concurrent create", async () => {
      await Promise.all([
        storage.mergeRecord("task", "t1", { title: "first" }, {
          ifMissing: { title: "first", status: "default" },
        }),
        storage.mergeRecord("task", "t1", { priority: "high" }, {
          ifMissing: { priority: "high", status: "other-default" },
        }),
      ]);

      expect(await storage.getRecord("task", "t1")).toEqual({
        id: "t1",
        title: "first",
        status: "default",
        priority: "high",
      });
    });
  });

  describe("Join Rows", () => {
    it("Sorts by composite key (from:to)", async () => {
      await storage.upsertJoinRow("tasks", { from: "u1", to: "t2" });
      await storage.upsertJoinRow("tasks", { from: "u1", to: "t1" });

      const rows = await storage.listJoinRows("tasks");
      expect(rows).toHaveLength(2);
      // Correct sorting even though inserted out of order
      expect(rows[0]).toEqual({ from: "u1", to: "t1" });
      expect(rows[1]).toEqual({ from: "u1", to: "t2" });
    });

    it("CRUD works", async () => {
      await storage.upsertJoinRow("rel", { from: "a", to: "b", meta: 1 });
      const list = await storage.listJoinRows("rel");
      expect(list).toHaveLength(1);
      expect(list[0].meta).toBe(1);

      await storage.deleteJoinRow("rel", "a", "b");
      const list2 = await storage.listJoinRows("rel");
      expect(list2).toHaveLength(0);
    });
  });

  describe("Changelog", () => {
    it("CLIENT-CHANGELOG-001: Deduplicates entries", async () => {
      const entry = {
        clientId: "c1",
        mutationId: "m1",
        mutation: { op: "insert" },
        timestampMs: 100,
      };

      // Append once
      const r1 = await storage.changelogAppend(entry);
      expect(r1.seq).toBeDefined();

      // Append same again
      const r2 = await storage.changelogAppend(entry);

      // Should be same entry (seq id matched)
      expect(r2.seq).toBe(r1.seq);

      const list = await storage.changelogList();
      expect(list).toHaveLength(1);
    });

    it("Acks entries properly", async () => {
      await storage.changelogAppend({
        clientId: "c1",
        mutationId: "m1",
        mutation: {},
        timestampMs: 1,
      }); // seq 1
      await storage.changelogAppend({
        clientId: "c1",
        mutationId: "m2",
        mutation: {},
        timestampMs: 2,
      }); // seq 2

      await storage.changelogAck({ throughSeq: 1 });

      const list = await storage.changelogList();
      expect(list).toHaveLength(1);
      expect(list[0].mutationId).toBe("m2");
    });
  });
});
