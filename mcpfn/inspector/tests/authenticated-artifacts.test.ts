import { startAuthenticatedServer } from "../../test-support/authenticated-server.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpFnClient, customTarget } from "@mcpfn/client";
import { authenticatedHttpTarget } from "@mcpfn/testing";
import { McpFnInspector } from "../src/index.js";

describe("authenticated programmatic artifacts", () => {
 const closeCallbacks: Array<() => Promise<void>> = [];
 afterEach(async () => { await Promise.allSettled(closeCallbacks.splice(0).map(close => close())); });
  it.each(["opaque-programmatic-secret", "opaque.[*]+secret", "MCPFN_SECRET", "SECRET", "[REDACTED]", "REDACTED"])("redacts programmatic inspector artifacts for %s", async (secret) => {
    const fixture = await startAuthenticatedServer(secret, true);
    closeCallbacks.push(fixture.close);
    const events: unknown[] = [];
    const client = new McpFnClient({
      target: authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: `Bearer ${secret}` } } }),
      events: event => { events.push(event); },
      diagnostics: event => { events.push(event); },
    });
    const inspector = new McpFnInspector(client);
    closeCallbacks.push(() => client.close());
    await inspector.connect();
    const operation = { kind: "tools.call" as const, name: "identity", arguments: {} };
    const result = await inspector.run(operation);
    expect(JSON.stringify(result)).toContain(secret); // Protocol values retain application semantics.
    const snapshot = await inspector.snapshot();
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    const exported = inspector.exportScenario("reflection", operation, result);
    expect(JSON.stringify(exported)).not.toContain(secret);
    expect(JSON.stringify(events)).toContain("echo");
    expect(JSON.stringify(events)).not.toContain(secret);
    await client.close();
    expect(JSON.stringify(inspector.timeline())).not.toContain(secret);
  });

  it.each(["logging.message", "connected", "MCPFN"])("preserves typed envelopes when a credential is %s", async (secret) => {
    const fixture = await startAuthenticatedServer(secret, true);
    closeCallbacks.push(fixture.close);
    const events: any[] = [];
    const client = new McpFnClient({
      target: authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: `Bearer ${secret}` } } }),
      events: event => { events.push(event); },
    });
    const inspector = new McpFnInspector(client);
    closeCallbacks.push(() => client.close());
    await inspector.connect();
    const operation = { kind: "tools.call" as const, name: "identity", arguments: {} };
    const result = await inspector.run(operation);
    const snapshot = await inspector.snapshot();
    expect(snapshot.clientState).toBe("connected");
    const event = events.find(event => event.kind === "logging.message");
    expect(event).toBeDefined();
    expect(event.payload.data.echo).not.toBe(secret);
    expect(snapshot.timeline.some(entry => entry.kind === "logging.message")).toBe(true);
    const exported = inspector.exportScenario("reflection", operation, result);
    if (secret === "MCPFN") expect(JSON.stringify(exported)).not.toContain("MCPFN_SECRET");
    else expect(JSON.stringify(exported)).toContain("${MCPFN_SECRET}");
  });

  it("keeps oversized diagnostic payloads from breaking a tool operation", async () => {
    const secret = "oversized-secret";
    const fixture = await startAuthenticatedServer(secret, true, "x".repeat(300_000) + secret);
    closeCallbacks.push(fixture.close);
    const events: any[] = [];
    const client = new McpFnClient({
      target: authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: `Bearer ${secret}` } } }),
      events: event => { events.push(event); },
    });
    closeCallbacks.push(() => client.close());
    await client.connect();
    const result = await client.tools.call("identity", {});
    expect(JSON.stringify(result)).toContain(secret);
    expect(events.some(event => event.payload?.omitted === true)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(secret);
  });

});

