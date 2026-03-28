import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorageAdapter } from "../../adapters/memoryStorage.js";
import { executeLocalQuery } from "../query.js";
import type { DatafnSchema } from "@datafn/core";

const schema: DatafnSchema = {
  resources: [
    {
      name: "tasks",
      version: 1,
      fields: [
        { name: "title", type: "string", required: false },
        { name: "projectId", type: "string", required: false },
        { name: "status", type: "string", required: false },
      ],
    },
    {
      name: "projects",
      version: 1,
      fields: [
        { name: "name", type: "string", required: false },
        { name: "ownerId", type: "string", required: false },
      ],
    },
    {
      name: "users",
      version: 1,
      fields: [{ name: "name", type: "string", required: false }],
    },
    {
      name: "tags",
      version: 1,
      fields: [{ name: "name", type: "string", required: false }],
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
      relation: "owner",
      to: "users",
      type: "many-one",
      fkField: "ownerId",
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

describe("Local DFQL Expansion", () => {
  let storage: any;

  beforeEach(async () => {
    storage = new MemoryStorageAdapter(["tasks", "projects", "users", "tags"]);

    // Seed data
    await storage.upsertRecord("tasks", {
      id: "t1",
      title: "Task 1",
      projectId: "p1",
      status: "active",
    });
    await storage.upsertRecord("projects", {
      id: "p1",
      name: "Project 1",
      ownerId: "u1",
    });
    await storage.upsertRecord("users", { id: "u1", name: "User 1" });
    await storage.upsertRecord("tags", { id: "tag1", name: "Tag 1" });

    // Join row
    await storage.upsertJoinRow("join_tasks_tags_tags", {
      from: "t1",
      to: "tag1",
      order: 1,
    });
  });

  it("TV-OFFLINE-QUERY-REL-001: Local query expands relations", async () => {
    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      filters: { id: "t1" },
      select: ["title", "project.*"],
    });

    expect(result.data![0].project).toEqual({
      id: "p1",
      name: "Project 1",
      ownerId: "u1",
    });
  });

  it("TV-OFFLINE-QUERY-NESTED-001: Local query expands nested relations", async () => {
    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      filters: { id: "t1" },
      select: ["title", "project.owner.*"],
    });

    expect(result.data![0].project.owner).toEqual({ id: "u1", name: "User 1" });
  });

  it("TV-OFFLINE-QUERY-MANYMANY-001: Local query expands many-many", async () => {
    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      filters: { id: "t1" },
      select: ["title", "tags.*"],
    });

    expect(result.data![0].tags).toHaveLength(1);
    expect(result.data![0].tags[0].name).toBe("Tag 1");
  });

  it("TV-OFFLINE-SORT-001: Local query sorts with '-field' prefix (descending)", async () => {
    await storage.upsertRecord("tasks", {
      id: "t2",
      title: "A Earlier Task",
      projectId: "p1",
      status: "active",
    });

    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      sort: ["-title"],
    });

    const titles = result.data!.map((r: any) => r.title);
    expect(titles[0]).toBe("Task 1");
    expect(titles[1]).toBe("A Earlier Task");
  });

  it("TV-OFFLINE-SORT-002: Local query '-field' sort equivalent to 'field:desc'", async () => {
    await storage.upsertRecord("tasks", {
      id: "t2",
      title: "A Earlier Task",
      projectId: "p1",
      status: "active",
    });

    const resultDash = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      sort: ["-title"],
    });

    const resultColon = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      sort: ["title:desc"],
    });

    const titlesDash = resultDash.data!.map((r: any) => r.title);
    const titlesColon = resultColon.data!.map((r: any) => r.title);
    expect(titlesDash).toEqual(titlesColon);
  });

  it("TV-OFFLINE-SORT-003: Local query mixed '-field' and 'field:asc' formats", async () => {
    await storage.upsertRecord("tasks", {
      id: "t2",
      title: "A Earlier Task",
      status: "done",
    });

    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      sort: ["-status", "title:asc"],
    });

    const statuses = result.data!.map((r: any) => r.status);
    // "done" > "active" alphabetically, so desc means "done" first
    expect(statuses[0]).toBe("done");
    expect(statuses[1]).toBe("active");
  });

  it("TV-OFFLINE-SORT-004: Local query 'field:asc' ascending still works", async () => {
    await storage.upsertRecord("tasks", {
      id: "t2",
      title: "A Earlier Task",
      projectId: "p1",
      status: "active",
    });

    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      sort: ["title:asc"],
    });

    const titles = result.data!.map((r: any) => r.title);
    expect(titles[0]).toBe("A Earlier Task");
    expect(titles[1]).toBe("Task 1");
  });

  it("TV-OFFLINE-QUERY-GROUPBY-001: Local query aggregations", async () => {
    await storage.upsertRecord("tasks", {
      id: "t2",
      title: "Task 2",
      status: "active",
    });
    await storage.upsertRecord("tasks", {
      id: "t3",
      title: "Task 3",
      status: "done",
    });

    const result = await executeLocalQuery(storage, schema, {
      resource: "tasks",
      groupBy: ["status"],
      aggregations: { total: { op: "count", field: "*" } },
    });

    // active: 2, done: 1
    const active = result.groups!.find((g: any) => g.status === "active");
    expect(active.total).toBe(2);
  });
});
