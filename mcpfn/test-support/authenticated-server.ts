import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { AddressInfo } from "node:net";
import { createAuthProviderMcpHandler } from "@mcpfn/auth";
import { McpFnRegistry, createMcpFnServer, structuredResult } from "@mcpfn/core";

export async function startAuthenticatedServer(expectedToken: string, echo = false, notificationEcho = expectedToken): Promise<{
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
      if (response.headersSent) response.destroy();
      else response.writeHead(500).end();
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
      headers: new Headers(Object.entries(request.headers).flatMap(nodeHeaderEntries)),
      ...(body.length ? { body } : {}),
    },
  );
}

function nodeHeaderEntries([name, value]: [string, string | string[] | undefined]): Array<[string, string]> {
  if (Array.isArray(value)) return value.map((entry) => [name, entry]);
  return value === undefined ? [] : [[name, value]];
}

async function sendWebResponse(response: ServerResponse, web: Response): Promise<void> {
  response.writeHead(web.status, Object.fromEntries(web.headers));
  if (!web.body) { response.end(); return; }
  await pipeline(Readable.fromWeb(web.body as Parameters<typeof Readable.fromWeb>[0]), response);
}

export function listen(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

export function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
