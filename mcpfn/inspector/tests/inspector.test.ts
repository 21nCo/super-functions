import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { customTarget } from "@mcpfn/client";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";
import { McpFnTestClient, runScenarios } from "@mcpfn/testing";

import { McpFnInspector } from "../src/index.js";

describe("McpFn inspector", () => {
  it("rejects limits that cannot be represented as safe integers", () => {
    expect(() => McpFnInspector.create({
      inspector: { maxInventoryEntries: Number.MAX_SAFE_INTEGER + 1 },
      target: customTarget({ kind: "unused", open: () => { throw new Error("unused"); } }),
    })).toThrow(/maxInventoryEntries must be a positive safe integer/);
  });

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
        formatVersion: 2,
        clientState: "connected",
        server: { name: "inspected", version: "1.0.0" },
        tools: [{ name: "echo" }],
      });
      const operation = {
        kind: "tools.call" as const,
        name: "echo",
        arguments: {
          access_token: "never-export-me",
          header: "Authorization: Bearer never-export-me",
          callback:
            "https://client.example/callback?access_token=never-export-me",
          literal: "the application returned [REDACTED]",
          value: "safe",
        },
      };
      const result = await inspector.run(operation);
      const bounded = await inspector.snapshot();
      expect(JSON.stringify(bounded)).not.toContain('"clientState":"[REDACTED]"');
      expect(bounded.timeline.length).toBeLessThanOrEqual(3);
      expect(bounded.droppedEvents).toBeGreaterThan(0);
      expect(bounded.timelineComplete).toBe(false);
      const scenario = inspector.exportScenario("echo", operation, result);
      expect(scenario.status).toBeUndefined();
      expect(scenario).toMatchObject({
        kind: "tools.call",
        tool: "echo",
        arguments: {
          access_token: "${MCPFN_SECRET}",
          header: "Authorization: ${MCPFN_SECRET}",
          callback:
            "https://client.example/callback?access_token=%24%7BMCPFN_SECRET%7D",
          literal: "the application returned [REDACTED]",
        },
        variables: ["MCPFN_SECRET"],
        expect: {
          isError: false,
          structuredContent: {
            access_token: "${MCPFN_SECRET}",
            header: "Authorization: ${MCPFN_SECRET}",
            callback:
              "https://client.example/callback?access_token=%24%7BMCPFN_SECRET%7D",
            literal: "the application returned [REDACTED]",
            value: "safe",
          },
        },
      });
      const ordinaryPlaceholders = inspector.exportScenario(
        "ordinary placeholders",
        {
          kind: "tools.call",
          name: "echo",
          arguments: {
            raw: "${ordinary}",
            encoded: "%24%7Borderinary%7D",
          },
        },
        {
          content: [{ type: "text", text: "ok" }],
        },
      );
      expect(ordinaryPlaceholders.variables).toBeUndefined();
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

  it("marks scenario exports incomplete when redaction bounds truncate assertions", () => {
    const inspector = McpFnInspector.create({
      target: customTarget({ kind: "unused", open: () => { throw new Error("unused"); } }),
    });
    let nested: Record<string, unknown> = { value: "retained" };
    for (let index = 0; index < 10; index += 1) nested = { nested };
    const oversizedObject = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`key-${index}`, index]),
    );
    Object.defineProperty(oversizedObject, "unread", {
      enumerable: true,
      get: () => { throw new Error("object value read beyond the export cap"); },
    });
    const replayableLongSecret = inspector.exportScenario(
      "replayable long secret",
      {
        kind: "tools.call",
        name: "echo",
        arguments: { access_token: "x".repeat(2_049) },
      },
      { content: [], structuredContent: { value: "retained" } },
    );
    expect(replayableLongSecret).toMatchObject({
      arguments: { access_token: "${MCPFN_SECRET}" },
      variables: ["MCPFN_SECRET"],
    });
    expect(replayableLongSecret.status).toBeUndefined();
    for (const structuredContent of [
      { value: "x".repeat(2_049) },
      { values: Array.from({ length: 101 }, (_, index) => index) },
      oversizedObject,
      nested,
    ]) {
      expect(inspector.exportScenario(
        "bounded export",
        { kind: "tools.call", name: "echo" },
        { content: [], structuredContent },
      )).toMatchObject({
        status: "incomplete",
        incompleteReason: "Inspector export exceeded redaction bounds and was truncated",
      });
    }
  });

  it("preserves retained timelines above the redactor default array limit", async () => {
    const inspector = McpFnInspector.create({
      inspector: { maxEvents: 150, maxTimelineBytes: 1_000_000 },
      target: customTarget({ kind: "unused", open: () => { throw new Error("unused"); } }),
    });
    const record = (inspector as unknown as {
      record(source: "diagnostic", kind: string, at: string, raw: never): void;
    }).record.bind(inspector);
    for (let index = 0; index < 101; index += 1) {
      record("diagnostic", "capability-operation", new Date(index).toISOString(), {
        phase: "capability-operation",
        outcome: "succeeded",
        at: new Date(index).toISOString(),
      } as never);
    }

    const snapshot = await inspector.snapshot();
    expect(snapshot.timeline).toHaveLength(101);
    expect(snapshot.timeline.every((event) => typeof event === "object")).toBe(true);
    expect(snapshot.timelineComplete).toBe(true);
  });

  it("bounds inventory surfaces and reports every dropped entry", async () => {
    const registry = new McpFnRegistry();
    for (let index = 0; index < 3; index += 1) {
      registry.register({
        name: `tool-${index}`,
        description: `Tool ${index}`,
        inputSchema: { type: "object" },
        handler: async (input) => structuredResult(input),
      });
    }
    const server = createMcpFnServer({
      info: { name: "bounded-inventory", version: "1.0.0" },
      registry,
    });
    const inspector = McpFnInspector.create({
      inspector: { maxInventoryEntries: 2 },
      target: customTarget({
        kind: "bounded-inventory",
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
        tools: [{ name: "tool-0" }, { name: "tool-1" }],
        droppedInventoryEntries: {
          tools: 1,
          resources: 0,
          resourceTemplates: 0,
          prompts: 0,
        },
        inventoryComplete: false,
      });
    } finally {
      await inspector.close();
    }
  });

  it("drops even the truncation marker when it exceeds the byte cap", () => {
    const inspector = McpFnInspector.create({
      inspector: { maxEvents: 1, maxTimelineBytes: 1 },
      target: customTarget({ kind: "unused", open: () => { throw new Error("unused"); } }),
    });
    (inspector as unknown as {
      record(source: "diagnostic", kind: string, at: string, raw: never): void;
    }).record("diagnostic", "oversized", new Date(0).toISOString(), {
      phase: "capability-operation",
      outcome: "succeeded",
      at: new Date(0).toISOString(),
      details: { value: "x".repeat(1_000) },
    } as never);

    expect(inspector.timeline()).toEqual([]);
  });

  it("does not apply custom event redaction again during recording or snapshots", async () => {
    const server = createMcpFnServer({ info: { name: "one-pass", version: "1" }, registry: new McpFnRegistry() });
    const inspector = McpFnInspector.create({ target: customTarget({ kind: "custom",
      redact: <T>(value: T): T => {
        if (value && typeof value === "object" && ("phase" in value || "event" in value)) {
          if ("event" in value || "customRedacted" in value) throw new Error("duplicate redaction");
          return { ...value, customRedacted: true } as T;
        }
        if (value && typeof value === "object" && "timeline" in value && (value as any).timeline.length) throw new Error("duplicate timeline redaction");
        return value;
      }, open: async () => {
        const [client, remote] = InMemoryTransport.createLinkedPair();
        await server.connect(remote);
        return { transport: client, close: () => server.close() };
      },
    }) });
    try {
      await inspector.connect();
      const snapshot = await inspector.snapshot();
      expect(snapshot.timeline.length).toBeGreaterThan(0);
      expect(snapshot.droppedEvents).toBe(0);
      const diagnosticEvents = snapshot.timeline.filter(event => event.source === "diagnostic");
      expect(diagnosticEvents.length).toBeGreaterThan(0);
      expect(diagnosticEvents.every(event => (event.event as any).customRedacted)).toBe(true);
    } finally { await inspector.close(); }
  });

  it("counts non-JSON diagnostics as dropped instead of silently losing them", async () => {
    const server = createMcpFnServer({ info: { name: "bigint", version: "1" }, registry: new McpFnRegistry() });
    const inspector = McpFnInspector.create({ target: customTarget({ kind: "custom",
      redact: <T>(value: T): T => value && typeof value === "object" && "phase" in value
        ? { ...value, details: { amount: 1n } } as T : value,
      open: async () => {
        const [client, remote] = InMemoryTransport.createLinkedPair();
        await server.connect(remote);
        return { transport: client, close: () => server.close() };
      },
    }) });
    try {
      await inspector.connect();
      const report = await inspector.snapshot();
      expect(report.droppedEvents).toBeGreaterThan(0);
      expect(report.timelineComplete).toBe(false);
      expect(() => JSON.stringify(report)).not.toThrow();
    } finally { await inspector.close(); }
  });
});


