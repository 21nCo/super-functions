/**
 * Health Check Tests (HEAL-001)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnClient } from "../src/client.js";
import { MemoryStorageAdapter } from "../src/adapters/memoryStorage.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [
        { name: "id", type: "string" as const, constraints: { required: true } },
        { name: "title", type: "string" as const, constraints: { required: true } },
        { name: "status", type: "string" as const },
      ],
      idPrefix: "task",
    },
  ],
  relations: [],
};

describe("Health Check (HEAL-001)", () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    // Include "kv" in valid resources as it's automatically added by the client
    storage = new MemoryStorageAdapter(["task", "kv"], schema);
  });

  describe("TV-HEAL-001 — Health Check Pass", () => {
    it("should return ok: true for healthy storage", async () => {
      const client = createDatafnClient({
        schema,
        clientId: "test-client",
        storage,
        sync: { mode: "local-only" },
      });

      const result = await client.checkHealth();

      if (!result.ok) {
        console.log("Health check failed with issues:", result.issues);
      }

      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.action).toBe("none");
    });

    it("should return ok: true when no storage is provided", async () => {
      const client = createDatafnClient({
        schema,
        clientId: "test-client",
        sync: { mode: "local-only" },
      });

      const result = await client.checkHealth();

      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.action).toBe("none");
    });
  });

  describe("TV-HEAL-001N — Health Check Fail", () => {
    it("should detect stuck hydrating state", async () => {
      // Use a stub remote so we're not in local-only mode
      // This prevents the auto-init from setting everything to ready
      const stubRemote = {
        query: async () => ({ ok: true, result: { data: [], nextCursor: null } }),
        mutation: async () => ({ ok: true, result: { ok: true } }),
        transact: async () => ({ ok: true, result: { ok: true, results: [] } }),
        seed: async () => ({ ok: true, result: { ok: true } }),
        clone: async () => ({ ok: true, result: { ok: true, resources: {} } }),
        pull: async () => ({ ok: true, result: { ok: true, updates: [] } }),
        push: async () => ({ ok: true, result: { ok: true } }),
        reconcile: async () => ({ ok: true, result: { ok: true } }),
      };

      const client = createDatafnClient({
        schema,
        clientId: "test-client",
        storage,
        sync: { 
          remoteAdapter: stubRemote,
          offlinability: true,
        },
      });

      // Manually set hydration state to "hydrating" to simulate stuck state
      await storage.setHydrationState("task", "hydrating");

      const result = await client.checkHealth();

      expect(result.ok).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues[0]).toContain("hydrating");
      expect(result.action).toBe("reclone");
    });

    it("should detect storage issues via healthCheck", async () => {
      // Create a mock storage adapter that reports issues
      const faultyStorage = new MemoryStorageAdapter(["task", "kv"], schema);
      
      // Override healthCheck to report issues
      faultyStorage.healthCheck = async () => ({
        ok: false,
        issues: ["Mock storage corruption"],
      });

      const client = createDatafnClient({
        schema,
        clientId: "test-client",
        storage: faultyStorage,
        sync: { mode: "local-only" },
      });

      const result = await client.checkHealth();

      expect(result.ok).toBe(false);
      expect(result.issues).toContain("Mock storage corruption");
      expect(result.action).toBe("reclone");
    });
  });

  describe("Storage Adapter Health Check", () => {
    it("memory adapter should always be healthy", async () => {
      const result = await storage.healthCheck();

      expect(result.ok).toBe(true);
      expect(result.issues).toEqual([]);
    });
  });
});
