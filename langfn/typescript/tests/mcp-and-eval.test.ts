import { PassThrough } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpFnRegistry, createMcpFnServer } from "@mcpfn/core";

import { describe, expect, it, vi } from "vitest";

import { LangFn } from "../src/client.js";
import { MCPProtocolError, MCPTransportError, ValidationError } from "../src/core/errors.js";
import { createMetric, Evaluator } from "../src/evaluation/index.js";
import { MCPClient } from "../src/mcp/client.js";
import { MCPServer } from "../src/mcp/server.js";
import { SSEMCPTransport } from "../src/mcp/sse.js";
import { StdioMCPTransport } from "../src/mcp/stdio.js";
import { MockChatModel } from "../src/models/mock.js";
import { ToolPolicy } from "../src/tools/policy.js";
import { Tool } from "../src/tools/base.js";

const addTool = new Tool({
  name: "add",
  description: "Add two integers",
  schema: {
    jsonSchema: {
      type: "object",
      properties: {
        a: { type: "integer" },
        b: { type: "integer" }
      },
      required: ["a", "b"]
    },
    parse(data) {
      const value = data as Record<string, unknown>;
      return { a: Number(value.a), b: Number(value.b) };
    }
  },
  async execute(args) {
    return args.a + args.b;
  }
});

