import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import createCalculatorServer from "./calculator-server.js";

const mcp = createCalculatorServer();
const handler = await mcp.createWebStandardHandler({ enableJsonResponse: true });

const httpServer = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (url.pathname !== "/mcp") {
      response.writeHead(404).end("Not found");
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const webRequest = new Request(url, {
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
      ...(body.length > 0 ? { body } : {}),
    });
    const webResponse = await handler(webRequest);
    response.writeHead(
      webResponse.status,
      Object.fromEntries(webResponse.headers.entries()),
    );
    if (!webResponse.body) {
      response.end();
      return;
    }
    const reader = webResponse.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      response.write(Buffer.from(chunk.value));
    }
    response.end();
  } catch {
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "text/plain" });
    }
    response.end("Internal Server Error");
  }
});

await new Promise<void>((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(0, "127.0.0.1", resolve);
});

const address = httpServer.address() as AddressInfo;
process.stdout.write(`http://127.0.0.1:${address.port}/mcp\n`);

const close = async () => {
  await mcp.close().catch(() => undefined);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
};
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));
