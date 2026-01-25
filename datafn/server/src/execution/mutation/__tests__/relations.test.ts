import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnServer } from "../../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "@datafn/core";

// Schema for testing
const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      idPrefix: "task",
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "projectId", type: "string" as const, required: false }, // FK for many-one
      ],
    },
    {
      name: "projects",
      version: 1,
      idPrefix: "proj",
      fields: [
        { name: "name", type: "string" as const, required: true },
      ],
    },
    {
      name: "tags",
      version: 1,
      idPrefix: "tag",
      fields: [
        { name: "name", type: "string" as const, required: true },
      ],
    },
  ],
  relations: [
    {
      from: "tasks",
      relation: "project",
      to: "projects",
      type: "many-one",
      fkField: "projectId",
    },
    {
      from: "projects",
      relation: "tasks",
      to: "tasks",
      type: "one-many",
      inverse: "projectId",
    },
    {
      from: "tasks",
      relation: "tags",
      to: "tags",
      type: "many-many",
      metadata: [{ name: "order", type: "number" }],
    },
  ],
};

describe("MUT-REL-001: Relation Mutations", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    
    // Seed initial data
    await db.create({
      model: "tasks",
      data: { id: "task-1", title: "Task 1" },
      namespace: "datafn"
    });
    await db.create({
      model: "projects",
      data: { id: "proj-1", name: "Project 1" },
      namespace: "datafn"
    });
    await db.create({
      model: "tags",
      data: { id: "tag-1", name: "Tag 1" },
      namespace: "datafn"
    });

    server = await createDatafnServer({
      schema,
      db,
    });
  });

  it("TV-MUT-RELATE-001: relate (many-one) updates FK", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-relate-1",
        operation: "relate",
        id: "task-1",
        relations: {
          project: "proj-1"
        }
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const task = await db.findOne({
      model: "tasks",
      where: [{ field: "id", operator: "eq", value: "task-1" }],
      namespace: "datafn"
    });
    expect(task.projectId).toBe("proj-1");
  });

  it("TV-MUT-RELATE-METADATA-001: relate (many-many) creates join row with metadata", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-relate-2",
        operation: "relate",
        id: "task-1",
        relations: {
          tags: [{ "$ref": "tag-1", "order": 5 }]
        }
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" }
      ],
      namespace: "datafn"
    });

    expect(joinRow).toBeDefined();
    expect(joinRow.order).toBe(5);
  });

  it("TV-MUT-MODIFY-REL-001: modifyRelation updates many-many metadata", async () => {
    // Setup existing relation
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: { from: "task-1", to: "tag-1", order: 1 },
      namespace: "datafn"
    });

    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-modify-1",
        operation: "modifyRelation",
        id: "task-1",
        relations: {
          tags: { "$ref": "tag-1", "order": 10 }
        }
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" }
      ],
      namespace: "datafn"
    });

    expect(joinRow.order).toBe(10);
  });

  it("TV-MUT-UNRELATE-001: unrelate removes relation (many-many)", async () => {
    // Setup existing relation
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: { from: "task-1", to: "tag-1", order: 1 },
      namespace: "datafn"
    });

    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-unrelate-1",
        operation: "unrelate",
        id: "task-1",
        relations: {
          tags: "tag-1"
        }
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" }
      ],
      namespace: "datafn"
    });

    expect(joinRow).toBeNull();
  });

  it("relate with non-existent target returns NOT_FOUND", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-relate-fail",
        operation: "relate",
        id: "task-1",
        relations: {
          project: "proj-nonexistent"
        }
      }),
    });

    const res = await server.router.handle(req, {});
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Related record not found");
  });
});
