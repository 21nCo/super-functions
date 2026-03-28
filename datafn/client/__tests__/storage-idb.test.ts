/**
 * IndexedDB Storage Tests
 * Tests STORAGE-IDB-001, CLIENT-CHANGELOG-001, STORAGE-INIT-001
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IndexedDbStorageAdapter } from "../src/adapters/indexedDbStorage.js";
import "fake-indexeddb/auto"; // Automatically mocks global indexedDB

describe("IndexedDbStorageAdapter", () => {
  let storage: IndexedDbStorageAdapter;
  const dbName = "test_db_" + Math.random(); // Unique DB per test run

  // Define a minimal schema for testing
  const testSchema = {
    resources: [
      { name: "task", version: 1, fields: [{ name: "id", type: "string" }, { name: "title", type: "string" }, { name: "val", type: "number" }] },
    ],
    relations: [],
  };

  beforeEach(() => {
    storage = new IndexedDbStorageAdapter(dbName, ["task"], testSchema);
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

      // New adapter instance connecting to same DB (must provide same schema)
      const storage2 = new IndexedDbStorageAdapter(dbName, ["task"], testSchema);
      const record = await storage2.getRecord("task", "p1");
      expect(record).toEqual({ id: "p1", val: 1 });
      // Note: v2 stores records in separate object stores per resource, 
      // so the 'resource' field is not included in the returned record
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

describe("IndexedDbStorageAdapter.create() — static factory (STORAGE-INIT-001)", () => {
  const schema = {
    resources: [
      {
        name: "todos",
        version: 1,
        fields: [
          { name: "id", type: "string" },
          { name: "text", type: "string" },
          { name: "completed", type: "boolean" },
        ],
        indices: { base: ["completed"] },
      },
      {
        name: "categories",
        version: 1,
        fields: [
          { name: "id", type: "string" },
          { name: "name", type: "string" },
        ],
      },
    ],
    relations: [
      {
        from: "todos",
        to: "categories",
        type: "many-many" as const,
        relation: "tags",
        inverse: "todos",
      },
    ],
  };

  it("creates all resource stores and join stores from schema", async () => {
    const dbName = "test_factory_" + Math.random();
    const adapter = IndexedDbStorageAdapter.create({ dbName, schema });

    // Should be able to write and read from both resources
    await adapter.upsertRecord("todos", { id: "todo:1", text: "Buy milk", completed: false });
    await adapter.upsertRecord("categories", { id: "cat:1", name: "Shopping" });

    const todos = await adapter.listRecords("todos");
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ id: "todo:1", text: "Buy milk" });

    const categories = await adapter.listRecords("categories");
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ id: "cat:1", name: "Shopping" });

    // Join store should be accessible
    await adapter.upsertJoinRow("join_todos_tags_categories", {
      from: "todo:1",
      to: "cat:1",
    });
    const joinRows = await adapter.getJoinRows("join_todos_tags_categories", "todo:1");
    expect(joinRows).toHaveLength(1);
    expect(joinRows[0]).toMatchObject({ from: "todo:1", to: "cat:1" });

    await adapter.close();
  });

  it("healthCheck passes for factory-created adapter", async () => {
    const dbName = "test_factory_health_" + Math.random();
    const adapter = IndexedDbStorageAdapter.create({ dbName, schema });

    // Trigger DB open by performing a read
    await adapter.listRecords("todos");

    const health = await adapter.healthCheck();
    // Should not report missing resource stores
    const missingStores = health.issues.filter((i) => i.includes("Missing object store"));
    expect(missingStores).toEqual([]);

    await adapter.close();
  });
});

describe("IndexedDbStorageAdapter — stale DB handling (STORAGE-INIT-001)", () => {
  const schema = {
    resources: [
      {
        name: "note",
        version: 1,
        fields: [
          { name: "id", type: "string" },
          { name: "body", type: "string" },
        ],
      },
    ],
    relations: [],
  };

  it("creates missing stores when reopening stale DB with schema", async () => {
    const dbName = "test_stale_" + Math.random();

    // Step 1: Open DB WITHOUT schema — only built-in stores created
    const adapter1 = new IndexedDbStorageAdapter(dbName);
    // Trigger DB open and verify built-in stores work
    await adapter1.changelogList();
    await adapter1.close();

    // Step 2: Reopen same DB WITH schema — should auto-create missing stores
    const adapter2 = IndexedDbStorageAdapter.create({ dbName, schema });

    // Should now be able to use the resource store
    await adapter2.upsertRecord("note", { id: "note:1", body: "Hello" });
    const record = await adapter2.getRecord("note", "note:1");
    expect(record).toMatchObject({ id: "note:1", body: "Hello" });

    await adapter2.close();
  });

  it("preserves existing data when bumping version for missing stores", async () => {
    const dbName = "test_stale_preserve_" + Math.random();

    // Step 1: Create DB with one resource
    const schema1 = {
      resources: [
        { name: "task", version: 1, fields: [{ name: "id", type: "string" }, { name: "title", type: "string" }] },
      ],
      relations: [],
    };
    const adapter1 = IndexedDbStorageAdapter.create({ dbName, schema: schema1 });
    await adapter1.upsertRecord("task", { id: "task:1", title: "Original" });
    await adapter1.close();

    // Step 2: Reopen with expanded schema (adds "label" resource)
    const schema2 = {
      resources: [
        { name: "task", version: 1, fields: [{ name: "id", type: "string" }, { name: "title", type: "string" }] },
        { name: "label", version: 1, fields: [{ name: "id", type: "string" }, { name: "color", type: "string" }] },
      ],
      relations: [],
    };
    const adapter2 = IndexedDbStorageAdapter.create({ dbName, schema: schema2 });

    // Original data should still be there
    const task = await adapter2.getRecord("task", "task:1");
    expect(task).toMatchObject({ id: "task:1", title: "Original" });

    // New store should be usable
    await adapter2.upsertRecord("label", { id: "label:1", color: "red" });
    const label = await adapter2.getRecord("label", "label:1");
    expect(label).toMatchObject({ id: "label:1", color: "red" });

    await adapter2.close();
  });
});

describe("createDatafnClient — storage validation (STORAGE-INIT-001)", () => {
  it("throws clear error when storage is missing resource stores", async () => {
    // Import dynamically to avoid circular issues
    const { createDatafnClient } = await import("../src/client.js");

    const schema = {
      resources: [
        { name: "widget", version: 1, fields: [{ name: "label", type: "string" as const }] },
      ],
    };

    const dbName = "test_validation_" + Math.random();
    // Create adapter WITHOUT schema — stores will be missing
    const badStorage = new IndexedDbStorageAdapter(dbName);

    const client = createDatafnClient({
      schema,
      clientId: "test-client",
      storage: badStorage,
      sync: { mode: "local-only", offlinability: true },
    });

    // The error should surface on first mutate/query
    await expect(
      client.mutate({
        resource: "widget",
        version: 1,
        operation: "insert",
        id: "widget:1",
        record: { label: "Test" },
        clientId: "test-client",
        mutationId: "m-1",
      }),
    ).rejects.toMatchObject({
      code: "DFQL_INVALID",
      message: expect.stringContaining("missing object store"),
    });

    await badStorage.close();
  });
});

describe("IndexedDbStorageAdapter — global cursor support (SYNC-CURSOR-001)", () => {
  const schema = {
    resources: [
      { name: "todos", version: 1, fields: [{ name: "id", type: "string" }, { name: "text", type: "string" }] },
      { name: "categories", version: 1, fields: [{ name: "id", type: "string" }, { name: "name", type: "string" }] },
    ],
    relations: [],
  };

  it("allows getCursor and setCursor for __global_cursor__ when using schema-based creation", async () => {
    const dbName = "test_global_cursor_" + Math.random();
    const adapter = IndexedDbStorageAdapter.create({ dbName, schema });

    // Should not throw for __global_cursor__ (internal cursor key)
    await expect(adapter.getCursor("__global_cursor__")).resolves.toBeNull();
    await expect(adapter.setCursor("__global_cursor__", "0")).resolves.toBeUndefined();
    await expect(adapter.getCursor("__global_cursor__")).resolves.toBe("0");
    await expect(adapter.setCursor("__global_cursor__", "100")).resolves.toBeUndefined();
    await expect(adapter.getCursor("__global_cursor__")).resolves.toBe("100");

    await adapter.close();
  });

  it("allows getCursor and setCursor for __datafn_actor_feed__", async () => {
    const dbName = "test_actor_feed_cursor_" + Math.random();
    const adapter = IndexedDbStorageAdapter.create({ dbName, schema });

    await expect(adapter.getCursor("__datafn_actor_feed__")).resolves.toBeNull();
    await expect(adapter.setCursor("__datafn_actor_feed__", "42")).resolves.toBeUndefined();
    await expect(adapter.getCursor("__datafn_actor_feed__")).resolves.toBe("42");

    await adapter.close();
  });

  it("still validates actual resource names when using schema-based creation", async () => {
    const dbName = "test_validation_cursor_" + Math.random();
    const adapter = IndexedDbStorageAdapter.create({ dbName, schema });

    // Valid resource cursors should work
    await expect(adapter.setCursor("todos", "5")).resolves.toBeUndefined();
    await expect(adapter.getCursor("todos")).resolves.toBe("5");

    // Invalid resource names should throw
    await expect(adapter.getCursor("unknown_table")).rejects.toThrow("Unknown table: unknown_table");
    await expect(adapter.setCursor("unknown_table", "10")).rejects.toThrow("Unknown table: unknown_table");

    await adapter.close();
  });

  it("allows per-resource and global cursor operations together", async () => {
    const dbName = "test_mixed_cursors_" + Math.random();
    const adapter = IndexedDbStorageAdapter.create({ dbName, schema });

    // Set per-resource cursors
    await adapter.setCursor("todos", "10");
    await adapter.setCursor("categories", "5");
    
    // Set global cursor
    await adapter.setCursor("__global_cursor__", "10");

    // All should be retrievable
    await expect(adapter.getCursor("todos")).resolves.toBe("10");
    await expect(adapter.getCursor("categories")).resolves.toBe("5");
    await expect(adapter.getCursor("__global_cursor__")).resolves.toBe("10");

    await adapter.close();
  });
});
