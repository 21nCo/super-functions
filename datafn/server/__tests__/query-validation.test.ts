/**
 * /datafn/query validation tests
 * Tests TV-API-002 and TV-QUERY-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../src/server.js";

// Fixture F1 schema from TEST_VECTORS.md
const fixtureF1Schema = {
  resources: [
    {
      name: "goal",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
        { name: "status", type: "string", required: true },
        { name: "isArchived", type: "boolean", required: true },
      ],
    },
    {
      name: "task",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
        { name: "priority", type: "number", required: true },
        { name: "goalId", type: "string", required: true },
        { name: "isArchived", type: "boolean", required: true },
        { name: "updatedAt", type: "string", required: true },
      ],
      indices: ["label"],
    },
    {
      name: "tag",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "task",
      to: "goal",
      type: "many-one" as const,
      relation: "goal",
      inverse: "tasks",
      fkField: "goalId",
    },
    {
      from: "task",
      to: "tag",
      type: "many-many" as const,
      relation: "tags",
      inverse: "tasks",
      metadata: [
        { name: "order", type: "number" as const },
        { name: "addedAt", type: "date" as const },
      ],
    },
  ],
};

describe("/datafn/query validation", () => {
  it("TV-API-002: returns error envelope for invalid DFQL (non-object/array)", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("hello"),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.message).toBe("Invalid DFQL: expected object or array");
    expect(body.error.details.path).toBe("$");
  });

  it("rejects invalid cursor.after payloads", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        sort: ["id:asc"],
        cursor: { after: "bad" },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_INVALID");
    expect(body.error.details.path).toBe("cursor.after");
  });

  it("TV-QUERY-002: unknown resource returns DFQL_UNKNOWN_RESOURCE", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "nope", version: 1 }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
    expect(body.error.message).toBe("Unknown resource: nope");
    expect(body.error.details.path).toBe("resource");
  });

  it("TV-QUERY-002: unknown field in filters returns DFQL_UNKNOWN_FIELD", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        filters: { notAField: true },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
    expect(body.error.message).toBe("Unknown field: filters.notAField");
    expect(body.error.details.path).toBe("filters.notAField");
  });

  it("TV-QUERY-002: unknown relation in select returns DFQL_UNKNOWN_RELATION", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "nope.*"],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_RELATION");
    expect(body.error.message).toBe("Unknown relation: select[1]");
    expect(body.error.details.path).toBe("select[1]");
  });

  it("returns empty data for valid query (non-aggregate)", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "label"],
        filters: { isArchived: false },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({ data: [], nextCursor: null });
  });

  it("returns empty groups for valid query (aggregate)", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        groupBy: ["label"],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({ groups: [], nextCursor: null });
  });

  it("handles batch queries and returns array", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { resource: "goal", version: 1, filters: { id: "goal:g1" } },
        { resource: "task", version: 1, select: ["id"] },
      ]),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.result)).toBe(true);
    expect(body.result).toHaveLength(2);
    expect(body.result[0]).toEqual({ data: [], nextCursor: null });
    expect(body.result[1]).toEqual({ data: [], nextCursor: null });
  });

  it("enforces limit against maxLimit", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        limit: 100, // Exceeds maxLimit of 2
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("LIMIT_EXCEEDED");
    expect(body.error.message).toContain("Limit exceeded");
  });

  it("fail-fast batch validation with error.details.index", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { resource: "goal", version: 1 },
        { resource: "nope", version: 1 }, // Invalid
      ]),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
    expect(body.error.details.index).toBe(1);
  });

  it("accepts sort with '-field' prefix (descending shorthand)", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        sort: ["-updatedAt"],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("accepts sort with mixed '-field' and 'field:asc' formats", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        sort: ["-updatedAt", "id:asc"],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("rejects sort with '-nonExistentField' prefix", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        sort: ["-doesNotExist"],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
  });

  it("accepts cursor pagination with '-field' sort prefix as tie-breaker", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "task",
        version: 1,
        sort: ["-updatedAt", "-id"],
        cursor: { after: { id: "t1", updatedAt: "2026-01-01" } },
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("validates relation expansions correctly", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      limits: { maxLimit: 2 },
    });

    // Valid: goal.* is a valid relation
    const req1 = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "goal.*"],
      }),
    });

    const res1 = await server.router.handle(req1, {});
    expect(res1.status).toBe(200);

    // Valid: tags is a valid relation
    const req2 = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({
        resource: "task",
        version: 1,
        select: ["id", "tags"],
      }),
    });

    const res2 = await server.router.handle(req2, {});
    expect(res2.status).toBe(200);
  });
});

describe("authorization", () => {
  it("returns FORBIDDEN when authorization denies query", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      authorize: async () => false, // Always deny
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({ resource: "task", version: 1 }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(body.error.message).toBe("Authorization denied");
  });

  it("allows query when authorization approves", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureF1Schema,
      authorize: async () => true, // Always allow
    });

    const req = new Request("http://localhost/datafn/query", {
      method: "POST",
      body: JSON.stringify({ resource: "task", version: 1 }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(200);
  });
});
