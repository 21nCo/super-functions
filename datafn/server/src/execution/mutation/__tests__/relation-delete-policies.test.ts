import { beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { Adapter } from "@superfunctions/db";
import { createDatafnServer } from "../../../server.js";
import type { DatafnSchema } from "../../../core-types.js";

const NS = "datafn";

const schema: DatafnSchema = {
  resources: [
    {
      name: "project",
      version: 1,
      idPrefix: "project",
      fields: [{ name: "name", type: "string", required: true }],
    },
    {
      name: "task",
      version: 1,
      idPrefix: "task",
      fields: [
        { name: "title", type: "string", required: true },
        { name: "projectId", type: "string", required: false },
      ],
    },
    {
      name: "tag",
      version: 1,
      idPrefix: "tag",
      fields: [{ name: "name", type: "string", required: true }],
    },
    {
      name: "node",
      version: 1,
      idPrefix: "node",
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "task",
      to: "project",
      type: "many-one",
      relation: "project",
      fkField: "projectId",
      onDelete: { to: "setNull" },
    },
    {
      from: "task",
      to: "tag",
      type: "many-many",
      relation: "tags",
      onDelete: "detach",
    },
    {
      from: ["task", "node"],
      to: "tag",
      type: "many-many",
      relation: "labels",
      joinTable: "resource_labels",
      onDelete: "detach",
    },
  ],
};

const restrictSchema: DatafnSchema = {
  ...schema,
  relations: [
    {
      from: "task",
      to: "project",
      type: "many-one",
      relation: "project",
      fkField: "projectId",
      onDelete: { to: "restrict" },
    },
  ],
};

const cascadeRestrictSchema: DatafnSchema = {
  ...schema,
  resources: schema.resources.map((resource) =>
    resource.name === "tag"
      ? {
          ...resource,
          fields: [
            ...resource.fields,
            { name: "taskId", type: "string", required: false },
          ],
        }
      : resource
  ),
  relations: [
    {
      from: "task",
      to: "project",
      type: "many-one",
      relation: "project",
      fkField: "projectId",
      onDelete: { to: "cascade" },
    },
    {
      from: "tag",
      to: "task",
      type: "many-one",
      relation: "task",
      fkField: "taskId",
      onDelete: { to: "restrict" },
    },
  ],
};

async function seed(db: Adapter) {
  await db.create({ model: "project", data: { id: "project:1", name: "Project" }, namespace: NS });
  await db.create({ model: "task", data: { id: "task:1", title: "Task", projectId: "project:1" }, namespace: NS });
  await db.create({ model: "tag", data: { id: "tag:1", name: "Tag" }, namespace: NS });
  await db.create({
    model: "__datafn_join_task_tags",
    data: { id: "task:1:tag:1", from: "task:1", to: "tag:1" },
    namespace: NS,
  });
}

async function runMutation(server: any, body: Record<string, unknown>) {
  const response = await server.router.handle(
    new Request("http://localhost/datafn/mutation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 1,
        clientId: "client:1",
        mutationId: `mutation:${Math.random()}`,
        ...body,
      }),
    }),
  );
  return {
    response,
    body: await response.json(),
  };
}

