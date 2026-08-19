/**
 * PHASE_08 Data Integrity + Reliability HIGH Tests
 * Tests for DI-001, DI-003, REL-008, REL-010, REL-011
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ChainedSequenceStore,
  DatabaseSequenceStore,
} from "../src/execution/sync/sequence-store.js";
import { ChangeTrackingService } from "../src/execution/sync/change-tracking.js";
import { executePush } from "../src/execution/sync/push.js";
import { DbIdempotencyStore } from "../src/execution/idempotency-db.js";
import { MemoryIdempotencyStore } from "../src/execution/idempotency.js";
import { executeModifyRelation } from "../src/execution/mutation/relations.js";
import { RedisRateLimiter } from "../src/middleware/rate-limit.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";

// ─── Shared helpers ──────────────────────────────────────────────────────────

function makeInternalApi(overrides?: any) {
  return {
    ensureTable: vi.fn(async () => {}),
    findOne: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    create: vi.fn(async (_table: string, data: any) => data),
    update: vi.fn(async () => 1),
    delete: vi.fn(async () => 0),
    ...overrides,
  };
}

function makeAdapter(overrides?: any) {
  const internal = makeInternalApi();
  return {
    internal,
    create: vi.fn(),
    findOne: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async () => 1),
    updateMany: vi.fn(async () => 1),
    upsert: vi.fn(async () => ({})),
    delete: vi.fn(async () => 0),
    capabilities: { operations: { batch: false } },
    ...overrides,
  } as any;
}

const manyManySchema: DatafnSchema = {
  resources: [
    { name: "tasks", version: 1, fields: [{ name: "title", type: "string", required: true }] },
    { name: "users", version: 1, fields: [{ name: "name", type: "string", required: true }] },
  ],
  relations: [
    { type: "many-many", from: "tasks", relation: "assignees", to: "users" },
  ],
};

// ─── DI-001: modifyRelation atomic findOne + update ───────────────────────

describe("DI-001: executeModifyRelation wraps findOne + update in transaction", () => {
  it("TV-DI-001a: calls adapter.transaction() when available", async () => {
    const txSpy = vi.fn(async (fn: any) => {
      const txAdapter = makeAdapter({
        findOne: vi.fn(async () => ({ id: "task1:user1", from: "task1", to: "user1" })),
        update: vi.fn(async () => 1),
      });
      await fn(txAdapter);
    });

    const adapter = makeAdapter({ transaction: txSpy });

    const mutation = {
      resource: "tasks",
      operation: "modifyRelation" as const,
      id: "task1",
      relations: { assignees: [{ $ref: "user1", weight: 2 }] },
    } as any;

    const result = await executeModifyRelation(adapter, manyManySchema, mutation, "default");

    expect(txSpy).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("TV-DI-001b: uses sequential findOne + update when no transaction support", async () => {
    const findOneSpy = vi.fn(async () => ({ id: "task1:user1", from: "task1", to: "user1" }));
    const updateSpy = vi.fn(async () => 1);

    const adapter = makeAdapter({ findOne: findOneSpy, update: updateSpy });
    delete (adapter as any).transaction;

    const mutation = {
      resource: "tasks",
      operation: "modifyRelation" as const,
      id: "task1",
      relations: { assignees: [{ $ref: "user1", weight: 3 }] },
    } as any;

    const result = await executeModifyRelation(adapter, manyManySchema, mutation, "default");

    expect(result.ok).toBe(true);
    expect(findOneSpy).toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalled();
  });

  it("TV-DI-001c: returns not_found when join row is missing", async () => {
    const adapter = makeAdapter({
      findOne: vi.fn(async () => null), // join row absent
    });

    const mutation = {
      resource: "tasks",
      operation: "modifyRelation" as const,
      id: "task1",
      relations: { assignees: [{ $ref: "user99" }] },
    } as any;

    const result = await executeModifyRelation(adapter, manyManySchema, mutation, "default");

    expect(result.ok).toBe(false);
    expect((result as any).code).toBe("NOT_FOUND");
  });
});

// ─── DI-003: ChainedSequenceStore — no duplicate sequences on failover ───

describe("DI-003: ChainedSequenceStore prevents duplicate sequences on Redis→DB failover", () => {
  it("TV-DI-003a: ensureMinSeq called with lastKnownPrimarySeq when primary fails", async () => {
    let primaryCalls = 0;
    const mockPrimary = {
      getNext: vi.fn(),
      getNextN: vi.fn(async (_ns: string, count: number) => {
        primaryCalls++;
        if (primaryCalls === 1) return [100];
        throw new Error("Redis unavailable");
      }),
      getCurrent: vi.fn(),
      isHealthy: vi.fn(async () => true),
    };

    const mockDb = { internal: makeInternalApi() } as any;
    const dbStore = new DatabaseSequenceStore(mockDb);
    const ensureMinSeqSpy = vi.spyOn(dbStore, "ensureMinSeq").mockResolvedValue();
    // Also make getNextN work so the fallback call succeeds
    vi.spyOn(dbStore, "getNextN").mockResolvedValue([101]);

    const fallback = new ChainedSequenceStore(mockPrimary, dbStore);

    // First call: primary returns 100, lastKnownPrimarySeq[default] = 100
    const first = await fallback.getNextN("default", 1);
    expect(first).toEqual([100]);

    // Second call: primary throws → fallback to DB, must call ensureMinSeq(default, 100) first
    await fallback.getNextN("default", 1);

    expect(ensureMinSeqSpy).toHaveBeenCalledWith("default", 100);
  });

  it("TV-DI-003b: ensureMinSeq called when primary isHealthy() returns false", async () => {
    const mockPrimary = {
      getNext: vi.fn(),
      getNextN: vi.fn(async () => [50]),
      getCurrent: vi.fn(),
      isHealthy: vi.fn(async () => false), // unhealthy after first call
    };

    let isHealthyCount = 0;
    mockPrimary.isHealthy = vi.fn(async () => {
      isHealthyCount++;
      return isHealthyCount < 2; // healthy first time, unhealthy from second
    });

    const mockDb = { internal: makeInternalApi() } as any;
    const dbStore = new DatabaseSequenceStore(mockDb);
    const ensureMinSeqSpy = vi.spyOn(dbStore, "ensureMinSeq").mockResolvedValue();
    vi.spyOn(dbStore, "getNextN").mockResolvedValue([51]);

    const fallback = new ChainedSequenceStore(mockPrimary, dbStore);

    // First call: healthy → primary returns 50
    await fallback.getNextN("default", 1);
    // Second call: unhealthy → fallback to DB, ensureMinSeq(default, 50)
    await fallback.getNextN("default", 1);

    expect(ensureMinSeqSpy).toHaveBeenCalledWith("default", 50);
  });

  it("TV-DI-003c: ensureMinSeq NOT called when no primary seq known", async () => {
    const mockPrimary = {
      getNext: vi.fn(),
      getNextN: vi.fn(async () => { throw new Error("Redis down"); }),
      getCurrent: vi.fn(),
    };

    const mockDb = { internal: makeInternalApi() } as any;
    const dbStore = new DatabaseSequenceStore(mockDb);
    const ensureMinSeqSpy = vi.spyOn(dbStore, "ensureMinSeq").mockResolvedValue();
    vi.spyOn(dbStore, "getNextN").mockResolvedValue([1]);

    const fallback = new ChainedSequenceStore(mockPrimary, dbStore);

    // First call immediately fails — no primary seq was ever tracked
    await fallback.getNextN("default", 1);

    expect(ensureMinSeqSpy).not.toHaveBeenCalled();
  });

  it("TV-DI-003d: ensureMinSeq uses a CAS filter after create loses a race", async () => {
    const internal = makeInternalApi({
      findOne: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ next_server_seq: 5 }),
      create: vi.fn(async () => {
        throw new Error("duplicate");
      }),
      update: vi.fn(async () => 0),
    });
    const db = { internal } as any;
    const store = new DatabaseSequenceStore(db);

    await store.ensureMinSeq("default", 10);

    expect(internal.update).toHaveBeenCalledWith(
      "__datafn_meta",
      [
        { field: "namespace", op: "eq", value: "default" },
        { field: "next_server_seq", op: "eq", value: 5 },
      ],
      { next_server_seq: 11 },
    );
  });

  it("TV-DI-003e: transaction rebinding preserves the primary high-water mark", async () => {
    let primaryCalls = 0;
    const primary = {
      getNext: vi.fn(),
      getNextN: vi.fn(async () => {
        primaryCalls += 1;
        if (primaryCalls === 1) return [100];
        throw new Error("Redis unavailable");
      }),
      getCurrent: vi.fn(async () => 100),
      isHealthy: vi.fn(async () => true),
    };
    const outerDb = { internal: makeInternalApi() } as any;
    const txDb = { internal: makeInternalApi() } as any;
    const ensureMinSeq = vi
      .spyOn(DatabaseSequenceStore.prototype, "ensureMinSeq")
      .mockResolvedValue();
    vi.spyOn(DatabaseSequenceStore.prototype, "getNextN").mockResolvedValue([101]);
    const store = new ChainedSequenceStore(primary, new DatabaseSequenceStore(outerDb));

    await store.getNextN("default", 1);
    await store.withDb(txDb).getNextN("default", 1);

    expect(ensureMinSeq).toHaveBeenCalledWith("default", 100);
    vi.restoreAllMocks();
  });
});

describe("transaction-bound runtime state", () => {
  it("does not re-run idempotency table DDL after rebinding an initialized store", async () => {
    const outerInternal = makeInternalApi();
    const txInternal = makeInternalApi();
    const store = new DbIdempotencyStore({ internal: outerInternal } as any, "tenant");

    await store.get("client", "mutation");
    await store.withDb({ internal: txInternal } as any).get("client", "mutation");

    expect(outerInternal.ensureTable).toHaveBeenCalledOnce();
    expect(txInternal.ensureTable).not.toHaveBeenCalled();
  });

  it("does not run sequence-table DDL after rebinding an initialized store", async () => {
    const outerInternal = makeInternalApi();
    const txInternal = makeInternalApi();
    const store = new DatabaseSequenceStore({ internal: outerInternal } as any);

    await store.ensureReady();
    await store.withDb({ internal: txInternal } as any).getCurrent("default");

    expect(outerInternal.ensureTable).toHaveBeenCalledOnce();
    expect(txInternal.ensureTable).not.toHaveBeenCalled();
  });

  it("does not run change-tracking DDL after rebinding an initialized service", async () => {
    const outerInternal = makeInternalApi();
    const txInternal = makeInternalApi();
    const service = new ChangeTrackingService({ internal: outerInternal } as any, "tenant");

    await service.ensureReady();
    const txService = service.withDb({ internal: txInternal } as any);
    await txService.recordChange({
      serverSeq: 1,
      resource: "tasks",
      id: "task:1",
      op: "insert",
      record: { title: "ready" },
    });
    await txService.getCurrentServerSeq();

    expect(outerInternal.ensureTable).toHaveBeenCalledTimes(2);
    expect(txInternal.ensureTable).not.toHaveBeenCalled();
  });

  it("discards sequence-pool state when a mutation transaction rolls back", async () => {
    const db = memoryAdapter() as any;
    await db.initialize();
    const originalTransaction = db.transaction.bind(db);
    let changeWriteFailures = 0;
    const transaction = (callback: (tx: any) => Promise<unknown>) =>
      originalTransaction(async (tx: any) => {
        const internal = new Proxy(tx.internal, {
          get(target, property, receiver) {
            if (property === "create" || property === "createMany") {
              return async (table: string, data: Record<string, unknown> | Record<string, unknown>[]) => {
                if (table === "__datafn_changes" && changeWriteFailures < 3) {
                  changeWriteFailures += 1;
                  throw new Error("forced change-write failure");
                }
                return property === "createMany"
                  ? target.createMany(table, data as Record<string, unknown>[])
                  : target.create(table, data as Record<string, unknown>);
              };
            }
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const txProxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "internal") return internal;
            const value = Reflect.get(target, property, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return callback(txProxy);
      });
    const transactionalDb = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "capabilities") {
          return {
            ...target.capabilities,
            transactions: { ...target.capabilities.transactions, supported: true },
          };
        }
        if (property === "transaction") return transaction;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const boundAllocations: number[][] = [];
    const sequenceStore = {
      getNext: vi.fn(async () => 1),
      getNextN: vi.fn(async () => { throw new Error("outer allocation is unexpected"); }),
      getCurrent: vi.fn(async () => 0),
      withDb: vi.fn(() => ({
        getNext: vi.fn(async () => 1),
        getNextN: vi.fn(async (_namespace: string, count: number) => {
          const allocation = Array.from({ length: count }, (_, index) => index + 1);
          boundAllocations.push([...allocation]);
          return allocation;
        }),
        getCurrent: vi.fn(async () => 0),
      })),
    };
    const schema: DatafnSchema = {
      resources: [{
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string", required: true }],
      }],
      relations: [],
    };
    const result = await executePush({
      clientId: "client",
      mutations: [
        {
          resource: "tasks", version: 1, operation: "insert", id: "task:rolled-back",
          clientId: "client", mutationId: "m1", record: { title: "first" },
        },
        {
          resource: "tasks", version: 1, operation: "insert", id: "task:committed",
          clientId: "client", mutationId: "m2", record: { title: "second" },
        },
      ],
    }, schema, transactionalDb, new MemoryIdempotencyStore(), "default", sequenceStore as any);

    expect(result.applied).toEqual(["m2"]);
    expect(boundAllocations).toEqual([[1, 2], [1, 2]]);
    const changes = await db.internal.findMany("__datafn_changes", []);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ record_id: "task:committed", server_seq: 1 });
    await db.close();
  });
});

// ─── REL-008: Redis rate limiter uses Lua eval for atomic TTL ─────────────

describe("REL-008: RedisRateLimiter uses Lua eval for atomic TTL on first request", () => {
  it("TV-REL-011: eval() used when Redis client supports it — no separate incr+set", async () => {
    const evalFn = vi.fn(async () => 1);
    const incrFn = vi.fn(async () => 1);
    const setFn = vi.fn(async () => {});

    const mockRedis = { incr: incrFn, set: setFn, get: vi.fn(), isHealthy: vi.fn(), eval: evalFn } as any;

    const limiter = new RedisRateLimiter(mockRedis);
    const result = await limiter.check("endpoint:client1", 10, 60);

    expect(evalFn).toHaveBeenCalledTimes(1);
    // The Lua script handles both incr and expire atomically
    expect(incrFn).not.toHaveBeenCalled();
    expect(setFn).not.toHaveBeenCalled();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("TV-REL-011b: Lua script includes EXPIRE logic (key + argv shape)", async () => {
    let capturedScript = "";
    let capturedKeys = 0;
    let capturedArgv = "";

    const mockRedis = {
      incr: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      isHealthy: vi.fn(),
      eval: vi.fn(async (script: string, keys: number, key: string, windowArg: string) => {
        capturedScript = script;
        capturedKeys = keys;
        capturedArgv = windowArg;
        return 1;
      }),
    } as any;

    const limiter = new RedisRateLimiter(mockRedis);
    await limiter.check("test", 5, 30);

    // Script must contain redis.call('incr') and redis.call('expire')
    expect(capturedScript).toContain("incr");
    expect(capturedScript).toContain("expire");
    expect(capturedKeys).toBe(1);
    expect(capturedArgv).toBe("30");
  });

  it("TV-REL-011c: falls back to incr+set when eval not available", async () => {
    const incrFn = vi.fn(async () => 1);
    const setFn = vi.fn(async () => {});

    const mockRedis = { incr: incrFn, set: setFn, get: vi.fn(), isHealthy: vi.fn() } as any;
    // No eval method

    const limiter = new RedisRateLimiter(mockRedis);
    const result = await limiter.check("test", 10, 60);

    expect(incrFn).toHaveBeenCalledTimes(1);
    expect(setFn).toHaveBeenCalledTimes(1);
    expect(result.allowed).toBe(true);
  });
});

// ─── REL-010: CAS retry delays are exponential ────────────────────────────

describe("REL-010: CAS retry backoff has exponential delays (10ms, 20ms, 40ms...)", () => {
  let origSetTimeout: typeof globalThis.setTimeout;
  let delays: number[];

  beforeEach(() => {
    delays = [];
    origSetTimeout = globalThis.setTimeout;
    // Intercept setTimeout to capture delays, execute fn immediately
    (globalThis as any).setTimeout = (fn: () => void, delay?: number) => {
      if (typeof delay === "number") delays.push(delay);
      return origSetTimeout(fn, 0);
    };
  });

  afterEach(() => {
    globalThis.setTimeout = origSetTimeout;
  });

  it("TV-REL-013: delays are 10ms, 20ms, 40ms for attempts 1, 2, 3", async () => {
    const internal = makeInternalApi({
      // findOne returns existing row so CAS path is taken (not create path)
      findOne: vi.fn(async () => ({ id: "meta:ns", namespace: "ns", next_server_seq: 1 })),
      // update returns 0 = CAS miss (contention) on every attempt
      update: vi.fn(async () => 0),
    });

    const mockDb = { internal } as any;
    const service = new ChangeTrackingService(mockDb, "ns");

    try {
      await service.getNextServerSeqBatch(1);
    } catch {
      // Expected: exhausts all retries
    }

    // Delays captured during retries (first attempt has no delay)
    expect(delays.length).toBeGreaterThanOrEqual(3);
    expect(delays[0]).toBe(10);  // attempt 1: 10 * 2^0
    expect(delays[1]).toBe(20);  // attempt 2: 10 * 2^1
    expect(delays[2]).toBe(40);  // attempt 3: 10 * 2^2
    expect(delays[3]).toBe(80);  // attempt 4: 10 * 2^3 (if reached)
  });

  it("TV-REL-013b: no delay on first attempt", async () => {
    // If first CAS succeeds, no sleep should occur
    const internal = makeInternalApi({
      findOne: vi.fn(async () => ({ id: "meta:ns", namespace: "ns", next_server_seq: 1 })),
      update: vi.fn(async () => 1), // CAS succeeds immediately
    });

    const mockDb = { internal } as any;
    const service = new ChangeTrackingService(mockDb, "ns");

    await service.getNextServerSeqBatch(1);

    // No sleep should have occurred
    expect(delays.length).toBe(0);
  });
});

// ─── REL-011: withDb() for transaction-scoped change tracking ─────────────

describe("REL-011: ChangeTrackingService.withDb() creates transaction-scoped instance", () => {
  it("TV-REL-014a: withDb(txDb) returns a different instance bound to txDb", async () => {
    const originalDb = { internal: makeInternalApi() } as any;
    const txDb = { internal: makeInternalApi() } as any;

    const service = new ChangeTrackingService(originalDb, "default");
    const txService = service.withDb(txDb);

    expect(txService).not.toBe(service);
    expect(txService).toBeInstanceOf(ChangeTrackingService);
    expect(txService.namespace).toBe("default");
  });

  it("TV-REL-014b: recordChange in txService writes to txDb.internal, not originalDb", async () => {
    const originalInternal = makeInternalApi();
    const txInternal = makeInternalApi();

    const originalDb = { internal: originalInternal } as any;
    const txDb = { internal: txInternal } as any;

    const service = new ChangeTrackingService(originalDb, "default");
    const txService = service.withDb(txDb);

    await txService.recordChange({
      serverSeq: 1,
      resource: "tasks",
      id: "t1",
      op: "insert",
      record: { title: "A" },
    });

    expect(txInternal.create).toHaveBeenCalled();
    expect(originalInternal.create).not.toHaveBeenCalled();
  });

  it("TV-REL-014c: withDb() inherits namespace from parent", async () => {
    const db = { internal: makeInternalApi() } as any;
    const txDb = { internal: makeInternalApi() } as any;

    const service = new ChangeTrackingService(db, "tenant:42");
    const txService = service.withDb(txDb);

    expect(txService.namespace).toBe("tenant:42");
  });
});
