/**
 * Comprehensive validation tests for DFQL schema-bounded validation
 * Tests VALID-001: Schema-bounded validation for all endpoints
 */

import { describe, it, expect } from "vitest";
import { createDatafnServer } from "../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";

// Fixture F1 schema for testing
const fixtureF1Schema = {
  resources: [
    {
      name: "goal",
      version: 1,
      idPrefix: "goal:",
      fields: [
        { name: "label", type: "string" as const, required: true },
        { name: "status", type: "string" as const, required: true },
        { name: "isArchived", type: "boolean" as const, required: true },
      ],
    },
    {
      name: "task",
      version: 1,
      idPrefix: "task:",
      fields: [
        { name: "label", type: "string" as const, required: true },
        { name: "priority", type: "number" as const, required: true },
        { name: "goalId", type: "string" as const, required: true },
        { name: "isArchived", type: "boolean" as const, required: true },
        { name: "updatedAt", type: "string" as const, required: true },
      ],
      indices: ["label"],
    },
    {
      name: "tag",
      version: 1,
      idPrefix: "tag:",
      fields: [{ name: "label", type: "string" as const, required: true }],
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

describe("Query Validation - VALID-001", () => {
  describe("Resource validation", () => {
    it("TV-VALID-RESOURCE-001: unknown resource returns DFQL_UNKNOWN_RESOURCE", async () => {
      const db = memoryAdapter();
      await db.initialize();
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "unknown_table", version: 1 }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
      expect(body.error.message).toBe("Unknown resource: unknown_table");
      expect(body.error.details.path).toBe("resource");
    });

    it("accepts valid resource", async () => {
      const db = memoryAdapter();
      await db.initialize();

      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "task", version: 1 }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(200);
    });
  });

  describe("Field validation", () => {
    it("TV-VALID-FIELD-001: unknown field in select returns DFQL_UNKNOWN_FIELD", async () => {
      const db = memoryAdapter();
      await db.initialize();
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "unknown_field"],
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(body.error.details.path).toBe("select[1]");
    });

    it("unknown field in filters returns DFQL_UNKNOWN_FIELD", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          filters: { unknown_field: "value" },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(body.error.message).toBe("Unknown field: filters.unknown_field");
      expect(body.error.details.path).toBe("filters.unknown_field");
    });

    it("unknown field in sort returns DFQL_UNKNOWN_FIELD", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          sort: ["unknown_field:asc"],
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(body.error.details.path).toBe("sort[0]");
    });

    it("unknown field in omit returns DFQL_UNKNOWN_FIELD", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          omit: ["unknown_field"],
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(body.error.details.path).toBe("omit[0]");
    });

    it("accepts system fields in select", async () => {
      const db = memoryAdapter();
      await db.initialize();

      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "createdAt", "updatedAt", "createdBy", "updatedBy", "isArchived"],
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(200);
    });
  });

  describe("Relation validation", () => {
    it("TV-VALID-RELATION-001: unknown relation in select returns DFQL_UNKNOWN_RELATION", async () => {
      const db = memoryAdapter();
      await db.initialize();
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "unknown_relation.*"],
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_RELATION");
      expect(body.error.details.path).toBe("select[1]");
    });

    it("accepts valid relation in select", async () => {
      const db = memoryAdapter();
      await db.initialize();
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["id", "goal.*", "tags.*"],
        }),
      });

      const res = await server.router.handle(req, {});
      if (res.status !== 200) console.log("Validation Select Fail:", await res.json());
      expect(res.status).toBe(200);
    });
  });
});

describe("Mutation Validation - VALID-001", () => {
  describe("Resource validation", () => {
    it("TV-VALID-MUTATION-001: unknown resource returns DFQL_UNKNOWN_RESOURCE", async () => {
      const db = memoryAdapter();
      await db.initialize();
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "unknown_table",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "item:1",
          record: { label: "test" },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
      expect(body.error.message).toBe("Unknown resource: unknown_table");
    });
  });

  describe("Field validation", () => {
    it("unknown field in mutation record returns DFQL_UNKNOWN_FIELD", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
          record: { label: "test", unknown_field: "value" },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(body.error.message).toContain("unknown_field");
    });

    it("accepts valid fields in mutation record", async () => {
      const db = memoryAdapter();
      await db.initialize();
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
          record: {
            label: "test",
            priority: 1,
            goalId: "goal:1",
            isArchived: false,
            updatedAt: "2024-01-01",
          },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(200);
    });
  });

  describe("Relation validation", () => {
    it("unknown relation in mutation returns DFQL_UNKNOWN_RELATION", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
          record: {},
          relations: {
            unknown_relation: { $ref: "item:1" },
          },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_RELATION");
      expect(body.error.message).toContain("unknown_relation");
    });

    it("unknown metadata key in relation mutation returns DFQL_UNKNOWN_FIELD", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
          record: {},
          relations: {
            tags: { $ref: "tag:1", unknown_meta: "value" },
          },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
      expect(body.error.message).toContain("unknown_meta");
    });

    it("accepts valid metadata key in relation mutation", async () => {
      const db = memoryAdapter();
      await db.initialize();
      // Seed target record for relation validation (relate checks existence)
      await db.create({
        model: "tag",
        data: { id: "tag:1", label: "Tag 1" },
        namespace: "datafn",
      });
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
        db,
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
          record: {},
          relations: {
            tags: { $ref: "tag:1", order: 1, addedAt: "2024-01-01" },
          },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(200);
    });
  });

  describe("Operation validation", () => {
    it("unsupported operation returns DFQL_UNSUPPORTED", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "invalid_op",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
          record: { label: "test" },
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_UNSUPPORTED");
    });

    it("insert requires record", async () => {
      const server = await createDatafnServer({
        schema: fixtureF1Schema,
        limits: { maxLimit: 100 },
      });

      const req = new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: "mut:1",
          id: "task:1",
        }),
      });

      const res = await server.router.handle(req, {});
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DFQL_INVALID");
      expect(body.error.message).toContain("record");
    });
  });
});

describe("Transact Validation - VALID-001", () => {
  it("validates mutation steps in transaction", async () => {
    const server = await createDatafnServer({
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/transact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: [
          {
            resource: "unknown_table",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "mut:1",
            id: "item:1",
            record: { label: "test" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
  });

  it("validates query steps in transaction", async () => {
    const server = await createDatafnServer({
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/transact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: [
          {
            resource: "unknown_table",
            version: 1,
          },
        ],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
  });

  it("validates unknown fields in transaction mutation step", async () => {
    const server = await createDatafnServer({
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/transact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: [
          {
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "mut:1",
            id: "task:1",
            record: { label: "test", unknown_field: "value" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
  });
});

describe("Push Validation - VALID-001", () => {
  it("TV-VALID-PUSH-001: validates mutations in push request", async () => {
    const server = await createDatafnServer({
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            resource: "unknown_table",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "mut:1",
            id: "item:1",
            record: { label: "test" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_RESOURCE");
  });

  it("validates unknown fields in push mutations", async () => {
    const server = await createDatafnServer({
      schema: fixtureF1Schema,
      limits: { maxLimit: 100 },
    });

    const req = new Request("http://localhost/datafn/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "client:1",
        mutations: [
          {
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "mut:1",
            id: "task:1",
            record: { label: "test", unknown_field: "value" },
          },
        ],
      }),
    });

    const res = await server.router.handle(req, {});
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DFQL_UNKNOWN_FIELD");
  });
});
