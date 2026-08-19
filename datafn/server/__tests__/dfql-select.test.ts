/**
 * DFQL Select Tests - Phase 11
 * Tests TV-DFQL-OMIT-001, TV-DFQL-OMIT-002, TV-DFQL-RELIDS-001, TV-DFQL-RELIDS-002,
 * TV-DFQL-NESTED-001, TV-DFQL-NESTED-002 from TEST_VECTORS.md
 */

import { describe, it, expect, beforeEach } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createDatafnServer } from "../src/server.js";
import { fixtureDfqlSchema } from "./fixtures/dfql.js";

describe("DFQL select extensions (Phase 11)", () => {
  // Helper to create server with DFQL schema
  async function createDfqlServer() {
    const db = memoryAdapter();
    await db.initialize();

    return await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureDfqlSchema,
      limits: { maxLimit: 100 },
      database: db,
    });
  }

  describe("omit", () => {
    it("TV-DFQL-OMIT-001: omit removes fields from result records", async () => {
      const server = await createDfqlServer();

      // Insert task
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-o1",
            id: "task:1",
            record: { title: "A" },
          }),
        }),
        {},
      );

      // Query with omit
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id", "title"],
            omit: ["title"],
            filters: { id: "task:1" },
          }),
        }),
        {},
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.data).toEqual([{ id: "task:1" }]);
    });

    it("TV-DFQL-OMIT-002: Unknown omitted fields are rejected with DFQL_UNKNOWN_FIELD", async () => {
      const server = await createDfqlServer();

      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["id"],
            omit: ["nope"],
          }),
        }),
        {},
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toEqual({
        code: "DFQL_UNKNOWN_FIELD",
        message: "Unknown field: omit[0]",
        details: { path: "omit[0]" },
      });
    });
  });

  describe("ids-only relation tokens", () => {
    it("TV-DFQL-RELIDS-001: ids-only relation tokens return related ids according to cardinality", async () => {
      const server = await createDfqlServer();

      // Insert goal, task, and relate them
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "goal",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-r1",
            id: "goal:g1",
            record: { label: "G1", parentPath: "" },
          }),
        }),
        {},
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-r2",
            id: "task:t1",
            record: { title: "T1", goalId: "goal:g1" },
          }),
        }),
        {},
      );

      // Batch query: goal.tasks (one-many) and task.goal (many-one)
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify([
            {
              resource: "goal",
              version: 1,
              select: ["id", "tasks"],
              filters: { id: "goal:g1" },
            },
            {
              resource: "task",
              version: 1,
              select: ["id", "goal"],
              filters: { id: "task:t1" },
            },
          ]),
        }),
        {},
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result).toEqual([
        { data: [{ id: "goal:g1", tasks: ["task:t1"] }], nextCursor: null },
        { data: [{ id: "task:t1", goal: "goal:g1" }], nextCursor: null },
      ]);
    });

    it("TV-DFQL-RELIDS-002: ids-only tokens for unknown relations are rejected", async () => {
      const server = await createDfqlServer();

      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["tags"],
          }),
        }),
        {},
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      // Note: In the current schema, tags IS a valid relation, so we need to use an unknown one
      // Let's modify the test to use a truly unknown relation

      const res2 = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            select: ["unknown"],
          }),
        }),
        {},
      );

      expect(res2.status).toBe(400);
      const body2 = await res2.json();
      expect(body2.ok).toBe(false);
      expect(body2.error.code).toBe("DFQL_UNKNOWN_FIELD");
    });
  });

  describe("nested select traversal", () => {
    it("TV-DFQL-NESTED-001: Nested select traversal tokens expand intermediate relations", async () => {
      const server = await createDfqlServer();

      // Insert goal, tasks, tags, and relate them
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "goal",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-n1",
            id: "goal:g1",
            record: { label: "G1", parentPath: "" },
          }),
        }),
        {},
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-n2",
            id: "task:t1",
            record: { title: "T1", goalId: "goal:g1" },
          }),
        }),
        {},
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-n3",
            id: "task:t2",
            record: { title: "T2", goalId: "goal:g1" },
          }),
        }),
        {},
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "tag",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-n4",
            id: "tag:a",
            record: { label: "urgent" },
          }),
        }),
        {},
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "tag",
            version: 1,
            operation: "insert",
            clientId: "client:1",
            mutationId: "m-n5",
            id: "tag:b",
            record: { label: "home" },
          }),
        }),
        {},
      );

      // Relate task:t1 to tags
      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "relate",
            clientId: "client:1",
            mutationId: "m-n6",
            id: "task:t1",
            relations: { tags: { $ref: "tag:a", order: 0 } },
          }),
        }),
        {},
      );

      await server.router.handle(
        new Request("http://localhost/datafn/mutation", {
          method: "POST",
          body: JSON.stringify({
            resource: "task",
            version: 1,
            operation: "relate",
            clientId: "client:1",
            mutationId: "m-n7",
            id: "task:t1",
            relations: { tags: { $ref: "tag:b", order: 1 } },
          }),
        }),
        {},
      );

      // Query with nested traversal: tasks.tags.*
      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "goal",
            version: 1,
            select: ["id", "tasks.*", "tasks.tags.*"],
            filters: { id: "goal:g1" },
            sort: ["id:asc"],
          }),
        }),
        {},
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.result.data).toEqual([
        {
          id: "goal:g1",
          tasks: [
            {
              id: "task:t1",
              title: "T1",
              tags: [
                { id: "tag:a", label: "urgent" },
                { id: "tag:b", label: "home" },
              ],
            },
            { id: "task:t2", title: "T2", tags: [] },
          ],
        },
      ]);
    });

    it("TV-DFQL-NESTED-002: Invalid nested traversal tokens are rejected", async () => {
      const server = await createDfqlServer();

      const res = await server.router.handle(
        new Request("http://localhost/datafn/query", {
          method: "POST",
          body: JSON.stringify({
            resource: "goal",
            version: 1,
            select: ["tasks.nope.*"],
          }),
        }),
        {},
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toEqual({
        code: "DFQL_UNKNOWN_RELATION",
        message: "Unknown relation: select[0]",
        details: { path: "select[0]" },
      });
    });
  });
});

