import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../../adapters/memoryStorage.js";
import { executeLocalQuery } from "../query.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    { name: "tasks", fields: [{ name: "title", type: "string" }, { name: "projectId", type: "string" }, { name: "status", type: "string" }] },
    { name: "projects", fields: [{ name: "name", type: "string" }, { name: "ownerId", type: "string" }] },
    { name: "users", fields: [{ name: "name", type: "string" }] },
    { name: "tags", fields: [{ name: "name", type: "string" }] }
  ],
  relations: [
    { from: "tasks", relation: "project", to: "projects", type: "many-one", fkField: "projectId" },
    { from: "projects", relation: "owner", to: "users", type: "many-one", fkField: "ownerId" },
    { from: "tasks", relation: "tags", to: "tags", type: "many-many", metadata: [{ name: "order" }] }
  ]
};

describe("Local DFQL Expansion", () => {
  let storage: any;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter(["tasks", "projects", "users", "tags"]);
    
    // Seed data
    await storage.upsertRecord("tasks", { id: "t1", title: "Task 1", projectId: "p1", status: "active" });
    await storage.upsertRecord("projects", { id: "p1", name: "Project 1", ownerId: "u1" });
    await storage.upsertRecord("users", { id: "u1", name: "User 1" });
    await storage.upsertRecord("tags", { id: "tag1", name: "Tag 1" });
    
    // Join row
    await storage.upsertJoinRow("tasks.tags", { from: "t1", to: "tag1", order: 1 });
  });

  it("TV-OFFLINE-QUERY-REL-001: Local query expands relations", async () => {
    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      filters: { id: "t1" },
      select: ["title", "project.*"]
    });

    expect(result.data![0].project).toEqual({ id: "p1", name: "Project 1", ownerId: "u1" });
  });

  it("TV-OFFLINE-QUERY-NESTED-001: Local query expands nested relations", async () => {
    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      filters: { id: "t1" },
      select: ["title", "project.owner.*"]
    });

    expect(result.data![0].project.owner).toEqual({ id: "u1", name: "User 1" });
  });

  it("TV-OFFLINE-QUERY-MANYMANY-001: Local query expands many-many", async () => {
    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      filters: { id: "t1" },
      select: ["title", "tags.*"]
    });

    expect(result.data![0].tags).toHaveLength(1);
    expect(result.data![0].tags[0].name).toBe("Tag 1");
  });

  it("TV-OFFLINE-QUERY-GROUPBY-001: Local query aggregations", async () => {
    await storage.upsertRecord("tasks", { id: "t2", title: "Task 2", status: "active" });
    await storage.upsertRecord("tasks", { id: "t3", title: "Task 3", status: "done" });

    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      groupBy: ["status"],
      aggregations: { total: { op: "count", field: "*" } }
    });

    // active: 2, done: 1
    const active = result.groups!.find((g: any) => g.status === "active");
    expect(active.total).toBe(2);
  });
});
