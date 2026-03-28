import { describe, it, expect, beforeEach } from "vitest";
import { createDatafnServer } from "../../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../../core-types.js";

// Schema for testing
const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      idPrefix: "task",
      fields: [
        { name: "title", type: "string" as const, required: true },
        { name: "status", type: "string" as const, required: true },
      ],
    },
  ],
  relations: [],
};

describe("MUT-GUARD-001: Optimistic Concurrency Guards", () => {
  let server: any;
  let db: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    
    // Seed initial data
    await db.create({
      model: "tasks",
      data: { id: "task-1", title: "Task 1", status: "active" },
      namespace: "datafn"
    });

    server = await createDatafnServer({ allowUnknownResources: true,
      schema,
      db,
    });
  });

  it("TV-MUT-GUARD-PASS-001: Guard matches, mutation applied", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-pass",
        operation: "merge",
        id: "task-1",
        record: { status: "completed" },
        if: { status: "active" }
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.affectedIds).toContain("task-1");

    // Verify record updated
    const updated = await db.findOne({
      model: "tasks",
      where: [{ field: "id", operator: "eq", value: "task-1" }],
      namespace: "datafn"
    });
    expect(updated.status).toBe("completed");
  });

  it("TV-MUT-GUARD-FAIL-001: Guard mismatch, returns CONFLICT, mutation not applied", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-2",
        mutationId: "mut-fail",
        operation: "merge",
        id: "task-1",
        record: { status: "archived" },
        if: { status: "pending" } // Mismatch: actual is "active"
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    // MUST return top-level CONFLICT error
    expect(res.status).toBe(409); // CONFLICT
    expect(body.ok).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Guard condition not met");
    expect(body.error.details).toEqual({ path: "if" });

    // Verify record NOT updated
    const task = await db.findOne({
      model: "tasks",
      where: [{ field: "id", operator: "eq", value: "task-1" }],
      namespace: "datafn"
    });
    expect(task.status).toBe("active");
  });

  it("TV-MUT-GUARD-NOTFOUND-001: Guard on non-existent record returns CONFLICT", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-3",
        mutationId: "mut-notfound",
        operation: "merge",
        id: "task-nonexistent",
        record: { status: "completed" },
        if: { status: "active" }
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    // MUST return top-level CONFLICT error
    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toBe("Guard condition not met");
  });
});
