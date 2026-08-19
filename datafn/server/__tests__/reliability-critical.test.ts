/**
 * PHASE_02 Reliability CRITICAL Tests
 * Tests for REL-001, REL-002, REL-003
 */

import { describe, it, expect, vi } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { executeTransaction } from "../src/execution/transact.js";
import { executePush } from "../src/execution/sync/push.js";
import { ChangeTrackingService } from "../src/execution/sync/change-tracking.js";
import * as mutationExecution from "../src/execution/mutation/execute.js";
import type { DatafnSchema } from "@datafn/core";

const testSchema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
      ],
    },
  ],
};

const capabilitySchema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      capabilities: ["timestamps", "audit"] as any,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

function makeMemoryIdempotencyStore() {
  const store = new Map<string, any>();
  return {
    get: vi.fn(async (clientId: string, mutationId: string) => store.get(`${clientId}:${mutationId}`)),
    set: vi.fn(async (clientId: string, mutationId: string, result: any) => {
      store.set(`${clientId}:${mutationId}`, result);
    }),
  };
}

// ─── REL-001: Transaction fallback ────────────────────────────────────

describe("REL-001: Transaction atomicity — no silent fallthrough", () => {
  it("TV-REL-001: DB error returns INTERNAL, no sequential fallback", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    // Patch the adapter to have a transaction function that throws
    (db as any).transaction = async () => {
      throw new Error("serialization failure");
    };
    const idempotencyStore = makeMemoryIdempotencyStore();

    const result = await executeTransaction(
      {
        atomic: true,
        steps: [
          { mutation: { resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } } as any },
        ],
      },
      testSchema,
      db,
      idempotencyStore,
      undefined,
      "default",
      undefined,
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INTERNAL");
    expect(result.error?.message).toContain("serialization failure");
  });

  it("TV-REL-002: Adapter without transaction fn uses sequential", async () => {
    // Create adapter WITHOUT a transaction method (simulates adapter that doesn't support transactions)
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    // Remove the transaction method so it's truly undefined
    delete (db as any).transaction;

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
    });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/transact", {
        method: "POST",
        body: JSON.stringify({
          steps: [
            { mutation: { resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } } },
          ],
        }),
      }),
      {},
    );

    const body = await res.json();
    // Sequential execution should succeed — not return INTERNAL error
    // (may be HTTP 200 with results, or may have step-level issues from change tracking)
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // The key assertion for REL-001: the response should NOT have code "INTERNAL"
    // at the top level — sequential execution was used, not a transaction failure
    expect(body.error?.code).not.toBe("INTERNAL");
  });

  it("guards nullish thrown values when mapping transact step errors", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    delete (db as any).transaction;
    const executeMutationSpy = vi.spyOn(mutationExecution, "executeMutation")
      .mockRejectedValueOnce(null);
    const idempotencyStore = makeMemoryIdempotencyStore();

    const result = await executeTransaction(
      {
        atomic: true,
        steps: [
          { mutation: { resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } } as any },
        ],
      },
      testSchema,
      db,
      idempotencyStore,
      undefined,
      "default",
      undefined,
    );

    expect(result.ok).toBe(true);
    expect(result.result?.ok).toBe(false);
    expect(result.result?.results[0].error.code).toBe("INTERNAL");
    expect(result.result?.results[0].error.message).toBe("null");

    executeMutationSpy.mockRestore();
    vi.restoreAllMocks();
  });
});

// ─── REL-003: Rolled-back step annotation ─────────────────────────────

