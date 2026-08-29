import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import { describe, expect, it } from "vitest";

import { McpFnRegistry, defineMcpFnServer, structuredResult } from "../src/index.js";

describe("McpFn server declarations", () => {
  it("uses one declaration for manifests and runtime construction", () => {
    const declaration = defineMcpFnServer({
      info: { name: "minimal", version: "1.0.0" },
      transports: ["stdio", "streamable-http"],
      tools: [{
        name: "ping",
        description: "Return a pong.",
        inputSchema: { type: "object", additionalProperties: false },
        handler: async () => structuredResult({ pong: true }),
      }],
    });

    expect(declaration.manifest()).toMatchObject({
      server: { name: "minimal", version: "1.0.0" },
      transports: ["stdio", "streamable-http"],
      tools: [{ name: "ping" }],
    });
    expect(declaration.createServer().registry.listTools()).toMatchObject([
      { name: "ping" },
    ]);
    expect(declaration.createServer().manifest()).toEqual(declaration.manifest());
  });

  it("keeps declared capabilities identical in manifest and runtime", () => {
    const declaration = defineMcpFnServer({
      info: { name: "capable", version: "1.0.0" },
      capabilities: { logging: {} },
    });

    expect(declaration.manifest().capabilities).toEqual({ logging: {} });
    expect(declaration.createServer().manifest()).toEqual(declaration.manifest());
    expect(() => declaration.createServer({
      additionalCapabilities: { completions: {} },
    } as never)).toThrow(/configured on defineMcpFnServer/);
  });

  it("does not mutate a supplied registry when declaration definitions are added", () => {
    const registry = new McpFnRegistry().register({
      name: "existing",
      description: "An existing tool.",
      inputSchema: { type: "object" },
      handler: async () => structuredResult({ ok: true }),
    });
    const declaration = defineMcpFnServer({
      info: { name: "composed", version: "1.0.0" },
      registry,
      tools: [{
        name: "added",
        description: "An added tool.",
        inputSchema: { type: "object" },
        handler: async () => structuredResult({ ok: true }),
      }],
    });

    expect(registry.listTools().map(({ name }) => name)).toEqual(["existing"]);
    expect(declaration.registry.listTools().map(({ name }) => name)).toEqual([
      "added",
      "existing",
    ]);
  });

  it("keeps task-store capability flags identical in manifest and runtime", () => {
    const declaration = defineMcpFnServer({
      info: { name: "tasks", version: "1.0.0" },
      tools: [{
        name: "deferred",
        description: "Run work through a task.",
        inputSchema: { type: "object" },
        execution: { taskSupport: "required" },
        handler: async () => structuredResult({ ok: true }),
        taskHandler: {
          createTask: async (_input, _context, extra) => {
            const task = await extra.taskStore.createTask({ pollInterval: 1 });
            return { task };
          },
        },
      }],
    });

    const server = declaration.createServer({ taskStore: new InMemoryTaskStore() });
    expect(declaration.manifest().capabilities.tasks).toMatchObject({
      requests: { tools: { call: {} } },
      list: {},
      cancel: {},
    });
    expect(server.manifest()).toEqual(declaration.manifest());
  });
});
