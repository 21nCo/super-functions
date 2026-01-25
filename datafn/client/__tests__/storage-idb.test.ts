/**
 * IndexedDB Storage Tests
 * Tests STORAGE-IDB-001, CLIENT-CHANGELOG-001
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IndexedDbStorageAdapter } from "../src/adapters/indexedDbStorage.js";
import "fake-indexeddb/auto"; // Automatically mocks global indexedDB

describe("IndexedDbStorageAdapter", () => {
  let storage: IndexedDbStorageAdapter;
  const dbName = "test_db_" + Math.random(); // Unique DB per test run

  beforeEach(() => {
    storage = new IndexedDbStorageAdapter(dbName);
  });

  // Since we use in-memory fake-indexeddb, state might persist if not cleared?
  // fake-indexeddb/auto uses a fresh instance usually if we reset.
  // Actually, for multiple tests, we might want unique DB names or to delete DB.

  describe("Records", () => {
    it("TV-STORAGE-IDB-001: Persists data and enforces deterministic ordering", async () => {
      await storage.upsertRecord("task", { id: "task:3", title: "C" });
      await storage.upsertRecord("task", { id: "task:1", title: "A" });
      await storage.upsertRecord("task", { id: "task:2", title: "B" });

      const records = await storage.listRecords("task");
      expect(records).toHaveLength(3);
      // IndexedDB (and fake-indexeddb) sorts by key path
      expect(records[0].id).toBe("task:1");
      expect(records[1].id).toBe("task:2");
      expect(records[2].id).toBe("task:3");
    });

    it("Persists across instances (simulated reload)", async () => {
      await storage.upsertRecord("task", { id: "p1", val: 1 });

      // New adapter instance connecting to same DB
      const storage2 = new IndexedDbStorageAdapter(dbName);
      const record = await storage2.getRecord("task", "p1");
      expect(record).toEqual({ id: "p1", val: 1, resource: "task" });
      // Note: implementation ads 'resource' to record
    });
  });

  describe("Changelog", () => {
    it("CLIENT-CHANGELOG-001: Deduplicates entries via unique index", async () => {
      const entry = {
        clientId: "c1",
        mutationId: "m1",
        mutation: { op: "insert" },
        timestampMs: 100,
      };

      const r1 = await storage.changelogAppend(entry);
      expect(r1.seq).toBeDefined();

      const r2 = await storage.changelogAppend(entry);
      expect(r2.seq).toBe(r1.seq);

      const list = await storage.changelogList();
      expect(list).toHaveLength(1);
    });
  });
});
