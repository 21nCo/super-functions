import { McpFnTargetSuiteCleanupError } from "../src/suite.js";
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
  } }) }).then(() => { throw new Error("Expected cleanup rejection"); }, error => {
      expect(error).toBeInstanceOf(McpFnTargetSuiteCleanupError);
      return (error as McpFnTargetSuiteCleanupError).report;
    });
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


it.each(["metadata", "failure", "throwing-redactor"])("applies custom target redaction to finalized suite %s", async mode => {
  const secret = "custom-owned-secret";
  const server = createMcpFnServer({
    info: { name: secret, version: "1.0.0" },
    registry: new McpFnRegistry().register({
      name: "visible-tool", description: "Fixture tool", inputSchema: { type: "object" },
      handler: async () => structuredResult({ ok: true }),
    }),
  });
  const target = customTarget({
    kind: "custom",
    descriptor: { label: secret },
    redact: <T>(value: T): T => {
      if (mode === "throwing-redactor") throw new Error(secret);
      const plain = value instanceof Error ? { name: value.name, message: value.message } : value;
      return JSON.parse(JSON.stringify(plain).replaceAll(secret, "[REDACTED]")) as T;
    },
    open: async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      return { transport: clientTransport, close: () => server.close() };
    },
  });
  const report = await runMcpFnTargetSuite({
    target,
    ...(mode === "failure" ? { expectedToolNames: [secret] } : {}),
  });
  expect(JSON.stringify(report)).not.toContain(secret);
  if (mode === "metadata") {
    expect(report.ok).toBe(true);
    expect(report.server?.name).toBe("[REDACTED]");
    expect(report.target.label).toBe("[REDACTED]");
  } else if (mode === "failure") {
    expect(report.ok).toBe(false);
    expect(report.failure?.message).toContain("[REDACTED]");
  } else {
    expect(report.status).toBe("incomplete");
    expect(report.server).toBeUndefined();
    expect(report.timeline).toEqual([]);
  }
});


it("transfers failed shutdown ownership and serializes safe cleanup retries", async () => {
  const secret = "private-cleanup-secret";
  const server = createMcpFnServer({ info: { name: "cleanup", version: "1" }, registry: new McpFnRegistry() });
  let fail = true;
  const close = vi.fn(async () => { if (fail) throw new Error(secret); await server.close(); });
  const target = customTarget({ kind: "custom", open: async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    return { transport: clientTransport, close };
  } });
  const error = await runMcpFnTargetSuite({ target }).catch(error => error);
  expect(error).toBeInstanceOf(McpFnTargetSuiteCleanupError);
  expect(error.report.ok).toBe(false);
  expect(JSON.stringify(error)).not.toContain(secret);
  const first = error.retryCleanup();
  expect(error.retryCleanup()).toBe(first);
  await expect(first).rejects.toBe(error);
  fail = false;
  await Promise.all([error.retryCleanup(), error.retryCleanup()]);
  const calls = close.mock.calls.length;
  await error.retryCleanup();
  expect(close).toHaveBeenCalledTimes(calls);
  expect(error.report.ok).toBe(false); // Immutable historical failure evidence.
});

it.each(["complete", "passed"])("keeps suite structure when a custom secret is %s", async secret => {
  const server = createMcpFnServer({ info: { name: secret, version: "1" }, registry: new McpFnRegistry() });
  const report = await runMcpFnTargetSuite({ target: customTarget({ kind: "custom", descriptor: { label: secret },
    redact: <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(secret, "[REDACTED]")),
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    },
  }) });
  expect(report.status).toBe("complete");
  expect(report.kind).toBe("mcpfn.target-suite-report");
  expect(report.passed).toBe(0);
  expect(report.server?.name).toBe("[REDACTED]");
  expect(report.target.label).toBe("[REDACTED]");
});

it("delivers diagnostics after exactly one custom redaction and bounds their retained bytes", async () => {
  const server = createMcpFnServer({ info: { name: "diagnostics", version: "1" }, registry: new McpFnRegistry() });
  const observed: unknown[] = [];
  const report = await runMcpFnTargetSuite({ maxReportBytes: 4096,
    client: { diagnostics: event => { observed.push(event); } },
    target: customTarget({ kind: "custom", redact: <T>(value: T): T => {
      if (value && typeof value === "object" && "phase" in value) {
        if ("redactionCount" in value) throw new Error("duplicate redaction");
        return { ...value, redactionCount: 1, details: { large: "x".repeat(6000) } } as T;
      }
      return value;
    }, open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    } }),
  });
  expect(observed.length).toBeGreaterThan(0);
  expect(observed.every(event => (event as { redactionCount: number }).redactionCount === 1)).toBe(true);
  expect(report.droppedTimelineEvents).toBeGreaterThan(0);
  expect(report.incompleteReason).toContain("maxReportBytes");
  expect(report.incompleteReason).not.toContain("maxTimelineEvents");
  expect(report.timeline.length).toBeLessThan(observed.length);
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(4096);
});