describe("mcp and evaluation parity", () => {
  it("round-trips tools/list and tools/call over stdio", async () => {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const policy = new ToolPolicy();
    const server = new MCPServer([new Tool({ name: "add", description: "Add", schema: addTool.schema, execute: async (input: any, context) => { expect(context.policy).toBe(policy); return input.a + input.b; } })], policy);
    await server.connect(new StdioServerTransport(clientToServer, serverToClient));
    const transport = new StdioMCPTransport({
      streams: {
        input: serverToClient,
        output: clientToServer,
        close: async () => {
          clientToServer.end();
          serverToClient.end();
        }
      }
    });
    const client = new MCPClient(transport);

    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("add");

    await expect(client.callTool("add", { a: 2, b: 3 })).resolves.toBe(5);
    await client.close();
    await server.close();
  });

  it("releases transient protocol servers when their transports close", async () => {
    const server = new MCPServer([addTool]);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    expect((server as any).activeServers.size).toBe(1);

    await clientTransport.close();

    expect((server as any).activeServers.size).toBe(0);
    await server.close();
  });

  it("paginates tool discovery and shares a concurrent first connection", async () => {
    const registry = new McpFnRegistry()
      .register({
        name: "one",
        description: "One.",
        inputSchema: { type: "object" },
        handler: async () => ({
          content: [{ type: "text", text: JSON.stringify({ result: "one" }) }],
          structuredContent: { result: "one" },
        }),
      })
      .register({
        name: "two",
        description: "Two.",
        inputSchema: { type: "object" },
        handler: async () => ({ content: [{ type: "text", text: "two" }] }),
      });
    const server = createMcpFnServer({
      info: { name: "paged", version: "1.0.0" },
      registry,
      pageSize: 1,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new MCPClient(clientTransport);
    try {
      const [tools, result] = await Promise.all([
        client.listTools(),
        client.callTool("one"),
      ]);
      expect(tools.map((tool) => tool.name)).toEqual(["one", "two"]);
      expect(result).toBe("one");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("preserves tool annotations and defaults unknown tools to open-world", () => {
    const annotated = new Tool({
      name: "annotated",
      description: "Annotated.",
      annotations: { readOnlyHint: true, openWorldHint: false },
      schema: { parse: () => ({}) },
      execute: async () => null,
    });
    expect(new MCPServer([addTool, annotated]).manifest().tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "add", annotations: { openWorldHint: true } }),
      expect.objectContaining({
        name: "annotated",
        annotations: { readOnlyHint: true, openWorldHint: false },
      }),
    ]));
  });

  it("normalizes unknown tools and shutdown hangs to canonical MCP errors", async () => {
    const clientToServer = new PassThrough();
    const serverToClient = new PassThrough();
    const server = new MCPServer([addTool]);
    await server.connect(new StdioServerTransport(clientToServer, serverToClient));
    const transport = new StdioMCPTransport({
      streams: {
        input: serverToClient,
        output: clientToServer,
        close: async () => {
          clientToServer.end();
          serverToClient.end();
        }
      }
    });
    const client = new MCPClient(transport);

    await expect(client.callTool("missing", {})).rejects.toBeInstanceOf(MCPProtocolError);
    await client.close();
    await server.close();

    const hangingTransport = new StdioMCPTransport({
      closeTimeoutMs: 10,
      streams: {
        input: new PassThrough(),
        output: new PassThrough(),
        close: async () => {
          await new Promise(() => {});
        }
      }
    });
    await expect(hangingTransport.close()).rejects.toBeInstanceOf(MCPTransportError);

    const delegatedTransport = new StdioMCPTransport({ command: "unused", closeTimeoutMs: 10 });
    (delegatedTransport as unknown as {
      delegate: { close(): Promise<void> };
    }).delegate = { close: async () => { await new Promise(() => {}); } };
    await expect(delegatedTransport.close()).rejects.toBeInstanceOf(MCPTransportError);
  });

  it("prefers supplied streams and rejects sends after closure", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioMCPTransport({
      command: "this-command-must-not-run",
      streams: { input, output },
    });
    await transport.start();
    await transport.close();
    await expect(transport.send({ jsonrpc: "2.0", method: "notifications/cancelled" }))
      .rejects.toBeInstanceOf(MCPTransportError);
  });

  it("preserves successful text-only tool results", async () => {
    const registry = new McpFnRegistry().register({
      name: "text_only",
      description: "Return plain text.",
      inputSchema: { type: "object", additionalProperties: false },
      handler: async () => ({ content: [{ type: "text", text: "plain response" }] }),
    });
    const server = createMcpFnServer({
      info: { name: "text-only", version: "1.0.0" },
      registry,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new MCPClient(clientTransport);
    try {
      await expect(client.callTool("text_only")).resolves.toBe("plain response");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("round-trips tools over the SSE transport", async () => {
    const server = new MCPServer([addTool]);
    const handler = await server.createWebStandardHandler();
    const transport = new SSEMCPTransport({
      url: "http://langfn.test/mcp",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        return await handler(request);
      }
    });
    const client = new MCPClient(transport);

    await expect(client.listTools()).resolves.toMatchObject([{ name: "add" }]);
    await expect(client.callTool("add", { a: 2, b: 3 })).resolves.toBe(5);
    await client.close();
    await server.close();
  });

  it("supports compare flows, custom metrics, and testfn export hooks", async () => {
    const exportPayloads: Array<Record<string, unknown>> = [];
    const evaluator = new Evaluator();
    const exactLang = new LangFn({ model: new MockChatModel({ responses: ["4", "Paris"] }) });
    const partialLang = new LangFn({ model: new MockChatModel({ responses: ["4", "Lyon"] }) });

    const comparison = await evaluator.compare({
      models: [
        { name: "mockA", lang: exactLang },
        { name: "mockB", lang: partialLang }
      ],
      dataset: [
        { input: "2+2", expected: "4" },
        { input: "capital of France", expected: "Paris" }
      ],
      metrics: [
        createMetric("exact_match", (output, expected) => output.trim() === expected.trim())
      ],
      exportHook(payload) {
        exportPayloads.push(payload as Record<string, unknown>);
      }
    });

    expect(comparison.bestModel).toBe("mockA");
    expect(comparison.perModel.mockA.accuracy).toBe(1);
    expect(comparison.perModel.mockB.accuracy).toBe(0.5);
    expect(comparison.testfnExported).toBe(true);
    expect(exportPayloads).toHaveLength(2);
    expect(exportPayloads[0].summary).toBeTruthy();
  });

  it("keeps evaluation accuracy distinct from graded score", async () => {
    const evaluator = new Evaluator();
    const evaluation = await evaluator.evaluate({
      lang: new LangFn({ model: new MockChatModel({ responses: ["one", "two"] }) }),
      dataset: [
        { input: "one", expected: "one" },
        { input: "two", expected: "two" }
      ],
      metrics: [createMetric("graded", (_output, _expected, item) => (
        item.input === "one" ? { score: 0.5, passed: true } : { score: 0.9, passed: false }
      ))]
    });

    expect(evaluation.accuracy).toBe(0.5);
    expect(evaluation.passRate).toBe(0.5);
    expect(evaluation.avgScore).toBeCloseTo(0.7);
  });

  it("rejects duplicate metric and model identities before evaluation", async () => {
    const complete = vi.fn(async () => ({ content: "ok" }));
    const lang = new LangFn({ model: new MockChatModel({ complete }) });
    const evaluator = new Evaluator();
    const metric = createMetric("same", () => true);

    await expect(evaluator.evaluate({
      lang,
      dataset: [{ input: "x", expected: "x" }],
      metrics: [metric, metric]
    })).rejects.toBeInstanceOf(ValidationError);
    await expect(evaluator.compare({
      models: [{ name: "same", lang }, { name: "same", lang }],
      dataset: [{ input: "x", expected: "x" }]
    })).rejects.toBeInstanceOf(ValidationError);
    expect(complete).not.toHaveBeenCalled();
  });

  it("uses collision-safe comparison maps and unique TestFn run IDs", async () => {
    const evaluator = new Evaluator();
    const comparison = await evaluator.compare({
      models: [{ name: "__proto__", lang: new LangFn({ model: new MockChatModel({ responses: ["ok"] }) }) }],
      dataset: [{ input: "x", expected: "ok" }]
    });
    expect(Object.getPrototypeOf(comparison.perModel)).toBeNull();
    expect(comparison.perModel["__proto__"]).toBeInstanceOf(Object);

    const result = comparison.perModel["__proto__"];
    expect(result.toTestFnRun("same").id).not.toBe(result.toTestFnRun("same").id);
  });

  it("fails empty datasets with VALIDATION_ERROR", async () => {
    const evaluator = new Evaluator({ lang: new LangFn({ model: new MockChatModel() }) });
    await expect(evaluator.run([])).rejects.toBeInstanceOf(ValidationError);
  });
});
