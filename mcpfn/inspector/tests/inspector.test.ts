import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { customTarget } from "@mcpfn/client";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";
import { McpFnTestClient, runScenarios } from "@mcpfn/testing";

import { McpFnInspector } from "../src/index.js";

describe("McpFn inspector", () => {
  it("inventories and runs a server through the production session engine", async () => {
    const createServer = () => createMcpFnServer({
      info: { name: "inspected", version: "1.0.0" },
      registry: new McpFnRegistry().register({
        name: "echo",
        description: "Echo an inspected input.",
        inputSchema: { type: "object" },
        handler: async (input) => structuredResult(input),
      }),
    });
    const server = createServer();
    const inspector = McpFnInspector.create({
      inspector: { maxEvents: 3, maxTimelineBytes: 100_000 },
      target: customTarget({
        kind: "in-memory",
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
    });
    await inspector.connect();
    try {
      await expect(inspector.snapshot()).resolves.toMatchObject({
        server: { name: "inspected", version: "1.0.0" },
        tools: [{ name: "echo" }],
      });
      const operation = {
        kind: "tools.call" as const,
        name: "echo",
        arguments: { access_token: "never-export-me", value: "safe" },
      };
      const result = await inspector.run(operation);
      const bounded = await inspector.snapshot();
      expect(bounded.timeline.length).toBeLessThanOrEqual(3);
      expect(bounded.droppedEvents).toBeGreaterThan(0);
      expect(bounded.timelineComplete).toBe(false);
      const scenario = inspector.exportScenario("echo", operation, result);
      expect(scenario).toMatchObject({
        kind: "tools.call",
        tool: "echo",
        arguments: { access_token: "${MCPFN_SECRET}" },
        variables: ["MCPFN_SECRET"],
        expect: {
          isError: false,
          structuredContent: { access_token: "${MCPFN_SECRET}", value: "safe" },
        },
      });
      const runner = await McpFnTestClient.connect(createServer());
      try {
        await expect(runScenarios(runner, [scenario], {
          variables: { MCPFN_SECRET: "never-export-me" },
        })).resolves.toMatchObject([
          { name: "echo", operation: "tools.call", status: "passed" },
        ]);
      } finally {
        await runner.close();
      }
    } finally {
      await inspector.close();
    }
  });
});
