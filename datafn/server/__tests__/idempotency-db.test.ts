/**
 * DB-backed idempotency tests - Phase 07D
 * Tests TV-IDEMP-001, TV-IDEMP-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string", required: true }],
    },
  ],
};

describe("DB-backed Idempotency", () => {
  it("TV-IDEMP-001: Idempotency dedupe survives 'restart' (same adapter instance)", async () => {
    // Create shared adapter that persists across "restarts"
    const sharedDb = memoryAdapter();
    await sharedDb.initialize();

    // First server instance
    const server1 = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: sharedDb,
    });

    // Execute mutation
    const res1 = await server1.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-idem",
          id: "task:1",
          record: { title: "B" },
        }),
      })
    );

    const body1 = await res1.json();
    expect(body1.result.ok).toBe(true);
    expect(body1.result.deduped).toBe(false);

    // "Restart" server (new instance, same adapter)
    const server2 = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: sharedDb,
    });

    // Replay same mutation after "restart"
    const res2 = await server2.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-idem",
          id: "task:1",
          record: { title: "B" },
        }),
      })
    );

    const body2 = await res2.json();
    expect(body2.result.ok).toBe(true);
    expect(body2.result.deduped).toBe(true); // Deduped across restart!
    expect(body2.result.mutationId).toBe("m-idem");
  });

  it("TV-IDEMP-002: Different clientId/mutationId combos are independent", async () => {
    const db = memoryAdapter();
    await db.initialize();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
    });

    // First mutation: client1 + m1
    const res1 = await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-1",
          id: "task:1",
          record: { title: "A" },
        }),
      })
    );

    expect((await res1.json()).result.deduped).toBe(false);

    // Second mutation: client1 + m2 (different mutationId)
    const res2 = await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-2",
          id: "task:2",
          record: { title: "B" },
        }),
      })
    );

    expect((await res2.json()).result.deduped).toBe(false); // Not deduped

    // Third mutation: client2 + m1 (different clientId)
    const res3 = await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:2",
          mutationId: "m-1",
          id: "task:3",
          record: { title: "C" },
        }),
      })
    );

    expect((await res3.json()).result.deduped).toBe(false); // Not deduped

    // Fourth mutation: replay client1 + m1 (exact match)
    const res4 = await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "m-1",
          id: "task:1",
          record: { title: "A" },
        }),
      })
    );

    expect((await res4.json()).result.deduped).toBe(true); // Deduped!
  });
});