describe("relation delete policies", () => {
  let db: Adapter;
  let server: any;

  beforeEach(async () => {
    db = memoryAdapter();
    await db.initialize();
    await seed(db);
    server = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: db,
    });
  });

  it("setNull clears FK references and records sync deltas", async () => {
    const result = await runMutation(server, {
      resource: "project",
      operation: "delete",
      id: "project:1",
    });

    expect(result.response.status).toBe(200);
    expect(result.body.ok).toBe(true);

    const task = await db.findOne({
      model: "task",
      where: [{ field: "id", operator: "eq", value: "task:1" }],
      namespace: NS,
    }) as Record<string, unknown> | null;
    expect(task?.projectId).toBeNull();

    const changes = await (db as any).internal.findMany("__datafn_changes", [], { orderBy: "server_seq" });
    expect(changes).toHaveLength(2);
    expect(changes.map((change: any) => change.resource)).toEqual(["project", "task"]);
    expect(JSON.parse(changes[1].record).projectId).toBeNull();
  });

  it("detach removes many-many join rows and records logical join deletes", async () => {
    const result = await runMutation(server, {
      resource: "task",
      operation: "delete",
      id: "task:1",
    });

    expect(result.response.status).toBe(200);
    expect(result.body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "__datafn_join_task_tags",
      where: [{ field: "id", operator: "eq", value: "task:1:tag:1" }],
      namespace: NS,
    });
    expect(joinRow).toBeNull();

    const changes = await (db as any).internal.findMany("__datafn_changes", [], { orderBy: "server_seq" });
    expect(changes.map((change: any) => change.resource)).toEqual(["task", "join_task_tags_tag"]);
    expect(changes[1].op).toBe("delete");
  });

  it("restrict rejects deletes when referenced records exist", async () => {
    const restrictServer = await createDatafnServer({
      allowUnknownResources: true,
      schema: restrictSchema,
      database: db,
    });

    const result = await runMutation(restrictServer, {
      resource: "project",
      operation: "delete",
      id: "project:1",
    });

    expect(result.body.ok).toBe(false);
    expect(result.body.error.code).toBe("RELATION_RESTRICTED");

    const project = await db.findOne({
      model: "project",
      where: [{ field: "id", operator: "eq", value: "project:1" }],
      namespace: NS,
    });
    expect(project).toBeDefined();
  });

  it("rolls back earlier relation effects when the parent delete fails", async () => {
    const transactionalDb = memoryAdapter();
    await transactionalDb.initialize();
    await seed(transactionalDb);
    const originalDelete = transactionalDb.delete.bind(transactionalDb);
    transactionalDb.delete = async (params) => {
      if (params.model === "project") {
        throw new Error("parent delete failed");
      }
      await originalDelete(params);
    };
    const transactionalServer = await createDatafnServer({
      allowUnknownResources: true,
      schema,
      database: transactionalDb,
    });

    const result = await runMutation(transactionalServer, {
      resource: "project",
      operation: "delete",
      id: "project:1",
    });

    expect(result.body.ok).toBe(true);
    expect(result.body.result.ok).toBe(false);
    expect(result.body.result.errors[0].code).toBe("INTERNAL");
    await expect(transactionalDb.findOne({
      model: "project",
      where: [{ field: "id", operator: "eq", value: "project:1" }],
      namespace: NS,
    })).resolves.toBeDefined();
    await expect(transactionalDb.findOne({
      model: "task",
      where: [{ field: "id", operator: "eq", value: "task:1" }],
      namespace: NS,
    })).resolves.toMatchObject({ projectId: "project:1" });
  });

  it("preflights nested restrict policies before cascading without transactions", async () => {
    await db.create({
      model: "tag",
      data: { id: "tag:dependent", name: "Dependent", taskId: "task:1" },
      namespace: NS,
    });
    db.capabilities.transactions.supported = false;
    const cascadeServer = await createDatafnServer({
      allowUnknownResources: true,
      schema: cascadeRestrictSchema,
      database: db,
    });

    const result = await runMutation(cascadeServer, {
      resource: "project",
      operation: "delete",
      id: "project:1",
    });

    expect(result.body.ok).toBe(false);
    expect(result.body.error.code).toBe("RELATION_RESTRICTED");
    for (const [model, id] of [
      ["project", "project:1"],
      ["task", "task:1"],
      ["tag", "tag:dependent"],
    ] as const) {
      await expect(db.findOne({
        model,
        where: [{ field: "id", operator: "eq", value: id }],
        namespace: NS,
      })).resolves.toBeDefined();
    }
  });

  it("relate writes polymorphic discriminator fields on shared join tables", async () => {
    await db.create({ model: "node", data: { id: "node:1", label: "Node" }, namespace: NS });

    const result = await runMutation(server, {
      resource: "node",
      operation: "relate",
      id: "node:1",
      relations: { labels: "tag:1" },
    });

    expect(result.response.status).toBe(200);
    expect(result.body.ok).toBe(true);

    const joinRow = await db.findOne({
      model: "resource_labels",
      where: [{ field: "id", operator: "eq", value: "node:1:tag:1" }],
      namespace: NS,
    }) as Record<string, unknown> | null;

    expect(joinRow?.fromResource).toBe("node");
    expect(joinRow?.to).toBe("tag:1");
  });

  it("detach scopes shared polymorphic join deletes by discriminator", async () => {
    await db.create({ model: "node", data: { id: "node:1", label: "Node" }, namespace: NS });
    await db.create({
      model: "resource_labels",
      data: {
        id: "node-row",
        from: "node:1",
        to: "tag:1",
        fromResource: "node",
        toResource: "tag",
      },
      namespace: NS,
    });
    await db.create({
      model: "resource_labels",
      data: {
        id: "task-row-with-overlapping-id",
        from: "node:1",
        to: "tag:1",
        fromResource: "task",
        toResource: "tag",
      },
      namespace: NS,
    });

    const result = await runMutation(server, {
      resource: "node",
      operation: "delete",
      id: "node:1",
    });

    expect(result.body.result.ok).toBe(true);
    await expect(db.findOne({
      model: "resource_labels",
      where: [{ field: "id", operator: "eq", value: "node-row" }],
      namespace: NS,
    })).resolves.toBeNull();
    await expect(db.findOne({
      model: "resource_labels",
      where: [{ field: "id", operator: "eq", value: "task-row-with-overlapping-id" }],
      namespace: NS,
    })).resolves.toBeDefined();
  });
});
