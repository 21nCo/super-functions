import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import {
  apiKeyCredential,
  authenticatedHttpTarget,
  connectAuthenticatedHttpTarget,
  runMcpFnTargetSuite,
} from "../src/index.js";

async function startProtectedMcp(apiKey: string): Promise<{ url: string; close(): Promise<void> }> {
  const mcp = createMcpFnServer({
    info: { name: "remote-target-fixture", version: "1.0.0" },
    registry: new McpFnRegistry().register({
      name: "echo",
      description: "Echo a message through a URL-only target.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
      handler: async ({ message }) => structuredResult({ message }),
    }),
  });
  const handler = await mcp.createWebStandardHandler({ enableJsonResponse: true });
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item);
        } else if (value !== undefined) {
          headers.set(name, value);
        }
      }
      if (headers.get("authorization") !== `Bearer ${apiKey}`) {
        outgoing.writeHead(401, { "www-authenticate": "Bearer" }).end();
        return;
      }
      const method = incoming.method ?? "GET";
      const request = new Request(`http://${incoming.headers.host}${incoming.url ?? "/"}`, {
        method,
        headers,
        ...(["GET", "HEAD"].includes(method)
          ? {}
          : { body: Buffer.concat(chunks), duplex: "half" }),
      } as RequestInit);
      const response = await handler(request);
      outgoing.statusCode = response.status;
      for (const [name, value] of response.headers) outgoing.setHeader(name, value);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    })().catch(() => {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("remote target fixture did not bind");
  }
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      await mcp.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

describe("authenticated remote HTTP targets", () => {
  const started: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.allSettled(started.splice(0).map((value) => value.close()));
  });

  it("connects by URL plus headers without constructing a server object in the consumer", async () => {
    const apiKey = "mcpfn-remote-target-key";
    const fixture = await startProtectedMcp(apiKey);
    started.push(fixture);
    const connected = await connectAuthenticatedHttpTarget({
      url: fixture.url,
      auth: { headers: { authorization: `Bearer ${apiKey}` } },
      kind: "api-key",
    });
    try {
      await expect(connected.client.callTool("echo", { message: "ok" })).resolves.toMatchObject({
        structuredContent: { message: "ok" },
      });
    } finally {
      await connected.close();
    }
  });

  it("issues credentials from an auth provider adapter and runs the target suite", async () => {
    const apiKey = "mcpfn-provider-key";
    const fixture = await startProtectedMcp(apiKey);
    started.push(fixture);
    const issued: string[] = [];
    const report = await runMcpFnTargetSuite({
      target: authenticatedHttpTarget(
        fixture.url,
        await (async () => {
          const credential = apiKeyCredential(apiKey);
          issued.push("issued");
          return credential;
        })(),
      ),
      scenarios: [{
        name: "echo",
        tool: "echo",
        arguments: { message: "provider" },
        expect: { structuredContent: { message: "provider" } },
      }],
    });
    expect(issued).toEqual(["issued"]);
    expect(report).toMatchObject({ ok: true, passed: 1, target: { kind: "streamable-http" } });
    expect(JSON.stringify(report)).not.toContain(apiKey);
  });

  it("rejects a missing credential at the remote URL", async () => {
    const fixture = await startProtectedMcp("secret-key");
    started.push(fixture);
    await expect(connectAuthenticatedHttpTarget({
      url: fixture.url,
      auth: { headers: {} },
    })).rejects.toThrow();
  });
});
