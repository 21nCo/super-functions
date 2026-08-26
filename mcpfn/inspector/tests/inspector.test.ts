import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { customTarget } from "@mcpfn/client";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import { McpFnInspector } from "../src/index.js";

describe("McpFn inspector", () => {
  it("inventories and runs a server through the production session engine", async () => {
    const server = createMcpFnServer({
      info: { name: "inspected", version: "1.0.0" },
      registry: new McpFnRegistry().register({
        name: "echo",
        description: "Echo an inspected input.",
        inputSchema: { type: "object" },
        handler: async (input) => structuredResult(input),
      }),
    });
    const inspector = McpFnInspector.create({
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
      expect(inspector.exportScenario("echo", operation, result))
        .toMatchObject({ operation: { arguments: { access_token: "${MCPFN_SECRET}" } } });
    } finally {
      await inspector.close();
    }
  });
});
