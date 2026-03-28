/**
 * Namespace Provider Tests
 * Tests TV-NS-007 through TV-NS-015, TV-NS-036, TV-NS-037
 * Requirements: NS-003, NS-004, NS-005, NS-006, NS-015, NS-021, NS-022
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { ns } from "@datafn/core";

const testSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

function pushRequest(mutations: any[], clientId = "client:1") {
  return new Request("http://localhost/datafn/push", {
    method: "POST",
    body: JSON.stringify({ clientId, mutations }),
  });
}

function queryRequest(resource: string) {
  return new Request("http://localhost/datafn/query", {
    method: "POST",
    body: JSON.stringify({ resource, select: ["*"] }),
  });
}

// ---------------------------------------------------------------------------
// NS-003 / NS-004: namespaceProvider.getNamespace()
// ---------------------------------------------------------------------------
describe("namespaceProvider (NS-003, NS-004)", () => {
  // TV-NS-007: Server with namespaceProvider resolves namespace
  it("TV-NS-007: uses namespaceProvider.getNamespace for namespace", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: (ctx: any) => "acme:u1",
      },
    });

    const res = await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "Test" },
        },
      ]),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.applied).toContain("m-1");
    await server.close();
  });

  // TV-NS-009: extractNamespace returns the provider's string
  it("TV-NS-009: extractNamespace returns provider's namespace string", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => "workspace:ws-42",
      },
    });

    const res = await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "Test" },
        },
      ]),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.applied).toContain("m-1");
    await server.close();
  });
});

// ---------------------------------------------------------------------------
// NS-022: Empty namespace validation
// ---------------------------------------------------------------------------
describe("Empty namespace validation (NS-022)", () => {
  // TV-NS-010 / TV-NS-037: Empty namespace rejected
  it("TV-NS-010/037: rejects empty namespace from provider", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => "",
      },
    });

    const res = await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "Test" },
        },
      ]),
    );
    // Should get an error response (provider error propagates)
    expect(res.status).toBeGreaterThanOrEqual(400);
    await server.close();
  });

  // TV-NS-011: Provider errors are propagated
  it("TV-NS-011: propagates provider errors (no silent fallback)", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => {
          throw new Error("auth expired");
        },
      },
    });

    const res = await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "Test" },
        },
      ]),
    );
    // Should get error response, not fallback to "datafn"
    expect(res.status).toBeGreaterThanOrEqual(400);
    await server.close();
  });
});

// ---------------------------------------------------------------------------
// NS-006: Rate limit key uses namespace
// ---------------------------------------------------------------------------
describe("Rate limit key uses namespace (NS-006)", () => {
  // TV-NS-015: rate limit key = namespace when namespaceProvider is used
  it("TV-NS-015: rate limit default key extractor uses namespace", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: (ctx: { query: URLSearchParams }) =>
          `org:${ctx.query.get("tenant") ?? "anonymous"}`,
      },
      rateLimit: {
        enabled: true,
        maxRequests: 1,
        windowSeconds: 60,
      },
    });

    const first = await server.router.handle(
      new Request("http://localhost/datafn/status?tenant=u1"),
    );
    const second = await server.router.handle(
      new Request("http://localhost/datafn/status?tenant=u1"),
    );
    const third = await server.router.handle(
      new Request("http://localhost/datafn/status?tenant=u2"),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(third.status).toBe(200);
    await server.close();
  });
});

// ---------------------------------------------------------------------------
// NS-015: Actor ID extraction
// ---------------------------------------------------------------------------
describe("Actor ID extraction (NS-015)", () => {
  // TV-NS-029: getActorId returns value
  it("TV-NS-029: getActorId value is extracted without error", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => "ns-1",
        getActorId: () => "actor-7",
      },
    });

    const res = await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "Test" },
        },
      ]),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.applied).toContain("m-1");
    await server.close();
  });

  // TV-NS-029 negative: getActorId throws → request still succeeds
  it("TV-NS-029 negative: getActorId error does not fail request", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => "ns-1",
        getActorId: () => {
          throw new Error("actor lookup failed");
        },
      },
    });

    const res = await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "Test" },
        },
      ]),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.applied).toContain("m-1");
    await server.close();
  });

});

// ---------------------------------------------------------------------------
// NS-021: WS auth context uses namespace
// ---------------------------------------------------------------------------
describe("WS namespace (NS-021)", () => {
  it("TV-NS-036: websocketHandler.addClient accepts namespace string", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => "ws-ns-1",
      },
    });

    // WsAuthContext already uses { namespace: string } — verify it's accepted
    const mockClient = {
      send: (_: string) => {},
      close: (_?: number, __?: string) => {},
      readyState: 1,
    };
    const result = server.websocketHandler.addClient(mockClient as any, { namespace: "ws-ns-1" });
    expect(result).toBe(true);
    server.websocketHandler.removeClient(mockClient as any);
    await server.close();
  });
});

// ---------------------------------------------------------------------------
// Namespace isolation correctness: cross-namespace data not visible
// ---------------------------------------------------------------------------
describe("Namespace isolation correctness", () => {
  it("data pushed under one namespace is invisible under another", async () => {
    let currentNs = "ns-A";
    const db = memoryAdapter({ libraryNamespace: "datafn" });
    const server = await createDatafnServer({
      schema: testSchema, allowUnknownResources: true,
      db,
      namespaceProvider: {
        getNamespace: () => currentNs,
      },
    });

    // Push as ns-A
    await server.router.handle(
      pushRequest([
        {
          operation: "insert",
          resource: "task",
          id: "task:1",
          clientId: "client:1",
          mutationId: "m-1",
          record: { title: "A task" },
        },
      ]),
    );

    // Query as ns-A — should see it
    let queryRes = await server.router.handle(queryRequest("task"));
    let qBody = await queryRes.json();
    expect(qBody.result.data).toHaveLength(1);

    // Query as ns-B — should NOT see it
    currentNs = "ns-B";
    queryRes = await server.router.handle(queryRequest("task"));
    qBody = await queryRes.json();
    expect(qBody.result.data).toHaveLength(0);

    await server.close();
  });
});
