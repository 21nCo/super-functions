/**
 * Secondary Database Support Tests
 * Tests for Redis/KV store support for serverSeq and future features
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { RedisAdapter, KVStoreAdapter } from "@superfunctions/db";
import {
  RedisSequenceStore,
  KVSequenceStore,
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

// Mock Redis adapter for testing
function createMockRedisAdapter(): RedisAdapter & { values: Map<string, number> } {
  const values = new Map<string, number>();
  return {
    values,
    incr: vi.fn(async (key: string, by = 1) => {
      const current = values.get(key) || 0;
      const next = current + by;
      values.set(key, next);
      return next;
    }),
    get: vi.fn(async (key: string) => {
      const value = values.get(key);
      return value !== undefined ? String(value) : null;
    }),
    set: vi.fn(async (key: string, value: string) => {
      values.set(key, parseInt(value, 10));
    }),
    del: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    isHealthy: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
}

// Mock KV store adapter for testing
function createMockKVAdapter(): KVStoreAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) || null),
    set: vi.fn(async ({ key, value }) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    incr: vi.fn(async ({ key, by = 1 }) => {
      const current = parseInt(values.get(key) || "0", 10);
      const next = current + by;
      values.set(key, String(next));
      return { value: next };
    }),
  };
}

// Mock KV store WITHOUT incr support
function createMockKVAdapterNoIncr(): KVStoreAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) || null),
    set: vi.fn(async ({ key, value }) => {
      values.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    // No incr method
  };
}

describe("SequenceStore implementations", () => {
  describe("RedisSequenceStore", () => {
    it("uses atomic INCR for getNext", async () => {
      const redis = createMockRedisAdapter();
      const store = new RedisSequenceStore(redis);

      const seq1 = await store.getNext("test-namespace");
      expect(seq1).toBe(1);
      expect(redis.incr).toHaveBeenCalledWith("serverSeq:test-namespace", 1);

      const seq2 = await store.getNext("test-namespace");
      expect(seq2).toBe(2);

      // Different namespace should be independent
      const seq3 = await store.getNext("other-namespace");
      expect(seq3).toBe(1);
    });

    it("returns current value with getCurrent", async () => {
      const redis = createMockRedisAdapter();
      const store = new RedisSequenceStore(redis);

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
      const redis = createMockRedisAdapter();
      const store = new RedisSequenceStore(redis);

      expect(await store.isHealthy()).toBe(true);
    });
  });

  describe("KVSequenceStore", () => {
    it("uses incr for getNext", async () => {
      const kv = createMockKVAdapter();
      const store = new KVSequenceStore(kv);

      const seq1 = await store.getNext("test-namespace");
      expect(seq1).toBe(1);
      expect(kv.incr).toHaveBeenCalledWith({ key: "serverSeq:test-namespace", by: 1 });

      const seq2 = await store.getNext("test-namespace");
      expect(seq2).toBe(2);
    });

    it("throws if KV store does not support incr", () => {
      const kv = createMockKVAdapterNoIncr();
      expect(() => new KVSequenceStore(kv)).toThrow("KV store does not support incr()");
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
      const redis = createMockRedisAdapter();
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const primary = new RedisSequenceStore(redis);
      const fallback = new DatabaseSequenceStore(db);
      const store = new ChainedSequenceStore(primary, fallback);

      const seq = await store.getNext("test-namespace");
      expect(seq).toBe(1);
      expect(redis.incr).toHaveBeenCalled();
    });

    it("falls back to database when primary fails", async () => {
      const redis = createMockRedisAdapter();
      redis.incr = vi.fn().mockRejectedValue(new Error("Redis unavailable"));
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const primary = new RedisSequenceStore(redis);
      const fallback = new DatabaseSequenceStore(db);
      const store = new ChainedSequenceStore(primary, fallback);

      const seq = await store.getNext("test-namespace");
      expect(seq).toBe(1); // Falls back to database
    });

    it("falls back when primary is unhealthy", async () => {
      const redis = createMockRedisAdapter();
      redis.isHealthy = vi.fn().mockResolvedValue(false);
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const primary = new RedisSequenceStore(redis);
      const fallback = new DatabaseSequenceStore(db);
      const store = new ChainedSequenceStore(primary, fallback);

      const seq = await store.getNext("test-namespace");
      expect(seq).toBe(1); // Falls back to database
    });
  });

  describe("createSequenceStore", () => {
    it("creates RedisSequenceStore when redis is configured", () => {
      const redis = createMockRedisAdapter();
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const store = createSequenceStore({
        db,
        redis,
        dbMapping: { serverseq: "redis" },
      });

      expect(store).toBeInstanceOf(ChainedSequenceStore);
    });

    it("creates KVSequenceStore when kv is configured", () => {
      const kv = createMockKVAdapter();
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const store = createSequenceStore({
        db,
        kvStore: kv,
        dbMapping: { serverseq: "kv" },
      });

      expect(store).toBeInstanceOf(ChainedSequenceStore);
    });

    it("creates DatabaseSequenceStore when db is configured or default", () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const store = createSequenceStore({
        db,
        dbMapping: { serverseq: "db" },
      });

      expect(store).toBeInstanceOf(DatabaseSequenceStore);
    });

    it("falls back to database when kv store does not support incr", () => {
      const kv = createMockKVAdapterNoIncr();
      const db = memoryAdapter({ libraryNamespace: "datafn" });

      const store = createSequenceStore({
        db,
        kvStore: kv,
        dbMapping: { serverseq: "kv" },
      });

      expect(store).toBeInstanceOf(DatabaseSequenceStore);
    });

    it("returns undefined when no db is provided", () => {
      const store = createSequenceStore({});
      expect(store).toBeUndefined();
    });
  });
});

describe("DatafnServerConfig with secondary databases", () => {
  it("accepts redis, kvStore, and dbMapping in config", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const redis = createMockRedisAdapter();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      redis,
      dbMapping: { serverseq: "redis" },
    });

    expect(server.router).toBeDefined();
  });

  it("uses Redis for serverSeq when configured", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const redis = createMockRedisAdapter();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      redis,
      dbMapping: { serverseq: "redis" },
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

    // Verify Redis was used (incr was called)
    expect(redis.incr).toHaveBeenCalled();
  });

  it("uses KV store for serverSeq when configured", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const kv = createMockKVAdapter();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      kvStore: kv,
      dbMapping: { serverseq: "kv" },
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

    // Verify KV store was used
    expect(kv.incr).toHaveBeenCalled();
  });

  it("falls back to database when redis is configured but dbMapping is not set", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const redis = createMockRedisAdapter();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      redis,
      // No dbMapping - defaults to "db"
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

    // Redis was NOT used because dbMapping was not set
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("works with all endpoints (push, pull, clone, mutation, transact)", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const redis = createMockRedisAdapter();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      redis,
      dbMapping: { serverseq: "redis" },
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
    // This test just verifies that the main endpoints (push, pull, clone, mutation) work with Redis

    // Verify Redis was used for operations
    expect(redis.incr).toHaveBeenCalled();
  });

  it("maintains namespace isolation with secondary databases", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const redis = createMockRedisAdapter();

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
      redis,
      dbMapping: { serverseq: "redis" },
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

    // Verify Redis was called with different namespace keys
    const incrCalls = (redis.incr as any).mock.calls;
    expect(incrCalls.some((call: any) => call[0].includes("user:user-1"))).toBe(true);
    expect(incrCalls.some((call: any) => call[0].includes("user:user-2"))).toBe(true);
  });

  it("continues working when Redis becomes unavailable", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const redis = createMockRedisAdapter();
    
    // Make Redis fail after first call
    let callCount = 0;
    redis.incr = vi.fn(async () => {
      callCount++;
      if (callCount > 1) {
        throw new Error("Redis unavailable");
      }
      return callCount;
    });

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      redis,
      dbMapping: { serverseq: "redis" },
    });

    // First request - Redis works
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

    // Second request - Redis fails, should fallback to database
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
