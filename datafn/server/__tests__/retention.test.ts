/**
 * Phase 06: Data Retention (Pruning) tests
 * Tests TV-RET-CHANGE-001, TV-RET-CHANGE-002, TV-RET-IDEMP-001,
 *       TV-RET-CONFIG-001, TV-RET-STARTUP-001, TV-RET-INTERVAL-001
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { ChangeTrackingService } from "../src/execution/sync/change-tracking.js";
import { DbIdempotencyStore } from "../src/execution/idempotency-db.js";
import { createDatafnServer } from "../src/server.js";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

/** Insert change entries with an explicit created_at override via direct internal.create */
async function seedChangesWithAge(
  database: ReturnType<typeof memoryAdapter>,
  namespace: string,
  count: number,
  daysOld: number,
): Promise<void> {
  const ct = new ChangeTrackingService(db, namespace);
  const past = new Date(Date.now() - daysOld * 86400000).toISOString();

  for (let i = 1; i <= count; i++) {
    const seq = await ct.getNextServerSeq();
    // Record change first (ensures table exists), then we won't be overriding created_at here.
    // Instead: directly insert into internal table with backdated created_at.
    await db.internal.create("__datafn_changes", {
      id: `change:${namespace}:${seq}:task:item${i}-old`,
      namespace,
      server_seq: seq,
      resource: "task",
      record_id: `item${i}`,
      op: "insert",
      record: null,
      created_at: past,
    });
  }
}

/** Insert change entries created "now" */
async function seedChangesNow(
  database: ReturnType<typeof memoryAdapter>,
  namespace: string,
  count: number,
  seqOffset: number,
): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 1; i <= count; i++) {
    await db.internal.create("__datafn_changes", {
      id: `change:${namespace}:${seqOffset + i}:task:item${i}-new`,
      namespace,
      server_seq: seqOffset + i,
      resource: "task",
      record_id: `item${i}-new`,
      op: "insert",
      record: null,
      created_at: now,
    });
  }
}

/** Insert idempotency records with backdated created_at */
async function seedIdempotencyWithAge(
  database: ReturnType<typeof memoryAdapter>,
  namespace: string,
  count: number,
  daysOld: number,
): Promise<void> {
  const past = new Date(Date.now() - daysOld * 86400000).toISOString();
  for (let i = 1; i <= count; i++) {
    await db.internal.create("__datafn_idempotency", {
      id: `${namespace}:client${i}:mut${i}`,
      namespace,
      client_id: `client${i}`,
      mutation_id: `mut${i}`,
      result: JSON.stringify({ ok: true }),
      created_at: past,
    });
  }
}

/** Insert idempotency records created "now" */
async function seedIdempotencyNow(
  database: ReturnType<typeof memoryAdapter>,
  namespace: string,
  count: number,
  idOffset: number,
): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 1; i <= count; i++) {
    await db.internal.create("__datafn_idempotency", {
      id: `${namespace}:client${idOffset + i}:mutnew${idOffset + i}`,
      namespace,
      client_id: `client${idOffset + i}`,
      mutation_id: `mutnew${idOffset + i}`,
      result: JSON.stringify({ ok: true }),
      created_at: now,
    });
  }
}

