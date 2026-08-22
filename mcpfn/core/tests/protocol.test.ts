import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import {
  CallToolResultSchema,
  CreateTaskResultSchema,
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  ListRootsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  MCP_APP_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  McpFnRegistry,
  createMcpAppResource,
  createMcpFnServer,
  mcpAppToolMetadata,
  structuredResult,
  validateManifest,
} from "../src/index.js";

describe("McpFn protocol primitives", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(closeables.splice(0).map((value) => value.close().catch(() => undefined)));
  });

  async function connect(registry: McpFnRegistry, options: Record<string, unknown> = {}) {
    const server = createMcpFnServer({
      info: { name: "protocol-test", version: "1.0.0" },
      registry,
      pageSize: 1,
      ...options,
    });
    const client = new Client(
      { name: "protocol-client", version: "1.0.0" },
      { capabilities: {} },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeables.push(client, server);
    return { client, server };
  }

  it("rejects duplicate resource-template URI patterns", () => {
    const registry = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://users/{id}",
      name: "user",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "user" }] }),
    });
    expect(() => registry.registerResourceTemplate({
      uriTemplate: "docs://users/{name}",
      name: "account",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "account" }] }),
    })).toThrow("Duplicate MCP resource template URI: docs://users/{name}");
    expect(() => registry.registerResourceTemplate({
      uriTemplate: "docs://users/{;name}",
      name: "matrix-account",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "matrix" }] }),
    })).toThrow("Duplicate MCP resource template URI: docs://users/{;name}");
  });

  it("serves paginated resources, templates, prompts, and completions", async () => {
    const registry = new McpFnRegistry()
      .registerResource({
        uri: "docs://guide",
        name: "guide",
        description: "The guide.",
        mimeType: "text/markdown",
        read: async () => ({
          contents: [{ uri: "docs://guide", mimeType: "text/markdown", text: "# Guide" }],
        }),
      })
      .registerResource({
        uri: "docs://reference",
        name: "reference",
        read: async () => ({ contents: [{ uri: "docs://reference", text: "Reference" }] }),
      })
      .registerResourceTemplate({
        uriTemplate: "docs://users/{id}",
        name: "user",
        read: async (uri, variables) => ({
          contents: [{ uri: uri.toString(), text: `User ${String(variables.id)}` }],
        }),
        complete: {
          id: async (value) => ({ completion: { values: [`${value}1`, `${value}2`] } }),
        },
      })
      .registerPrompt({
        name: "welcome",
        description: "Welcome a user.",
        arguments: [{ name: "name", required: true }],
        get: async ({ name }) => ({
          messages: [{ role: "user", content: { type: "text", text: `Welcome ${name}` } }],
        }),
        complete: {
          name: async (value) => ({ completion: { values: [`${value}da`] } }),
        },
      });
    const { client, server } = await connect(registry);

    const first = await client.listResources();
    expect(first.resources).toHaveLength(1);
    expect(first.nextCursor).toMatch(/^mcpfn:resources:[A-Za-z0-9_-]+:1$/);
    await expect(client.listResourceTemplates({ cursor: first.nextCursor }))
      .rejects.toThrow(/Invalid McpFn pagination cursor/);
    const second = await client.listResources({ cursor: first.nextCursor });
    expect(second.resources).toHaveLength(1);
    await expect(client.readResource({ uri: "docs://users/42" })).resolves.toMatchObject({
      contents: [{ text: "User 42" }],
    });
    await expect(client.listResourceTemplates()).resolves.toMatchObject({
      resourceTemplates: [{ name: "user", uriTemplate: "docs://users/{id}" }],
    });
    await expect(client.getPrompt({ name: "welcome", arguments: { name: "Ada" } }))
      .resolves.toMatchObject({ messages: [{ content: { text: "Welcome Ada" } }] });
    await expect(client.complete({
      ref: { type: "ref/resource", uri: "docs://users/{id}" },
      argument: { name: "id", value: "4" },
    })).resolves.toMatchObject({ completion: { values: ["41", "42"] } });

    const manifest = server.manifest();
    expect(validateManifest(manifest)).toEqual(manifest);
    expect(manifest.capabilities).toMatchObject({
      resources: { listChanged: true },
      prompts: { listChanged: true },
      completions: {},
    });
  });

  it("rejects a list cursor after its visible collection changes", async () => {
    let visible = new Set(["alpha", "beta"]);
    const tool = (name: string) => ({
      name,
      description: `Run ${name}.`,
      inputSchema: { type: "object" as const },
      handler: async () => structuredResult({ ok: true }),
    });
    const registry = new McpFnRegistry()
      .register(tool("alpha"))
      .register(tool("beta"));
    const { client } = await connect(registry, {
      toolVisibility: ({ tool: listed }: { tool: { name: string } }) => visible.has(listed.name),
    });

    const first = await client.listTools();
    expect(first.nextCursor).toMatch(/^mcpfn:tools:[A-Za-z0-9_-]+:1$/);
    visible = new Set(["beta"]);
    await expect(client.listTools({ cursor: first.nextCursor }))
      .rejects.toThrow(/Expired McpFn pagination cursor/);
  });

  it("keeps a list cursor valid when equivalent resources change property order", async () => {
    let reversePropertyOrder = false;
    const registry = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://items/{id}",
      name: "items",
      list: async () => ({
        resources: [
          reversePropertyOrder
            ? { description: "First item.", name: "first", uri: "docs://items/1" }
            : { uri: "docs://items/1", name: "first", description: "First item." },
          { uri: "docs://items/2", name: "second" },
        ],
      }),
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "item" }] }),
    });
    const { client } = await connect(registry);

    const first = await client.listResources();
    reversePropertyOrder = true;
    await expect(client.listResources({ cursor: first.nextCursor })).resolves.toMatchObject({
      resources: [{ uri: "docs://items/2" }],
    });
  });

  it("runs task-augmented tools through the SDK task store", async () => {
    const taskStore = new InMemoryTaskStore();
    const registry = new McpFnRegistry().register({
      name: "deferred_echo",
      description: "Echo using a task.",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
      execution: { taskSupport: "required" },
      handler: async ({ value }) => structuredResult({ value }),
      taskHandler: {
        createTask: async ({ value }, _context, extra) => {
          const task = await extra.taskStore.createTask({
            ttl: extra.taskRequestedTtl,
            pollInterval: 1,
          });
          await extra.taskStore.storeTaskResult(
            task.taskId,
            "completed",
            structuredResult({ value }),
          );
          return { task: await extra.taskStore.getTask(task.taskId) };
        },
      },
    });
    const { client } = await connect(registry, { taskStore });
    await client.listTools();
    const stream = client.experimental.tasks.callToolStream(
      { name: "deferred_echo", arguments: { value: "later" } },
      undefined,
      { task: { ttl: 5_000 } },
    );
    let taskId: string | undefined;
    let result: unknown;
    for await (const message of stream) {
      if (message.type === "taskCreated") taskId = message.task.taskId;
      if (message.type === "result") result = message.result;
    }
    expect(taskId).toBeTypeOf("string");
    expect(result).toMatchObject({ structuredContent: { value: "later" } });
    if (!taskId) throw new Error("Task stream did not create a task");
    await expect(client.experimental.tasks.getTask(taskId)).resolves.toMatchObject({
      status: "completed",
    });
    await expect(client.experimental.tasks.getTaskResult(taskId, CallToolResultSchema)).resolves.toMatchObject({
      structuredContent: { value: "later" },
    });
  });

  it("returns protocol errors for task creation failures and validates stored task output", async () => {
    const taskStore = new InMemoryTaskStore();
    const registry = new McpFnRegistry().register({
      name: "validated_task",
      description: "Store validated task output.",
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
      outputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
      execution: { taskSupport: "required" },
      handler: async ({ value }) => structuredResult({ value }),
      taskHandler: {
        createTask: async (_args, _context, extra) => {
          const task = await extra.taskStore.createTask({ pollInterval: 1 });
          await extra.taskStore.storeTaskResult(
            task.taskId,
            "completed",
            structuredResult({ value: 42 }),
          );
          return { task };
        },
      },
    });
    const { client } = await connect(registry, { taskStore });
    await expect(client.request({
      method: "tools/call",
      params: { name: "validated_task", arguments: {}, task: {} },
    }, CreateTaskResultSchema)).rejects.toThrow(/Invalid arguments/);
    await expect(client.request({
      method: "tools/call",
      params: { name: "validated_task", arguments: { value: "ok" }, task: {} },
    }, CreateTaskResultSchema)).rejects.toThrow(/Invalid output/);
  });

  it("validates MCP App resources, subscriptions, and tool linkage", async () => {
    const appUri = "ui://weather/main" as const;
    const subscriptions: string[] = [];
    const registry = new McpFnRegistry()
      .registerResource(createMcpAppResource({
        uri: appUri,
        name: "weather-ui",
        html: "<!doctype html><html><body>Weather</body></html>",
        ui: { prefersBorder: true, csp: { connectDomains: ["https://api.example.com"] } },
        subscribe: async () => { subscriptions.push("subscribe"); },
        unsubscribe: async () => { subscriptions.push("unsubscribe"); },
      }))
      .register({
        name: "show_weather",
        description: "Show the weather app.",
        inputSchema: { type: "object" },
        metadata: mcpAppToolMetadata(appUri),
        handler: async () => structuredResult({ ok: true }),
      });
    const server = createMcpFnServer({
      info: { name: "apps", version: "1.0.0" },
      registry,
      extensions: { [MCP_APP_EXTENSION_ID]: { version: "draft" } },
    });
    closeables.push(server);
    const manifest = server.manifest();
    expect(manifest.resources?.[0]).toMatchObject({ mimeType: MCP_APP_MIME_TYPE });
    expect(manifest.tools[0].metadata).toMatchObject({ ui: { resourceUri: appUri } });
    const { client } = await connect(registry);
    await client.subscribeResource({ uri: appUri });
    await client.unsubscribeResource({ uri: appUri });
    expect(subscriptions).toEqual(["subscribe", "unsubscribe"]);

    expect(() => createMcpFnServer({
      info: { name: "bad-app", version: "1.0.0" },
      registry: new McpFnRegistry().register({
        name: "broken",
        description: "Broken app link.",
        inputSchema: { type: "object" },
        metadata: mcpAppToolMetadata("ui://missing/app"),
        handler: async () => structuredResult({ ok: true }),
      }),
    })).toThrow(/missing MCP App resource/);
  });

  it("mediates roots, sampling, and elicitation through declared client requirements", async () => {
    let server: ReturnType<typeof createMcpFnServer>;
    const registry = new McpFnRegistry().register({
      name: "client_features",
      description: "Exercise client-mediated features.",
      inputSchema: { type: "object" },
      handler: async () => {
        const roots = await server.listRoots();
        const sample = await server.sample({
          messages: [{ role: "user", content: { type: "text", text: "Hello" } }],
          maxTokens: 32,
        });
        const elicited = await server.elicit({
          mode: "form",
          message: "Choose a name",
          requestedSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        });
        return structuredResult({
          root: roots.roots[0]?.uri,
          sampled: Array.isArray(sample.content) ? undefined :
            sample.content.type === "text" ? sample.content.text : undefined,
          elicited: elicited.content?.name,
        });
      },
    });
    server = createMcpFnServer({
      info: { name: "client-features", version: "1.0.0" },
      registry,
      clientRequirements: { sampling: true, elicitation: ["form"], roots: true },
    });
    const client = new Client(
      { name: "capable-client", version: "1.0.0" },
      {
        capabilities: {
          roots: {},
          sampling: {},
          elicitation: { form: {} },
        },
      },
    );
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: [{ uri: "file:///workspace", name: "workspace" }],
    }));
    client.setRequestHandler(CreateMessageRequestSchema, async () => ({
      model: "test-model",
      role: "assistant",
      content: { type: "text", text: "Sampled" },
      stopReason: "endTurn",
    }));
    client.setRequestHandler(ElicitRequestSchema, async () => ({
      action: "accept",
      content: { name: "Ada" },
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeables.push(client, server);

    await expect(client.callTool({ name: "client_features" })).resolves.toMatchObject({
      structuredContent: {
        root: "file:///workspace",
        sampled: "Sampled",
        elicited: "Ada",
      },
    });
    expect(server.manifest().clientRequirements).toEqual({
      sampling: true,
      elicitation: ["form"],
      roots: true,
    });
  });
});
