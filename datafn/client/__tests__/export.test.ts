/**
 * Export/Import tests
 * Tests TV-EXP-001, TV-EXP-001N, TV-EXP-002, TV-EXP-002N
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnSchema } from "@datafn/core";
import type { DatafnExportPayload, DatafnImportResult } from "../src/export.js";

const testSchema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "status", type: "string", required: false },
        { name: "priority", type: "number", required: false },
      ],
    },
    {
      name: "user",
      version: 1,
      fields: [
        { name: "name", type: "string", required: true },
        { name: "email", type: "string", required: false },
      ],
    },
    {
      name: "tag",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
      ],
    },
  ],
  relations: [
    {
      from: "task",
      relation: "tags",
      to: "tag",
      type: "many-many",
      inverse: "tasks",
    },
  ],
};

describe("Export/Import - TV-EXP-001, TV-EXP-001N, TV-EXP-002, TV-EXP-002N", () => {
  describe("TV-EXP-001: Data Export", () => {
    it("should export all records in correct format", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Insert test data
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:1",
        record: { title: "Task 1", status: "open" },
      });
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:2",
        record: { title: "Task 2", status: "done" },
      });
      await client.mutate({
        resource: "user",
        operation: "insert",
        id: "user:1",
        record: { name: "Alice", email: "alice@example.com" },
      });

      // Export data
      const exported = await client.exportData() as DatafnExportPayload;

      // Verify structure
      expect(exported.version).toBe(1);
      expect(exported.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 timestamp
      // Note: kv and datafnTimezoneChange are built-in resources.
      expect(exported.schema).toEqual([
        { name: "task", version: 1 },
        { name: "user", version: 1 },
        { name: "tag", version: 1 },
        { name: "kv", version: 1 },
        { name: "datafnTimezoneChange", version: 1 },
      ]);

      // Verify records
      expect(exported.resources.task).toHaveLength(2);
      expect(exported.resources.task).toContainEqual(
        expect.objectContaining({ id: "task:1", title: "Task 1" })
      );
      expect(exported.resources.task).toContainEqual(
        expect.objectContaining({ id: "task:2", title: "Task 2" })
      );
      expect(exported.resources.user).toHaveLength(1);
      expect(exported.resources.user[0]).toMatchObject({
        id: "user:1",
        name: "Alice",
        email: "alice@example.com",
      });
    });

    it("should export join rows for many-many relations", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Insert test data with relations
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:1",
        record: { title: "Task 1" },
      });
      await client.mutate({
        resource: "tag",
        operation: "insert",
        id: "tag:A",
        record: { label: "urgent" },
      });

      // Create join row
      const joinStoreName = "join_task_tags_tag";
      await storage.upsertJoinRow(joinStoreName, {
        from: "task:1",
        to: "tag:A",
      });

      // Export data
      const exported = await client.exportData() as DatafnExportPayload;

      // Verify join rows are included
      expect(exported.joins).toBeDefined();
      expect(exported.joins![joinStoreName]).toHaveLength(1);
      expect(exported.joins![joinStoreName][0]).toMatchObject({
        from: "task:1",
        to: "tag:A",
      });
    });

    it("should handle export when no data exists", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Export with no data
      const exported = await client.exportData() as DatafnExportPayload;

      expect(exported.version).toBe(1);
      expect(exported.resources.task).toEqual([]);
      expect(exported.resources.user).toEqual([]);
      expect(exported.resources.tag).toEqual([]);
    });
  });

  describe("TV-EXP-001N: Export with resource filter", () => {
    it("should only export specified resources", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Insert data in multiple resources
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:1",
        record: { title: "Task 1" },
      });
      await client.mutate({
        resource: "user",
        operation: "insert",
        id: "user:1",
        record: { name: "Alice" },
      });

      // Export only tasks
      const exported = await client.exportData({
        resources: ["task"],
      }) as DatafnExportPayload;

      // Verify only task schema is included
      expect(exported.schema).toEqual([{ name: "task", version: 1 }]);

      // Verify only task records are included
      expect(exported.resources.task).toHaveLength(1);
      expect(exported.resources.user).toBeUndefined();
    });

    it("should handle empty resource filter gracefully", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Insert test data
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:1",
        record: { title: "Task 1" },
      });

      // Export with empty filter (should export all)
      const exported = await client.exportData({
        resources: [],
      }) as DatafnExportPayload;

      expect(exported.schema).toHaveLength(5); // All resources including built-ins
      expect(exported.resources.task).toHaveLength(1);
    });

    it("should throw error when storage is not available", async () => {
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
        },
      });

      await expect(client.exportData()).rejects.toMatchObject({
        code: "DFQL_INVALID",
        message: "Export requires storage adapter",
      });
    });
  });

  describe("TV-EXP-002: Data Import", () => {
    it("should import records correctly", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Create import payload
      const importPayload: DatafnExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: [{ name: "task", version: 1 }],
        resources: {
          task: [
            { id: "task:1", title: "Imported Task 1", status: "open" },
            { id: "task:2", title: "Imported Task 2", status: "done" },
          ],
        },
        joins: {},
      };

      // Import data
      const result = await client.importData(importPayload) as DatafnImportResult;

      // Verify result
      expect(result.ok).toBe(true);
      expect(result.stats.resources.task).toEqual({
        imported: 2,
        skipped: 0,
      });
      expect(result.errors).toEqual([]);

      // Verify records exist in storage
      const task1 = await storage.getRecord("task", "task:1");
      expect(task1).toMatchObject({
        id: "task:1",
        title: "Imported Task 1",
        status: "open",
      });

      const task2 = await storage.getRecord("task", "task:2");
      expect(task2).toMatchObject({
        id: "task:2",
        title: "Imported Task 2",
        status: "done",
      });
    });

    it("should upsert existing records on import", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Insert initial record
      await client.mutate({
        resource: "task",
        operation: "insert",
        id: "task:1",
        record: { title: "Original", status: "open" },
      });

      // Import updated version
      const importPayload: DatafnExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: [{ name: "task", version: 1 }],
        resources: {
          task: [{ id: "task:1", title: "Updated", status: "done" }],
        },
      };

      const result = await client.importData(importPayload) as DatafnImportResult;

      expect(result.ok).toBe(true);
      expect(result.stats.resources.task.imported).toBe(1);

      // Verify record was updated
      const task = await storage.getRecord("task", "task:1");
      expect(task).toMatchObject({
        id: "task:1",
        title: "Updated",
        status: "done",
      });
    });

    it("should import join rows", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Import with join rows
      const importPayload: DatafnExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: [
          { name: "task", version: 1 },
          { name: "tag", version: 1 },
        ],
        resources: {
          task: [{ id: "task:1", title: "Task 1" }],
          tag: [{ id: "tag:A", label: "urgent" }],
        },
        joins: {
          join_task_tags_tag: [{ from: "task:1", to: "tag:A" }],
        },
      };

      const result = await client.importData(importPayload) as DatafnImportResult;

      expect(result.ok).toBe(true);
      expect(result.stats.joins.join_task_tags_tag).toEqual({
        imported: 1,
        skipped: 0,
      });

      // Verify join row exists
      const joinRows = await storage.listJoinRows("join_task_tags_tag");
      expect(joinRows).toHaveLength(1);
      expect(joinRows[0]).toMatchObject({
        from: "task:1",
        to: "tag:A",
      });
    });

    it("should handle import errors gracefully", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Override upsertRecord to simulate an error on second record
      let callCount = 0;
      const originalUpsert = storage.upsertRecord.bind(storage);
      storage.upsertRecord = async (resource: string, record: any) => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Simulated storage error");
        }
        return originalUpsert(resource, record);
      };

      const importPayload: DatafnExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: [{ name: "task", version: 1 }],
        resources: {
          task: [
            { id: "task:1", title: "Task 1" },
            { id: "task:2", title: "Task 2" },
          ],
        },
      };

      const result = await client.importData(importPayload) as DatafnImportResult;

      expect(result.ok).toBe(false); // Has errors
      expect(result.stats.resources.task).toEqual({
        imported: 1,
        skipped: 1,
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        resource: "task",
        id: "task:2",
        code: "IMPORT_FAILED",
      });
    });
  });

  describe("TV-EXP-002N: Import unknown resource", () => {
    it("should skip unknown resources without error", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      // Import payload with unknown resource
      const importPayload: DatafnExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: [{ name: "unknown_resource", version: 1 }],
        resources: {
          unknown_resource: [{ id: "unknown:1", data: "test" }],
          task: [{ id: "task:1", title: "Task 1" }],
        },
      };

      const result = await client.importData(importPayload) as DatafnImportResult;

      expect(result.ok).toBe(true);
      expect(result.stats.resources.unknown_resource).toBeUndefined();
      expect(result.stats.resources.task).toEqual({
        imported: 1,
        skipped: 0,
      });
    });

    it("should reject unsupported export version", async () => {
      const storage = new MemoryStorageAdapter();
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage,
      });

      const importPayload = {
        version: 99, // Unsupported version
        exportedAt: new Date().toISOString(),
        schema: [],
        resources: {},
      } as any;

      await expect(client.importData(importPayload)).rejects.toMatchObject({
        code: "DFQL_INVALID",
        message: "Unsupported export version",
      });
    });

    it("should throw error when storage is not available", async () => {
      const client = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
        },
      });

      const importPayload: DatafnExportPayload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        schema: [],
        resources: {},
      };

      await expect(client.importData(importPayload)).rejects.toMatchObject({
        code: "DFQL_INVALID",
        message: "Import requires storage adapter",
      });
    });
  });

  describe("Export → Import roundtrip", () => {
    it("should preserve data through export-import cycle", async () => {
      const storage1 = new MemoryStorageAdapter();
      const client1 = createDatafnClient({
        clientId: "client:1",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage: storage1,
      });

      // Insert test data
      await client1.mutate({
        resource: "task",
        operation: "insert",
        id: "task:1",
        record: { title: "Task 1", status: "open", priority: 1 },
      });
      await client1.mutate({
        resource: "user",
        operation: "insert",
        id: "user:1",
        record: { name: "Alice", email: "alice@example.com" },
      });

      // Export from client1
      const exported = await client1.exportData() as DatafnExportPayload;

      // Create new client with fresh storage
      const storage2 = new MemoryStorageAdapter();
      const client2 = createDatafnClient({
        clientId: "client:2",
        schema: testSchema,
        sync: {
          mode: "local-only",
          offlinability: true,
        },
        storage: storage2,
      });

      // Import to client2
      const result = await client2.importData(exported) as DatafnImportResult;

      expect(result.ok).toBe(true);

      // Verify data matches
      const task = await storage2.getRecord("task", "task:1");
      expect(task).toMatchObject({
        id: "task:1",
        title: "Task 1",
        status: "open",
        priority: 1,
      });

      const user = await storage2.getRecord("user", "user:1");
      expect(user).toMatchObject({
        id: "user:1",
        name: "Alice",
        email: "alice@example.com",
      });
    });
  });
});
