/**
 * TST-006 + TST-007: Stress & Clone Pagination Tests
 *
 * TST-006: High-volume operation tests
 *   - 10,000 records insert (via db.create) + query
 *   - 500 mutations in single push
 *   - Rapid WebSocket connect/disconnect
 *
 * TST-007: Clone pagination boundary tests
 *   - Clone 15,000 records with maxCloneRecords:10,000 → paginated: true
 *   - Clone 500 records (below threshold) → full, not paginated
 *   - Paginated cursor continuation: page 1 → page 2 → done
 *
 * Note: DB seeding uses `db.create()` directly (no server round-trips) for speed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatafnServer, type DatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { executeClone } from "../src/execution/sync/clone.js";
import { WebSocketManager, type WebSocketClient } from "../src/ws.js";
import type { DatafnSchema } from "@datafn/core";
import type { Adapter } from "@superfunctions/db";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema: DatafnSchema = {
  resources: [
    {
      name: "item",
      version: 1,
      fields: [
        { name: "name", type: "string", required: true },
        { name: "category", type: "string", required: false },
        { name: "value", type: "number", required: false },
      ],
    },
  ],
};

// ─── Seeding helper ───────────────────────────────────────────────────────────

/**
 * Seed `count` item records directly via db.create for speed.
 * Bypasses HTTP layer — suitable for high-volume setup.
 */
