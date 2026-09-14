import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
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
        descriptor: {
          mode: "external-shaped",
          url: "https://target.example/mcp?api_key=secret#access_token=token",
        },
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
    expect(JSON.stringify(report.target)).not.toContain("secret");
    expect(JSON.stringify(report.target)).not.toContain("access_token=token");
    expect(JSON.stringify(report.target)).toContain("REDACTED");
    expect(report.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: "transport-close", outcome: "succeeded" }),
    ]));
  });

  it("rejects an invalid report cap before opening the target", async () => {
    const open = vi.fn();
    await expect(runMcpFnTargetSuite({
      target: customTarget({ kind: "never-opened", open }),
      maxReportBytes: 1,
    })).rejects.toThrow(/at least 1024/);
    expect(open).not.toHaveBeenCalled();
  });

  it("marks target reports incomplete when observed events exceed the scenario cap", async () => {
    let server: ReturnType<typeof createMcpFnServer>;
    server = createMcpFnServer({
      info: { name: "event-heavy-target", version: "1.0.0" },
      additionalCapabilities: { logging: {} },
      registry: new McpFnRegistry().register({
        name: "notify",
        description: "Emit enough notifications to exercise the event cap.",
        inputSchema: { type: "object" },
        handler: async () => {
          for (let index = 0; index < 5; index += 1) {
            await server.sendLoggingMessage({ level: "info", data: { index } });
          }
          return structuredResult({ ok: true });
        },
      }),
    });

    const report = await runMcpFnTargetSuite({
      target: customTarget({
        kind: "fixture",
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      scenarios: [
        { name: "notify", tool: "notify" },
        {
          name: "drain notifications",
          kind: "auth.assert",
          phase: "drain",
          expect: { outcome: "allowed" },
        },
      ],
      scenarioRun: {
        maxObservedEvents: 2,
        auth: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { outcome: "allowed" };
        },
      },
    });

    expect(report).toMatchObject({
      ok: false,
      status: "incomplete",
      droppedObservedEvents: 3,
      incompleteReason: "Observed client events exceeded maxObservedEvents",
      results: [
        { status: "passed", droppedObservedEvents: 3 },
        { status: "passed" },
      ],
    });
  });
});

it("marks otherwise successful suites incomplete when custom close rejects", async () => {
  const server = createMcpFnServer({ info: { name: "close-failure", version: "1" }, registry: new McpFnRegistry() });
  const report = await runMcpFnTargetSuite({ target: customTarget({ kind: "fixture", open: async () => {
    const [client, remote] = InMemoryTransport.createLinkedPair();
    await server.connect(remote);
    return { transport: client, close: async () => { await server.close(); throw new Error("opaque-cleanup-value"); } };
  } }) });
  expect(report.ok).toBe(false);
  expect(report.incompleteReason).toContain("Target cleanup failed");
  expect(JSON.stringify(report)).not.toContain("opaque-cleanup-value");
});


it.each(["x", "€"])("bounds long target failures under the minimum report cap: %s", async character => {
  const { customTarget } = await import('@mcpfn/client');
  const report = await runMcpFnTargetSuite({ target: customTarget({ kind: 'failure', open: async () => { throw new Error(character.repeat(4000)); } }), maxReportBytes: 1024 });
  expect(report.status).toBe('incomplete');
  expect(Buffer.byteLength(JSON.stringify(report, null, 2))).toBeLessThanOrEqual(1024);
});

it("retains a complete report when only its compact encoding fits", async () => {
  const run = async (maxReportBytes?: number) => {
    const server = createMcpFnServer({ info: { name: "compact", version: "1" }, registry: new McpFnRegistry().register({ name: "echo", description: "Echo", inputSchema: { type: "object" }, handler: async input => structuredResult(input) }) });
    return runMcpFnTargetSuite({ maxReportBytes, target: customTarget({ kind: "compact", open: async () => {
      const [transport, peer] = InMemoryTransport.createLinkedPair();
      await server.connect(peer);
      return { transport, close: () => server.close() };
    } }), scenarios: Array.from({ length: 5 }, (_, i) => ({ name: `echo-${i}`, tool: "echo", arguments: { value: "ok" }, expect: { structuredContent: { value: "ok" } } })) });
  };
  const full = await run();
  const cap = Math.max(1024, new TextEncoder().encode(JSON.stringify(full)).byteLength + 128);
  expect(cap).toBeLessThan(new TextEncoder().encode(JSON.stringify(full, null, 2)).byteLength);
  const bounded = await run(cap);
  expect(bounded.ok).toBe(true);
  expect(bounded.droppedResults).toBe(0);
  expect(new TextEncoder().encode(JSON.stringify(bounded)).byteLength).toBeLessThanOrEqual(cap);
});

it("does not repeat successful custom cleanup after an open failure", async () => {
  const cleanup = vi.fn(async () => {
    if (cleanup.mock.calls.length > 1) throw new Error("cleanup repeated");
  });
  const report = await runMcpFnTargetSuite({ target: customTarget({
    kind: "failed-open", open: async () => { throw new Error("cannot open"); }, cleanup,
  }) });
  expect(report.ok).toBe(false);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(report.incompleteReason).not.toContain("Target cleanup failed");
});
