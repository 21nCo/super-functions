/**
 * Seed Endpoint Tests - Phase 06
 * Tests TV-SEED-001, TV-SEED-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";

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
    const server = await createDatafnServer({ schema: defaultSchema });

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
    const server = await createDatafnServer({ schema: defaultSchema });

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

  it("TV-SEED-002: clientId as non-string is rejected", async () => {
    const server = await createDatafnServer({ schema: defaultSchema });

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
});
