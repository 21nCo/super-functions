import { describe, expect, it, vi } from "vitest";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import { createMcpFnClient, customTarget } from "../src/index.js";
import type { McpFnTransportHandle } from "../src/index.js";

describe("McpFn production client", () => {
  it("omits credential-colliding timestamps without emitting malformed artifacts", async () => {
    const credentialTimestamp = "2001-02-03T04:05:06.007Z";
    const events: any[] = [];
    const diagnostics: any[] = [];
    const client = createMcpFnClient({
      clock: () => new Date(credentialTimestamp),
      target: customTarget({
        kind: "custom",
        open: async () => { throw new Error("unused"); },
        redact: <T>(value: T): T => JSON.parse(JSON.stringify(value)
          .replaceAll(credentialTimestamp, "")) as T,
      }),
      events: event => { events.push(event); },
      diagnostics: event => { diagnostics.push(event); },
    });
    const emitEvent = (client as unknown as {
      emitEvent(kind: "logging.message", payload: unknown): Promise<void>;
    }).emitEvent.bind(client);
    const dispatch = (client as unknown as {
      dispatch(event: {
        phase: "capability-operation";
        outcome: "failed";
        requestId: string;
        at: string;
        target: { kind: string };
      }): Promise<void>;
    }).dispatch.bind(client);

    await emitEvent("logging.message", { message: "safe" });
    await dispatch({
      phase: "capability-operation",
      outcome: "failed",
      requestId: "request",
      at: credentialTimestamp,
      target: { kind: "custom" },
    });

    expect(events).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    for (const artifact of [...events, ...diagnostics]) {
      expect(client.isRedactionOmission(artifact)).toBe(true);
      expect(new Date(artifact.at).toISOString()).toBe(artifact.at);
      expect(JSON.stringify(artifact)).not.toContain(credentialTimestamp);
    }
    expect(client.getRedactionOmissionCounts()).toEqual({
      clientEvents: 1,
      diagnostics: 1,
    });
  });

  it("drops timestamp omissions when every valid ISO timestamp is unsafe", async () => {
    const events: any[] = [];
    const diagnostics: any[] = [];
    const client = createMcpFnClient({
      clock: () => new Date(0),
      target: customTarget({
        kind: "custom",
        open: async () => { throw new Error("unused"); },
        redact: <T>(value: T): T => JSON.parse(JSON.stringify(value)
          .replaceAll("T", "")) as T,
      }),
      events: event => { events.push(event); },
      diagnostics: event => { diagnostics.push(event); },
    });
    const emitEvent = (client as unknown as {
      emitEvent(kind: "logging.message", payload: unknown): Promise<void>;
    }).emitEvent.bind(client);
    const dispatch = (client as unknown as {
      dispatch(event: {
        phase: "capability-operation";
        outcome: "failed";
        requestId: string;
        at: string;
        target: { kind: string };
      }): Promise<void>;
    }).dispatch.bind(client);

    await emitEvent("logging.message", { message: "safe" });
    await dispatch({
      phase: "capability-operation",
      outcome: "failed",
      requestId: "request",
      at: new Date(0).toISOString(),
      target: { kind: "custom" },
    });

    expect(events).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(client.getRedactionOmissionCounts()).toEqual({
      clientEvents: 1,
      diagnostics: 1,
    });
  });

  it("emits marked safe omissions when credentials collide with envelope discriminators", async () => {
    const events: any[] = [];
    const diagnostics: any[] = [];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "custom",
        open: async () => { throw new Error("unused"); },
        redact: <T>(value: T): T => JSON.parse(JSON.stringify(value)
          .replaceAll("logging.message", "")
          .replaceAll("failed", "")) as T,
      }),
      events: event => { events.push(event); },
      diagnostics: event => { diagnostics.push(event); },
    });
    const emitEvent = (client as unknown as {
      emitEvent(kind: "logging.message", payload: unknown): Promise<void>;
    }).emitEvent.bind(client);
    const dispatch = (client as unknown as {
      dispatch(event: {
        phase: "capability-operation";
        outcome: "failed";
        requestId: string;
        at: string;
        target: { kind: string };
      }): Promise<void>;
    }).dispatch.bind(client);

    await emitEvent("logging.message", { message: "safe" });
    await dispatch({
      phase: "capability-operation",
      outcome: "failed",
      requestId: "request",
      at: new Date().toISOString(),
      target: { kind: "custom" },
    });

    expect(events).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    expect(client.isRedactionOmission(events[0])).toBe(true);
    expect(client.isRedactionOmission(diagnostics[0])).toBe(true);
    expect(JSON.stringify({ events, diagnostics })).not.toContain("logging.message");
    expect(JSON.stringify({ events, diagnostics })).not.toContain("failed");
  });

  it("omits artifacts when a credential collides with the target kind value", async () => {
    const secret = "target-owned-kind";
    const events: any[] = [];
    const diagnostics: any[] = [];
    const client = createMcpFnClient({
      target: customTarget({
        kind: secret,
        open: async () => { throw new Error("unused"); },
        redact: <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(secret, "")) as T,
      }),
      events: event => { events.push(event); },
      diagnostics: event => { diagnostics.push(event); },
    });
    const emitEvent = (client as any).emitEvent.bind(client);
    const dispatch = (client as any).dispatch.bind(client);

    await emitEvent("logging.message", { message: "safe" });
    await dispatch({
      phase: "capability-operation", outcome: "failed", requestId: "request",
      at: new Date(0).toISOString(), target: { kind: secret },
    });

    expect(events).toHaveLength(1);
    expect(diagnostics).toHaveLength(1);
    expect(client.isRedactionOmission(events[0])).toBe(true);
    expect(client.isRedactionOmission(diagnostics[0])).toBe(true);
    expect(JSON.stringify({ events, diagnostics })).not.toContain(secret);
    expect(client.getRedactionOmissionCounts()).toEqual({ clientEvents: 1, diagnostics: 1 });
  });

  it("drops artifacts when a credential collides with the target discriminator key", async () => {
    const events: any[] = [];
    const diagnostics: any[] = [];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "custom",
        open: async () => { throw new Error("unused"); },
        redact: <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll("kind", "")) as T,
      }),
      events: event => { events.push(event); },
      diagnostics: event => { diagnostics.push(event); },
    });
    const emitEvent = (client as any).emitEvent.bind(client);
    const dispatch = (client as any).dispatch.bind(client);

    await emitEvent("logging.message", { message: "safe" });
    await dispatch({
      phase: "capability-operation", outcome: "failed", requestId: "request",
      at: new Date(0).toISOString(), target: { kind: "custom" },
    });

    expect(events).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(client.getRedactionOmissionCounts()).toEqual({ clientEvents: 1, diagnostics: 1 });
  });

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
    await expect(client.tools.listBounded(1)).resolves.toMatchObject({
      items: [{ name: "one" }],
      droppedItems: 1,
      complete: false,
    });
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

  it("rejects repeated inventory cursors and enforces the overall page cap", async () => {
    const server = createMcpFnServer({
      info: { name: "pagination-bounds", version: "1.0.0" },
      registry: new McpFnRegistry(),
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
      maxInventoryPages: 2,
    });
    await client.connect();

    const listTools = vi.spyOn(client.protocol, "listTools").mockResolvedValue({
      tools: [],
      nextCursor: "repeated",
    });
    await expect(client.tools.listAll()).rejects.toMatchObject({
      code: "MCPFN_OPERATION_FAILED",
      details: { operation: "tools/list", reason: "cursor repeated" },
    });
    expect(listTools).toHaveBeenCalledTimes(2);

    let resourcePage = 0;
    vi.spyOn(client.protocol, "listResources").mockImplementation(async () => ({
      resources: [],
      nextCursor: `page-${++resourcePage}`,
    }));
    await expect(client.resources.listAll()).rejects.toMatchObject({
      code: "MCPFN_OPERATION_FAILED",
      details: { operation: "resources/list", reason: "exceeded 2 pages" },
    });
    expect(resourcePage).toBe(2);

    await expect(client.tools.listBounded(0)).rejects.toThrow(
      /maxEntries must be a positive safe integer/,
    );

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

  it("keeps the client event deadline referenced until the wait settles", async () => {
    const deadline = setTimeout(() => undefined, 60_000);
    const unref = vi.spyOn(deadline, "unref");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockReturnValueOnce(deadline);
    const controller = new AbortController();
    const client = createMcpFnClient({
      target: customTarget({ kind: "unused", open: () => { throw new Error("unused"); } }),
    });
    try {
      const waiting = client.waitForEvent(() => false, { signal: controller.signal });
      expect(unref).not.toHaveBeenCalled();
      controller.abort();
      await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("rejects non-integer and non-finite connection retry counts", () => {
    const target = customTarget({ kind: "unused", open: () => { throw new Error("unused"); } });
    for (const connectRetries of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createMcpFnClient({ target, connectRetries })).toThrow(
        /non-negative safe integer/,
      );
    }
  });

  it("treats falsy target-open rejections as retryable failures", async () => {
    const open = vi.fn().mockRejectedValue(undefined);
    const client = createMcpFnClient({
      target: customTarget({ kind: "falsy-rejection", open }),
      connectRetries: 1,
      connectRetryDelayMs: 1,
    });

    await expect(client.connect()).rejects.toMatchObject({
      code: "MCPFN_TARGET_OPEN_FAILED",
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(client.state).toBe("idle");
  });

  it("blocks reconnect until an aborted open has released its late handle", async () => {
    const [lateClientTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpFnServer({
      info: { name: "reconnected", version: "1.0.0" },
      registry: new McpFnRegistry(),
    });
    let targetSignal: AbortSignal | undefined;
    let resolveOpen!: (handle: McpFnTransportHandle) => void;
    let openCalls = 0;
    const closeHandle = vi.fn(async () => undefined);
    const client = createMcpFnClient({
      target: customTarget({
        kind: "delayed",
        open: async (context) => {
          openCalls += 1;
          if (openCalls > 1) {
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
            await server.connect(serverTransport);
            return { transport: clientTransport, close: () => server.close() };
          }
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
    const closing = expect(client.close()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED", retryable: true });
    await vi.waitFor(() => expect(targetSignal?.aborted).toBe(true));
    await closing;
    expect(client.state).toBe("closing");
    expect(closeHandle).not.toHaveBeenCalled();
    await expect(client.reconnect()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED" });
    expect(openCalls).toBe(1);
    resolveOpen({ transport: lateClientTransport, close: closeHandle });

    await connectResult;
    await vi.waitFor(() => expect(closeHandle).toHaveBeenCalledOnce());
    await expect(client.reconnect()).resolves.toBeUndefined();
    expect(client.state).toBe("connected");
    await client.close();
  });

  it("keeps a delayed initialization attempt from taking over a reconnect", async () => {
    const [firstClientTransport] = InMemoryTransport.createLinkedPair();
    const firstClose = vi.fn(async () => undefined);
    const server = createMcpFnServer({
      info: { name: "reconnected-after-configure", version: "1.0.0" },
      registry: new McpFnRegistry(),
    });
    let openCalls = 0;
    let configureCalls = 0;
    let releaseConfigure!: () => void;
    let markConfigureStarted!: () => void;
    const configureStarted = new Promise<void>((resolve) => {
      markConfigureStarted = resolve;
    });
    const delayedConfigure = new Promise<void>((resolve) => {
      releaseConfigure = resolve;
    });
    const client = createMcpFnClient({
      target: customTarget({
        kind: "delayed-configure",
        open: async () => {
          openCalls += 1;
          if (openCalls === 1) {
            return { transport: firstClientTransport, close: firstClose };
          }
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      configure: async () => {
        configureCalls += 1;
        if (configureCalls === 1) {
          markConfigureStarted();
          await delayedConfigure;
        }
      },
    });

    const connecting = client.connect();
    const connectResult = expect(connecting).rejects.toMatchObject({
      code: "MCPFN_CONNECT_ABORTED",
    });
    await configureStarted;
    await client.close();
    expect(firstClose).toHaveBeenCalledOnce();
    await expect(client.reconnect()).resolves.toBeUndefined();
    expect(client.getServerVersion()).toMatchObject({ name: "reconnected-after-configure" });

    releaseConfigure();
    await connectResult;
    expect(client.state).toBe("connected");
    expect(client.getServerVersion()).toMatchObject({ name: "reconnected-after-configure" });
    await client.close();
  });

  it("closes the transport to interrupt a pending MCP initialization", async () => {
    let onclose: (() => void) | undefined;
    const closeTransport = vi.fn(async () => onclose?.());
    const transport = {
      start: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
      close: closeTransport,
      get onclose() {
        return onclose;
      },
      set onclose(callback: (() => void) | undefined) {
        onclose = callback;
      },
    } as unknown as McpFnTransportHandle["transport"];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "stalled-initialization",
        open: () => ({ transport }),
      }),
    });

    const connecting = client.connect();
    await vi.waitFor(() => expect(transport.send).toHaveBeenCalled());

    await expect(client.close()).resolves.toBeUndefined();
    await expect(connecting).rejects.toMatchObject({ code: "MCPFN_CONNECT_ABORTED" });
    expect(closeTransport).toHaveBeenCalled();
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

  it("closes a custom transport when its handle omits close", async () => {
    const closeTransport = vi.fn(async () => undefined);
    const transport = {
      start: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
      close: closeTransport,
    } as unknown as McpFnTransportHandle["transport"];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "configure-failure-with-transport-fallback",
        open: () => ({ transport }),
      }),
      configure: async () => {
        throw new Error("configure failed");
      },
    });
    await expect(client.connect()).rejects.toMatchObject({ code: "MCPFN_CONNECT_FAILED" });
    expect(closeTransport).toHaveBeenCalledOnce();
    expect(client.state).toBe("idle");
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

  it("advertises first-class client-mediated handlers and observes server events", async () => {
    const registry = new McpFnRegistry()
      .register({
        name: "progress",
        description: "Emit one progress event.",
        inputSchema: { type: "object", additionalProperties: false },
        handler: async (_input, _context, extra) => {
          if (extra._meta?.progressToken !== undefined) {
            await extra.sendNotification({
              method: "notifications/progress",
              params: { progressToken: extra._meta.progressToken, progress: 1, total: 1 },
            });
          }
          return structuredResult({ ok: true });
        },
      })
      .registerResource({
        uri: "memory://status",
        name: "status",
        read: async () => ({ contents: [{ uri: "memory://status", text: "ready" }] }),
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
      })
      .registerPrompt({ name: "hello", get: async () => ({ messages: [] }) });
    const server = createMcpFnServer({
      info: { name: "client-mediated", version: "1.0.0" },
      registry,
      additionalCapabilities: { logging: {}, tasks: {} },
    });
    const events: Array<{ kind: string }> = [];
    const diagnostics: Array<{ code?: string }> = [];
    const client = createMcpFnClient({
      target: customTarget({
        kind: "in-memory",
        open: async () => {
          const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
          await server.connect(serverTransport);
          return { transport: clientTransport, close: () => server.close() };
        },
      }),
      handlers: {
        roots: async () => ({ roots: [{ uri: "file:///workspace", name: "workspace" }] }),
        sampling: async () => ({
          role: "assistant",
          content: { type: "text", text: "sampled" },
          model: "fixture-model",
          stopReason: "endTurn",
        }),
        elicitation: async () => ({ action: "accept", content: { approved: true } }),
      },
      clientOptions: {
        listChanged: {
          tools: {
            onChanged: () => { throw new Error("consumer callback failed"); },
          },
        },
      },
      diagnostics: (event) => { diagnostics.push(event); },
      events: (event) => { events.push(event); },
    });

    await client.connect();
    await expect(server.listRoots()).resolves.toMatchObject({
      roots: [{ uri: "file:///workspace" }],
    });
    await expect(server.sample({
      maxTokens: 32,
      messages: [{ role: "user", content: { type: "text", text: "hello" } }],
    })).resolves.toMatchObject({ model: "fixture-model" });
    await expect(server.elicit({
      mode: "form",
      message: "Approve?",
      requestedSchema: {
        type: "object",
        properties: { approved: { type: "boolean" } },
      },
    })).resolves.toMatchObject({ action: "accept" });
    await server.sendLoggingMessage({ level: "info", data: { message: "ready" } });
    await client.tools.call("progress");
    await client.resources.subscribe("memory://status");
    await client.resources.unsubscribe("memory://status");
    await server.sendResourceUpdated({ uri: "memory://status" });
    await server.sendToolListChanged();
    await server.sendResourceListChanged();
    await server.sendPromptListChanged();
    const now = new Date().toISOString();
    await server.protocol.notification({
      method: "notifications/tasks/status",
      params: {
        taskId: "task-1",
        status: "working",
        ttl: null,
        createdAt: now,
        lastUpdatedAt: now,
      },
    });
    await vi.waitFor(() => expect(events.map((event) => event.kind)).toEqual(expect.arrayContaining([
      "client.roots",
      "client.sampling",
      "client.elicitation",
      "logging.message",
      "progress",
      "resources.subscribed",
      "resources.unsubscribed",
      "resources.updated",
      "tools.list_changed",
      "resources.list_changed",
      "prompts.list_changed",
      "tasks.status",
    ])));
    await vi.waitFor(() => expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "MCPFN_LIST_CHANGED_CALLBACK_FAILED" }),
    ])));
    await client.close();
  });
});


it("retries failed handle cleanup before reconnecting", async () => {
  let opens = 0;
  const failedClose = vi.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValue(undefined);
  const client = createMcpFnClient({ target: customTarget({ kind: "retry-cleanup", open: async () => {
    opens++;
    const server = createMcpFnServer({ info: { name: "retry", version: "1" }, registry: new McpFnRegistry() });
    const [transport, peer] = InMemoryTransport.createLinkedPair();
    await server.connect(peer);
    return { transport, close: opens === 1 ? failedClose : () => server.close() };
  } }) });
  await client.connect();
  await expect(client.reconnect()).rejects.toThrow(/cleanup failed/);
  expect(opens).toBe(1);
  await expect(client.connect()).rejects.toThrow(/Retry close/);
  expect(opens).toBe(1);
  await client.reconnect();
  expect(failedClose).toHaveBeenCalledTimes(2);
  expect(opens).toBe(2);
  await client.close();
});

it("retains failed cleanup after a remote protocol close", async () => {
  const server = createMcpFnServer({ info: { name: "remote-close", version: "1" }, registry: new McpFnRegistry() });
  const cleanup = vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue(undefined);
  const client = createMcpFnClient({ target: customTarget({ kind: "remote", open: async () => {
    const [transport, peer] = InMemoryTransport.createLinkedPair();
    await server.connect(peer);
    return { transport, close: cleanup };
  } }) });
  await client.connect();
  await server.close();
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(client.state).toBe("closing"));
  await client.close().catch(() => undefined); // Observe any still-settling remote cleanup.
  await expect(client.close()).resolves.toBeUndefined();
  expect(cleanup).toHaveBeenCalledTimes(2);
});

it("does not expose raw target cleanup failures through public cause chains", async () => {
  const secret = "provider-cleanup-secret";
  const server = createMcpFnServer({ info: { name: "safe-cleanup", version: "1" }, registry: new McpFnRegistry() });
  const cleanup = vi.fn()
    .mockRejectedValueOnce(new Error(`provider rejected ${secret}`))
    .mockResolvedValue(undefined);
  const client = createMcpFnClient({ target: customTarget({
    kind: "safe-cleanup",
    cleanup,
    open: async () => {
      const [transport, peer] = InMemoryTransport.createLinkedPair();
      await server.connect(peer);
      return { transport, close: () => server.close() };
    },
  }) });
  await client.connect();
  const failure = await client.close().then(
    () => undefined,
    error => error as Error,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(failure!.message).toBe("MCP target cleanup failed");
  expect(failure!.cause).toBeUndefined();
  expect(String(failure)).not.toContain(secret);
  await client.close();
  expect(cleanup).toHaveBeenCalledTimes(2);
});

it("retains a late aborted handle whose cleanup fails", async () => {
  let resolveOpen!: (handle: McpFnTransportHandle) => void;
  const cleanup = vi.fn().mockRejectedValueOnce(new Error("retry")).mockResolvedValue(undefined);
  const client = createMcpFnClient({ target: customTarget({ kind: "late", open: () => new Promise(resolve => { resolveOpen = resolve; }) }) });
  const connecting = client.connect();
  const rejected = expect(connecting).rejects.toMatchObject({ code: "MCPFN_CONNECT_ABORTED" });
  await vi.waitFor(() => expect(resolveOpen).toBeDefined());
  await expect(client.close()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED", retryable: true });
  const [transport] = InMemoryTransport.createLinkedPair();
  resolveOpen({ transport, close: cleanup });
  await rejected;
  await expect(client.connect()).rejects.toThrow(/Retry close/);
  await client.close();
  expect(cleanup).toHaveBeenCalledTimes(2);
});


it("shares cleanup of a late aborted handle across close calls", async () => {
  let resolveOpen!: (handle: McpFnTransportHandle) => void;
  let finishCleanup!: () => void;
  const cleanup = vi.fn(() => new Promise<void>(resolve => { finishCleanup = resolve; }));
  const client = createMcpFnClient({ target: customTarget({ kind: "late", open: () => new Promise(resolve => { resolveOpen = resolve; }) }) });
  const connecting = client.connect();
  const rejected = expect(connecting).rejects.toMatchObject({ code: "MCPFN_CONNECT_ABORTED" });
  await vi.waitFor(() => expect(resolveOpen).toBeDefined());
  await expect(client.close()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED", retryable: true });
  const [transport] = InMemoryTransport.createLinkedPair();
  resolveOpen({ transport, close: cleanup });
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());
  const closing = client.close();
  await Promise.resolve();
  expect(cleanup).toHaveBeenCalledOnce();
  finishCleanup();
  await Promise.all([closing, rejected]);
});

it("retains a cleanup gate when an aborted open fails after close", async () => {
  let rejectOpen!: (reason: Error) => void;
  let retained = false;
  const cleanup = vi.fn(async () => { if (retained) throw new Error("revoke failed"); });
  const client = createMcpFnClient({target: customTarget({kind: "late-failed-open", cleanup,
    open: () => new Promise((_, reject) => { rejectOpen = reject; }),
  })});
  const connecting = client.connect().catch(() => undefined);
  await vi.waitFor(() => expect(rejectOpen).toBeDefined());
  await expect(client.close()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED", retryable: true });
  retained = true;
  rejectOpen(new Error("late setup failure"));
  await connecting;
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  await expect(client.connect()).rejects.toThrow(/Retry close/);
  await expect(client.close()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED", phase: "transport-close", retryable: true });
  retained = false;
  await client.close();
});

it("does not reconnect after authorization when target cleanup fails", async () => {
  const cleanup = vi.fn().mockRejectedValueOnce(new Error("revoke failed")).mockResolvedValue(undefined);
  const open = vi.fn();
  const client = createMcpFnClient({target: customTarget({kind: "auth-cleanup", open, cleanup})});
  // Isolate the post-callback transition from the OAuth server fixture.
  (client as any)._state = "authorization-required";
  (client as any).handle = {finishAuthorization: async () => {}, close: async () => {}};
  await expect(client.completeAuthorization("code")).rejects.toThrow(/cleanup failed/);
  expect(open).not.toHaveBeenCalled();
  await expect(client.connect()).rejects.toThrow(/Retry close/);
  await client.close();
});

it("defers non-idempotent target cleanup until an aborted open finishes", async () => {
  let rejectOpen!: (reason: Error) => void;
  const cleanup = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error("duplicate cleanup"));
  const client = createMcpFnClient({ target: customTarget({ kind: "late", cleanup, open: () => new Promise((_, reject) => { rejectOpen = reject; }) }) });
  const connecting = client.connect().catch(() => undefined);
  await vi.waitFor(() => expect(rejectOpen).toBeDefined());
  await expect(client.close()).rejects.toMatchObject({ code: "MCPFN_OPERATION_FAILED", retryable: true });
  expect(cleanup).not.toHaveBeenCalled();
  rejectOpen(new Error("aborted open"));
  await connecting;
  expect(cleanup).toHaveBeenCalledOnce();
  await client.close();
  expect(cleanup).toHaveBeenCalledOnce();
});


it("blocks reconnect while an aborted pre-open diagnostic is pending", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const open = vi.fn();
  const client = createMcpFnClient({ target: customTarget({ kind: "pre-open", open }), diagnostics: async event => {
    if (event.phase === "transport-connect" && event.outcome === "started") await gate;
  } });
  const connecting = client.connect();
  const rejected = expect(connecting).rejects.toThrow();
  await client.close();
  await expect(client.connect()).rejects.toThrow(/Retry close/);
  expect(open).not.toHaveBeenCalled();
  release();
  await rejected;
});

it("cleans a failed target before awaiting failure diagnostics", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const cleanup = vi.fn(async () => {});
  const client = createMcpFnClient({ target: customTarget({ kind: "failed-open", cleanup, open: async () => { throw new Error("open failed"); } }), diagnostics: async event => {
    if (event.phase === "transport-connect" && event.outcome === "failed") await gate;
  } });
  const connecting = client.connect().catch(() => undefined);
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalled());
  release();
  await connecting;
  await client.close();
});

it("drains target cleanup only after live transport handles finish closing", async () => {
  let finish!: () => void;
  const closed = new Promise<void>(resolve => { finish = resolve; });
  const cleanup = vi.fn(async () => {});
  const client = createMcpFnClient({ target: customTarget({ kind: "shutdown-order", cleanup, open: async () => { throw new Error("unused"); } }) });
  (client as any).handle = { transport: { close: async () => {} }, close: async () => closed };
  const closing = client.close();
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(cleanup).not.toHaveBeenCalled();
  finish();
  await closing;
  expect(cleanup).toHaveBeenCalled();
});

it("escalates an in-flight temporary shutdown to permanent", async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const client = createMcpFnClient({ target: customTarget({ kind: "shutdown-race", open: async () => { throw new Error("unused"); } }) });
  (client as any).handle = { transport: { close: async () => {} }, close: async () => gate };
  const automatic = client.close(false);
  const permanent = client.close();
  finish();
  await Promise.all([automatic, permanent]);
  expect(client.state).toBe("closed");
});

it("clears the permanent-close request when explicitly reopening", async () => {
  let server!: ReturnType<typeof createMcpFnServer>;
  const client = createMcpFnClient({ target: customTarget({ kind: "reopen", open: async () => {
    server = createMcpFnServer({ info: { name: "reopen", version: "1" }, registry: new McpFnRegistry() });
    const [transport, peer] = InMemoryTransport.createLinkedPair();
    await server.connect(peer);
    return { transport, close: () => server.close() };
  } }) });
  await client.connect(); await client.close(); await client.reconnect();
  await server.close();
  await vi.waitFor(() => expect(client.state).toBe("idle"));
  await client.close();
});

it.each([false, true])("finishes protocol shutdown before handle cleanup (retry=%s)", async retry => {
  const server = createMcpFnServer({ info: { name: "shutdown-order", version: "1" }, registry: new McpFnRegistry() });
  const handleClose = vi.fn(async () => server.close());
  const client = createMcpFnClient({ target: customTarget({ kind: "in-memory", open: async () => {
    const [transport, peer] = InMemoryTransport.createLinkedPair();
    await server.connect(peer);
    return { transport, close: handleClose };
  } }) });
  await client.connect();
  const originalClose = client.protocol.close.bind(client.protocol);
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const close = vi.spyOn(client.protocol, "close").mockImplementationOnce(async () => {
    entered(); await barrier;
    if (retry) throw new Error("temporary protocol shutdown failure");
    await originalClose();
  });
  try {
    const closing = client.close();
    const rejected = retry ? expect(closing).rejects.toMatchObject({ phase: "transport-close" }) : undefined;
    await started;
    expect(handleClose).not.toHaveBeenCalled();
    release();
    if (retry) {
      await rejected;
      expect(handleClose).not.toHaveBeenCalled();
      close.mockImplementation(originalClose);
      await client.close();
    } else await closing;
    expect(handleClose).toHaveBeenCalledOnce();
  } finally { release(); close.mockRestore(); await client.close(); await server.close(); }
});

it.each([false, true])("retains failed initialization shutdown before a connection retry (permanent=%s)", async permanent => {
  const closeHandle = vi.fn(async () => {});
  const transport = { start: async () => {}, send: async () => {}, close: async () => {} } as McpFnTransportHandle["transport"];
  const open = vi.fn(async () => ({ transport, close: closeHandle }));
  let shutdown: ReturnType<typeof vi.spyOn>;
  const client = createMcpFnClient({
    target: customTarget({ kind: "failed-initialization-shutdown", open }),
    configure: protocol => {
      shutdown = vi.spyOn(protocol, "close").mockRejectedValue(new Error("shutdown failed"));
      throw new Error("initialization failed");
    },
  });
  await expect(client.connect()).rejects.toMatchObject({ phase: "transport-close", retryable: true });
  expect(client.state).toBe("closing");
  expect(open).toHaveBeenCalledOnce();
  expect(closeHandle).not.toHaveBeenCalled();
  await expect(client.connect()).rejects.toMatchObject({ phase: "transport-close" });
  if (permanent) {
    await expect(client.close()).rejects.toMatchObject({ phase: "transport-close" });
    expect(closeHandle).not.toHaveBeenCalled();
  }
  shutdown!.mockResolvedValue(undefined);
  await client.close();
  expect(closeHandle).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
});

it.each([false, true])("waits for initialization cleanup during concurrent permanent close (reject=%s)", async rejectShutdown => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let finish!: () => void;
  const barrier = new Promise<void>(resolve => { finish = resolve; });
  const closeHandle = vi.fn(async () => {});
  const transport = { start: async () => {}, send: async () => {}, close: async () => {} } as McpFnTransportHandle["transport"];
  let shutdown: ReturnType<typeof vi.spyOn>;
  const client = createMcpFnClient({ target: customTarget({ kind: "concurrent-init-cleanup", open: async () => ({ transport, close: closeHandle }) }),
    configure: protocol => {
      shutdown = vi.spyOn(protocol, "close").mockImplementation(async () => {
        entered(); await barrier;
        if (rejectShutdown) throw new Error("shutdown rejected");
      });
      throw new Error("initialization failed");
    },
  });
  const connected = client.connect().catch(error => error);
  await started;
  let settled = false;
  const closing = client.close().then(() => { settled = true; return undefined; }, error => { settled = true; return error; });
  await new Promise(resolve => setImmediate(resolve));
  expect(settled).toBe(false);
  expect(closeHandle).not.toHaveBeenCalled();
  finish();
  const error = await closing;
  await connected;
  if (rejectShutdown) {
    expect(error).toMatchObject({ phase: "transport-close", retryable: true });
    expect(client.state).toBe("closing");
    expect(closeHandle).not.toHaveBeenCalled();
    shutdown!.mockResolvedValue(undefined);
    await client.close();
  } else expect(error).toBeUndefined();
  expect(client.state).toBe("closed");
  expect(closeHandle).toHaveBeenCalledOnce();
});


it.each(["success", "handle-failure", "target-failure"])("coordinates late aborted-open cleanup (%s)", async mode => {
  let opened!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { opened = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  let peerDisposed = false;
  let failHandle = mode === "handle-failure";
  let failTarget = mode === "target-failure";
  const client = createMcpFnClient({ target: customTarget({ kind: "late", open: async () => {
    opened(); await barrier;
    return { transport: { start: async () => {}, send: async () => {}, close: async () => {} }, close: async () => {
      events.push("handle");
      if (failHandle) { failHandle = false; throw new Error("transient handle failure"); }
      if (peerDisposed) throw new Error("target cleanup destroyed peer");
    } };
  }, cleanup: async () => {
    events.push("target");
    if (failTarget) { failTarget = false; throw new Error("transient target failure"); }
    peerDisposed = true;
  } }) });
  const connection = client.connect().catch(() => undefined);
  await started;
  await expect(client.close()).rejects.toMatchObject({ retryable: true });
  release(); await connection;
  if (mode === "handle-failure") expect(events).toEqual(["handle"]);
  if (mode === "target-failure") expect(events).toEqual(["handle", "target"]);
  await Promise.all([client.close(), client.close()]);
  expect(events).toEqual(mode === "handle-failure" ? ["handle", "handle", "target"]
    : mode === "target-failure" ? ["handle", "target", "target"] : ["handle", "target"]);
  expect(client.state).toBe("closed");
});
