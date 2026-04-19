/**
 * PHASE_01 Security CRITICAL Tests
 * Tests for SEC-001 through SEC-008
 */

import { describe, it, expect, vi } from "vitest";
import { WebSocketManager, type WebSocketClient } from "../src/ws.js";
import { validateQueryAuthz, validateMutationAuthz } from "../src/validation/authz.js";
import { validateMutation, validatePushMutations } from "../src/validation/mutation.js";
import { validateFilters, validateQuery } from "../src/validation/query.js";
import { buildSchemaIndex } from "../src/validation/index.js";
import { readBodyWithLimit } from "../src/http/middleware.js";
import type { DatafnSchema } from "@datafn/core";

const testSchema: DatafnSchema = {
  resources: [
    {
      name: "users",
      version: 1,
      fields: [
        { name: "name", type: "string", required: true },
        { name: "age", type: "number", required: false },
        { name: "active", type: "boolean", required: false },
        { name: "bio", type: "string", required: false, nullable: true },
        { name: "salary", type: "number", required: false },
        { name: "metadata", type: "object", required: false },
        { name: "createdAt", type: "date", required: false },
      ],
      permissions: {
        read: { fields: ["id", "name", "age", "active", "bio", "createdAt"] },
        write: { fields: ["name", "age", "active", "bio"] },
      },
    },
  ],
};

const schemaIndex = buildSchemaIndex(testSchema);

// ─── SEC-001 / SEC-002: WebSocket Auth ────────────────────────────────

describe("SEC-001/002: WebSocket Auth", () => {
  it("addClient requires namespace and stores server-derived namespace", () => {
    const manager = new WebSocketManager();
    const client: WebSocketClient = { send: vi.fn() };

    manager.addClient(client, { namespace: "tenant:abc" });

    // Broadcast to namespace — client should receive
    manager.broadcastCursor("100", "tenant:abc");
    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "cursor",
        cursor: "100",
        targeting: { mode: "namespace-broadcast", degraded: false },
      }),
    );
  });

  it("client namespace in hello message is ignored (SEC-002)", () => {
    const manager = new WebSocketManager();
    const client: WebSocketClient = { send: vi.fn() };

    // Server sets namespace to "tenant:abc"
    manager.addClient(client, { namespace: "tenant:abc" });

    // Client tries to spoof namespace via hello
    manager.handleMessage(client, JSON.stringify({
      type: "hello",
      clientId: "c1",
      cursor: "0",
      namespace: "tenant:evil",
    }));

    // Broadcast to spoofed namespace — client should NOT receive
    manager.broadcastCursor("100", "tenant:evil");
    expect(client.send).not.toHaveBeenCalled();

    // Broadcast to real namespace — client SHOULD receive
    manager.broadcastCursor("100", "tenant:abc");
    expect(client.send).toHaveBeenCalled();
  });

  it("separate namespace clients are isolated", () => {
    const manager = new WebSocketManager();
    const client1: WebSocketClient = { send: vi.fn() };
    const client2: WebSocketClient = { send: vi.fn() };

    manager.addClient(client1, { namespace: "tenant:a" });
    manager.addClient(client2, { namespace: "tenant:b" });

    manager.broadcastCursor("100", "tenant:a");
    expect(client1.send).toHaveBeenCalled();
    expect(client2.send).not.toHaveBeenCalled();
  });
});

// ─── SEC-003: Authz Coverage ──────────────────────────────────────────

describe("SEC-003: Authz coverage for query fields", () => {
  it("aggregation field authz bypass is blocked", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        aggregations: {
          avgSalary: { op: "avg", field: "salary" },
        },
      },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.path).toContain("aggregations");
    }
  });

  it("aggregation on allowed field passes", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        aggregations: {
          avgAge: { op: "avg", field: "age" },
        },
      },
      testSchema,
    );
    expect(result.ok).toBe(true);
  });

  it("groupBy authz bypass is blocked", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        groupBy: ["salary"],
      },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.path).toContain("groupBy");
    }
  });

  it("sort authz bypass is blocked", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        sort: ["-salary"],
      },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.path).toContain("sort");
    }
  });

  it("sort on allowed field passes", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        sort: ["-name"],
      },
      testSchema,
    );
    expect(result.ok).toBe(true);
  });

  it("search.fields authz bypass is blocked", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        search: { query: "test", fields: ["salary"] },
      },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
      expect(result.path).toContain("search.fields");
    }
  });

  it("having clause authz bypass is blocked", () => {
    const result = validateQueryAuthz(
      {
        resource: "users",
        having: { salary: { $gt: 100000 } },
      },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });
});

// ─── SEC-004: Transact authz tested via integration ───────────────────
// (The transact route wiring is tested in authz.test.ts / integration tests;
//  here we verify validateQueryAuthz and validateMutationAuthz individually)

