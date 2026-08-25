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
import { afterEach, describe, expect, it, vi } from "vitest";

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

  async function connect<TContext = undefined>(
    registry: McpFnRegistry<TContext>,
    options: Record<string, unknown> = {},
  ) {
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
    expect(first.nextCursor).toBe("mcpfn:1");
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

  it("passes trusted request context and client completion arguments to completers", async () => {
    const complete = vi.fn(async (
      value: string,
      completionContext: Record<string, string> | undefined,
      context: { tenant: string },
    ) => ({
      completion: { values: [`${context.tenant}:${completionContext?.scope}:${value}`] },
    }));
    const registry = new McpFnRegistry<{ tenant: string }>().registerPrompt({
      name: "tenant-welcome",
      arguments: [{ name: "name" }],
      get: async () => ({ messages: [] }),
      complete: { name: complete },
    });
    const context = vi.fn(async () => ({ tenant: "acme" }));
    const { client } = await connect(registry, { context });

    await expect(client.complete({
      ref: { type: "ref/prompt", name: "tenant-welcome" },
      argument: { name: "name", value: "ada" },
      context: { arguments: { scope: "admins" } },
    })).resolves.toMatchObject({ completion: { values: ["acme:admins:ada"] } });
    expect(context).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      "ada",
      { scope: "admins" },
      { tenant: "acme" },
      expect.any(Object),
    );
  });

  it("rejects duplicate or ambiguous resource template URIs under different names", () => {
    const registry = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://users/{id}",
      name: "user",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "User" }] }),
    });
    expect(() => registry.registerResourceTemplate({
      uriTemplate: "docs://users/{id}",
      name: "person",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Person" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);
    expect(() => registry.registerResourceTemplate({
      uriTemplate: "docs://users/{name}",
      name: "renamed-person",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Person" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);

    const reserved = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://reserved/{+id}",
      name: "reserved",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Reserved" }] }),
    });
    expect(() => reserved.registerResourceTemplate({
      uriTemplate: "docs://reserved/{+id*}",
      name: "exploded-reserved",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Reserved" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);
    expect(() => reserved.registerResourceTemplate({
      uriTemplate: "docs://reserved/{name}",
      name: "simple-reserved",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Reserved" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);

    const slash = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://slash/{id}",
      name: "literal-slash",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Slash" }] }),
    });
    expect(() => slash.registerResourceTemplate({
      uriTemplate: "docs://slash{/name}",
      name: "slash-operator",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Slash" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);

    const dot = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://dot.{id}",
      name: "literal-dot",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Dot" }] }),
    });
    expect(() => dot.registerResourceTemplate({
      uriTemplate: "docs://dot{.name}",
      name: "dot-operator",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Dot" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);

    const query = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://query{?value}",
      name: "query",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Query" }] }),
    });
    expect(() => query.registerResourceTemplate({
      uriTemplate: "docs://query{?value*}",
      name: "exploded-query",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Query" }] }),
    })).toThrow(/Ambiguous MCP resource URI template/);

    expect(() => new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://unsupported{;value}",
      name: "unsupported-path-parameter",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Unsupported" }] }),
    })).toThrow(/unsupported URI template operator ;/);

    const distinct = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://distinct/{id}/a",
      name: "distinct-a",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "A" }] }),
    });
    expect(() => distinct.registerResourceTemplate({
      uriTemplate: "docs://distinct/{id}/b",
      name: "distinct-b",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "B" }] }),
    })).not.toThrow();

    const distinctQuery = new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://distinct-query{?first}",
      name: "distinct-first-query",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "First" }] }),
    });
    expect(() => distinctQuery.registerResourceTemplate({
      uriTemplate: "docs://distinct-query{?second}",
      name: "distinct-second-query",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Second" }] }),
    })).not.toThrow();
  });

  it("requires resource subscription callbacks to be registered as a pair", () => {
    const read = async () => ({ contents: [{ uri: "docs://paired", text: "Paired" }] });
    expect(() => new McpFnRegistry().registerResource({
      uri: "docs://paired",
      name: "paired",
      read,
      subscribe: async () => undefined,
    })).toThrow(/must define subscribe and unsubscribe together/);
    expect(() => new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://paired/{id}",
      name: "paired-template",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Paired" }] }),
      unsubscribe: async () => undefined,
    })).toThrow(/must define subscribe and unsubscribe together/);
    expect(() => new McpFnRegistry().registerResource({
      uri: "docs://invalid-pair",
      name: "invalid-pair",
      read,
      subscribe: true,
      unsubscribe: true,
    } as never)).toThrow(/together as functions/);
    expect(() => new McpFnRegistry().registerResourceTemplate({
      uriTemplate: "docs://invalid-pair/{id}",
      name: "invalid-pair-template",
      read: async (uri) => ({ contents: [{ uri: uri.toString(), text: "Invalid" }] }),
      subscribe: true,
      unsubscribe: true,
    } as never)).toThrow(/together as functions/);
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

    expect(() => createMcpAppResource({
      uri: "ui://optional-csp/main",
      name: "optional-csp",
      html: "<!doctype html><html><body>Optional</body></html>",
      ui: { csp: { connectDomains: undefined } as never },
    })).not.toThrow();
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