it.each([1n, () => undefined, Symbol("diagnostic"), undefined, NaN, Infinity])("marks unserializable diagnostic data as dropped and incomplete (%s)", async amount => {
  const server = createMcpFnServer({ info: { name: "bigint", version: "1" }, registry: new McpFnRegistry().register({ name: "echo", description: "Fixture", inputSchema: { type: "object" }, handler: async () => structuredResult({ ok: true }) }) });
  const report = await runMcpFnTargetSuite({ scenarios: [{ name: "retained", tool: "echo" }], target: customTarget({ kind: "custom",
    redact: <T>(value: T): T => value && typeof value === "object" && "phase" in value
      ? { ...value, details: { amount } } as T : value,
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    },
  }) });
  expect(report.status).toBe("incomplete");
  expect(report.results).toHaveLength(1);
  expect(report.results[0].status).toBe("passed");
  expect(report.droppedTimelineEvents).toBeGreaterThan(0);
  expect(report.incompleteReason).toContain("non-JSON data");
  expect(() => JSON.stringify(report)).not.toThrow();
});


it("scrubs custom metadata while the target still owns its credential state", async () => {
  const secret = "ephemeral-secret";
  let credential: string | undefined = secret;
  const server = createMcpFnServer({ info: { name: secret, version: "1" }, registry: new McpFnRegistry() });
  const report = await runMcpFnTargetSuite({ target: customTarget({ kind: "custom", descriptor: { label: secret },
    redact: <T>(value: T): T => credential ? JSON.parse(JSON.stringify(value).replaceAll(credential, "[REDACTED]")) : value,
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: async () => { credential = undefined; await server.close(); } };
    },
  }) });
  expect(credential).toBeUndefined();
  expect(report.ok).toBe(true);
  expect(report.server?.name).toBe("[REDACTED]");
  expect(report.target.label).toBe("[REDACTED]");
  expect(JSON.stringify(report)).not.toContain(secret);
});


it.each([new Map([["key", "evidence"]]), new Set(["evidence"])])("preserves container diagnostic evidence in JSON (%s)", async amount => {
  const server = createMcpFnServer({ info: { name: "containers", version: "1" }, registry: new McpFnRegistry().register({ name: "echo", description: "Fixture", inputSchema: { type: "object" }, handler: async () => structuredResult({ ok: true }) }) });
  const report = await runMcpFnTargetSuite({ scenarios: [{ name: "retained", tool: "echo" }], target: customTarget({ kind: "custom",
    redact: <T>(value: T): T => value && typeof value === "object" && "phase" in value
      ? { ...value, details: { amount } } as T : value,
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    },
  }) });
  expect(report.status).toBe("complete");
  expect(report.results).toHaveLength(1);
  expect(report.results[0].status).toBe("passed");
  expect(report.droppedTimelineEvents).toBe(0);
  const persisted = JSON.parse(JSON.stringify(report));
  const expected = amount instanceof Map
    ? { type: "Map", entries: [["key", "evidence"]] }
    : { type: "Set", values: ["evidence"] };
  expect(persisted.timeline[0].details.amount).toEqual(expected);
  expect(() => JSON.stringify(report)).not.toThrow();
});


it.each(["stdio", "streamable-http", "authenticated-streamable-http"])("preserves %s connection failure with an unchecked manifest", async kind => {
  const server = createMcpFnServer({ info: { name: "manifest", version: "1" }, registry: new McpFnRegistry() });
  const report = await runMcpFnTargetSuite({ manifest: server.manifest(), target: customTarget({ kind,
    open: async () => { throw new Error("Connection refused"); },
  }) });
  expect(report.target.kind).toBe(kind);
  expect(report.manifestChecked).toBe(false);
  expect(report.manifestHash).toBeUndefined();
  expect(report.failure?.phase).toBe("transport-connect");
  expect(report.incompleteReason).not.toContain("serialization");
  expect(report.ok).toBe(false);
});

it.each(["throw", "proxy"])("fails closed for a hostile live descriptor (%s)", async mode => {
  const secret = "hostile-live-descriptor-secret";
  const server = createMcpFnServer({ info: { name: "fixture", version: "1" }, registry: new McpFnRegistry() });
  const close = vi.fn(() => server.close());
  const target = customTarget({ kind: "custom", open: async () => {
    const [client, remote] = InMemoryTransport.createLinkedPair();
    await server.connect(remote);
    return { transport: client, close };
  } });
  target.describe = () => {
    if (mode === "throw") throw new Error(secret);
    return new Proxy({ kind: "custom" }, { ownKeys() { throw new Error(secret); } });
  };
  const report = await runMcpFnTargetSuite({ target });
  expect(close).toHaveBeenCalledOnce();
  expect(report).toMatchObject({ ok: false, status: "incomplete", target: { kind: "custom" }, results: [], timeline: [] });
  expect(report.incompleteReason).toContain("safe serialization failed");
  expect(JSON.stringify(report)).not.toContain(secret);
});