describe("REL-003: Rolled-back step annotation", () => {
  it("TV-REL-005: Failed step causes prior results to be annotated as rolled back", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    let insertCount = 0;
    const originalCreate = db.create.bind(db);

    // Override transaction to use a tx adapter where 3rd create fails
    (db as any).transaction = async (fn: any) => {
      const txDb = new Proxy(db, {
        get(target, prop) {
          if (prop === "create") {
            return async (params: any) => {
              insertCount++;
              if (insertCount === 3) {
                throw new Error("constraint violation");
              }
              return originalCreate(params);
            };
          }
          return (target as any)[prop];
        },
      });
      await fn(txDb);
    };

    const idempotencyStore = makeMemoryIdempotencyStore();

    const result = await executeTransaction(
      {
        atomic: true,
        steps: [
          { mutation: { resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } } as any },
          { mutation: { resource: "tasks", operation: "insert", id: "t2", record: { title: "B" } } as any },
          { mutation: { resource: "tasks", operation: "insert", id: "t3", record: { title: "C" } } as any },
        ],
      },
      testSchema,
      db,
      idempotencyStore,
      undefined,
      "default",
      undefined,
    );

    // Top-level should report success (HTTP 200) with rolled-back results
    expect(result.ok).toBe(true);
    expect(result.result?.ok).toBe(false);
    expect(result.result?.error?.code).toBe("TRANSACTION_ROLLED_BACK");
    expect(result.result?.error?.message).toContain("Step 2 failed");

    // Steps 0 and 1 should be annotated as rolled back
    const results = result.result!.results;
    expect(results[0].ok).toBe(false);
    expect(results[0].rolledBack).toBe(true);
    expect(results[0].result).toBeDefined(); // Original result preserved

    expect(results[1].ok).toBe(false);
    expect(results[1].rolledBack).toBe(true);

    // Step 2 should be the actual failure (ok: false, no rolledBack)
    expect(results[2].ok).toBe(false);
    expect(results[2].rolledBack).toBeUndefined();
  });

  it("TV-REL-006: Successful transaction has no rolledBack field", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const originalCreate = db.create.bind(db);

    // Override transaction to use a proper tx adapter
    (db as any).transaction = async (fn: any) => {
      await fn(db); // Use same db for simplicity in test
    };

    const idempotencyStore = makeMemoryIdempotencyStore();

    const result = await executeTransaction(
      {
        atomic: true,
        steps: [
          { mutation: { resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } } as any },
          { mutation: { resource: "tasks", operation: "insert", id: "t2", record: { title: "B" } } as any },
        ],
      },
      testSchema,
      db,
      idempotencyStore,
      undefined,
      "default",
      undefined,
    );

    expect(result.ok).toBe(true);
    expect(result.result?.ok).toBe(true);

    // No rolledBack on any result
    for (const r of result.result!.results) {
      expect(r.rolledBack).toBeUndefined();
    }
  });
});

// ─── REL-002: Change tracking failure propagation ─────────────────────

describe("REL-002: Push change tracking failure propagation", () => {
  it("TV-REL-003: Change tracking failure makes mutation end up in errors", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    db.capabilities.transactions.supported = false;
    // Spy on change tracking: make recordChange always fail
    const recordChangeSpy = vi.spyOn(ChangeTrackingService.prototype, "recordChange")
      .mockRejectedValue(new Error("CAS failure"));
    vi.spyOn(ChangeTrackingService.prototype, "getNextServerSeq").mockResolvedValue(1);
    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const idempotencyStore = makeMemoryIdempotencyStore();

    const result = await executePush(
      {
        clientId: "c1",
        mutations: [
          { clientId: "c1", mutationId: "m1", resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } },
        ],
      },
      testSchema,
      db,
      idempotencyStore,
      "default",
    );

    // Mutation should be in errors, NOT in applied
    expect(result.applied).not.toContain("m1");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].mutationId).toBe("m1");
    expect(result.errors[0].code).toBe("INTERNAL");

    recordChangeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("TV-REL-004: Change tracking retry succeeds transparently", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    db.capabilities.transactions.supported = false;
    let callCount = 0;
    const recordChangeSpy = vi.spyOn(ChangeTrackingService.prototype, "recordChange")
      .mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("transient CAS failure");
        // Second call succeeds
      });
    vi.spyOn(ChangeTrackingService.prototype, "getNextServerSeq").mockResolvedValue(1);
    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const idempotencyStore = makeMemoryIdempotencyStore();

    const result = await executePush(
      {
        clientId: "c1",
        mutations: [
          { clientId: "c1", mutationId: "m1", resource: "tasks", operation: "insert", id: "t1", record: { title: "A" } },
        ],
      },
      testSchema,
      db,
      idempotencyStore,
      "default",
    );

    // Mutation should be in applied (retry was transparent)
    expect(result.applied).toContain("m1");
    expect(result.errors.length).toBe(0);
    expect(callCount).toBeGreaterThanOrEqual(2);

    recordChangeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("replace change records use the persisted row when upsert creates a record", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const idempotencyStore = makeMemoryIdempotencyStore();
    const recordChangeSpy = vi.spyOn(ChangeTrackingService.prototype, "recordChange")
      .mockResolvedValue(undefined);
    vi.spyOn(ChangeTrackingService.prototype, "getNextServerSeq").mockResolvedValue(1);
    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const result = await executePush(
      {
        clientId: "c1",
        mutations: [
          {
            clientId: "c1",
            mutationId: "m-replace",
            resource: "tasks",
            operation: "replace",
            id: "t-replace",
            record: { title: "A" },
          },
        ],
      },
      capabilitySchema,
      db,
      idempotencyStore,
      "default",
      undefined,
      undefined,
      "user:alice",
    );

    expect(result.ok).toBe(true);
    expect(result.applied).toContain("m-replace");
    expect(result.errors).toHaveLength(0);
    expect(recordChangeSpy).toHaveBeenCalledTimes(1);
    const [entry] = recordChangeSpy.mock.calls[0];
    expect(entry.op).toBe("replace");
    expect(entry.record).toEqual(
      expect.objectContaining({
        id: "t-replace",
        title: "A",
        createdBy: "user:alice",
      }),
    );
    expect(typeof entry.record?.createdAt).toBe("number");

    recordChangeSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
