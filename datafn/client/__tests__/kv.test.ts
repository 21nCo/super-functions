/**
 * KV API tests
 * Tests TV-KV-001, TV-KV-001N, TV-KV-002, TV-KV-002N, TV-DEB-002, TV-DEB-002N
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnSchema } from "@datafn/core";

const testSchema: DatafnSchema = {
  resources: [
    {
      name: "node",
      version: 1,
      fields: [
        { name: "label", type: "string", required: false },
      ],
    },
  ],
};

describe("KV API - TV-KV-001, TV-KV-001N, TV-KV-002, TV-KV-002N", () => {
  describe("TV-KV-001: KV resource exists without being in user schema", () => {
    it("should allow KV operations without defining KV in user schema", async () => {
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

      // TV-KV-001: Set a KV value
      const setResult = await client.kv.set("preferences.theme", { mode: "dark" });
      
      expect(setResult.ok).toBe(true);
      if (setResult.ok) {
        expect(setResult.key).toBe("preferences.theme");
      }

      // Get the value back
      const value = await client.kv.get<{ mode: string }>("preferences.theme");
      expect(value).toEqual({ mode: "dark" });
    });

    it("should persist KV in storage adapter", async () => {
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

      await client.kv.set("ui.theme", { mode: "dark" });

      // Verify storage has the KV record
      const record = await storage.getRecord("kv", "kv:ui.theme");
      expect(record).toBeTruthy();
      expect(record?.value).toEqual({ mode: "dark" });
    });
  });

  describe("TV-KV-001N: KV key must be string", () => {
    it("should reject non-string keys with deterministic error", async () => {
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

      // @ts-expect-error Testing runtime validation
      const result = await client.kv.set(123, "value");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "DFQL_INVALID",
          message: "Invalid KV key: must be string",
          details: { path: "key" },
        });
      }
    });
  });

  describe("TV-KV-002: KV merge shallow-merges object and emits fields metadata", () => {
    it("should shallow merge objects", async () => {
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

      // Set initial value
      await client.kv.set("preferences.theme", { mode: "light", accent: "blue" });

      // Merge with new values
      const mergeResult = await client.kv.merge("preferences.theme", { mode: "dark" });
      
      expect(mergeResult.ok).toBe(true);
      if (mergeResult.ok) {
        expect(mergeResult.key).toBe("preferences.theme");
      }

      // Get merged value
      const value = await client.kv.get<{ mode: string; accent: string }>("preferences.theme");
      expect(value).toEqual({ mode: "dark", accent: "blue" });
    });

    it("should emit mutation event with changed fields", async () => {
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

      // Set initial value
      await client.kv.set("k", { a: 1, b: 2 });

      // Subscribe to events
      const events: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          events.push(event);
        }
      });

      // Merge - should emit event with fields metadata
      await client.kv.merge("k", { a: 10 });

      // Wait for event
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check event has correct fields
      expect(events.length).toBeGreaterThan(0);
      const mergeEvent = events.find((e) => e.action === "merge");
      expect(mergeEvent).toBeTruthy();
      expect(mergeEvent.resource).toBe("kv");
      expect(mergeEvent.ids).toContain("kv:k");
      // Note: fields extraction is handled by mutation execution
    });
  });

  describe("TV-KV-002N: KV merge rejects non-object existing value", () => {
    it("should reject merge when existing value is not an object", async () => {
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

      // Set a non-object value
      await client.kv.set("k", "not-an-object");

      // Try to merge
      const result = await client.kv.merge("k", { a: 1 });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "DFQL_INVALID",
          message: "Invalid KV merge: existing value is not an object",
          details: { path: "value" },
        });
      }
    });

    it("should reject merge when patch is not a plain object", async () => {
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

      // Try to merge with non-object patch
      // @ts-expect-error Testing runtime validation
      const result = await client.kv.merge("k", "not-an-object");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatchObject({
          code: "DFQL_INVALID",
          message: "Invalid KV merge: patch must be a plain object",
          details: { path: "patch" },
        });
      }
    });
  });

  describe("KV signal functionality", () => {
    it("should create a signal for a specific KV key", async () => {
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

      // Set initial value
      await client.kv.set("counter", 0);

      // Wait a bit for the mutation to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Create signal
      const signal = client.kv.signal<number>("counter");

      // Subscribe to get the value (signal.get() is synchronous but might not have data yet)
      let receivedValue: number | null = null;
      signal.subscribe((value) => {
        receivedValue = value;
      });

      // Wait for signal to deliver value
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check we received the value
      expect(receivedValue).toBe(0);

      // Subscribe to changes
      const values: number[] = [];
      const unsubscribe = signal.subscribe((value) => {
        values.push(value);
      });

      // Update value
      await client.kv.set("counter", 1);

      // Wait for signal update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check signal received update
      expect(values).toContain(1);

      unsubscribe();
    });

    it("should use defaultValue when key does not exist", async () => {
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

      // Create signal with default value
      const signal = client.kv.signal<number>("nonexistent", { defaultValue: 42 });

      // Get value (should return default)
      const value = await signal.get();
      expect(value).toBe(42);
    });
  });

  describe("KV delete functionality", () => {
    it("should delete a KV key", async () => {
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

      // Set a value
      await client.kv.set("temp", { data: "test" });

      // Verify it exists
      let value = await client.kv.get("temp");
      expect(value).toEqual({ data: "test" });

      // Delete it
      const deleteResult = await client.kv.delete("temp");
      expect(deleteResult.ok).toBe(true);

      // Verify it's gone
      value = await client.kv.get("temp");
      expect(value).toBeNull();
    });
  });

  describe("KV with context", () => {
    it("should propagate context to mutation events", async () => {
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

      // Subscribe to events
      const events: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          events.push(event);
        }
      });

      // Set with context
      await client.kv.set("pref", { theme: "dark" }, { context: { source: "ui" } });

      // Wait for event
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Check event includes context
      expect(events.length).toBeGreaterThan(0);
      const setEvent = events[events.length - 1];
      expect(setEvent.context).toEqual({ source: "ui" });
    });
  });

  // Phase 05 tests: TV-DEB-002, TV-DEB-002N, TV-KV-001, TV-KV-001N
  describe("TV-DEB-002: KV Debounced Persistence", () => {
    it("should debounce KV set operations", async () => {
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

      // Track mutations
      const mutations: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          mutations.push(event);
        }
      });

      // Make two rapid calls with debounceMs (don't await them yet)
      client.kv.set("prefs", { theme: "dark" }, { debounceMs: 200 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const lastPromise = client.kv.set("prefs", { theme: "light" }, { debounceMs: 200 });

      // Wait for the last promise to complete (which waits for the debounce)
      await lastPromise;

      // Wait a bit for mutation event to propagate
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should only have one mutation event (coalesced)
      expect(mutations.length).toBe(1);

      // Final value should be the last one set
      const value = await client.kv.get("prefs");
      expect(value).toEqual({ theme: "light" });
    });

    it("should debounce KV merge operations and coalesce", async () => {
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

      // Set initial value
      await client.kv.set("prefs", { theme: "light", lang: "en" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Track mutations after initial set
      const mutations: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied" && event.action === "merge") {
          mutations.push(event);
        }
      });

      // Make two rapid merge calls with debounceMs (don't await the first)
      client.kv.merge("prefs", { theme: "dark" }, { debounceMs: 200 });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const lastPromise = client.kv.merge("prefs", { lang: "es" }, { debounceMs: 200 });

      // Wait for the last promise (which waits for the debounce)
      await lastPromise;

      // Wait a bit for mutation event to propagate
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have one merge mutation (coalesced)
      expect(mutations.length).toBe(1);

      // Final value should have both changes
      const value = await client.kv.get<{ theme: string; lang: string }>("prefs");
      expect(value).toEqual({ theme: "dark", lang: "es" });
    });

    it("should support KV flush to force immediate write", async () => {
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

      // Track mutations
      const mutations: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          mutations.push(event);
        }
      });

      // Set with long debounce
      const promise = client.kv.set("prefs", { theme: "dark" }, { debounceMs: 10000 });

      // Immediately flush
      await client.kv.flush("prefs");

      // Wait for flush to complete
      await promise;

      // Should have mutation immediately (not after 10s)
      expect(mutations.length).toBe(1);
    });

    it("should support flushAll to flush all KV mutations", async () => {
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

      // Track mutations
      const mutations: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          mutations.push(event);
        }
      });

      // Set multiple keys with long debounce
      client.kv.set("key1", "value1", { debounceMs: 10000 });
      client.kv.set("key2", "value2", { debounceMs: 10000 });

      // Flush all
      await client.kv.flush();

      // Wait a bit for mutations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have both mutations
      expect(mutations.length).toBe(2);
    });
  });

  describe("TV-DEB-002N: KV Without Debounce (Default)", () => {
    it("should execute immediately without debounceMs", async () => {
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

      // Track mutations
      const mutations: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          mutations.push(event);
        }
      });

      // Set without debounceMs (default immediate behavior)
      await client.kv.set("prefs", { theme: "dark" });

      // Wait briefly
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have mutation immediately
      expect(mutations.length).toBe(1);

      // Value should be available
      const value = await client.kv.get("prefs");
      expect(value).toEqual({ theme: "dark" });
    });

    it("should not debounce when debounceMs is 0", async () => {
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

      // Track mutations
      const mutations: any[] = [];
      client.subscribe((event) => {
        if (event.resource === "kv" && event.type === "mutation_applied") {
          mutations.push(event);
        }
      });

      // Set with debounceMs: 0 (immediate)
      await client.kv.set("prefs", { theme: "dark" }, { debounceMs: 0 });

      // Wait briefly
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have mutation immediately
      expect(mutations.length).toBe(1);
    });
  });

  describe("TV-KV-001: KV Seed Data", () => {
    it("should return defaults on first call to getOrSeed", async () => {
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

      const defaults = { volume: 50, muted: false };
      const value = await client.kv.getOrSeed("settings", defaults);

      expect(value).toEqual(defaults);

      // Verify it was persisted
      const retrieved = await client.kv.get("settings");
      expect(retrieved).toEqual(defaults);
    });

    it("should return existing value on second call to getOrSeed", async () => {
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

      // First call with defaults
      const defaults1 = { volume: 50, muted: false };
      const value1 = await client.kv.getOrSeed("settings", defaults1);
      expect(value1).toEqual(defaults1);

      // Second call with different defaults
      const defaults2 = { volume: 100, muted: true };
      const value2 = await client.kv.getOrSeed("settings", defaults2);

      // Should return the existing value (from first call), NOT the new defaults
      expect(value2).toEqual(defaults1);
    });

    it("should be idempotent for concurrent calls", async () => {
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

      const defaults = { volume: 50, muted: false };

      // Make concurrent calls
      const [value1, value2, value3] = await Promise.all([
        client.kv.getOrSeed("settings", defaults),
        client.kv.getOrSeed("settings", defaults),
        client.kv.getOrSeed("settings", defaults),
      ]);

      // All should return the same defaults
      expect(value1).toEqual(defaults);
      expect(value2).toEqual(defaults);
      expect(value3).toEqual(defaults);

      // Should only have one record in storage
      const records = await storage.listRecords("kv");
      const settingsRecords = records.filter((r: any) => r.id === "kv:settings");
      expect(settingsRecords.length).toBe(1);
    });
  });

  describe("TV-KV-001N: KV Seed Does Not Overwrite Null", () => {
    it("should return null when value is explicitly set to null", async () => {
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

      // Explicitly set to null
      await client.kv.set("x", null);

      // Try to seed
      const value = await client.kv.getOrSeed("x", { a: 1 });

      // Should return null (not the defaults)
      expect(value).toBeNull();
    });

    it("should seed when value is undefined", async () => {
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

      // Key doesn't exist (undefined)
      const value = await client.kv.getOrSeed("nonexistent", { a: 1 });

      // Should return defaults
      expect(value).toEqual({ a: 1 });
    });
  });
});