describe("Phase 06: Data Retention", () => {
  describe("RET-001: Change log pruning (ChangeTrackingService.pruneChanges)", () => {
    it("TV-RET-CHANGE-001: pruneChanges(30) deletes old entries, keeps recent", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      // Ensure the internal table exists before seeding
      const ctInit = new ChangeTrackingService(db, "datafn");
      // Trigger table creation by calling getNextServerSeq (creates __datafn_meta),
      // then record a dummy change to ensure __datafn_changes is created.
      const seq0 = await ctInit.getNextServerSeq();
      await ctInit.recordChange({ serverSeq: seq0, resource: "task", id: "init", op: "insert", record: null });

      // Seed 25 entries that are 60 days old
      await seedChangesWithAge(db, "datafn", 25, 60);
      // Seed 25 entries created now
      await seedChangesNow(db, "datafn", 25, 100);

      const ct = new ChangeTrackingService(db, "datafn");
      // Mark table as already ensured since we seeded directly
      const deleted = await ct.pruneChanges(30);

      // Expect 25 old entries deleted (plus potentially the init one if it was created far back - but it was created now)
      expect(deleted).toBe(25);

      // Verify remaining entries (25 recent + 1 init = 26 total remain)
      const remaining = await db.internal.findMany("__datafn_changes", [
        { field: "namespace", op: "eq", value: "datafn" },
      ]);
      expect(remaining.length).toBe(26);
    });

    it("TV-RET-CHANGE-002: pruneChanges respects namespace isolation", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      // Seed 10 entries in namespace "user:1" that are 60 days old
      await seedChangesWithAge(db, "user:1", 10, 60);
      // Seed 10 entries in namespace "user:2" that are 60 days old
      await seedChangesWithAge(db, "user:2", 10, 60);

      const ct = new ChangeTrackingService(db, "user:1");
      const deleted = await ct.pruneChanges(30);

      // Only user:1 entries should be deleted
      expect(deleted).toBe(10);

      // Verify user:2 entries are untouched
      const remaining = await db.internal.findMany("__datafn_changes", [
        { field: "namespace", op: "eq", value: "user:2" },
      ]);
      expect(remaining.length).toBe(10);
    });
  });

  describe("RET-002: Idempotency record pruning (DbIdempotencyStore.pruneIdempotency)", () => {
    it("TV-RET-IDEMP-001: pruneIdempotency(7) deletes old entries, keeps recent", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      // Ensure the idempotency table exists by creating a store instance
      const storeInit = new DbIdempotencyStore(db, "datafn");
      await storeInit.get("init-client", "init-mut"); // triggers ensureTable

      // Seed 10 entries that are 14 days old
      await seedIdempotencyWithAge(db, "datafn", 10, 14);
      // Seed 10 entries created now
      await seedIdempotencyNow(db, "datafn", 10, 100);

      const store = new DbIdempotencyStore(db, "datafn");
      const deleted = await store.pruneIdempotency(7);

      expect(deleted).toBe(10);

      const remaining = await db.internal.findMany("__datafn_idempotency", [
        { field: "namespace", op: "eq", value: "datafn" },
      ]);
      expect(remaining.length).toBe(10);
    });
  });

  describe("RET-003: Retention configuration", () => {
    it("TV-RET-CONFIG-001: no retention config → no pruning occurs", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      // Insert some old changes
      await seedChangesWithAge(db, "datafn", 5, 60);

      // Create server without retention config
      const server = await createDatafnServer({ allowUnknownResources: true, schema: testSchema, database: db });

      // No pruning should have happened
      const changes = await db.internal.findMany("__datafn_changes", [
        { field: "namespace", op: "eq", value: "datafn" },
      ]);
      expect(changes.length).toBe(5);

      server.close();
    });
  });

  describe("RET-004: Auto-prune on startup", () => {
    it("TV-RET-STARTUP-001: pruneOnStartup runs during init and server still starts on prune error", async () => {
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      // Seed old entries that should be pruned
      await seedChangesWithAge(db, "datafn", 10, 60);
      await seedIdempotencyWithAge(db, "datafn", 5, 30);

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: db,
        retention: {
          changeLogDays: 30,
          idempotencyDays: 7,
          pruneOnStartup: true,
        },
      });

      // Verify old change entries were pruned
      const changesAfter = await db.internal.findMany("__datafn_changes", [
        { field: "namespace", op: "eq", value: "datafn" },
      ]);
      expect(changesAfter.length).toBe(0);

      // Verify old idempotency entries were pruned
      const idempAfter = await db.internal.findMany("__datafn_idempotency", [
        { field: "namespace", op: "eq", value: "datafn" },
      ]);
      expect(idempAfter.length).toBe(0);

      server.close();
    });

    it("TV-RET-STARTUP-001 (error resilience): server starts even if pruning throws", async () => {
      // A db that fails on internal.delete should not block server startup
      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      // Patch internal.delete to throw
      const origDelete = db.internal.delete.bind(db.internal);
      db.internal.delete = async () => { throw new Error("delete failed"); };

      // Server should still be created without throwing
      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: db,
        retention: {
          changeLogDays: 30,
          pruneOnStartup: true,
        },
      });

      // Restore
      db.internal.delete = origDelete;

      expect(server).toBeDefined();
      expect(server.router).toBeDefined();
      server.close();
    });
  });

  describe("RET-005: Periodic background pruning", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("TV-RET-INTERVAL-001: interval is created and clearable via close()", async () => {
      vi.useFakeTimers();

      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      const setIntervalSpy = vi.spyOn(global, "setInterval");
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: db,
        retention: {
          changeLogDays: 30,
          pruneIntervalMs: 3600000,
        },
      });

      // setInterval should have been called with (fn, 3600000)
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        3600000,
      );

      // Calling close() should clear the interval
      server.close();
      expect(clearIntervalSpy).toHaveBeenCalled();

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });

    it("TV-RET-INTERVAL-001 (minimum clamp): interval below 60000ms is clamped to 60000ms", async () => {
      vi.useFakeTimers();

      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      const setIntervalSpy = vi.spyOn(global, "setInterval");

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: db,
        retention: {
          changeLogDays: 30,
          pruneIntervalMs: 1000, // Below minimum
        },
      });

      // Should be clamped to 60000
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60000,
      );

      server.close();
      setIntervalSpy.mockRestore();
    });

    it("TV-RET-INTERVAL-001 (no interval without config): no setInterval when pruneIntervalMs omitted", async () => {
      vi.useFakeTimers();

      const db = memoryAdapter({ libraryNamespace: "datafn" });
      await db.initialize();

      const setIntervalSpy = vi.spyOn(global, "setInterval");

      const server = await createDatafnServer({ allowUnknownResources: true,
        schema: testSchema,
        database: db,
        retention: {
          changeLogDays: 30,
          // pruneIntervalMs omitted
        },
      });

      expect(setIntervalSpy).not.toHaveBeenCalled();

      server.close();
      setIntervalSpy.mockRestore();
    });
  });
});