it("records diagnostic redaction omissions as incomplete timeline evidence", async () => {
  const server = createMcpFnServer({ info: { name: "fixture", version: "1" }, registry: new McpFnRegistry() });
  const inspector = McpFnInspector.create({ target: customTarget({ kind: "custom",
    redact: <T>(value: T): T => {
      if (value && typeof value === "object" && "phase" in value) throw new Error("private-redaction-state");
      return value;
    },
    open: async () => {
      const [client, remote] = InMemoryTransport.createLinkedPair();
      await server.connect(remote);
      return { transport: client, close: () => server.close() };
    },
  }) });
  try {
    await inspector.connect();
    const report = await inspector.snapshot();
    expect(report.timelineComplete).toBe(false);
    expect(report.droppedEvents).toBeGreaterThan(0);
    expect(report.timeline.some(entry => "code" in entry.event && entry.event.code === "MCPFN_DIAGNOSTIC_REDACTION_FAILED")).toBe(true);
    expect(JSON.stringify(report)).not.toContain("private-redaction-state");
  } finally { await inspector.close(); }
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
  const inspector = McpFnInspector.create({ target });
  try {
    await inspector.connect();
    const report = await inspector.snapshot();
    expect(report.timelineComplete).toBe(true);
    expect(report.droppedEvents).toBe(0);
    expect(report.timeline.some(entry => "code" in entry.event && entry.event.code === "MCPFN_DIAGNOSTIC_REDACTION_FAILED")).toBe(true);
  } finally { await inspector.close(); }
});
