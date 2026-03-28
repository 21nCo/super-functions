/**
 * Phase 09: Validation MEDIUM tests
 * TV-VAL-001 through TV-VAL-012
 *
 * Covers:
 *   VAL-001 — Authz deny-by-default
 *   VAL-002 — Select token limit (50)
 *   VAL-003 — Filter key limit (20)
 *   VAL-004 — Sort field limit (10)
 *   VAL-005 — Aggregation count limit (20)
 *   VAL-006 — ID length limit (255)
 *   VAL-007 — clientId/mutationId validation
 *   VAL-008 — Version field validation
 *   VAL-009 — Error disclosure control (debug mode)
 *   VAL-010 — Default payload size (5 MB)
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";

// ─── Schemas ──────────────────────────────────────────────────────────────────

/** Resource with NO permissions policy — will be FORBIDDEN by deny-by-default. */
const schemaNoPerm: DatafnSchema = {
  resources: [
    {
      name: "items",
      version: 1,
      fields: [{ name: "name", type: "string" as const, required: false }],
    },
  ],
  relations: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function queryReq(body: unknown): Request {
  return new Request("http://localhost/datafn/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mutationReq(body: unknown): Request {
  return new Request("http://localhost/datafn/mutation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Phase 09: Validation MEDIUM", () => {
  // ── VAL-001: Authz deny-by-default ─────────────────────────────────────────

  describe("VAL-001: Authz deny-by-default", () => {
    it("TV-VAL-001: query on resource with no policy is FORBIDDEN by default", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        // allowUnknownResources omitted → defaults to false (deny-by-default)
      });

      const res = await server.router.handle(
        queryReq({ resource: "items", version: 1, select: ["id"] }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      // Message must contain the escape-hatch hint
      expect(body.error.message).toContain("allowUnknownResources");
    });

    it("TV-VAL-002: query on resource with no policy + allowUnknownResources passes", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      const res = await server.router.handle(
        queryReq({ resource: "items", version: 1, select: ["id"] }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  // ── VAL-002: Select token limit ─────────────────────────────────────────────

  describe("VAL-002: Select token limit (50)", () => {
    it("TV-VAL-003: select with 51 tokens is rejected (max 50)", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      const res = await server.router.handle(
        queryReq({
          resource: "items",
          version: 1,
          select: Array<string>(51).fill("id"),
        }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("Select exceeds limit");
    });
  });

  // ── VAL-003: Filter key limit ───────────────────────────────────────────────

  describe("VAL-003: Filter key limit (20)", () => {
    it("TV-VAL-004: filter with 21 keys is rejected (max 20)", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      // 21 unique keys — count check fires before field validation
      const filters = Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [`field${i}`, { eq: "x" }]),
      );

      const res = await server.router.handle(
        queryReq({ resource: "items", version: 1, select: ["id"], filters }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("Filter keys exceed limit");
    });
  });

  // ── VAL-004: Sort field limit ───────────────────────────────────────────────

  describe("VAL-004: Sort field limit (10)", () => {
    it("TV-VAL-005: sort with 11 fields is rejected (max 10)", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      // Length check fires before field-name validation
      const res = await server.router.handle(
        queryReq({
          resource: "items",
          version: 1,
          select: ["id"],
          sort: Array<string>(11).fill("id"),
        }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("Sort fields exceed limit");
    });
  });

  // ── VAL-005: Aggregation count limit ───────────────────────────────────────

  describe("VAL-005: Aggregation count limit (20)", () => {
    it("TV-VAL-006: 21 aggregations are rejected (max 20)", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      // 21 unique aggregation aliases — count check fires before field validation
      const aggregations = Object.fromEntries(
        Array.from({ length: 21 }, (_, i) => [
          `agg${i}`,
          { op: "count", field: "*" },
        ]),
      );

      const res = await server.router.handle(
        queryReq({
          resource: "items",
          version: 1,
          aggregations,
          groupBy: ["id"],
        }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("Aggregations exceed limit");
    });
  });

  // ── VAL-006: ID length limit ────────────────────────────────────────────────

  describe("VAL-006: ID length limit (255)", () => {
    it("TV-VAL-007: mutation with 300-char ID is rejected", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      const res = await server.router.handle(
        mutationReq({
          resource: "items",
          operation: "merge",
          id: "item-" + "a".repeat(296), // 5 + 296 = 301 chars > 255
          record: { name: "x" },
          clientId: "client-1",
          mutationId: "mut-1",
        }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("ID exceeds maximum length");
    });
  });

  // ── VAL-007: clientId/mutationId validation ─────────────────────────────────

  describe("VAL-007: clientId/mutationId validation", () => {
    it("TV-VAL-008: mutation with empty clientId is rejected", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      const res = await server.router.handle(
        mutationReq({
          resource: "items",
          operation: "merge",
          id: "item-1",
          record: { name: "x" },
          clientId: "", // empty — invalid
          mutationId: "mut-1",
        }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("clientId");
    });
  });

  // ── VAL-008: Version field validation ──────────────────────────────────────

  describe("VAL-008: Version field validation", () => {
    it("TV-VAL-009: mutation with version -1 is rejected", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
      });

      const res = await server.router.handle(
        mutationReq({
          resource: "items",
          operation: "merge",
          id: "item-1",
          version: -1, // negative — invalid
          record: { name: "x" },
          clientId: "client-1",
          mutationId: "mut-1",
        }),
        {},
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("version");
    });
  });

  // ── VAL-009: Error disclosure control ──────────────────────────────────────

  describe("VAL-009: Error disclosure control (debug mode)", () => {
    const invalidMutBody = {
      resource: "items",
      operation: "merge",
      id: "item-" + "a".repeat(296), // > 255 — triggers ID length validation error
      record: { name: "x" },
      clientId: "client-1",
      mutationId: "mut-1",
    };

    it("TV-VAL-010: debug: false returns generic 'Validation error' message", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
        debug: false,
      });

      const res = await server.router.handle(mutationReq(invalidMutBody), {});
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.message).toBe("Validation error");
    });

    it("TV-VAL-011: debug: true returns detailed error message", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
        debug: true,
      });

      const res = await server.router.handle(mutationReq(invalidMutBody), {});
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain("ID exceeds maximum length");
    });
  });

  // ── VAL-010: Default payload size (5 MB) ───────────────────────────────────

  describe("VAL-010: Default payload size (5 MB)", () => {
    it("TV-VAL-012: payload exceeding configured limit is rejected with 413 LIMIT_EXCEEDED", async () => {
      const server = await createDatafnServer({
        schema: schemaNoPerm,
        db: memoryAdapter(),
        allowUnknownResources: true,
        limits: { maxPayloadBytes: 100 }, // tiny limit for testing
      });

      const largeBody = JSON.stringify({
        resource: "items",
        version: 1,
        select: ["id"],
        // Pad to exceed 100-byte limit
        _pad: "x".repeat(200),
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(largeBody.length),
        },
        body: largeBody,
      });

      const res = await server.router.handle(req, {});
      const body = await res.json();

      expect(res.status).toBe(413);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("LIMIT_EXCEEDED");
    });
  });
});