describe("DFQL bare * wildcard in select", () => {
  async function createDfqlServer() {
    const { memoryAdapter } = await import("@superfunctions/db/adapters");
    const db = memoryAdapter();
    await db.initialize();

    return await createDatafnServer({ allowUnknownResources: true,
      schema: fixtureDfqlSchema,
      limits: { maxLimit: 100 },
      database: db,
    });
  }

  async function seedTask(server: Awaited<ReturnType<typeof createDfqlServer>>, id: string, record: Record<string, unknown>) {
    await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: `m-seed-${id}`,
          id,
          record,
        }),
      }),
      {},
    );
  }

  async function seedTag(server: Awaited<ReturnType<typeof createDfqlServer>>, id: string, record: Record<string, unknown>) {
    await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "tag",
          version: 1,
          operation: "insert",
          clientId: "client:1",
          mutationId: `m-seed-${id}`,
          id,
          record,
        }),
      }),
      {},
    );
  }

  it("TV-DFQL-WILDCARD-001: select:[\"*\"] passes validation (no 400 error)", async () => {
    const server = await createDfqlServer();

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["*"],
        }),
      }),
      {},
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("TV-DFQL-WILDCARD-002: select:[\"*\"] returns all base fields (equivalent to omitting select)", async () => {
    const server = await createDfqlServer();
    await seedTask(server, "task:w1", { title: "Wildcard Task" });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["*"],
          filters: { id: "task:w1" },
        }),
      }),
      {},
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.data).toHaveLength(1);
    const record = body.result.data[0];
    expect(record.id).toBe("task:w1");
    expect(record.title).toBe("Wildcard Task");
    // Should NOT have a literal "*" key
    expect("*" in record).toBe(false);
  });

  it("TV-DFQL-WILDCARD-003: select:[\"*\"] does not expand relations", async () => {
    const server = await createDfqlServer();
    await seedTask(server, "task:w2", { title: "No Relations" });
    await seedTag(server, "tag:w1", { label: "some-tag" });

    // Relate
    await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "m-relate-w2",
          id: "task:w2",
          relations: { tags: { $ref: "tag:w1", order: 0 } },
        }),
      }),
      {},
    );

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["*"],
          filters: { id: "task:w2" },
        }),
      }),
      {},
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const record = body.result.data[0];
    // Relations should NOT be expanded
    expect(record.tags).toBeUndefined();
  });

  it("TV-DFQL-WILDCARD-004: select:[\"*\",\"tags.*\"] returns all base fields + expanded many-many relation", async () => {
    const server = await createDfqlServer();
    await seedTask(server, "task:w3", { title: "With Tags" });
    await seedTag(server, "tag:w2", { label: "urgent" });
    await seedTag(server, "tag:w3", { label: "home" });

    await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "m-relate-w3a",
          id: "task:w3",
          relations: { tags: { $ref: "tag:w2", order: 0 } },
        }),
      }),
      {},
    );

    await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "m-relate-w3b",
          id: "task:w3",
          relations: { tags: { $ref: "tag:w3", order: 1 } },
        }),
      }),
      {},
    );

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["*", "tags.*"],
          filters: { id: "task:w3" },
        }),
      }),
      {},
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const record = body.result.data[0];
    // All base fields present
    expect(record.id).toBe("task:w3");
    expect(record.title).toBe("With Tags");
    // Relation expanded
    expect(Array.isArray(record.tags)).toBe(true);
    expect(record.tags).toHaveLength(2);
    expect(record.tags[0].label).toBe("urgent");
    expect(record.tags[1].label).toBe("home");
    // No literal "*" key
    expect("*" in record).toBe(false);
  });

  it("TV-DFQL-WILDCARD-005: select:[\"*\",\"tags.#\"] returns all base fields + join rows", async () => {
    const server = await createDfqlServer();
    await seedTask(server, "task:w4", { title: "Join Rows" });
    await seedTag(server, "tag:w4", { label: "joinable" });

    await server.router.handle(
      new Request("http://localhost/datafn/mutation", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          operation: "relate",
          clientId: "client:1",
          mutationId: "m-relate-w4",
          id: "task:w4",
          relations: { tags: { $ref: "tag:w4", order: 0 } },
        }),
      }),
      {},
    );

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["*", "tags.#"],
          filters: { id: "task:w4" },
        }),
      }),
      {},
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const record = body.result.data[0];
    expect(record.id).toBe("task:w4");
    expect(record.title).toBe("Join Rows");
    // Join rows present
    expect(Array.isArray(record.tags)).toBe(true);
    expect(record.tags[0].from).toBe("task:w4");
    expect(record.tags[0].to).toBe("tag:w4");
  });

  it("TV-DFQL-WILDCARD-006: select:[\"*\"] with omit:[\"title\"] omits the field but keeps others", async () => {
    const server = await createDfqlServer();
    await seedTask(server, "task:w5", { title: "Omit Me" });

    const res = await server.router.handle(
      new Request("http://localhost/datafn/query", {
        method: "POST",
        body: JSON.stringify({
          resource: "task",
          version: 1,
          select: ["*"],
          omit: ["title"],
          filters: { id: "task:w5" },
        }),
      }),
      {},
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const record = body.result.data[0];
    expect(record.id).toBe("task:w5");
    // omitted field absent
    expect(record.title).toBeUndefined();
  });
});
