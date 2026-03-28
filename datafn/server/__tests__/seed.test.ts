/**
 * Seed Endpoint Tests - Phase 06
 * Tests TV-SEED-001, TV-SEED-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
// Default schema for testing
const defaultSchema = {
  resources: [
    {
      name: "task",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

describe("@datafn/server seed endpoint", () => {
  it("TV-SEED-001: POST /datafn/seed accepts clientId and returns success", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: defaultSchema });

    const request = new Request("http://localhost/datafn/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client:device-1" }),
    });

    const response = await server.router.handle(request, {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      result: { ok: true },
    });
  });

  it("TV-SEED-002: Missing/invalid clientId is rejected with DFQL_INVALID", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: defaultSchema });

    const request = new Request("http://localhost/datafn/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await server.router.handle(request, {});
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      },
    });
  });

  it("TV-SEC-033: Seed uses auth-derived namespace, not hardcoded 'datafn'", async () => {
    const db = memoryAdapter({ libraryNamespace: "datafn" });

    const namespaceProvider = {
      getNamespace: (ctx: any) => `user:${ctx?.parsedBody?.userId || "u1"}`,
    };

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: defaultSchema,
      db,
      namespaceProvider,
      rowLevelNamespace: false, // Disable RLN to avoid pre-existing wrapWithRowLevelNamespace issue
    });

    const request = new Request("http://localhost/datafn/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client:1", userId: "u1" }),
    });

    const response = await server.router.handle(request, {});
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.ok).toBe(true);

    // Verify the seed record was stored with auth-derived namespace, not 'datafn'
    // Query internal table to confirm namespace is "user:u1" not "datafn"
    const seedRecord = await db.internal.findOne("__datafn_seed", [
      { field: "namespace", op: "eq", value: "user:u1" },
    ]);
    expect(seedRecord).not.toBeNull();
    expect(seedRecord?.namespace).toBe("user:u1");
  });

  it("TV-SEED-002: clientId as non-string is rejected", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: defaultSchema });

    const request = new Request("http://localhost/datafn/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: 123 }),
    });

    const response = await server.router.handle(request, {});
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: clientId must be string",
        details: { path: "clientId" },
      },
    });
  });

  it("SRV-013: seed returns 500 when DB write fails", async () => {
    // Build a DB adapter that throws on internal.create (simulating a DB error)
    const base = memoryAdapter();
    const faultyDb = {
      ...base,
      internal: {
        ...base.internal,
        create: async () => {
          throw new Error("DB write failed");
        },
      },
    };

    const server = await createDatafnServer({
      allowUnknownResources: true,
      schema: defaultSchema,
      db: faultyDb as any,
    });

    const request = new Request("http://localhost/datafn/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client:1" }),
    });

    const response = await server.router.handle(request, {});
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INTERNAL");
  });
});
