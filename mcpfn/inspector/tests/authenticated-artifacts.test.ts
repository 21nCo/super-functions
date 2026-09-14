import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { McpFnClient } from "@mcpfn/client";
import { authenticatedHttpTarget } from "@mcpfn/testing";
import { createAuthProviderMcpHandler } from "@mcpfn/auth";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";
import { McpFnInspector } from "../src/index.js";

describe("authenticated programmatic artifacts", () => {
 const closeCallbacks: Array<() => Promise<void>> = [];
 afterEach(async () => { await Promise.allSettled(closeCallbacks.splice(0).map(close => close())); });
  it.each(["opaque-programmatic-secret", "opaque.[*]+secret"])("redacts programmatic inspector artifacts for %s", async (secret) => {
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
    expect(JSON.stringify(exported)).toContain("${MCPFN_SECRET}");
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

async function startAuthenticatedServer(expectedToken: string, echo = false, notificationEcho = expectedToken): Promise<{
  url: string;
  close(): Promise<void>;
}> {
  const mcp = createMcpFnServer({
    info: { name: echo ? expectedToken : "authenticated-external-fixture", version: "1.0.0" },
    additionalCapabilities: { logging: {} },
    registry: new McpFnRegistry().register({
      name: "identity",
      inputSchema: { type: "object", additionalProperties: false },
      description: echo ? expectedToken : "Identity",
      handler: async (_input, _context, extra) => {
        if (echo) await extra.sendNotification({ method: "notifications/message", params: { level: "info", data: { echo: notificationEcho } } });
        return structuredResult(echo ? { echo: expectedToken } : { authenticated: true });
      },
    }),
  });
  const mcpHandler = await mcp.createWebStandardHandler({ enableJsonResponse: !echo });
  let protectedHandler: ((request: Request) => Promise<Response>) | undefined;
  const server = createServer(async (request, response) => {
    try {
      await sendWebResponse(
        response,
        await protectedHandler!(await toWebRequest(request)),
      );
    } catch {
      response.writeHead(500).end();
    }
  });
  await listen(server);
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}/mcp`;
  protectedHandler = createAuthProviderMcpHandler(mcpHandler, {
    resource: url,
    provider: {
      async authenticateBearer(token) {
        if (token !== expectedToken) return null;
        return {
          id: "fixture-session",
          type: "api-key",
          subject: { actorId: "fixture", actorType: "service" },
          scopes: ["mcp:test"],
          resourceIds: [url],
        };
      },
    },
  });
  return {
    url,
    close: async () => {
      await mcp.close();
      await closeServer(server);
    },
  };
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);
  return new Request(
    new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`),
    {
      method: request.method,
      headers: new Headers(Object.entries(request.headers).flatMap(([name, value]) =>
        Array.isArray(value)
          ? value.map((entry) => [name, entry] as [string, string])
          : value === undefined ? [] : [[name, value] as [string, string]],
      )),
      ...(body.length ? { body } : {}),
    },
  );
}

async function sendWebResponse(response: ServerResponse, web: Response): Promise<void> {
  response.writeHead(web.status, Object.fromEntries(web.headers));
  response.end(Buffer.from(await web.arrayBuffer()));
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
