import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDatafnServer } from "../../../server.js";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { DatafnSchema } from "../../../core-types.js";
import {
  extractJoinDeltas,
  extractJoinDeltasFromDB,
} from "../relations.js";

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
    {
      name: "goals",
      version: 1,
      idPrefix: "goal",
      fields: [
        { name: "label", type: "string" as const, required: false },
        { name: "parentId", type: "string" as const, required: false },
        { name: "parentPath", type: "string" as const, required: false },
      ],
    },
    {
      name: "docs",
      version: 1,
      idPrefix: "doc",
      fields: [
        { name: "title", type: "string" as const, required: false },
      ],
    },
    {
      name: "refs",
      version: 1,
      idPrefix: "ref",
      fields: [
        { name: "title", type: "string" as const, required: false },
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
    {
      from: "docs",
      relation: "typedRefs",
      to: "refs",
      type: "many-many",
      metadata: [{ name: "linkType", type: "string" }],
      identityMetadata: ["linkType"],
    },
    {
      from: "goals",
      relation: "children",
      inverse: "parent",
      to: "goals",
      type: "htree",
      fkField: "parentId",
      pathField: "parentPath",
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
    await db.create({
      model: "goals",
      data: { id: "goal-1", label: "Root", parentPath: "" },
      namespace: "datafn"
    });
    await db.create({
      model: "goals",
      data: { id: "goal-2", label: "Child" },
      namespace: "datafn"
    });
    await db.create({
      model: "docs",
      data: { id: "doc-1", title: "Doc 1" },
      namespace: "datafn"
    });
    await db.create({
      model: "refs",
      data: { id: "ref-1", title: "Ref 1" },
      namespace: "datafn"
    });

    server = await createDatafnServer({ allowUnknownResources: true,
      schema,
      database: db,
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

    const res = await server.router.handle(req);
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

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" },
      ],
      namespace: "datafn"
    });

    expect(joinRow).toBeDefined();
    expect(joinRow!.order).toBe(5);
  });

  it("TV-MUT-RELATE-NOMETA-001: relate (many-many) with no metadata succeeds (empty update)", async () => {
    // This is the exact scenario that triggered the "No values to set" Drizzle error.
    // When a tag is related to a todo with no metadata, update is {}.
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-relate-nometa-1",
        operation: "relate",
        id: "task-1",
        relations: {
          tags: "tag-1"   // bare string — no metadata at all
        }
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Join row should exist
    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" },
      ],
      namespace: "datafn"
    });
    expect(joinRow).toBeDefined();
    expect(joinRow!.from).toBe("task-1");
    expect(joinRow!.to).toBe("tag-1");
  });

  it("TV-MUT-RELATE-HTREE-001: relate (htree) updates child parent and path", async () => {
    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: "client-1",
        mutationId: "mut-relate-htree-1",
        resource: "goals",
        version: 1,
        operation: "relate",
        id: "goal-1",
        relations: {
          children: [{ $ref: "goal-2" }],
        },
      }),
    });
    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    const child = await db.findOne({
      model: "goals",
      where: [{ field: "id", operator: "eq", value: "goal-2" }],
      namespace: "datafn",
    });
    expect(child).toMatchObject({
      parentId: "goal-1",
      parentPath: "goal-1",
    });
  });

  it("TV-MUT-RELATE-NOMETA-002: relate (many-many) no metadata is idempotent", async () => {
    // Relate once
    const req1 = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-relate-idem-1",
        operation: "relate",
        id: "task-1",
        relations: { tags: "tag-1" }
      }),
    });
    const res1 = await server.router.handle(req1);
    expect(res1.status).toBe(200);

    // Relate again — should be a no-op, not crash
    const req2 = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-relate-idem-2",
        operation: "relate",
        id: "task-1",
        relations: { tags: "tag-1" }
      }),
    });
    const res2 = await server.router.handle(req2);
    const body2 = await res2.json();

    expect(res2.status).toBe(200);
    expect(body2.ok).toBe(true);
  });

  it("TV-MUT-MODIFY-REL-001: modifyRelation updates many-many metadata", async () => {
    // Setup existing relation using standard adapter
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: {
        id: "task-1:tag-1",
        from: "task-1",
        to: "tag-1",
        order: 1,
      },
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

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" },
      ],
      namespace: "datafn"
    });

    expect(joinRow!.order).toBe(10);
  });

  it("TV-MUT-UNRELATE-001: unrelate removes relation (many-many)", async () => {
    // Setup existing relation using standard adapter
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: {
        id: "task-1:tag-1",
        from: "task-1",
        to: "tag-1",
        order: 1,
      },
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

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" },
      ],
      namespace: "datafn"
    });

    expect(joinRow).toBeNull();
  });

  it("unrelate with identity metadata removes only the matching many-many row", async () => {
    for (const [linkType, mutationId] of [
      ["DIRECT", "mut-typed-link-direct"],
      ["MENTION", "mut-typed-link-mention"],
    ]) {
      const res = await server.router.handle(new Request("http://localhost/datafn/mutation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "docs",
          version: "1",
          clientId: "client-1",
          mutationId,
          operation: "relate",
          id: "doc-1",
          relations: {
            typedRefs: [{ "$ref": "ref-1", linkType }],
          },
        }),
      }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    }

    const rowsBefore = await db.findMany({
      model: "__datafn_join_docs_typedRefs",
      where: [
        { field: "from", operator: "eq", value: "doc-1" },
        { field: "to", operator: "eq", value: "ref-1" },
      ],
      namespace: "datafn",
    });
    expect(rowsBefore.map((row: any) => row.linkType).sort()).toEqual([
      "DIRECT",
      "MENTION",
    ]);
    expect(extractJoinDeltas({
      resource: "docs",
      operation: "relate",
      id: "doc-1",
      relations: {
        typedRefs: [{ "$ref": "ref-1", linkType: "MENTION" }],
      },
    }, schema)).toMatchObject([
      {
        resource: "join_docs_typedRefs_refs",
        id: "doc-1:ref-1:linkType=MENTION",
        op: "upsert",
        record: {
          from: "doc-1",
          to: "ref-1",
          linkType: "MENTION",
        },
      },
    ]);
    expect(await extractJoinDeltasFromDB(db, {
      resource: "docs",
      operation: "relate",
      id: "doc-1",
      relations: {
        typedRefs: [{ "$ref": "ref-1", linkType: "MENTION" }],
      },
    }, schema, "datafn")).toMatchObject([
      {
        resource: "join_docs_typedRefs_refs",
        id: "doc-1:ref-1:linkType=MENTION",
        op: "upsert",
        record: {
          from: "doc-1",
          to: "ref-1",
          linkType: "MENTION",
        },
      },
    ]);

    const unrelateRes = await server.router.handle(new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "docs",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-typed-link-unmention",
        operation: "unrelate",
        id: "doc-1",
        relations: {
          typedRefs: [{ "$ref": "ref-1", linkType: "MENTION" }],
        },
      }),
    }));
    const unrelateBody = await unrelateRes.json();
    expect(unrelateRes.status).toBe(200);
    expect(unrelateBody.ok).toBe(true);
    expect(extractJoinDeltas({
      resource: "docs",
      operation: "unrelate",
      id: "doc-1",
      relations: {
        typedRefs: [{ "$ref": "ref-1", linkType: "MENTION" }],
      },
    }, schema)).toMatchObject([
      {
        resource: "join_docs_typedRefs_refs",
        id: "doc-1:ref-1:linkType=MENTION",
        op: "delete",
      },
    ]);

    const rowsAfter = await db.findMany({
      model: "__datafn_join_docs_typedRefs",
      where: [
        { field: "from", operator: "eq", value: "doc-1" },
        { field: "to", operator: "eq", value: "ref-1" },
      ],
      namespace: "datafn",
    });
    expect(rowsAfter.map((row: any) => row.linkType)).toEqual(["DIRECT"]);
  });

  it("TV-REL-OPT-001: batch target validation uses findMany with IN filter", async () => {
    await db.create({ model: "tags", data: { id: "tag-2", name: "Tag 2" }, namespace: "datafn" });
    await db.create({ model: "tags", data: { id: "tag-3", name: "Tag 3" }, namespace: "datafn" });

    const findManySpy = vi.spyOn(db, "findMany");
    const findOneSpy = vi.spyOn(db, "findOne");

    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-tv-rel-opt-001",
        operation: "relate",
        id: "task-1",
        relations: {
          tags: [{ "$ref": "tag-1" }, { "$ref": "tag-2" }, { "$ref": "tag-3" }],
        },
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // Verify findMany called once with IN filter for tags (batch validation)
    const tagInCalls = (findManySpy.mock.calls as any[]).filter((c) =>
      c[0]?.model === "tags" && c[0]?.where?.some((w: any) => w.operator === "in")
    );
    const tagInCallOrders = (findManySpy.mock.calls as any[]).flatMap((c, index) =>
      c[0]?.model === "tags" && c[0]?.where?.some((w: any) => w.operator === "in")
        ? [findManySpy.mock.invocationCallOrder[index]]
        : []
    );
    expect(tagInCalls).toHaveLength(1);
    expect(tagInCallOrders).toHaveLength(1);
    expect(tagInCalls[0][0].where[0]).toMatchObject({
      field: "id",
      operator: "in",
      value: expect.arrayContaining(["tag-1", "tag-2", "tag-3"]),
    });

    const tagFindOneCallOrders = (findOneSpy.mock.calls as any[]).flatMap((c, index) =>
      c[0]?.model === "tags"
        ? [findOneSpy.mock.invocationCallOrder[index]]
        : []
    );
    expect(tagFindOneCallOrders.every((order) => order > tagInCallOrders[0])).toBe(true);

    findManySpy.mockRestore();
    findOneSpy.mockRestore();
  });

  it("TV-REL-OPT-002: batch target validation detects missing target, no writes", async () => {
    await db.create({ model: "tags", data: { id: "tag-3", name: "Tag 3" }, namespace: "datafn" });

    const findManySpy = vi.spyOn(db, "findMany");
    const createSpy = vi.spyOn(db, "create");
    const upsertSpy = vi.spyOn(db, "upsert");

    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-tv-rel-opt-002",
        operation: "relate",
        id: "task-1",
        relations: {
          tags: [{ "$ref": "tag-1" }, { "$ref": "tag-999" }, { "$ref": "tag-3" }],
        },
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("tag-999");

    // findMany was called once with IN filter
    const tagInCalls = (findManySpy.mock.calls as any[]).filter((c) =>
      c[0]?.model === "tags" && c[0]?.where?.some((w: any) => w.operator === "in")
    );
    expect(tagInCalls).toHaveLength(1);

    // No join rows created (early exit on validation failure)
    const joinCreateCalls = (createSpy.mock.calls as any[]).filter((c) =>
      String(c[0]?.model).includes("join")
    );
    expect(joinCreateCalls).toHaveLength(0);

    const joinUpsertCalls = (upsertSpy.mock.calls as any[]).filter((c) =>
      String(c[0]?.model).includes("join")
    );
    expect(joinUpsertCalls).toHaveLength(0);

    findManySpy.mockRestore();
    createSpy.mockRestore();
    upsertSpy.mockRestore();
  });

  it("TV-REL-OPT-003: many-many join created via upsert (findOne not called)", async () => {
    const upsertSpy = vi.spyOn(db, "upsert");
    const findOneSpy = vi.spyOn(db, "findOne");

    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-tv-rel-opt-003",
        operation: "relate",
        id: "task-1",
        relations: {
          tags: [{ "$ref": "tag-1", "order": 1 }],
        },
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // upsert called for join table (not findOne+create)
    const joinUpsertCalls = (upsertSpy.mock.calls as any[]).filter((c) =>
      c[0]?.model === "__datafn_join_tasks_tags"
    );
    expect(joinUpsertCalls).toHaveLength(1);
    expect(joinUpsertCalls[0][0]).toMatchObject({
      model: "__datafn_join_tasks_tags",
      create: expect.objectContaining({ from: "task-1", to: "tag-1", order: 1 }),
      update: expect.objectContaining({ order: 1 }),
    });

    // findOne must NOT be called for join existence check
    const joinFindOneCalls = (findOneSpy.mock.calls as any[]).filter((c) =>
      c[0]?.model === "__datafn_join_tasks_tags"
    );
    expect(joinFindOneCalls).toHaveLength(0);

    // Verify join row was created
    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" },
      ],
      namespace: "datafn",
    });
    expect(joinRow).toBeDefined();
    expect((joinRow as any).order).toBe(1);

    upsertSpy.mockRestore();
    findOneSpy.mockRestore();
  });

  it("TV-REL-OPT-004: many-many join updated with metadata via upsert", async () => {
    await db.create({
      model: "__datafn_join_tasks_tags",
      data: { id: "task-1:tag-1", from: "task-1", to: "tag-1", order: 1 },
      namespace: "datafn",
    });

    const upsertSpy = vi.spyOn(db, "upsert");

    const req = new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "tasks",
        version: "1",
        clientId: "client-1",
        mutationId: "mut-tv-rel-opt-004",
        operation: "relate",
        id: "task-1",
        relations: {
          tags: [{ "$ref": "tag-1", "order": 5 }],
        },
      }),
    });

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);

    // upsert called with update: { order: 5 }
    const joinUpsertCalls = (upsertSpy.mock.calls as any[]).filter((c) =>
      c[0]?.model === "__datafn_join_tasks_tags"
    );
    expect(joinUpsertCalls).toHaveLength(1);
    expect(joinUpsertCalls[0][0].update).toMatchObject({ order: 5 });

    // Join row has updated metadata
    const joinRow = await db.findOne({
      model: "__datafn_join_tasks_tags",
      where: [
        { field: "from", operator: "eq", value: "task-1" },
        { field: "to", operator: "eq", value: "tag-1" },
      ],
      namespace: "datafn",
    });
    expect((joinRow as any).order).toBe(5);

    upsertSpy.mockRestore();
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

    const res = await server.router.handle(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toContain("Related record not found");
  });
});
