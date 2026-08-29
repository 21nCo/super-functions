import { afterEach, describe, expect, it } from "vitest";
import { createDatafnServer } from "@datafn/server";
import { memoryAdapter } from "@superfunctions/db/adapters";
import { createMcpFnServer } from "mcpfn";
import { McpFnTestClient } from "@mcpfn/testing";

import { createDatafnMcpRegistry } from "../src/index.js";

describe("DataFn McpFn adapter", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(closeables.splice(0).map((value) => value.close().catch(() => undefined)));
  });

  it("exposes bounded reads and opt-in idempotent writes over MCP", async () => {
    const schema = {
      resources: [{
        name: "tasks",
        version: 1,
        fields: [
          { name: "title", type: "string" as const, required: true },
          { name: "secret", type: "string" as const, required: false },
        ],
        permissions: {
          read: { fields: ["title"] },
          write: { fields: ["title"] },
        },
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    const registry = createDatafnMcpRegistry({
      schema,
      executor: datafn.executor,
      context: () => undefined,
      clientId: "mcpfn-test",
      expose: {
        tasks: {
          fields: ["id", "title"],
          list: { filterFields: ["title"], sortFields: ["title"], maxLimit: 10 },
          get: true,
          create: { fields: ["title"] },
        },
      },
    });
    const server = createMcpFnServer({
      info: { name: "datafn-test", version: "1.0.0" },
      registry,
    });
    const client = await McpFnTestClient.connect(server);
    closeables.push(client);

    expect((await client.listTools()).map((tool) => tool.name)).toEqual([
      "datafn_tasks_create",
      "datafn_tasks_get",
      "datafn_tasks_list",
    ]);
    const created = await client.callTool("datafn_tasks_create", {
      id: "task-1",
      mutationId: "create-1",
      record: { title: "First" },
    });
    expect(created.isError).not.toBe(true);
    const second = await client.callTool("datafn_tasks_create", {
      id: "task-2",
      mutationId: "create-2",
      record: { title: "Earlier" },
    });
    expect(second.isError).not.toBe(true);
    const firstPage = await client.callTool("datafn_tasks_list", {
      sort: ["title:asc"],
      limit: 1,
    });
    expect(firstPage.structuredContent).toMatchObject({
      result: {
        data: [expect.objectContaining({ id: "task-2", title: "Earlier" })],
        nextCursor: expect.objectContaining({ id: "task-2", title: "Earlier" }),
      },
    });
    const cursor = (firstPage.structuredContent as {
      result: { nextCursor: Record<string, unknown> };
    }).result.nextCursor;
    const nextPage = await client.callTool("datafn_tasks_list", {
      sort: ["title:asc"],
      cursor: { after: cursor },
      limit: 1,
    });
    expect(nextPage.isError).not.toBe(true);
    expect(nextPage.structuredContent).toMatchObject({
      result: { data: [expect.objectContaining({ id: "task-1", title: "First" })] },
    });
    const listed = await client.callTool("datafn_tasks_list", { limit: 10 });
    expect(listed.structuredContent).toMatchObject({
      resource: "tasks",
      operation: "list",
      result: {
        data: expect.arrayContaining([
          expect.objectContaining({ id: "task-1", title: "First" }),
          expect.objectContaining({ id: "task-2", title: "Earlier" }),
        ]),
      },
    });
    expect(JSON.stringify(listed.structuredContent)).not.toContain("secret");
  });

  it("rejects exposure of fields outside DataFn policy", async () => {
    const schema = {
      resources: [{
        name: "tasks",
        version: 1,
        fields: [{ name: "secret", type: "string" as const, required: false }],
        permissions: { read: { fields: [] }, write: { fields: [] } },
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    expect(() => createDatafnMcpRegistry({
      schema,
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
      expose: { tasks: { fields: ["secret"] } },
    })).toThrow(/not readable/);
  });

  it("rejects sanitized default-name collisions before registration", () => {
    const schema = {
      resources: ["_tasks", "tasks_"].map((name) => ({
        name,
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: false }],
        permissions: { read: { fields: ["title"] }, write: { fields: [] } },
      })),
    };
    expect(() => createDatafnMcpRegistry({
      executor: { schema } as never,
      context: () => undefined,
      clientId: "test",
      expose: {
        _tasks: { fields: ["id", "title"] },
        tasks_: { fields: ["id", "title"] },
      },
    })).toThrow(/DataFn tool name collision for datafn_tasks_list: _tasks\.list and tasks_\.list/);
  });

  it("honors schema-level default permissions", async () => {
    const schema = {
      defaultPermissions: "allResourceFields" as const,
      resources: [{
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    const registry = createDatafnMcpRegistry({
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
      expose: {
        tasks: {
          fields: ["id", "title"],
          create: { fields: ["title"] },
          delete: true,
        },
      },
    });
    expect(registry.listTools().map((tool) => tool.name)).toEqual([
      "datafn_tasks_create",
      "datafn_tasks_delete",
      "datafn_tasks_get",
      "datafn_tasks_list",
    ]);
  });

  it("treats resource permissions as a complete override of schema defaults", async () => {
    const schema = {
      defaultPermissions: "allResourceFields" as const,
      resources: [{
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
        permissions: { read: { fields: ["title"] } },
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    expect(() => createDatafnMcpRegistry({
      schema,
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
      expose: {
        tasks: {
          fields: ["id", "title"],
          create: { fields: ["title"] },
          delete: true,
        },
      },
    })).toThrow(/has no write policy/);
  });

  it("keeps generated names stable for resource-edge underscores", async () => {
    const schema = {
      resources: [{
        name: "_tasks_",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
        permissions: { read: { fields: ["title"] } },
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    const registry = createDatafnMcpRegistry({
      schema,
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
      expose: { _tasks_: { fields: ["id", "title"] } },
    });
    expect(registry.listTools().map((tool) => tool.name)).toEqual([
      "datafn_tasks_get",
      "datafn_tasks_list",
    ]);
  });

  it("uses the executor's normalized schema as the authoritative contract", async () => {
    const executorSchema = {
      resources: [{
        name: "tasks",
        version: 1,
        fields: [{ name: "title", type: "string" as const, required: true }],
        permissions: { read: { fields: ["title"] }, write: { fields: ["title"] } },
      }],
    };
    const datafn = await createDatafnServer({ schema: executorSchema, db: memoryAdapter() });
    closeables.push(datafn);
    const registry = createDatafnMcpRegistry({
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
      expose: { tasks: { fields: ["id", "title"] } },
    });
    expect(registry.listTools().map((tool) => tool.name)).toEqual([
      "datafn_tasks_get",
      "datafn_tasks_list",
    ]);
  });

  it("mirrors DataFn JSON, date, nullable, and default semantics for write-only resources", async () => {
    const schema = {
      resources: [{
        name: "events",
        version: 1,
        fields: [
          { name: "title", type: "string" as const, required: true },
          { name: "status", type: "string" as const, required: true, default: "draft" },
          { name: "payload", type: "json" as const, required: true },
          { name: "occurredAt", type: "date" as const, required: true },
          {
            name: "note",
            type: "string" as const,
            required: false,
            nullable: true,
            enum: ["internal", "public"],
          },
        ],
        permissions: {
          write: { fields: ["title", "status", "payload", "occurredAt", "note"] },
        },
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    const registry = createDatafnMcpRegistry({
      schema,
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
      expose: {
        events: {
          fields: ["id", "title", "status", "payload", "occurredAt", "note"],
          list: false,
          get: false,
          create: { fields: ["title", "status", "payload", "occurredAt", "note"] },
        },
      },
    });
    const createTool = registry.listTools().find((tool) => tool.name === "datafn_events_create");
    const recordSchema = createTool?.inputSchema.properties?.record as {
      required?: string[];
      properties?: Record<string, { type?: string | string[]; enum?: unknown[] }>;
    };
    expect(recordSchema.required).toEqual(["occurredAt", "payload", "title"]);
    expect(recordSchema.properties?.status).toBeDefined();
    expect(recordSchema.properties?.payload.type).toEqual([
      "string", "number", "boolean", "object", "array",
    ]);
    expect(recordSchema.properties?.occurredAt.type).toEqual(["string", "number"]);
    expect(recordSchema.properties?.note.type).toEqual(["string", "null"]);
    expect(recordSchema.properties?.note.enum).toEqual(["internal", "public", null]);

    const server = createMcpFnServer({
      info: { name: "datafn-semantics", version: "1.0.0" },
      registry,
    });
    const client = await McpFnTestClient.connect(server);
    closeables.push(client);
    const created = await client.callTool("datafn_events_create", {
      id: "event-1",
      mutationId: "create-event-1",
      record: {
        title: "Launch",
        payload: ["public", 1],
        occurredAt: 1_786_400_000_000,
        note: null,
      },
    });
    expect(created.isError).not.toBe(true);
  });

  it("rejects ambiguous write allowlists and invalid list bounds", async () => {
    const schema = {
      resources: [{
        name: "tasks",
        version: 1,
        fields: [
          { name: "title", type: "string" as const, required: true },
          { name: "status", type: "string" as const, required: false },
        ],
        permissions: {
          read: { fields: ["title", "status"] },
          write: { fields: ["title", "status"] },
        },
      }],
    };
    const datafn = await createDatafnServer({ schema, db: memoryAdapter() });
    closeables.push(datafn);
    const common = {
      schema,
      executor: datafn.executor,
      context: () => undefined,
      clientId: "test",
    };

    expect(() => createDatafnMcpRegistry({
      ...common,
      expose: { tasks: { fields: ["id", "title"], create: { fields: [] } } },
    })).toThrow(/non-empty, unique field list/);
    expect(() => createDatafnMcpRegistry({
      ...common,
      expose: {
        tasks: {
          fields: ["id", "title"],
          create: { fields: ["status"] },
        },
      },
    })).toThrow(/create fields omit required writable fields: title/);
    expect(() => createDatafnMcpRegistry({
      ...common,
      expose: {
        tasks: {
          fields: ["id", "title"],
          list: { maxLimit: 10, defaultLimit: 11 },
        },
      },
    })).toThrow(/defaultLimit cannot exceed maxLimit/);
  });
});
