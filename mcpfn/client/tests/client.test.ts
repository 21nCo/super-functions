import { describe, expect, it, vi } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import { createMcpFnClient, customTarget } from "../src/index.js";
import type { McpFnTransportHandle } from "../src/index.js";

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

  it("aborts a pending open and closes a handle that resolves after close starts", async () => {
    const [clientTransport] = InMemoryTransport.createLinkedPair();
    let targetSignal: AbortSignal | undefined;
    let resolveOpen!: (handle: McpFnTransportHandle) => void;
    const closeHandle = vi.fn(async () => undefined);
    const client = createMcpFnClient({
      target: customTarget({
        kind: "delayed",
        open: (context) => {
          targetSignal = context.signal;
          return new Promise<McpFnTransportHandle>((resolve) => {
            resolveOpen = resolve;
          });
        },
      }),
    });

    const connecting = client.connect();
    const connectResult = expect(connecting).rejects.toMatchObject({
      code: "MCPFN_CONNECT_ABORTED",
    });
    await vi.waitFor(() => expect(targetSignal).toBeDefined());
    const closing = client.close();
    await vi.waitFor(() => expect(targetSignal?.aborted).toBe(true));
    resolveOpen({ transport: clientTransport, close: closeHandle });

    await closing;
    await connectResult;
    expect(closeHandle).toHaveBeenCalledOnce();
    expect(client.state).toBe("closed");
  });

  it("cleans up target and protocol ownership when configure fails", async () => {
    const [clientTransport] = InMemoryTransport.createLinkedPair();
    const closeHandle = vi.fn(async () => undefined);
    const client = createMcpFnClient({
      target: customTarget({
        kind: "configure-failure",
        open: () => ({ transport: clientTransport, close: closeHandle }),
      }),
      configure: async () => {
        throw new Error("configure failed");
      },
    });

    await expect(client.connect()).rejects.toMatchObject({ code: "MCPFN_CONNECT_FAILED" });

    expect(closeHandle).toHaveBeenCalledOnce();
    expect(client.state).toBe("idle");
    expect(client.getServerVersion()).toBeUndefined();
  });

  it("isolates diagnostic observer failures from lifecycle and operation results", async () => {
    let executions = 0;
    const server = createMcpFnServer({
      info: { name: "observer-test", version: "1.0.0" },
      registry: new McpFnRegistry().register({
        name: "mutate",
        description: "Mutate exactly once.",
        inputSchema: { type: "object", additionalProperties: false },
        handler: async () => structuredResult({ executions: ++executions }),
      }),
    });
    const client = createMcpFnClient({
      target: customTarget({
        kind: "in-memory",
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      diagnostics: async () => {
        throw new Error("observer failed");
      },
    });

    await client.connect();
    await expect(client.tools.call("mutate")).resolves.toMatchObject({
      structuredContent: { executions: 1 },
    });
    expect(executions).toBe(1);
    await expect(client.close()).resolves.toBeUndefined();
  });

  it("clears protocol and handle ownership after an unexpected transport close", async () => {
    const server = createMcpFnServer({
      info: { name: "unexpected-close", version: "1.0.0" },
      registry: new McpFnRegistry(),
    });
    const closeHandle = vi.fn(async () => undefined);
    const client = createMcpFnClient({
      target: customTarget({
        kind: "in-memory",
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: closeHandle };
        },
      }),
    });

    await client.connect();
    await server.close();
    await vi.waitFor(() => expect(client.state).toBe("idle"));

    expect(client.getServerVersion()).toBeUndefined();
    expect(closeHandle).toHaveBeenCalledOnce();
    await client.close();
  });
});