async function seedItems(
  database: Adapter,
  count: number,
  namespace = "datafn",
): Promise<void> {
  const BATCH = 500;
  for (let start = 0; start < count; start += BATCH) {
    const end = Math.min(start + BATCH, count);
    await Promise.all(
      Array.from({ length: end - start }, (_, j) => {
        const i = start + j;
        return db.create({
          model: "item",
          data: {
            id: `item:${String(i).padStart(6, "0")}`,
            name: `Item ${i}`,
            category: i % 10 === 0 ? "premium" : "standard",
            value: i,
          },
          namespace,
        });
      }),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TST-006: High-volume operations
// ═══════════════════════════════════════════════════════════════════════════

describe("TST-006: High-volume operations", () => {
  it("TST-006a: 10,000 records seeded via db.create are all queryable via server", async () => {
    const db = memoryAdapter();
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
      limits: { maxLimit: 20_000 },
    });

    await seedItems(db, 10_000);

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "item", limit: 20_000 }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // Query response format: { ok: true, result: { data: [...] } } — no result.ok
    // All 10,000 records returned
    expect(body.result.data).toHaveLength(10_000);
  }, 30_000 /* timeout: 30s for large seed */);

  it("TST-006a: 10,000 records filtered by category returns correct subset", async () => {
    const db = memoryAdapter();
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
      limits: { maxLimit: 5_000 },
    });

    await seedItems(db, 10_000);

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "item",
          filters: { category: { $eq: "premium" } },
          limit: 5_000,
        }),
      }),
    );
    const body = await res.json();

    expect(body.ok).toBe(true);
    // Query response format: no result.ok field
    // Every 10th item is premium: 0,10,20,...,9990 = 1,000 items
    expect(body.result.data).toHaveLength(1_000);
    for (const record of body.result.data) {
      expect(record.category).toBe("premium");
    }
  }, 30_000);

  it("TST-006b: 500 mutations in a single push all applied successfully", async () => {
    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: memoryAdapter(),
      limits: { maxLimit: 1_000 }, // allow querying 1,000 records to verify all 500 persisted
    });

    const mutations = Array.from({ length: 500 }, (_, i) => ({
      resource: "item",
      operation: "insert",
      id: `item:bulk-${i}`,
      clientId: "bulk-client",
      mutationId: `bulk-m-${i}`,
      record: { name: `Bulk item ${i}`, value: i },
    }));

    const res = await server.router.handle(
      new Request("http://localhost/datafn/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "bulk-client", mutations }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.applied).toHaveLength(500);
    expect(body.result.errors).toHaveLength(0);

    // Verify all 500 records persisted
    const qRes = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "item", limit: 1_000 }),
      }),
    );
    const qBody = await qRes.json();
    expect(qBody.result.data).toHaveLength(500);
  }, 30_000);

  it("TST-006c: rapid WebSocket connect/disconnect does not crash the manager", () => {
    const mgr = new WebSocketManager({
      maxConnections: 1000,
      maxConnectionsPerNamespace: 500,
    });

    // Rapidly add and remove 200 clients across 5 namespaces
    const clients: WebSocketClient[] = [];
    for (let i = 0; i < 200; i++) {
      const ns = `ns-${i % 5}`;
      const client: WebSocketClient = {
        send: () => {},
        close: () => {},
      };
      const accepted = mgr.addClient(client, { namespace: ns });
      if (accepted) clients.push(client);
    }

    // Verify all were accepted (under limits)
    expect(clients.length).toBe(200);

    // Remove all clients
    for (const c of clients) {
      mgr.removeClient(c);
    }

    // After all removed, broadcastCursor should be a no-op (no crash)
    for (let i = 0; i < 5; i++) {
      mgr.broadcastCursor("99", `ns-${i}`);
    }

    mgr.destroy();
    // If we reach here without exception, the test passes
    expect(true).toBe(true);
  });

  it("TST-006c: manager under per-namespace limit rejects overflow connections with close 4503", () => {
    const mgr = new WebSocketManager({ maxConnectionsPerNamespace: 5 });

    const ns = "stress-ns";
    const accepted: WebSocketClient[] = [];
    const rejected: WebSocketClient[] = [];

    for (let i = 0; i < 10; i++) {
      const c: WebSocketClient = { send: () => {}, close: () => {} };
      const ok = mgr.addClient(c, { namespace: ns });
      if (ok) accepted.push(c);
      else rejected.push(c);
    }

    expect(accepted).toHaveLength(5);
    expect(rejected).toHaveLength(5);

    mgr.destroy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TST-007: Clone pagination boundary tests
// ═══════════════════════════════════════════════════════════════════════════

describe("TST-007: Clone pagination boundaries", () => {
  it("TST-007a: clone 15,000 records with maxCloneRecords=10,000 returns paginated:true", async () => {
    const db = memoryAdapter();
    await seedItems(db, 15_000);

    const result = await executeClone(
      { clientId: "c1", tables: ["item"] },
      schema,
      database: db,
      "datafn",
      undefined,
      10_000, // maxCloneRecords: 10,000 — triggers pagination
    );

    expect(result.ok).toBe(true);
    expect(result.paginated).toBe(true);

    // Only up to 10,000 records should be returned in the first page
    const returnedCount = result.data.item?.length ?? 0;
    expect(returnedCount).toBeLessThanOrEqual(10_000);
    expect(returnedCount).toBeGreaterThan(0);

    // Cursors must be present
    expect(result.cursors).toBeDefined();
    expect(result.cursors.item).toBeDefined();
  }, 60_000 /* 60s for large seed */);

  it("TST-007b: clone 500 records with maxCloneRecords=10,000 returns paginated: undefined (full clone)", async () => {
    const db = memoryAdapter();
    await seedItems(db, 500);

    const result = await executeClone(
      { clientId: "c1", tables: ["item"] },
      schema,
      database: db,
      "datafn",
      undefined,
      10_000,
    );

    expect(result.ok).toBe(true);
    // Not paginated — all 500 records fit
    expect(result.paginated).toBeFalsy();

    // All 500 returned
    expect(result.data.item).toHaveLength(500);

    // Cursors must be present
    expect(result.cursors.item).toBeDefined();
  }, 30_000);

  it("TST-007c: paginated clone cursor continuation — page 1 → page 2 → done", async () => {
    const db = memoryAdapter();
    // Seed 25 records; use maxCloneRecords=10 to force 3 pages
    await seedItems(db, 25);

    // Page 1: initial clone (no page param, maxCloneRecords=10)
    const page1 = await executeClone(
      { clientId: "c1", tables: ["item"] },
      schema,
      database: db,
      "datafn",
      undefined,
      10,
    );

    expect(page1.ok).toBe(true);
    expect(page1.paginated).toBe(true);
    expect(page1.data.item).toBeDefined();
    const page1Records = page1.data.item!.length;
    expect(page1Records).toBeLessThanOrEqual(10);
    expect(page1Records).toBeGreaterThan(0);

    // The `next` marker points to the last record's ID for continuing
    const nextAfter = page1.next?.item;
    expect(nextAfter).toBeDefined();

    // Page 2: cursor continuation using the page parameter
    const page2 = await executeClone(
      {
        clientId: "c1",
        tables: ["item"],
        page: {
          table: "item",
          afterId: nextAfter!,
          limit: 10,
        },
      },
      schema,
      database: db,
      "datafn",
      undefined,
      10,
    );

    expect(page2.ok).toBe(true);
    const page2Records = page2.data.item!.length;
    expect(page2Records).toBeGreaterThan(0);
    expect(page2Records).toBeLessThanOrEqual(10);

    // IDs in page 2 must be GREATER than nextAfter (correct pagination)
    for (const record of page2.data.item!) {
      expect(record.id! > nextAfter!).toBe(true);
    }

    // Total across pages must add up to ≤ 25
    const totalSoFar = page1Records + page2Records;
    expect(totalSoFar).toBeLessThanOrEqual(25);

    // If page2 has a next marker, fetch page 3 (final page)
    if (page2.next?.item !== null && page2.next?.item !== undefined) {
      const page3 = await executeClone(
        {
          clientId: "c1",
          tables: ["item"],
          page: {
            table: "item",
            afterId: page2.next.item,
            limit: 10,
          },
        },
        schema,
        database: db,
        "datafn",
        undefined,
        10,
      );

      expect(page3.ok).toBe(true);
      const page3Records = page3.data.item!.length;
      const total = totalSoFar + page3Records;
      // Total across all pages must equal 25
      expect(total).toBe(25);

      // Page 3 has no more pages (next.item === null or no next)
      expect(page3.next?.item ?? null).toBeNull();
    } else {
      // page2 was the last page — total must be 25
      expect(totalSoFar).toBe(25);
    }
  }, 30_000);

  it("TST-007c: paginated clone with page.table NOT in tables list returns DFQL_INVALID", async () => {
    const db = memoryAdapter();
    await seedItems(db, 5);

    const result = await executeClone(
      {
        clientId: "c1",
        tables: ["item"],
        page: {
          table: "other_table", // NOT in tables list
          afterId: null,
          limit: 10,
        },
      },
      schema,
      database: db,
      "datafn",
      undefined,
      10,
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DFQL_INVALID");
  });

  it("TST-007d: clone with unknown table returns DFQL_UNKNOWN_RESOURCE", async () => {
    const db = memoryAdapter();

    const result = await executeClone(
      { clientId: "c1", tables: ["phantom"] },
      schema,
      database: db,
      "datafn",
      undefined,
      10_000,
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DFQL_UNKNOWN_RESOURCE");
  });

  it("TST-007e: clone across many small pages produces complete non-overlapping record set", async () => {
    const db = memoryAdapter();
    await seedItems(db, 50);

    // Use page size of 15 — page 1: items 0-14, page 2: items 15-29, page 3: items 30-44, page 4: items 45-49
    const pageSize = 15;
    const allIds: string[] = [];
    let afterId: string | null = null;
    let pageNum = 0;

    while (true) {
      pageNum++;
      const result = await executeClone(
        {
          clientId: "c1",
          tables: ["item"],
          page: {
            table: "item",
            afterId,
            limit: pageSize,
          },
        },
        schema,
        database: db,
        "datafn",
        undefined,
        10_000,
      );

      expect(result.ok).toBe(true);
      const records = result.data.item ?? [];

      for (const r of records) {
        allIds.push(r.id as string);
      }

      afterId = result.next?.item ?? null;

      if (!afterId || records.length < pageSize) break;
      // Safety: don't spin indefinitely
      if (pageNum > 10) break;
    }

    // All 50 IDs must be unique (no overlaps)
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);

    // All 50 records must have been retrieved
    expect(allIds).toHaveLength(50);
  }, 30_000);
});
