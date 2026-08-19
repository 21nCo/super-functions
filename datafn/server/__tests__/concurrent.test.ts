/**
 * TST-005: Concurrent Execution Tests
 *
 * Race condition tests covering:
 * - Two concurrent mutations on the same record → no data loss
 * - Concurrent push from two clients → correct serverSeq ordering
 * - Concurrent idempotent mutations → deduplicated (not double-applied)
 * - Concurrent insert + delete on same record
 * - Concurrent push batches from many clients
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatafnServer, type DatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { executePush } from "../src/execution/sync/push.js";
import { MemoryIdempotencyStore } from "../src/execution/idempotency.js";
import type { DatafnSchema } from "@datafn/core";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema: DatafnSchema = {
  resources: [
    {
      name: "counter",
      version: 1,
      fields: [
        { name: "value", type: "number", required: true },
        { name: "label", type: "string", required: false },
      ],
    },
    {
      name: "note",
      version: 1,
      fields: [{ name: "text", type: "string", required: true }],
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

let server: DatafnServer;

beforeEach(async () => {
  server = await createDatafnServer({
    allowUnknownResources: true,
    schema,
    database: memoryAdapter(),
  });
});

function pushReq(body: unknown): Request {
  return new Request("http://localhost/datafn/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function queryReq(resource: string, filters?: Record<string, unknown>): Request {
  return new Request("http://localhost/datafn/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(filters ? { resource, filters } : { resource }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TST-005a: Two concurrent mutations on the same record
// ═══════════════════════════════════════════════════════════════════════════

describe("TST-005a: Two concurrent mutations on same record — no data loss", () => {
  it("concurrent inserts with different IDs both persist", async () => {
    // Two clients simultaneously push inserts with different record IDs
    const [res1, res2] = await Promise.all([
      server.router.handle(
        pushReq({
          clientId: "c1",
          mutations: [
            {
              resource: "counter",
              operation: "insert",
              id: "counter:concurrent-1",
              clientId: "c1",
              mutationId: "c1-m1",
              record: { value: 1, label: "from-c1" },
            },
          ],
        }),
      ),
      server.router.handle(
        pushReq({
          clientId: "c2",
          mutations: [
            {
              resource: "counter",
              operation: "insert",
              id: "counter:concurrent-2",
              clientId: "c2",
              mutationId: "c2-m1",
              record: { value: 2, label: "from-c2" },
            },
          ],
        }),
      ),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both pushes must succeed
    expect(body1.result.ok).toBe(true);
    expect(body2.result.ok).toBe(true);
    expect(body1.result.applied).toContain("c1-m1");
    expect(body2.result.applied).toContain("c2-m1");

    // Both records must be persisted
    const queryRes = await server.router.handle(queryReq("counter"));
    const queryBody = await queryRes.json();
    expect(queryBody.result.data).toHaveLength(2);
    const ids = queryBody.result.data.map((r: any) => r.id).sort();
    expect(ids).toEqual(["counter:concurrent-1", "counter:concurrent-2"]);
  });

  it("concurrent merges on same record — last-write-wins, no silent failure", async () => {
    // Seed the record
    await server.router.handle(
      pushReq({
        clientId: "seed",
        mutations: [
          {
            resource: "counter",
            operation: "insert",
            id: "counter:shared",
            clientId: "seed",
            mutationId: "seed-m1",
            record: { value: 0, label: "initial" },
          },
        ],
      }),
    );

    // Two clients concurrently update the same record
    const [res1, res2] = await Promise.all([
      server.router.handle(
        pushReq({
          clientId: "c1",
          mutations: [
            {
              resource: "counter",
              operation: "merge",
              id: "counter:shared",
              clientId: "c1",
              mutationId: "merge-c1",
              record: { value: 100, label: "from-c1" },
            },
          ],
        }),
      ),
      server.router.handle(
        pushReq({
          clientId: "c2",
          mutations: [
            {
              resource: "counter",
              operation: "merge",
              id: "counter:shared",
              clientId: "c2",
              mutationId: "merge-c2",
              record: { value: 200, label: "from-c2" },
            },
          ],
        }),
      ),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both pushes must succeed (applied list must include their mutationId)
    expect(body1.result.ok).toBe(true);
    expect(body2.result.ok).toBe(true);
    expect(body1.result.applied).toContain("merge-c1");
    expect(body2.result.applied).toContain("merge-c2");

    // The record must exist and have a valid final value (one of the two)
    const queryRes = await server.router.handle(
      queryReq("counter", { id: { $eq: "counter:shared" } }),
    );
    const queryBody = await queryRes.json();
    expect(queryBody.result.data).toHaveLength(1);
    const finalValue = queryBody.result.data[0].value;
    // Final value must be either 100 or 200 — not a corrupted state
    expect([100, 200]).toContain(finalValue);
  });

  it("concurrent insert + delete on same record — result is deterministic", async () => {
    // Insert first
    await server.router.handle(
      pushReq({
        clientId: "seed",
        mutations: [
          {
            resource: "counter",
            operation: "insert",
            id: "counter:race",
            clientId: "seed",
            mutationId: "seed-race",
            record: { value: 42 },
          },
        ],
      }),
    );

    // Concurrent: one client merges, another deletes
    const [mergeRes, deleteRes] = await Promise.all([
      server.router.handle(
        pushReq({
          clientId: "c-merge",
          mutations: [
            {
              resource: "counter",
              operation: "merge",
              id: "counter:race",
              clientId: "c-merge",
              mutationId: "m-merge-race",
              record: { value: 99 },
            },
          ],
        }),
      ),
      server.router.handle(
        pushReq({
          clientId: "c-delete",
          mutations: [
            {
              resource: "counter",
              operation: "delete",
              id: "counter:race",
              clientId: "c-delete",
              mutationId: "m-delete-race",
            },
          ],
        }),
      ),
    ]);

    const mergeBody = await mergeRes.json();
    const deleteBody = await deleteRes.json();

    // Both operations must have been accepted (applied or acknowledged)
    expect(mergeBody.result.ok).toBe(true);
    expect(deleteBody.result.ok).toBe(true);

    // Server must not be in a corrupted state — query must return a valid response
    const queryRes = await server.router.handle(queryReq("counter"));
    const queryBody = await queryRes.json();
    expect(queryBody.ok).toBe(true);
    // Record is either present (0 or 1 items) — deterministic, not corrupted
    expect(queryBody.result.data.length).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TST-005b: Concurrent push from two clients — serverSeq ordering
// ═══════════════════════════════════════════════════════════════════════════

describe("TST-005b: Concurrent push from two clients — serverSeq ordering", () => {
  it("10 concurrent pushes each produce a distinct, monotonically valid cursor", async () => {
    const pushes = Array.from({ length: 10 }, (_, i) =>
      server.router.handle(
        pushReq({
          clientId: `client-${i}`,
          mutations: [
            {
              resource: "note",
              operation: "insert",
              id: `note:${i}`,
              clientId: `client-${i}`,
              mutationId: `m-note-${i}`,
              record: { text: `Note ${i}` },
            },
          ],
        }),
      ),
    );

    const responses = await Promise.all(pushes);
    const bodies = await Promise.all(responses.map((r) => r.json()));

    // All pushes must succeed
    for (let i = 0; i < bodies.length; i++) {
      expect(bodies[i]!.result.ok).toBe(true);
    }

    // Each cursor must be a valid integer string
    const cursors = bodies.map((b) => parseInt(b!.result.cursor, 10));
    for (const cursor of cursors) {
      expect(Number.isInteger(cursor)).toBe(true);
      expect(cursor).toBeGreaterThan(0);
    }
    expect(new Set(cursors).size).toBe(cursors.length);

    // All 10 notes must be persisted (no lost writes)
    const queryRes = await server.router.handle(queryReq("note"));
    const queryBody = await queryRes.json();
    expect(queryBody.result.data).toHaveLength(10);
  });

  it("sequential pushes produce strictly increasing cursors", async () => {
    const cursors: number[] = [];

    for (let i = 0; i < 5; i++) {
      const res = await server.router.handle(
        pushReq({
          clientId: "client-seq",
          mutations: [
            {
              resource: "note",
              operation: "insert",
              id: `note:seq-${i}`,
              clientId: "client-seq",
              mutationId: `m-seq-${i}`,
              record: { text: `Sequential note ${i}` },
            },
          ],
        }),
      );
      const body = await res.json();
      expect(body.result.ok).toBe(true);
      cursors.push(parseInt(body.result.cursor, 10));
    }

    // Cursors must be strictly increasing
    for (let i = 1; i < cursors.length; i++) {
      expect(cursors[i]).toBeGreaterThan(cursors[i - 1]!);
    }
  });

  it("cursorBefore of push N equals cursor of push N-1 (sequential ordering)", async () => {
    // Push A
    const resA = await server.router.handle(
      pushReq({
        clientId: "clientA",
        mutations: [
          {
            resource: "note",
            operation: "insert",
            id: "note:order-a",
            clientId: "clientA",
            mutationId: "m-order-a",
            record: { text: "A" },
          },
        ],
      }),
    );
    const bodyA = await resA.json();
    expect(bodyA.result.ok).toBe(true);
    const cursorAfterA = parseInt(bodyA.result.cursor, 10);

    // Push B
    const resB = await server.router.handle(
      pushReq({
        clientId: "clientB",
        mutations: [
          {
            resource: "note",
            operation: "insert",
            id: "note:order-b",
            clientId: "clientB",
            mutationId: "m-order-b",
            record: { text: "B" },
          },
        ],
      }),
    );
    const bodyB = await resB.json();
    expect(bodyB.result.ok).toBe(true);

    // B's cursorBefore must equal A's cursor (B sees A's changes)
    const bCursorBefore = parseInt(bodyB.result.cursorBefore, 10);
    expect(bCursorBefore).toBe(cursorAfterA);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TST-005c: Concurrent idempotent mutations — deduplicated
// ═══════════════════════════════════════════════════════════════════════════

describe("TST-005c: Concurrent idempotent mutations — deduplicated", () => {
  it("same mutation submitted concurrently from two clients produces exactly 1 record", async () => {
    const payload = {
      clientId: "c-dedup",
      mutations: [
        {
          resource: "note",
          operation: "insert",
          id: "note:dedup-race",
          clientId: "c-dedup",
          mutationId: "m-dedup-concurrent",
          record: { text: "Deduplicated race" },
        },
      ],
    };

    // Submit same mutation twice concurrently
    const [res1, res2] = await Promise.all([
      server.router.handle(pushReq(payload)),
      server.router.handle(pushReq(payload)),
    ]);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both must succeed at the HTTP level
    expect(body1.ok).toBe(true);
    expect(body2.ok).toBe(true);

    // The note must exist exactly once (idempotent — no duplicates)
    const queryRes = await server.router.handle(
      queryReq("note", { id: { $eq: "note:dedup-race" } }),
    );
    const queryBody = await queryRes.json();
    expect(queryBody.result.data).toHaveLength(1);
  });

  it("same mutation submitted 5 times serially is always in applied list", async () => {
    const payload = {
      clientId: "c-serial",
      mutations: [
        {
          resource: "note",
          operation: "insert",
          id: "note:serial-idem",
          clientId: "c-serial",
          mutationId: "m-serial-idem",
          record: { text: "Serial idempotent" },
        },
      ],
    };

    for (let i = 0; i < 5; i++) {
      const res = await server.router.handle(pushReq(payload));
      const body = await res.json();
      expect(body.result.ok).toBe(true);
      expect(body.result.applied).toContain("m-serial-idem");
    }

    // Only 1 record in DB
    const queryRes = await server.router.handle(
      queryReq("note", { id: { $eq: "note:serial-idem" } }),
    );
    const queryBody = await queryRes.json();
    expect(queryBody.result.data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TST-005d: executePush direct — concurrent with shared idempotency store
// ═══════════════════════════════════════════════════════════════════════════

describe("TST-005d: executePush direct — concurrent with shared idempotency store", () => {
  it("concurrent pushes sharing an idempotency store deduplicate correctly", async () => {
    const db = memoryAdapter();
    const idempotencyStore = new MemoryIdempotencyStore();

    const pushReqPayload = {
      clientId: "c-shared",
      mutations: [
        {
          resource: "note",
          operation: "insert",
          id: "note:shared-idem",
          clientId: "c-shared",
          mutationId: "m-shared",
          record: { text: "Shared idempotency" },
          version: 1,
        },
      ],
    };

    // Run 3 concurrent pushes with the same idempotency store
    const [r1, r2, r3] = await Promise.all([
      executePush(pushReqPayload, schema, db, idempotencyStore, "default"),
      executePush(pushReqPayload, schema, db, idempotencyStore, "default"),
      executePush(pushReqPayload, schema, db, idempotencyStore, "default"),
    ]);

    // All must succeed
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);

    // With concurrent pushes, at least one must report the mutationId as applied.
    // Idempotency with concurrent writes: the first wins, others may see it as already-applied
    // depending on store locking. Guarantee: at least 1 applied, all report ok.
    const allApplied = [...r1.applied, ...r2.applied, ...r3.applied];
    expect(allApplied.filter((id: string) => id === "m-shared").length).toBeGreaterThanOrEqual(1);

    // Only 1 record must exist in the DB
    const records = await db.findMany({ model: "note", where: [], namespace: "default" });
    expect(records).toHaveLength(1);
  });

  it("10 concurrent distinct pushes each create 1 record — 10 total records", async () => {
    const db = memoryAdapter();
    const idempotencyStore = new MemoryIdempotencyStore();

    const pushes = Array.from({ length: 10 }, (_, i) =>
      executePush(
        {
          clientId: `c-${i}`,
          mutations: [
            {
              resource: "note",
              operation: "insert",
              id: `note:distinct-${i}`,
              clientId: `c-${i}`,
              mutationId: `m-distinct-${i}`,
              record: { text: `Note ${i}` },
              version: 1,
            },
          ],
        },
        schema,
        db,
        idempotencyStore,
        "default",
      ),
    );

    const results = await Promise.all(pushes);

    // All pushes succeed
    for (const result of results) {
      expect(result.ok).toBe(true);
    }

    // Exactly 10 records
    const records = await db.findMany({ model: "note", where: [], namespace: "default" });
    expect(records).toHaveLength(10);
  });
});
