import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { customTarget } from "@mcpfn/client";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import { runMcpFnTargetSuite } from "../src/index.js";

describe("McpFn target suite", () => {
  it("uses one target/session engine for external-shaped and in-memory targets", async () => {
    const server = createMcpFnServer({
      info: { name: "suite-target", version: "1.0.0" },
      registry: new McpFnRegistry().register({
        name: "echo",
        description: "Echo an input in the shared suite.",
        inputSchema: { type: "object" },
        handler: async (input) => structuredResult(input),
      }),
    });
    const report = await runMcpFnTargetSuite({
      target: customTarget({
        kind: "fixture",
        descriptor: { mode: "external-shaped" },
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      manifest: server.manifest(),
      scenarios: [{
        name: "echo",
        tool: "echo",
        arguments: { value: "ok" },
        expect: { structuredContent: { value: "ok" } },
      }],
    });
    expect(report).toMatchObject({
      ok: true,
      target: { kind: "fixture", mode: "external-shaped" },
      manifestChecked: true,
      total: 1,
      passed: 1,
    });
  });
});
