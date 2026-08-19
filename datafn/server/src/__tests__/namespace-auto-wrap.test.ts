/**
 * DFN-001 / DFN-002: Server auto-wrapping tests
 *
 * Verifies that createDatafnServer wraps the adapter with row-level
 * namespace filtering when namespaceProvider is present, and does
 * not wrap when it's absent or when rowLevelNamespace is explicitly false.
 */

import { describe, it, expect, vi } from "vitest";
import { createDatafnServer } from "../server.js";
import { memoryAdapter } from "@superfunctions/db/testing";
import type { DatafnSchema } from "../core-types.js";

const testSchema: DatafnSchema = {
  version: 1,
  resources: [
    {
      name: "task",
      version: 1,
      capabilities: ["audit"],
      fields: [
        { name: "title", type: "string", required: true },
      ],
    },
  ],
  relations: [],
};

describe("DFN-001: Server auto-wrapping on namespaceProvider", () => {
  it("wraps adapter when namespaceProvider is present", async () => {
    const db = memoryAdapter({ debug: false });
    const findManySpy = vi.spyOn(db, "findMany");

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      namespaceProvider: {
        getNamespace: () => "user:alice",
      },
    });

    // Issue a query request through the server
    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "task" }),
    });

    await server.router.handle(req);

    // The adapter's findMany should have been called with __ns in where clause
    expect(findManySpy).toHaveBeenCalled();
    const call = findManySpy.mock.calls[0];
    const params = call[0] as any;
    const hasNsClause = params.where?.some(
      (w: any) => w.field === "__ns" && w.operator === "eq" && w.value === "user:alice",
    );
    expect(hasNsClause).toBe(true);

    server.close();
  });

  it("does NOT wrap adapter when namespaceProvider is absent (DFN-002)", async () => {
    const db = memoryAdapter({ debug: false });
    const findManySpy = vi.spyOn(db, "findMany");

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "task" }),
    });

    await server.router.handle(req);

    // The adapter's findMany should NOT have __ns in where clause
    if (findManySpy.mock.calls.length > 0) {
      const call = findManySpy.mock.calls[0];
      const params = call[0] as any;
      const hasNsClause = params.where?.some(
        (w: any) => w.field === "__ns",
      );
      expect(hasNsClause).toBeFalsy();
    }

    server.close();
  });

  it("does NOT wrap when rowLevelNamespace is explicitly false", async () => {
    const db = memoryAdapter({ debug: false });
    const findManySpy = vi.spyOn(db, "findMany");

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      namespaceProvider: {
        getNamespace: () => "user:alice",
      },
      rowLevelNamespace: false,
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "task" }),
    });

    await server.router.handle(req);

    // Should NOT have __ns filter even though namespaceProvider is present
    if (findManySpy.mock.calls.length > 0) {
      const call = findManySpy.mock.calls[0];
      const params = call[0] as any;
      const hasNsClause = params.where?.some(
        (w: any) => w.field === "__ns",
      );
      expect(hasNsClause).toBeFalsy();
    }

    server.close();
  });

  it("uses custom config when rowLevelNamespace is an object", async () => {
    const db = memoryAdapter({ debug: false });
    const findManySpy = vi.spyOn(db, "findMany");

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      namespaceProvider: {
        getNamespace: () => "user:alice",
      },
      rowLevelNamespace: { enabled: true, columnName: "tenant_id", mandatory: true },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "task" }),
    });

    await server.router.handle(req);

    // Should use custom column name
    expect(findManySpy).toHaveBeenCalled();
    const call = findManySpy.mock.calls[0];
    const params = call[0] as any;
    const hasCustomCol = params.where?.some(
      (w: any) => w.field === "tenant_id" && w.operator === "eq" && w.value === "user:alice",
    );
    expect(hasCustomCol).toBe(true);

    server.close();
  });

  it("passes request context into namespace and actor providers", async () => {
    const server = await createDatafnServer<{ actorId: string }>({
      allowUnknownResources: true,
      schema: testSchema,
      database: memoryAdapter({ debug: false }),
      context: (request) => ({
        actorId: request.headers.get("x-actor-id") ?? "anonymous",
      }),
      namespaceProvider: {
        getNamespace: (ctx) => `workspace:${ctx.actorId}`,
        getActorId: (ctx) => ctx.actorId,
      },
    });

    const mutation = await server.router.handle(new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-actor-id": "usr_alice",
      },
      body: JSON.stringify({
        clientId: "test-client",
        mutationId: "test-context-actor",
        resource: "task",
        version: 1,
        operation: "insert",
        id: "task:context",
        record: { title: "Context actor" },
      }),
    }));
    const query = await server.router.handle(new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-actor-id": "usr_alice",
      },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        filters: { id: "task:context" },
        select: ["id", "createdBy"],
      }),
    }));

    expect(await mutation.json()).toMatchObject({
      ok: true,
      result: { ok: true },
    });
    expect(await query.json()).toMatchObject({
      ok: true,
      result: {
        data: [{ id: "task:context", createdBy: "usr_alice" }],
      },
    });

    server.close();
  });
});
