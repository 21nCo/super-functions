/**
 * PHASE_03 Scalability CRITICAL Tests
 * Tests for SCA-001, SCA-002, SCA-003, SCA-004
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeReconcile } from "../src/execution/sync/reconcile.js";
import { executeClone } from "../src/execution/sync/clone.js";
import { MemoryIdempotencyStore } from "../src/execution/idempotency.js";
import { ChangeTrackingService } from "../src/execution/sync/change-tracking.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";

const testSchema: DatafnSchema = {
  resources: [
    { name: "tasks", version: 1, fields: [{ name: "title", type: "string", required: true }] },
    { name: "users", version: 1, fields: [{ name: "name", type: "string", required: true }] },
  ],
};

// ─── SCA-001: Reconcile count via db.count() ──────────────────────────

describe("SCA-001: Reconcile uses db.count()", () => {
  it("calls db.count() instead of findMany for resource counts", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    // Seed some data
    await db.create({ model: "tasks", data: { id: "t1", title: "A" }, namespace: "default" });
    await db.create({ model: "tasks", data: { id: "t2", title: "B" }, namespace: "default" });

    // Spy on count and findMany
    const countSpy = vi.spyOn(db, "count");
    const findManySpy = vi.spyOn(db, "findMany");

    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const result = await executeReconcile(
      { clientId: "c1", resources: ["tasks"] },
      testSchema,
      db,
      "default",
    );

    expect(result.ok).toBe(true);
    expect(result.counts?.tasks).toBe(2);
    // Should have called count, not findMany for the resource count
    expect(countSpy).toHaveBeenCalledWith(expect.objectContaining({ model: "tasks" }));

    vi.restoreAllMocks();
  });

  it("counts non-polymorphic public join stores without loading their rows", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const relationSchema: DatafnSchema = {
      resources: testSchema.resources,
      relations: [{
        from: "tasks",
        to: "users",
        type: "many-many",
        relation: "assignees",
      }],
    };
    await db.create({
      model: "__datafn_join_tasks_assignees",
      data: { id: "t1:u1", from: "t1", to: "u1" },
      namespace: "default",
    });
    const countSpy = vi.spyOn(db, "count");
    const findManySpy = vi.spyOn(db, "findMany");
    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const result = await executeReconcile(
      { clientId: "c1", resources: ["tasks"], includeJoins: true },
      relationSchema,
      db,
      "default",
    );

    expect(result.joinCounts?.join_tasks_assignees_users).toBe(1);
    expect(countSpy).toHaveBeenCalledWith(expect.objectContaining({
      model: "__datafn_join_tasks_assignees",
    }));
    expect(findManySpy).not.toHaveBeenCalledWith(expect.objectContaining({
      model: "__datafn_join_tasks_assignees",
    }));
    vi.restoreAllMocks();
  });

  it("falls back to loading join rows when db.count() fails", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const relationSchema: DatafnSchema = {
      resources: testSchema.resources,
      relations: [{
        from: "tasks",
        to: "users",
        type: "many-many",
        relation: "assignees",
      }],
    };
    await db.create({
      model: "__datafn_join_tasks_assignees",
      data: { id: "t1:u1", from: "t1", to: "u1" },
      namespace: "default",
    });
    const originalCount = db.count.bind(db);
    vi.spyOn(db, "count").mockImplementation(async (input) => {
      if (input.model === "__datafn_join_tasks_assignees") {
        throw new Error("count unavailable");
      }
      return originalCount(input);
    });
    const findManySpy = vi.spyOn(db, "findMany");
    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const result = await executeReconcile(
      { clientId: "c1", resources: ["tasks"], includeJoins: true },
      relationSchema,
      db,
      "default",
    );

    expect(result.joinCounts?.join_tasks_assignees_users).toBe(1);
    expect(findManySpy).toHaveBeenCalledWith(expect.objectContaining({
      model: "__datafn_join_tasks_assignees",
    }));
    vi.restoreAllMocks();
  });

  it("filters discriminator rows in explicitly shared join tables", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const relationSchema: DatafnSchema = {
      resources: testSchema.resources,
      relations: [{
        from: "tasks",
        to: "users",
        type: "many-many",
        relation: "assignees",
        joinTable: "shared_assignments",
      }],
    };
    await db.create({
      model: "shared_assignments",
      data: {
        id: "task:user",
        from: "t1",
        to: "u1",
        fromResource: "tasks",
        toResource: "users",
      },
      namespace: "default",
    });
    await db.create({
      model: "shared_assignments",
      data: {
        id: "project:user",
        from: "p1",
        to: "u1",
        fromResource: "projects",
        toResource: "users",
      },
      namespace: "default",
    });
    const countSpy = vi.spyOn(db, "count");
    vi.spyOn(ChangeTrackingService.prototype, "getCurrentServerSeq").mockResolvedValue(0);

    const result = await executeReconcile(
      { clientId: "c1", resources: ["tasks"], includeJoins: true },
      relationSchema,
      db,
      "default",
    );

    expect(result.joinCounts?.join_tasks_assignees_users).toBe(1);
    expect(countSpy).not.toHaveBeenCalledWith(expect.objectContaining({
      model: "shared_assignments",
    }));
    vi.restoreAllMocks();
  });
});

// ─── SCA-002: Clone auto-pagination ───────────────────────────────────

describe("SCA-002: Clone auto-pagination", () => {
  it("small dataset returns full data (no pagination)", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    await db.create({ model: "tasks", data: { id: "t1", title: "A" }, namespace: "default" });

    vi.spyOn(ChangeTrackingService.prototype, "getLatestServerSeq").mockResolvedValue(0);

    const result = await executeClone(
      { clientId: "c1" },
      testSchema,
      db,
      "default",
      undefined,
      10_000, // maxCloneRecords
    );

    expect(result.ok).toBe(true);
    expect(result.paginated).toBeUndefined();
    expect(result.data.tasks.length).toBe(1);

    vi.restoreAllMocks();
  });

  it("large dataset triggers auto-pagination with paginated flag", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    // Seed 15 records — more than maxCloneRecords of 10
    for (let i = 0; i < 15; i++) {
      await db.create({ model: "tasks", data: { id: `t${String(i).padStart(3, "0")}`, title: `Task ${i}` }, namespace: "default" });
    }

    vi.spyOn(ChangeTrackingService.prototype, "getLatestServerSeq").mockResolvedValue(0);

    const result = await executeClone(
      { clientId: "c1", tables: ["tasks"] },
      testSchema,
      db,
      "default",
      undefined,
      10, // maxCloneRecords = 10 (less than 15)
    );

    expect(result.ok).toBe(true);
    expect(result.paginated).toBe(true);
    // Should return only 10 records
    expect(result.data.tasks.length).toBe(10);
    // Should have next cursor for tasks
    expect(result.next).toBeDefined();
    expect(result.next?.tasks).toBeDefined();
    expect(typeof result.next?.tasks).toBe("string"); // afterId cursor

    vi.restoreAllMocks();
  });
});

// ─── SCA-003: Extension transport timeout — tested in client package ──
// (Covered in separate client test file)

// ─── SCA-004: MemoryIdempotencyStore TTL + LRU ───────────────────────

describe("SCA-004: MemoryIdempotencyStore TTL + LRU", () => {
  it("entry evicted after TTL", async () => {
    const store = new MemoryIdempotencyStore({ ttlMs: 50, maxEntries: 100 });

    await store.set("c1", "m1", {
      ok: true, mutationId: "m1", affectedIds: ["a1"], errors: [], deduped: false,
    });

    // Entry should exist
    expect(await store.get("c1", "m1")).not.toBeNull();

    // Wait for TTL to expire + trigger sweep manually
    await new Promise(r => setTimeout(r, 60));
    // Access private sweep via any
    (store as any).sweep();

    // Entry should be gone
    expect(await store.get("c1", "m1")).toBeNull();

    store.destroy();
  });

  it("oldest entry evicted when max entries exceeded (LRU)", async () => {
    const store = new MemoryIdempotencyStore({ ttlMs: 86_400_000, maxEntries: 3 });

    await store.set("c1", "m1", { ok: true, mutationId: "m1", affectedIds: [], errors: [], deduped: false });
    await store.set("c1", "m2", { ok: true, mutationId: "m2", affectedIds: [], errors: [], deduped: false });
    await store.set("c1", "m3", { ok: true, mutationId: "m3", affectedIds: [], errors: [], deduped: false });

    expect(store.size).toBe(3);

    // Adding a 4th entry should evict the oldest (m1)
    await store.set("c1", "m4", { ok: true, mutationId: "m4", affectedIds: [], errors: [], deduped: false });

    expect(store.size).toBe(3);
    expect(await store.get("c1", "m1")).toBeNull(); // evicted
    expect(await store.get("c1", "m2")).not.toBeNull();
    expect(await store.get("c1", "m4")).not.toBeNull();

    store.destroy();
  });

  it("get() refreshes LRU position", async () => {
    const store = new MemoryIdempotencyStore({ ttlMs: 86_400_000, maxEntries: 3 });

    await store.set("c1", "m1", { ok: true, mutationId: "m1", affectedIds: [], errors: [], deduped: false });
    await store.set("c1", "m2", { ok: true, mutationId: "m2", affectedIds: [], errors: [], deduped: false });
    await store.set("c1", "m3", { ok: true, mutationId: "m3", affectedIds: [], errors: [], deduped: false });

    // Access m1 to refresh its LRU position (moves it to end)
    await store.get("c1", "m1");

    // Now add m4 — should evict m2 (oldest after m1 was refreshed)
    await store.set("c1", "m4", { ok: true, mutationId: "m4", affectedIds: [], errors: [], deduped: false });

    expect(await store.get("c1", "m1")).not.toBeNull(); // refreshed, still present
    expect(await store.get("c1", "m2")).toBeNull(); // evicted
    expect(await store.get("c1", "m3")).not.toBeNull();
    expect(await store.get("c1", "m4")).not.toBeNull();

    store.destroy();
  });

  it("destroy() clears timer", async () => {
    const store = new MemoryIdempotencyStore({ ttlMs: 1000, maxEntries: 100 });

    // Should not throw
    store.destroy();
    store.destroy(); // double destroy safe

    // Can still use the store after destroy (just no auto-sweep)
    await store.set("c1", "m1", { ok: true, mutationId: "m1", affectedIds: [], errors: [], deduped: false });
    expect(await store.get("c1", "m1")).not.toBeNull();
  });
});