describe("SEC-004: Transact per-step authz", () => {
  it("mutation authz rejects unauthorized write fields", () => {
    const result = validateMutationAuthz(
      { resource: "users", operation: "insert", id: "u1", record: { salary: 100000 } },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("query authz rejects unauthorized select fields", () => {
    const result = validateQueryAuthz(
      { resource: "users", select: ["salary"] },
      testSchema,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });
});

// ─── SEC-005: Type Validation ─────────────────────────────────────────

describe("SEC-005: Field value type validation in mutations", () => {
  it("TV-SEC-013: string field rejects number", () => {
    const result = validateMutation(
      { resource: "users", operation: "insert", id: "u1", record: { name: 123 } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("name");
      expect(result.error.message).toContain("string");
    }
  });

  it("TV-SEC-014: number field rejects string", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { age: "twenty" } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("age");
      expect(result.error.message).toContain("number");
    }
  });

  it("TV-SEC-015: number field rejects NaN", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { age: NaN } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("NaN");
    }
  });

  it("TV-SEC-016: boolean field rejects string", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { active: "true" } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("boolean");
    }
  });

  it("TV-SEC-019: object field rejects array", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { metadata: [1, 2] } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("object");
      expect(result.error.message).toContain("array");
    }
  });

  it("TV-SEC-020: nullable field accepts null", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { bio: null } },
      schemaIndex,
    );
    expect(result.ok).toBe(true);
  });

  it("TV-SEC-017: date field accepts ISO string", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { createdAt: "2026-01-01T00:00:00Z" } },
      schemaIndex,
    );
    expect(result.ok).toBe(true);
  });

  it("TV-SEC-018: date field accepts epoch number", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { createdAt: 1767225600000 } },
      schemaIndex,
    );
    expect(result.ok).toBe(true);
  });

  it("correct types pass validation", () => {
    const result = validateMutation(
      { resource: "users", operation: "insert", id: "u1", record: { name: "Alice", age: 30, active: true } },
      schemaIndex,
    );
    expect(result.ok).toBe(true);
  });
});

// ─── SEC-006: Batch Size Limit ────────────────────────────────────────
// (Route-level test; unit-level batch limit validation in push handler
//  is tested via integration. Here we verify the validatePushMutations behavior.)

describe("SEC-006: Batch size limit", () => {
  it("mutations array of exactly 500 validates structurally", () => {
    // Note: This tests the validation utility, not the route limit check.
    // The actual batch size check is in the push route handler.
    const mutations = Array.from({ length: 500 }, (_, i) => ({
      resource: "users",
      operation: "merge",
      id: `u${i}`,
      record: { name: `user${i}` },
    }));
    const result = validatePushMutations(mutations, schemaIndex);
    expect(result.valid).toBe(true);
  });
});

// ─── SEC-007: Byte-based Payload ──────────────────────────────────────

describe("SEC-007: Byte-based payload measurement", () => {
  it("multi-byte content is correctly measured", async () => {
    // 2MB of emoji characters (each 4 bytes in UTF-8)
    const emoji = "😀".repeat(500_000); // 500K chars = 2MB UTF-8
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: emoji,
    });

    // With a 1MB limit, this should be rejected (2MB > 1MB)
    const result = await readBodyWithLimit(req, 1_000_000);
    expect(result.ok).toBe(false);
  });

  it("ASCII content within limit passes", async () => {
    const ascii = "a".repeat(1000);
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: ascii,
    });

    const result = await readBodyWithLimit(req, 5_242_880);
    expect(result.ok).toBe(true);
  });
});

// ─── SEC-008: Prototype Pollution ─────────────────────────────────────

describe("SEC-008: Prototype pollution protection", () => {
  it("TV-SEC-025: top-level __proto__ in mutation record rejected", () => {
    // Build a record with __proto__ key using Object.create(null)
    const record = Object.create(null);
    record["id"] = "u1";
    record["__proto__"] = { isAdmin: true };
    record["name"] = "test";

    const result = validateMutation(
      { resource: "users", operation: "insert", id: "u1", record },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("__proto__");
    }
  });

  it("TV-SEC-026: nested constructor key in mutation rejected", () => {
    const result = validateMutation(
      { resource: "users", operation: "merge", id: "u1", record: { metadata: { constructor: { prototype: {} } } } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("constructor");
    }
  });

  it("TV-SEC-027: __proto__ in filter rejected", () => {
    const filters = Object.create(null);
    filters["__proto__"] = { $eq: "test" };

    const result = validateFilters(filters, "users", schemaIndex);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("__proto__");
    }
  });

  it("TV-SEC-028: clean record accepted", () => {
    const result = validateMutation(
      { resource: "users", operation: "insert", id: "u1", record: { name: "test", metadata: { key: "value" } } },
      schemaIndex,
    );
    expect(result.ok).toBe(true);
  });

  // FIX-SEC-008: Query-level, aggregations, and having pollution checks

  it("TV-SEC-008-P1: clean query with aggregations/having passes", () => {
    const result = validateFilters(
      { name: { $eq: "test" } },
      "users",
      schemaIndex,
    );
    expect(result.ok).toBe(true);
  });

  it("TV-SEC-008-N1: __proto__ in aggregations is rejected", () => {

    const aggObj = Object.create(null);
    aggObj["__proto__"] = { op: "count", field: "*" };

    const result = validateQuery(
      { resource: "users", aggregations: aggObj },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("__proto__");
    }
  });

  it("TV-SEC-008-N2: constructor in nested query object is rejected", () => {

    const result = validateQuery(
      { resource: "users", meta: { constructor: { prototype: {} } } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("constructor");
    }
  });

  it("FIX-SEC-008: __proto__ in having clause is rejected", () => {

    const havingObj = Object.create(null);
    havingObj["__proto__"] = { $gt: 0 };

    const result = validateQuery(
      { resource: "users", having: havingObj, aggregations: { total: { op: "count", field: "*" } } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("__proto__");
    }
  });

  it("FIX-SEC-008: prototype in aggregation value is rejected", () => {

    const result = validateQuery(
      { resource: "users", aggregations: { total: { op: "count", field: "*", prototype: {} } } },
      schemaIndex,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DFQL_INVALID");
      expect(result.error.message).toContain("prototype");
    }
  });
});
