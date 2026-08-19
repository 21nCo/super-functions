/**
 * Tests for storage adapter implementations of join/find methods
 */

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../memoryStorage.js";
import { IndexedDbStorageAdapter } from "../indexedDbStorage.js";
import "fake-indexeddb/auto";

const mockSchema: any = {
  resources: [
    { name: "tasks", version: 1, fields: [] },
    { name: "tags", version: 1, fields: [] }
  ],
  relations: [
    {
      type: "many-many",
      from: "tasks",
      to: "tags",
      relation: "tags"
    }
  ]
};

const taskOnlySchema: any = {
  resources: [{ name: "tasks", version: 1, fields: [] }],
  relations: []
};

function openRawDb(dbName: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: ["type", "key"] });
      }
      if (!db.objectStoreNames.contains("changelog")) {
        db.createObjectStore("changelog", {
          keyPath: "seq",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runStorageTests(
  name: string,
  createAdapter: () => any
) {
  describe(`${name} Join/Find`, () => {
    let adapter: any;
    // For MemoryAdapter, keys are arbitrary. For IDB, they must match schema.
    const joinKey = name === "IDB" ? "join_tasks_tags_tags" : "tasks.tags";

    beforeEach(() => {
      adapter = createAdapter();
    });

    it("getJoinRows filters by fromId", async () => {
      await adapter.upsertJoinRow(joinKey, { from: "t1", to: "tag1", meta: 1 });
      await adapter.upsertJoinRow(joinKey, { from: "t1", to: "tag2", meta: 2 });
      await adapter.upsertJoinRow(joinKey, { from: "t2", to: "tag3", meta: 3 });

      const rows = await adapter.getJoinRows(joinKey, "t1");
      expect(rows).toHaveLength(2);
      expect(rows.map((r: any) => r.to).sort()).toEqual(["tag1", "tag2"]);
    });
    
    // New test for inverse
    if (name === "IDB") {
      it("getJoinRowsInverse filters by toId", async () => {
        await adapter.upsertJoinRow(joinKey, { from: "t1", to: "tag1", meta: 1 });
        await adapter.upsertJoinRow(joinKey, { from: "t2", to: "tag1", meta: 2 });
        await adapter.upsertJoinRow(joinKey, { from: "t3", to: "tag2", meta: 3 });
  
        const rows = await adapter.getJoinRowsInverse(joinKey, "tag1");
        expect(rows).toHaveLength(2);
        expect(rows.map((r: any) => r.from).sort()).toEqual(["t1", "t2"]);
      });
    }

    it("setJoinRows bulk upserts", async () => {
      await adapter.setJoinRows(joinKey, [
        { from: "t1", to: "tag1" },
        { from: "t1", to: "tag2" }
      ]);
      const rows = await adapter.getJoinRows(joinKey, "t1");
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
runStorageTests("IDB", () => new IndexedDbStorageAdapter("test_join_" + Date.now(), ["tasks", "tags"], mockSchema));

describe("IDB stale schema upgrades", () => {
  it("reopens databases after ensureStores has bumped the IndexedDB version", async () => {
    const dbName = `test_version_reopen_${Date.now()}`;
    const adapterV1 = IndexedDbStorageAdapter.create({
      dbName,
      schema: taskOnlySchema,
    });

    expect(await adapterV1.healthCheck()).toEqual({ ok: true, issues: [] });
    await adapterV1.close();

    const adapterV2 = IndexedDbStorageAdapter.create({
      dbName,
      schema: mockSchema,
    });
    expect(await adapterV2.countJoinRows("join_tasks_tags_tags")).toBe(0);
    await adapterV2.close();

    const adapterAfterBump = IndexedDbStorageAdapter.create({
      dbName,
      schema: mockSchema,
    });
    expect(await adapterAfterBump.countJoinRows("join_tasks_tags_tags")).toBe(0);
    await adapterAfterBump.close();
  });

  it("reports a blocked schema upgrade instead of hanging forever", async () => {
    const dbName = `test_blocked_upgrade_${Date.now()}`;
    const rawDb = await openRawDb(dbName, 2);
    const adapter = IndexedDbStorageAdapter.create({
      dbName,
      schema: taskOnlySchema,
    });

    const health = await adapter.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.issues.join(" ")).toContain("IndexedDB upgrade blocked");
    rawDb.close();
  });
});
