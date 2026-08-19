/**
 * Namespace Isolation Tests
 * Tests for per-user/tenant serverSeq isolation via namespaceProvider
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

describe("Namespace Isolation via namespaceProvider", () => {

  it("uses default namespace when namespaceProvider is not provided", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
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
    expect(body.result.cursor).toBeDefined();
  });

  it("extracts namespace from namespaceProvider using request context", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });

    // namespaceProvider extracts user from parsed body (simulating session/JWT)
    const namespaceProvider = {
      getNamespace: (ctx: any) => {
        const parsedBody = ctx.parsedBody as any;
        const userId = parsedBody?.userId || parsedBody?.clientId || "";
        const tenantId = parsedBody?.tenantId;
        if (tenantId) return `tenant:${tenantId}:user:${userId}`;
        return userId ? `user:${userId}` : "datafn";
      },
    };

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      namespaceProvider,
    });

    // Push for user 1 (using clientId as userId for this test)
    const req1 = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:1",
        userId: "user-1", // Extra field for auth context
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
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.ok).toBe(true);
    expect(body1.result.cursor).toBe("1"); // First serverSeq for user-1

    // Push for user 2 - should get independent serverSeq
    const req2 = new Request("http://localhost/datafn/push", {
      method: "POST",
      body: JSON.stringify({
        clientId: "client:2",
        userId: "user-2", // Different user
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
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.ok).toBe(true);
    expect(body2.result.cursor).toBe("1"); // First serverSeq for user-2 (independent namespace)
  });

  it("returns error when getNamespace throws (SRV-010: no silent fallback)", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const namespaceProvider = {
      getNamespace: () => {
        throw new Error("Auth error");
      },
    };

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      namespaceProvider,
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
    // SRV-010: namespaceProvider.getNamespace throwing must not silently fall back
    // to "datafn" to prevent accidental cross-tenant data leaks.
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("falls back to default namespace when getNamespace returns 'datafn'", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const namespaceProvider = {
      getNamespace: () => "datafn", // Returns default namespace
    };

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: testSchema,
      database: db,
      namespaceProvider,
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
    expect(res.status).toBe(200); // Should not fail, falls back to default
  });
});
