import { McpFnTargetSuiteCleanupError } from "../src/suite.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { customTarget } from "@mcpfn/client";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import { authenticatedHttpTarget, runMcpFnTargetSuite } from "../src/index.js";

describe("McpFn target suite", () => {
  it("fails closed when a primitive credential collides with the fallback report", async () => {
    const secret = "false";
    const error = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget("http://127.0.0.1:1/mcp", {
        credential: { headers: { "x-api-key": secret } },
      }),
    }).catch(failure => failure as Error);

    expect(error.message).toContain("credential conflicts with required artifact structure");
    expect(error.message).not.toContain(secret);
  });

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

  it("distinguishes redaction omissions from observed-event overflow", async () => {
    let server: ReturnType<typeof createMcpFnServer>;
    server = createMcpFnServer({
      info: { name: "redaction-omission-target", version: "1.0.0" },
      additionalCapabilities: { logging: {} },
      registry: new McpFnRegistry().register({
        name: "notify",
        description: "Emit an event whose payload cannot be redacted.",
        inputSchema: { type: "object" },
        handler: async () => {
          await server.sendLoggingMessage({ level: "info", data: { privateRedactionState: true } });
          return structuredResult({ ok: true });
        },
      }),
    });
    const report = await runMcpFnTargetSuite({
      target: customTarget({
        kind: "fixture",
        redact: <T>(value: T): T => {
          const data = value && typeof value === "object"
            ? (value as { data?: unknown }).data
            : undefined;
          if (data && typeof data === "object" && "privateRedactionState" in data) {
            throw new Error("event redaction unavailable");
          }
          return value;
        },
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      scenarios: [{ name: "notify", tool: "notify" }],
    });
    expect(report).toMatchObject({
      ok: false,
      status: "incomplete",
      droppedObservedEvents: 1,
      redactionOmittedObservedEvents: 1,
      incompleteReason: "Observed client events were omitted because credential redaction failed",
      results: [{ status: "passed", redactionOmittedObservedEvents: 1 }],
    });
    expect(report.incompleteReason).not.toContain("maxObservedEvents");
  });

  it("counts redaction omissions emitted before scenarios start", async () => {
    const server = new Server(
      { name: "setup-omission", version: "1.0.0" },
      { capabilities: { logging: {}, tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      await server.sendLoggingMessage({
        level: "info",
        data: { privateSetupState: true },
      });
      return { tools: [] };
    });
    const report = await runMcpFnTargetSuite({
      expectedToolNames: [],
      target: customTarget({
        kind: "fixture",
        redact: <T>(value: T): T => {
          const data = value && typeof value === "object"
            ? (value as { data?: unknown }).data
            : undefined;
          if (data && typeof data === "object" && "privateSetupState" in data) {
            throw new Error("setup event redaction unavailable");
          }
          return value;
        },
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
    });

    expect(report).toMatchObject({
      ok: false,
      status: "incomplete",
      total: 0,
      droppedObservedEvents: 1,
      redactionOmittedObservedEvents: 1,
      incompleteReason: "Observed client events were omitted because credential redaction failed",
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

it("proves a target-supplied failure phase safe before emitting it", async () => {
  const report = await runMcpFnTargetSuite({ target: customTarget({
    kind: "failed-open",
    redact: <T>(value: T): T => value instanceof Error
      ? { name: value.name, message: value.message, phase: "vendor-phase" } as T
      : value,
    open: async () => { throw new Error("cannot open"); },
  }) });
  expect(report).toMatchObject({
    ok: false,
    status: "incomplete",
    failure: { phase: "vendor-phase" },
  });
});

it("rejects a target-supplied failure phase that its redactor cannot prove safe", async () => {
  const phase = "vendor-phase";
  await expect(runMcpFnTargetSuite({ target: customTarget({
    kind: "failed-open",
    redact: <T>(value: T): T => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, phase } as T;
      }
      return (value === phase ? "[REDACTED]" : value) as T;
    },
    open: async () => { throw new Error("cannot open"); },
  }) })).rejects.toThrow("credential conflicts with required artifact structure");
});


it.each(["metadata", "failure"])("applies custom target redaction to finalized suite %s", async mode => {
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
  }
});

it("rejects a typed report when the live custom redactor cannot prove structure safe", async () => {
  const secret = "custom-owned-secret";
  await expect(runMcpFnTargetSuite({
    target: customTarget({
      kind: "custom",
      redact: <T>(): T => { throw new Error(secret); },
      open: async () => { throw new Error("cannot open"); },
    }),
  })).rejects.toThrow("credential conflicts with required artifact structure");
});

it("fails a custom target report closed when its dynamic kind conflicts with redaction", async () => {
  const secretKind = "custom-kind-owned-secret";
  const server = createMcpFnServer({
    info: { name: "kind-collision", version: "1.0.0" },
    registry: new McpFnRegistry(),
  });
  const target = customTarget({
    kind: secretKind,
    redact: <T>(value: T): T => JSON.parse(
      JSON.stringify(value).replaceAll(secretKind, "[REDACTED]"),
    ) as T,
    open: async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      return { transport: clientTransport, close: () => server.close() };
    },
  });

  const report = await runMcpFnTargetSuite({ target });

  expect(report).toMatchObject({
    ok: false,
    status: "incomplete",
    target: { kind: "custom" },
  });
  expect(report.incompleteReason).toContain("Credential redaction");
  expect(JSON.stringify(report)).not.toContain(secretKind);
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
  expect(error.message).not.toContain(secret);
  expect(JSON.stringify(error.report)).not.toContain(secret);
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

it.each(["complete", "passed"])("rejects suite structure when a custom secret is %s", async secret => {
  const server = createMcpFnServer({ info: { name: secret, version: "1" }, registry: new McpFnRegistry() });
  await expect(runMcpFnTargetSuite({ target: customTarget({ kind: "custom", descriptor: { label: secret },
    redact: <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(secret, "[REDACTED]")),
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    },
  }) })).rejects.toThrow("credential conflicts with required artifact structure");
});

it("uses payload redaction for standalone suite projections", async () => {
  const secret = "scenario-secret";
  const server = createMcpFnServer({
    info: { name: secret, version: "1" },
    registry: new McpFnRegistry().register({
      name: secret,
      description: "Fixture tool",
      inputSchema: { type: "object" },
      handler: async () => structuredResult({ ok: true }),
    }),
  });
  const modes: Array<boolean | undefined> = [];
  const report = await runMcpFnTargetSuite({
    target: customTarget({
      kind: "custom",
      descriptor: { label: secret },
      redact: <T>(value: T, options?: { preserveKeys?: boolean }): T => {
        modes.push(options?.preserveKeys);
        if (options?.preserveKeys !== false) return value;
        return JSON.parse(JSON.stringify(value).replaceAll(secret, "[REDACTED]")) as T;
      },
      open: async () => {
        const [client, remote] = InMemoryTransport.createLinkedPair();
        await server.connect(remote);
        return { transport: client, close: () => server.close() };
      },
    }),
    scenarios: [{ name: secret, tool: secret }],
  });

  expect(modes).toContain(false);
  expect(report.status).toBe("complete");
  expect(report.results[0]).toMatchObject({
    status: "passed",
    name: "[REDACTED]",
    tool: "[REDACTED]",
  });
  expect(report.server?.name).toBe("[REDACTED]");
  expect(report.target.label).toBe("[REDACTED]");
});

it("rejects a pre-connect fallback whose emitted structure conflicts with custom redaction", async () => {
  const secret = "incomplete";
  const error = await runMcpFnTargetSuite({
    target: customTarget({
      kind: "custom",
      redact: <T>(value: T): T => JSON.parse(
        JSON.stringify(value).replaceAll(secret, "[REDACTED]"),
      ) as T,
      open: async () => { throw new Error("connection failed"); },
    }),
  }).catch(error => error);

  expect(error).toMatchObject({
    name: "McpFnClientError",
    message: expect.stringContaining("credential conflicts with required artifact structure"),
  });
  expect(error.message).not.toContain(secret);
  expect(JSON.stringify(error)).not.toContain(secret);
});

it("delivers diagnostics after exactly one custom redaction and bounds their retained bytes", async () => {
  const server = createMcpFnServer({ info: { name: "diagnostics", version: "1" }, registry: new McpFnRegistry() });
  const observed: unknown[] = [];
  let redactionCalls = 0;
  const report = await runMcpFnTargetSuite({ maxReportBytes: 1024,
    client: { diagnostics: event => { observed.push(event); } },
    target: customTarget({ kind: "custom", redact: <T>(value: T): T => {
      if (value && typeof value === "object" && "large" in value) {
        if ("redactionCount" in value) throw new Error("duplicate redaction");
        redactionCalls += 1;
        return { ...value, redactionCount: 1 } as T;
      }
      return value;
    }, open: async context => {
      await context.diagnostic({
        phase: "capability-operation", outcome: "succeeded",
        requestId: context.requestId, at: new Date().toISOString(),
        target: { kind: "custom" }, details: { large: "x".repeat(6000) },
      });
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    } }),
  });
  expect(observed.length).toBeGreaterThan(0);
  expect(redactionCalls).toBe(1);
  expect(observed.some(event =>
    (event as { details?: { redactionCount?: number } }).details?.redactionCount === 1,
  )).toBe(true);
  expect(report.droppedTimelineEvents).toBeGreaterThan(0);
  expect(report.incompleteReason).toContain("maxReportBytes");
  expect(report.incompleteReason).not.toContain("maxTimelineEvents");
  expect(report.timeline.length).toBeLessThan(observed.length);
  expect(Buffer.byteLength(JSON.stringify(report))).toBeLessThanOrEqual(1024);
});


it.each([1n, () => undefined, Symbol("diagnostic"), undefined, NaN, Infinity])("marks unserializable diagnostic data as dropped and incomplete (%s)", async amount => {
  const server = createMcpFnServer({ info: { name: "bigint", version: "1" }, registry: new McpFnRegistry().register({ name: "echo", description: "Fixture", inputSchema: { type: "object" }, handler: async () => structuredResult({ ok: true }) }) });
  const report = await runMcpFnTargetSuite({ scenarios: [{ name: "retained", tool: "echo" }], target: customTarget({ kind: "custom",
    open: async context => {
      await context.diagnostic({
        phase: "capability-operation", outcome: "succeeded",
        requestId: context.requestId, at: new Date().toISOString(),
        target: { kind: "custom" }, details: { amount },
      });
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


it.each([
  { name: "Map", amount: new Map([["key", "evidence"]]) },
  { name: "Set", amount: new Set(["evidence"]) },
])("preserves $name diagnostic evidence in JSON", async ({ amount }) => {
  const server = createMcpFnServer({ info: { name: "containers", version: "1" }, registry: new McpFnRegistry().register({ name: "echo", description: "Fixture", inputSchema: { type: "object" }, handler: async () => structuredResult({ ok: true }) }) });
  const report = await runMcpFnTargetSuite({ scenarios: [{ name: "retained", tool: "echo" }], target: customTarget({ kind: "custom",
    open: async context => {
      await context.diagnostic({
        phase: "capability-operation", outcome: "succeeded",
        requestId: context.requestId, at: new Date().toISOString(),
        target: { kind: "custom" }, details: { amount },
      });
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
  expect(persisted.timeline.find((event: { details?: { amount?: unknown } }) =>
    event.details?.amount !== undefined,
  )?.details.amount).toEqual(expected);
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

it("closes a connected target when its kind getter throws during projection fallback", async () => {
  const server = createMcpFnServer({ info: { name: "fixture", version: "1" }, registry: new McpFnRegistry() });
  const close = vi.fn(() => server.close());
  let opened = false;
  let postOpenKindReads = 0;
  const target = customTarget({ kind: "custom", open: async () => {
    const [client, remote] = InMemoryTransport.createLinkedPair();
    await server.connect(remote);
    opened = true;
    return { transport: client, close };
  } });
  Object.defineProperty(target, "kind", {
    configurable: true,
    get: () => {
      if (opened) {
        postOpenKindReads += 1;
        throw new Error("hostile-kind-getter");
      }
      return "custom";
    },
  });

  const report = await runMcpFnTargetSuite({ target });

  expect(close).toHaveBeenCalledOnce();
  expect(postOpenKindReads).toBeGreaterThan(0);
  expect(report.status).toBe("complete");
  expect(JSON.stringify(report)).not.toContain("hostile-kind-getter");
});


it("marks reports incomplete when post-close credential redaction is unavailable", async () => {
  let released = false;
  const server = createMcpFnServer({ info: { name: "fixture", version: "1" }, registry: new McpFnRegistry() });
  const report = await runMcpFnTargetSuite({ target: customTarget({ kind: "custom",
    redact: <T>(value: T): T => { if (released) throw new Error("private-redaction-state"); return value; },
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: async () => { await server.close(); released = true; } };
    },
  }) });
  expect(released).toBe(true);
  expect(report.status).toBe("incomplete");
  expect(report.ok).toBe(false);
  expect(report.failure).toBeUndefined();
  expect(report.droppedTimelineEvents).toBeGreaterThan(0);
  expect(report.incompleteReason).toContain("redaction failed");
  expect(report.timeline.some(event => event.code === "MCPFN_DIAGNOSTIC_REDACTION_FAILED")).toBe(false);
  expect(JSON.stringify(report)).not.toContain("private-redaction-state");
});


it("does not count a target-authored diagnostic code collision as an omission", async () => {
  const server = createMcpFnServer({ info: { name: "fixture", version: "1" }, registry: new McpFnRegistry() });
  const target = customTarget({ kind: "custom", open: async context => {
    await context.diagnostic({ phase: "capability-operation", outcome: "succeeded",
      code: "MCPFN_DIAGNOSTIC_REDACTION_FAILED", requestId: context.requestId,
      at: new Date().toISOString(), target: { kind: "custom" }, details: { message: "Target-authored status" },
    });
    const [client, remote] = InMemoryTransport.createLinkedPair();
    await server.connect(remote);
    return { transport: client, close: () => server.close() };
  } });
  const report = await runMcpFnTargetSuite({ target });
  expect(report.ok).toBe(true);
  expect(report.status).toBe("complete");
  expect(report.droppedTimelineEvents).toBe(0);
  expect(report.timeline.some(event => event.code === "MCPFN_DIAGNOSTIC_REDACTION_FAILED")).toBe(true);
});
