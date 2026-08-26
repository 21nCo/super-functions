import { describe, expect, it } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import { createMcpFnClient, customTarget } from "../src/index.js";

describe("McpFn production client", () => {
  it("shares the official session engine and paginates complete inventories", async () => {
    const registry = new McpFnRegistry()
      .register({
        name: "one",
        description: "One.",
        inputSchema: { type: "object", additionalProperties: false },
        handler: async () => structuredResult({ value: 1 }),
      })
      .register({
        name: "two",
        description: "Two.",
        inputSchema: { type: "object", additionalProperties: false },
        handler: async () => structuredResult({ value: 2 }),
      });
    const server = createMcpFnServer({
      info: { name: "client-test", version: "1.0.0" },
      registry,
      pageSize: 1,
    });
    const events: Array<{ phase: string; details?: Record<string, unknown> }> = [];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "in-memory",
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      diagnostics: (event) => events.push(event),
    });

    await client.connect();
    await expect(client.tools.listAll()).resolves.toHaveLength(2);
    await expect(client.tools.call("two")).resolves.toMatchObject({
      structuredContent: { value: 2 },
    });
    expect(client.getServerVersion()).toMatchObject({ name: "client-test" });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "mcp-initialize" }),
      expect.objectContaining({
        phase: "capability-operation",
        details: expect.objectContaining({ operation: "tools/call" }),
      }),
    ]));
    await client.close();
  });

  it("redacts target queries before diagnostics are emitted", async () => {
    const events: unknown[] = [];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "broken",
        descriptor: { url: "https://example.com/mcp?access_token=secret" },
        open: () => { throw new Error("unavailable"); },
      }),
      diagnostics: (event) => events.push(event),
    });
    await expect(client.connect()).rejects.toMatchObject({
      code: "MCPFN_TARGET_OPEN_FAILED",
    });
    expect(JSON.stringify(events)).not.toContain("secret");
    expect(JSON.stringify(events)).toContain("REDACTED");
  });
});
