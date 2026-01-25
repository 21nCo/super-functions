/**
 * Tests for storage adapter implementations of join/find methods
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../memoryStorage.js";
import { IndexedDbStorageAdapter } from "../indexedDbStorage.js";
import "fake-indexeddb/auto";

function runStorageTests(
  name: string,
  createAdapter: () => any
) {
  describe(`${name} Join/Find`, () => {
    let adapter: any;

    beforeEach(() => {
      adapter = createAdapter();
    });

    it("getJoinRows filters by fromId", async () => {
      await adapter.upsertJoinRow("tasks.tags", { from: "t1", to: "tag1", meta: 1 });
      await adapter.upsertJoinRow("tasks.tags", { from: "t1", to: "tag2", meta: 2 });
      await adapter.upsertJoinRow("tasks.tags", { from: "t2", to: "tag3", meta: 3 });

      const rows = await adapter.getJoinRows("tasks.tags", "t1");
      expect(rows).toHaveLength(2);
      expect(rows.map((r: any) => r.to).sort()).toEqual(["tag1", "tag2"]);
    });

    it("setJoinRows bulk upserts", async () => {
      await adapter.setJoinRows("tasks.tags", [
        { from: "t1", to: "tag1" },
        { from: "t1", to: "tag2" }
      ]);
      const rows = await adapter.getJoinRows("tasks.tags", "t1");
      expect(rows).toHaveLength(2);
    });

    it("findRecords filters by field", async () => {
      await adapter.upsertRecord("tasks", { id: "t1", status: "active" });
      await adapter.upsertRecord("tasks", { id: "t2", status: "done" });
      await adapter.upsertRecord("tasks", { id: "t3", status: "active" });

      const active = await adapter.findRecords("tasks", "status", "active");
      expect(active).toHaveLength(2);
      expect(active.map((r: any) => r.id).sort()).toEqual(["t1", "t3"]);
    });
  });
}

runStorageTests("Memory", () => new MemoryStorageAdapter(["tasks"]));
runStorageTests("IDB", () => new IndexedDbStorageAdapter("test_join_" + Date.now(), ["tasks"]));
