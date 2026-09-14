import { startAuthenticatedServer } from "../../test-support/authenticated-server.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpFnClient } from "@mcpfn/client";
import { authenticatedHttpTarget } from "@mcpfn/testing";
import { McpFnInspector } from "../src/index.js";

describe("authenticated programmatic artifacts", () => {
 const closeCallbacks: Array<() => Promise<void>> = [];
 afterEach(async () => { await Promise.allSettled(closeCallbacks.splice(0).map(close => close())); });
  it.each(["opaque-programmatic-secret", "opaque.[*]+secret", "MCPFN_SECRET", "SECRET"])("redacts programmatic inspector artifacts for %s", async (secret) => {
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
  } finally { await inspector.close(); await fixture.close(); }
});
