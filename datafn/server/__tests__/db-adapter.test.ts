/**
 * DB Adapter tests - Phase 07D
 * Tests TV-DB-001, TV-DB-002 from TEST_VECTORS.md
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

describe("DB Adapter Integration", () => {
  it("TV-DB-001: Mutation persists record, query reads it back", async () => {
    // Create server with memory adapter
    const db = memoryAdapter();
    await db.initialize();

    const server = await createDatafnServer({
      schema: testSchema,
      db,
    });

    // Insert a record via mutation
    const mutationRes = await server.router.handle(
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
      }),
    );

    const mutationBody = await mutationRes.json();
    expect(mutationBody.ok).toBe(true);
    expect(mutationBody.result.ok).toBe(true);
    expect(mutationBody.result.mutationId).toBe("m-1");
    expect(mutationBody.result.affectedIds).toEqual(["task:1"]);
    expect(mutationBody.result.deduped).toBe(false);

    // Query the record back
    const queryRes = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "title"],
          filters: { id: "task:1" },
        }),
      }),
    );

    const queryBody = await queryRes.json();
    expect(queryBody.ok).toBe(true);
    expect(queryBody.result.data).toHaveLength(1);
    expect(queryBody.result.data[0]).toMatchObject({
      id: "task:1",
      title: "A",
    });
  });

  it("TV-DB-MISSING-001: Query without DB returns INTERNAL error", async () => {
    // Create server WITHOUT db
    const server = await createDatafnServer({
      schema: testSchema,
    });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id"],
        }),
      }),
    );

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal error");
    expect(body.error.details.path).toBe("$");
  });

  it("TV-DB-002: Mutation without DB returns INTERNAL error", async () => {
    // Create server WITHOUT db
    const server = await createDatafnServer({
      schema: testSchema,
    });

    const res = await server.router.handle(
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
      }),
    );

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Internal error");
    expect(body.error.details.path).toBe("$");
  });
});
