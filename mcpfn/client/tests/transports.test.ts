import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

import {
  createMcpFnClient,
  stdioTarget,
  streamableHttpTarget,
} from "../src/index.js";

describe("McpFn first-class transports", () => {
  const closeables: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closeables.splice(0).reverse()) await close();
  });

  it("runs a real stdio child-process round trip", async () => {
    const fixture = fileURLToPath(new URL("./fixtures/stdio-server.mjs", import.meta.url));
    const client = createMcpFnClient({
      target: stdioTarget({ command: process.execPath, args: [fixture] }),
    });
    closeables.push(() => client.close());
    await client.connect();
    await expect(client.tools.call("echo", { transport: "stdio" })).resolves.toMatchObject({
      structuredContent: { transport: "stdio" },
    });
  }, 15_000);

  it("runs a real Streamable HTTP round trip", async () => {
    const mcp = createMcpFnServer({
      info: { name: "mcpfn-http-fixture", version: "1.0.0" },
      registry: new McpFnRegistry().register({
        name: "echo",
        description: "Echo an input over HTTP.",
        inputSchema: { type: "object" },
        handler: async (input) => structuredResult(input),
      }),
    });
    const handler = await mcp.createWebStandardHandler({ enableJsonResponse: true });
    const httpServer = createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const webResponse = await handler(new Request(url, {
        method: request.method,
        headers: new Headers(
          Object.entries(request.headers).flatMap(([key, value]) =>
            Array.isArray(value)
              ? value.map((entry) => [key, entry] as [string, string])
              : value === undefined
                ? []
                : [[key, value] as [string, string]],
          ),
        ),
        ...(body.length ? { body } : {}),
      }));
      response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
      response.end(Buffer.from(await webResponse.arrayBuffer()));
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    closeables.push(async () => {
      await mcp.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });
    const address = httpServer.address() as AddressInfo;
    const client = createMcpFnClient({
      target: streamableHttpTarget(`http://127.0.0.1:${address.port}/mcp`),
    });
    closeables.push(() => client.close());
    await client.connect();
    await expect(client.tools.call("echo", { transport: "http" })).resolves.toMatchObject({
      structuredContent: { transport: "http" },
    });
  }, 15_000);
});
