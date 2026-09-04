import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export const EXTERNAL_EXAMPLE_API_KEY = process.env.MCPFN_EXTERNAL_API_KEY ??
  "mcpfn-external-example-key";

function createOfficialSdkServer(): Server {
  const server = new Server(
    { name: "mcpfn-external-example", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
      name: "echo",
      description: "Echo a message from a non-McpFn official SDK server.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
        additionalProperties: false,
      },
    }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "echo") {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ error: "unknown tool" }) }],
      };
    }
    const message = String(
      (request.params.arguments as { message?: unknown } | undefined)?.message ?? "",
    );
    return {
      content: [{ type: "text", text: JSON.stringify({ message }) }],
      structuredContent: { message },
    };
  });
  return server;
}

async function handleMcp(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${EXTERNAL_EXAMPLE_API_KEY}`) {
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized" },
      id: null,
    }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": "Bearer",
      },
    });
  }
  const server = createOfficialSdkServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => undefined);
  }
}

const httpServer = createServer((incoming, outgoing) => {
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
    const method = incoming.method ?? "GET";
    const url = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "127.0.0.1"}`);
    if (url.pathname !== "/mcp") {
      outgoing.writeHead(404).end("Not found");
      return;
    }
    const request = new Request(url, {
      method,
      headers,
      ...(["GET", "HEAD"].includes(method)
        ? {}
        : { body: Buffer.concat(chunks), duplex: "half" }),
    } as RequestInit);
    const response = await handleMcp(request);
    outgoing.statusCode = response.status;
    for (const [name, value] of response.headers) outgoing.setHeader(name, value);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  })().catch(() => {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  });
});

await new Promise<void>((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(0, "127.0.0.1", resolve);
});

const address = httpServer.address() as AddressInfo;
process.stdout.write(`http://127.0.0.1:${address.port}/mcp\n`);

const close = () => new Promise<void>((resolve) => httpServer.close(() => resolve()));
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));
