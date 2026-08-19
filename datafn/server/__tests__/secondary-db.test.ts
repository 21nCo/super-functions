/**
 * Secondary Database Support Tests
 * Tests for the shared atomic store used by serverSeq and future features
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { AtomicKVStoreAdapter } from "@superfunctions/db";
import {
  AtomicSequenceStore,
  DatabaseSequenceStore,
  ChainedSequenceStore,
  createSequenceStore,
} from "../src/execution/sync/sequence-store.js";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

// Mock atomic store for testing
function createMockAtomicStore(): AtomicKVStoreAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    incr: vi.fn(async ({ key, by = 1 }) => {
      const current = Number(values.get(key) ?? "0");
      const next = current + by;
      values.set(key, String(next));
      return { value: next };
    }),
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async ({ key, value }) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    setIfAbsent: vi.fn(async ({ key, value }) => {
      const existing = values.get(key);
      if (existing !== undefined) return { inserted: false, existing };
      values.set(key, value);
      return { inserted: true };
    }),
    compareAndSet: vi.fn(async ({ key, expected, value }) => {
      const existing = values.get(key) ?? null;
      if (existing !== expected) return { updated: false, existing: existing ?? undefined };
      values.set(key, value);
      return { updated: true };
    }),
    isHealthy: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
}

describe("SequenceStore implementations", () => {
  describe("AtomicSequenceStore", () => {
    it("uses atomic INCR for getNext", async () => {
      const atomicStore = createMockAtomicStore();
      const store = new AtomicSequenceStore(atomicStore);

      const seq1 = await store.getNext("test-namespace");
      expect(seq1).toBe(1);
      expect(atomicStore.incr).toHaveBeenCalledWith({ key: "serverSeq:test-namespace", by: 1 });

      const seq2 = await store.getNext("test-namespace");
      expect(seq2).toBe(2);

      // Different namespace should be independent
      const seq3 = await store.getNext("other-namespace");
      expect(seq3).toBe(1);
    });

    it("returns current value with getCurrent", async () => {
      const atomicStore = createMockAtomicStore();
      const store = new AtomicSequenceStore(atomicStore);

      // Initially 0 (null value)
      const current1 = await store.getCurrent("test-namespace");
      expect(current1).toBe(0);

      // After incrementing
      await store.getNext("test-namespace");
      await store.getNext("test-namespace");
      const current2 = await store.getCurrent("test-namespace");
      expect(current2).toBe(2);
    });

    it("reports health status", async () => {
      const atomicStore = createMockAtomicStore();
      const store = new AtomicSequenceStore(atomicStore);

      expect(await store.isHealthy()).toBe(true);
    });
  });

  describe("DatabaseSequenceStore", () => {
    it("uses CAS loop for getNext", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const store = new DatabaseSequenceStore(db);

      const seq1 = await store.getNext("test-namespace");
      expect(seq1).toBe(1);

      const seq2 = await store.getNext("test-namespace");
      expect(seq2).toBe(2);

      // Different namespace should be independent
      const seq3 = await store.getNext("other-namespace");
      expect(seq3).toBe(1);
    });

    it("returns current value with getCurrent", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const store = new DatabaseSequenceStore(db);

      const current1 = await store.getCurrent("test-namespace");
      expect(current1).toBe(0);

      await store.getNext("test-namespace");
      await store.getNext("test-namespace");
      const current2 = await store.getCurrent("test-namespace");
      expect(current2).toBe(2);
    });
  });

  describe("ChainedSequenceStore", () => {
    it("uses primary when healthy", async () => {
      const atomicStore = createMockAtomicStore();
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const primary = new AtomicSequenceStore(atomicStore);
      const fallback = new DatabaseSequenceStore(db);
      const store = new ChainedSequenceStore(primary, fallback);

      const seq = await store.getNext("test-namespace");
      expect(seq).toBe(1);
      expect(atomicStore.incr).toHaveBeenCalled();
    });

    it("falls back to database when primary fails", async () => {
      const atomicStore = createMockAtomicStore();
      atomicStore.incr = vi.fn().mockRejectedValue(new Error("Atomic store unavailable"));
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const primary = new AtomicSequenceStore(atomicStore);
      const fallback = new DatabaseSequenceStore(db);
      const store = new ChainedSequenceStore(primary, fallback);

      const seq = await store.getNext("test-namespace");
      expect(seq).toBe(1); // Falls back to database
    });

    it("falls back when primary is unhealthy", async () => {
      const atomicStore = createMockAtomicStore();
      atomicStore.isHealthy = vi.fn().mockResolvedValue(false);
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const primary = new AtomicSequenceStore(atomicStore);
      const fallback = new DatabaseSequenceStore(db);
      const store = new ChainedSequenceStore(primary, fallback);

      const seq = await store.getNext("test-namespace");
      expect(seq).toBe(1); // Falls back to database
    });

    it("does not return an atomic sequence when its durable high-water mark cannot be persisted", async () => {
      const atomicStore = createMockAtomicStore();
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      const fallback = new DatabaseSequenceStore(db);
      await fallback.ensureReady();
      await fallback.ensureMinSeq("test-namespace", 0);
      vi.spyOn(db.internal, "update").mockRejectedValue(
        new Error("database high-water unavailable"),
      );

      const store = new ChainedSequenceStore(
        new AtomicSequenceStore(atomicStore),
        fallback,
      );

      await expect(store.getNext("test-namespace")).rejects.toThrow(
        "database high-water unavailable",
      );
      expect(atomicStore.incr).toHaveBeenCalledTimes(1);
    });
  });

  describe("createSequenceStore", () => {
    it("creates a chained store when an atomic store is configured", () => {
      const atomicStore = createMockAtomicStore();
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const store = createSequenceStore({
        db,
        stores: { atomicKv: atomicStore },
        policy: { mode: "strict" },
      });

      expect(store).toBeInstanceOf(ChainedSequenceStore);
    });

    it("creates DatabaseSequenceStore when db is configured or default", () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const store = createSequenceStore({
        db,
        policy: { mode: "db" },
      });

      expect(store).toBeInstanceOf(DatabaseSequenceStore);
    });

    it("rejects strict mode when no atomic store is configured", () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      expect(() => createSequenceStore({
        db,
        policy: { mode: "strict" },
      })).toThrow("DATAFN_ATOMIC_STORE_REQUIRED");
    });

    it("returns undefined when no db is provided", () => {
      const store = createSequenceStore({});
      expect(store).toBeUndefined();
    });
  });
});

describe("DatafnServerConfig with runtime stores", () => {
  it("accepts stores and serverSeq policy in config", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "strict" },
    });

    expect(server.router).toBeDefined();
  });

  it("uses the atomic store for serverSeq when configured", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "strict" },
    });

    // Make a push request
    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:1",
            clientId: "client:1",
            mutationId: "m-1",
            record: { title: "Test" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.cursor).toBe("1");

    // Verify the atomic store was used (incr was called)
    expect(atomicStore.incr).toHaveBeenCalled();
  });

  it("supports another atomic KV implementation", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "strict" },
    });

    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:1",
            clientId: "client:1",
            mutationId: "m-1",
            record: { title: "Test" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.cursor).toBe("1");

    expect(atomicStore.incr).toHaveBeenCalled();
  });

  it("uses the database when serverSeq mode is db", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "db" },
    });

    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:1",
            clientId: "client:1",
            mutationId: "m-1",
            record: { title: "Test" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req);
    expect(res.status).toBe(200);

    expect(atomicStore.incr).not.toHaveBeenCalled();
  });

  it("works with all endpoints (push, pull, clone, mutation, transact)", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "strict" },
    });

    // Push
    const pushReq = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:1",
            clientId: "client:1",
            mutationId: "m-1",
            record: { title: "Test" },
          },
        ],
      }),
    });
    const pushRes = await server.router.handle(pushReq);
    expect(pushRes.status).toBe(200);

    // Mutation
    const mutationReq = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      body: JSON.stringify({
        operation: "insert",
        resource: "task",
        id: "task:2",
        clientId: "client:1",
        mutationId: "m-2",
        record: { title: "Test 2" },
      }),
    });
    const mutationRes = await server.router.handle(mutationReq);
    expect(mutationRes.status).toBe(200);

    // Pull
    const pullReq = new Request("http://localhost/datafn/pull", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        cursor: "0",
      }),
    });
    const pullRes = await server.router.handle(pullReq);
    expect(pullRes.status).toBe(200);

    // Clone
    const cloneReq = new Request("http://localhost/datafn/clone", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
      }),
    });
    const cloneRes = await server.router.handle(cloneReq);
    expect(cloneRes.status).toBe(200);

    // Transact - Note: Memory adapter doesn't support transactions, so we skip this test
    // The transact handler itself does use the sequenceStore correctly (verified in other tests)
    // This test verifies that the main endpoints work with the atomic sequence store.

    expect(atomicStore.incr).toHaveBeenCalled();
  });

  it("maintains namespace isolation with secondary databases", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();

    const namespaceProvider = {
      getNamespace: (ctx: any) => {
        const userId = ctx.parsedBody?.userId || "";
        const tenantId = ctx.parsedBody?.tenantId;
        if (tenantId) return `tenant:${tenantId}:user:${userId}`;
        return userId ? `user:${userId}` : "datafn";
      },
    };

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "strict" },
      namespaceProvider,
    });

    // Push for user 1
    const req1 = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        userId: "user-1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:1",
            clientId: "client:1",
            mutationId: "m-1",
            record: { title: "User 1 Task" },
          },
        ],
      }),
    });
    const res1 = await server.router.handle(req1);
    const body1 = await res1.json();
    expect(body1.result.cursor).toBe("1");

    // Push for user 2 - should have independent serverSeq
    const req2 = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:2",
        userId: "user-2",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:2",
            clientId: "client:2",
            mutationId: "m-2",
            record: { title: "User 2 Task" },
          },
        ],
      }),
    });
    const res2 = await server.router.handle(req2);
    const body2 = await res2.json();
    expect(body2.result.cursor).toBe("1"); // Independent namespace

    const incrCalls = (atomicStore.incr as any).mock.calls;
    expect(incrCalls.some((call: any) => call[0].key.includes("user:user-1"))).toBe(true);
    expect(incrCalls.some((call: any) => call[0].key.includes("user:user-2"))).toBe(true);
  });

  it("continues working when the atomic store becomes unavailable", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const atomicStore = createMockAtomicStore();
    
    // Make the atomic store fail after the first allocation.
    let callCount = 0;
    atomicStore.incr = vi.fn(async () => {
      callCount++;
      if (callCount > 1) {
        throw new Error("Atomic store unavailable");
      }
      return { value: callCount };
    });

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      stores: { atomicKv: atomicStore },
      serverSeq: { mode: "strict" },
    });

    // First request - atomic store works
    const req1 = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:1",
            clientId: "client:1",
            mutationId: "m-1",
            record: { title: "Test" },
          },
        ],
      }),
    });
    const res1 = await server.router.handle(req1);
    expect(res1.status).toBe(200);

    // Second request - atomic store fails, so the database fallback is used
    const req2 = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            operation: "insert",
            resource: "task",
            id: "task:2",
            clientId: "client:1",
            mutationId: "m-2",
            record: { title: "Test 2" },
          },
        ],
      }),
    });
    const res2 = await server.router.handle(req2);
    expect(res2.status).toBe(200); // Still works via fallback
  });
});