it("redacts client-event payloads in payload mode and records fallbacks as omissions", async () => {
  const events: any[] = [];
  let throwOnPayload = false;
  const target = customTarget({
    kind: "custom",
    open: async () => { throw new Error("unused"); },
    redact: <T>(value: T, options): T => {
      if (throwOnPayload && value && typeof value === "object" && "status" in value) {
        throw new Error("payload redaction unavailable");
      }
      if (options?.preserveKeys !== false) return value;
      return JSON.parse(JSON.stringify(value).replaceAll("passed", "[REDACTED]")) as T;
    },
  });
  const client = new McpFnClient({ target, events: event => { events.push(event); } });
  const inspector = new McpFnInspector(client);
  const emitEvent = (client as unknown as {
    emitEvent(kind: "logging.message", payload: unknown): Promise<void>;
  }).emitEvent.bind(client);
  await emitEvent("logging.message", { status: "passed" });
  expect(events[0].kind).toBe("logging.message");
  expect(events[0].payload.status).toBe("[REDACTED]");
  throwOnPayload = true;
  await emitEvent("logging.message", { status: "passed" });
  expect(events[1].payload).toMatchObject({ omitted: true });
  expect(client.isRedactionOmission(events[1])).toBe(true);
  const snapshot = await inspector.snapshot();
  expect(snapshot.timelineComplete).toBe(false);
  expect(snapshot.droppedEvents).toBe(1);
});

it("reconstructs diagnostic discriminators around payload redaction", async () => {
  const observed: any[] = [];
  const target = customTarget({
    kind: "custom",
    open: async () => { throw new Error("unused"); },
    redact: <T>(value: T): T => JSON.parse(
      JSON.stringify(value)
        .replaceAll("transport-close", "[REDACTED]")
        .replaceAll("failed", "[REDACTED]"),
    ) as T,
  });
  const client = new McpFnClient({ target, diagnostics: event => { observed.push(event); } });
  const dispatch = (client as unknown as {
    dispatch(event: Record<string, unknown>): Promise<void>;
  }).dispatch.bind(client);
  await dispatch({
    phase: "transport-close",
    outcome: "failed",
    requestId: "request",
    at: new Date(0).toISOString(),
    target: { kind: "custom" },
    details: { phase: "transport-close", outcome: "failed" },
  });
  expect(observed[0]).toMatchObject({
    phase: "transport-close",
    outcome: "failed",
    details: { phase: "[REDACTED]", outcome: "[REDACTED]" },
  });
});

it("redacts failed-open diagnostics after releasing malformed credentials", async () => {
  const secret = "private-header-first\nprivate-header-second";
  const events: unknown[] = [];
  const client = new McpFnClient({
    target: authenticatedHttpTarget("http://127.0.0.1:1/mcp", { credential: { headers: { "x-api-key": secret } } }),
    diagnostics: event => { events.push(event); },
  });
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outbound request"));
  try {
    await expect(client.connect()).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  } finally { fetch.mockRestore(); }
  expect(events.length).toBeGreaterThan(0);
  expect(JSON.stringify(events)).not.toContain("private-header-first");
  expect(JSON.stringify(events)).not.toContain("private-header-second");
  await client.close();
});

it.each(["custom", "connected", "mcpfn.inspector-snapshot"])("preserves snapshot structure around custom credential %s", async secret => {
  const fixture = await startAuthenticatedServer("server-key", true);
  const target = authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: "Bearer server-key" } } });
  const original = target.redact!.bind(target);
  target.redact = <T>(value: T): T => JSON.parse(JSON.stringify(original(value)).replaceAll(secret, "[REDACTED]"));
  target.describe = () => ({ kind: "custom", label: secret });
  const inspector = new McpFnInspector(new McpFnClient({ target }));
  try {
    await inspector.connect();
    const report = await inspector.snapshot();
    expect(report.kind).toBe("mcpfn.inspector-snapshot");
    expect(report.target.kind).toBe("custom");
    expect(report.clientState).toBe("connected");
    expect(report.target.label).toBe("[REDACTED]");
  } finally {
    try { await inspector.close(); } finally { await fixture.close(); }
  }
});


it("preserves live event kinds under custom exact-value redaction", async () => {
  const fixture = await startAuthenticatedServer("server-key", true);
  const target = authenticatedHttpTarget(fixture.url, { credential: { headers: { authorization: "Bearer server-key" } } });
  const original = target.redact!.bind(target);
  target.redact = <T>(value: T): T => JSON.parse(JSON.stringify(original(value)).replaceAll("logging.message", "[REDACTED]"));
  const events: any[] = [];
  const client = new McpFnClient({ target, events: event => { events.push(event); } });
  try {
    await client.connect();
    await client.tools.call("identity", {});
    expect(events.some(event => event.kind === "logging.message")).toBe(true);
  } finally { try { await client.close(); } finally { await fixture.close(); } }
});

it.each(["tools.call", "non-idempotent", "none"])("preserves exported scenario discriminators matching %s", secret => {
  const client = new McpFnClient({ target: customTarget({ kind: "custom", open: async () => { throw new Error("unused"); },
    redact: <T>(value: T): T => JSON.parse(JSON.stringify(value).replaceAll(secret, "[REDACTED]")),
  }) });
  const inspector = new McpFnInspector(client);
  const scenario = secret === "none"
    ? inspector.exportScenario(secret, { kind: "resources.read", uri: "test://resource" }, { contents: [] })
    : inspector.exportScenario(secret, { kind: "tools.call", name: "echo" }, { content: [] });
  expect(scenario.kind).toBe(secret === "none" ? "resources.read" : "tools.call");
  expect(scenario.sideEffect).toBe(secret === "none" ? "none" : "non-idempotent");
  expect(scenario.name).toBe("[REDACTED]");
});

it("declares placeholders introduced in redacted property keys", () => {
  const secret = "opaque-property-key";
  const target = customTarget({
    kind: "custom",
    open: async () => { throw new Error("unused"); },
    redact: <T>(value: T, options): T => JSON.parse(
      JSON.stringify(value).replaceAll(secret, options?.redactionMarker ?? "[REDACTED]"),
    ) as T,
  });
  const inspector = new McpFnInspector(new McpFnClient({ target }));
  const scenario = inspector.exportScenario(
    "redacted key",
    { kind: "tools.call", name: "echo", arguments: { [secret]: "value" } },
    { content: [], structuredContent: { [secret]: "value" } },
  );
  expect(scenario.variables).toEqual(["MCPFN_SECRET"]);
  expect(scenario.arguments).toEqual({ "${MCPFN_SECRET}": "${MCPFN_SECRET}" });
  expect(scenario.expect?.structuredContent).toEqual({
    "${MCPFN_SECRET}": "${MCPFN_SECRET}",
  });
});


it.each(["connected", "passed", "logging.message", "custom"])("redacts envelope-shaped scenario payloads containing %s", async secret => {
  const fixture = await startAuthenticatedServer(secret, true);
  const client = new McpFnClient({ target: authenticatedHttpTarget(fixture.url, {
    credential: { headers: { authorization: `Bearer ${secret}` } },
  }) });
  const inspector = new McpFnInspector(client);
  try {
    await inspector.connect();
    const payload = { clientState: secret, status: secret, kind: secret,
      target: { kind: secret }, nested: [{ clientState: secret }] };
    const scenario = inspector.exportScenario("reflection", {
      kind: "tools.call", name: "identity", arguments: payload,
    }, { content: [], structuredContent: payload });
    expect(scenario.kind).toBe("tools.call");
    expect(scenario.sideEffect).toBe("non-idempotent");
    expect(JSON.stringify(scenario)).not.toContain(secret);
    expect(JSON.stringify(scenario)).toContain("${MCPFN_SECRET}");
  } finally { try { await client.close(); } finally { await fixture.close(); } }
});
