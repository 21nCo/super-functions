import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  McpFnRegistry,
  createMcpFnServer,
} from "../core/src/index.js";

const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
const audio = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let server: ReturnType<typeof createMcpFnServer>;
const registry = new McpFnRegistry()
  .register({
    name: "test_simple_text",
    description: "Return simple text.",
    inputSchema: { type: "object" },
    handler: async () => ({ content: [{ type: "text", text: "Simple text" }] }),
  })
  .register({
    name: "test_image_content",
    description: "Return image content.",
    inputSchema: { type: "object" },
    handler: async () => ({ content: [{ type: "image", data: pixel, mimeType: "image/png" }] }),
  })
  .register({
    name: "test_audio_content",
    description: "Return audio content.",
    inputSchema: { type: "object" },
    handler: async () => ({ content: [{ type: "audio", data: audio, mimeType: "audio/wav" }] }),
  })
  .register({
    name: "test_embedded_resource",
    description: "Return an embedded resource.",
    inputSchema: { type: "object" },
    handler: async () => ({
      content: [{
        type: "resource",
        resource: { uri: "test://embedded", mimeType: "text/plain", text: "Embedded" },
      }],
    }),
  })
  .register({
    name: "test_multiple_content_types",
    description: "Return mixed content.",
    inputSchema: { type: "object" },
    handler: async () => ({
      content: [
        { type: "text", text: "Mixed" },
        { type: "image", data: pixel, mimeType: "image/png" },
        { type: "audio", data: audio, mimeType: "audio/wav" },
        {
          type: "resource",
          resource: { uri: "test://mixed", mimeType: "text/plain", text: "Mixed resource" },
        },
      ],
    }),
  })
  .register({
    name: "test_error_handling",
    description: "Return a tool error.",
    inputSchema: { type: "object" },
    handler: async () => ({
      content: [{ type: "text", text: "Expected test error" }],
      isError: true,
    }),
  })
  .register({
    name: "test_tool_with_logging",
    description: "Emit log notifications.",
    inputSchema: { type: "object" },
    handler: async (_args, _context, extra) => {
      await extra.sendNotification({
        method: "notifications/message",
        params: { level: "info", data: "Tool execution started" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await extra.sendNotification({
        method: "notifications/message",
        params: { level: "info", data: "Tool processing data" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await extra.sendNotification({
        method: "notifications/message",
        params: { level: "info", data: "Tool execution completed" },
      });
      return { content: [{ type: "text", text: "Logged" }] };
    },
  })
  .register({
    name: "test_tool_with_progress",
    description: "Emit progress notifications.",
    inputSchema: { type: "object" },
    handler: async (_args, _context, extra) => {
      const progressToken = extra._meta?.progressToken;
      if (progressToken !== undefined) {
        for (const progress of [25, 50, 100]) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress, total: 100 },
          });
        }
      }
      return { content: [{ type: "text", text: "Progress complete" }] };
    },
  })
  .register({
    name: "test_sampling",
    description: "Request sampling from the client.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
    },
    handler: async ({ prompt }, _context, extra) => {
      const sampled = await server.sampleForRequest(extra, {
        messages: [{ role: "user", content: { type: "text", text: String(prompt) } }],
        maxTokens: 64,
      });
      return {
        content: [{
          type: "text",
          text: Array.isArray(sampled.content)
            ? "Sampled"
            : sampled.content.type === "text" ? sampled.content.text : "Sampled",
        }],
      };
    },
  })
  .register({
    name: "test_elicitation",
    description: "Request form elicitation.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    handler: async ({ message }, _context, extra) => {
      const result = await server.elicitForRequest(extra, {
        mode: "form",
        message: String(message),
        requestedSchema: {
          type: "object",
          properties: {
            username: { type: "string" },
            email: { type: "string" },
          },
          required: ["username", "email"],
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(result.content ?? {}) }] };
    },
  })
  .register({
    name: "test_elicitation_sep1034_defaults",
    description: "Request elicitation with primitive defaults.",
    inputSchema: { type: "object" },
    handler: async (_args, _context, extra) => {
      const result = await server.elicitForRequest(extra, {
        mode: "form",
        message: "Test primitive defaults",
        requestedSchema: {
          type: "object",
          properties: {
            name: { type: "string", default: "John Doe" },
            age: { type: "integer", default: 30 },
            score: { type: "number", default: 95.5 },
            status: { type: "string", enum: ["active", "inactive", "pending"], default: "active" },
            verified: { type: "boolean", default: true },
          },
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(result.content ?? {}) }] };
    },
  })
  .register({
    name: "test_elicitation_sep1330_enums",
    description: "Request all elicitation enum variants.",
    inputSchema: { type: "object" },
    handler: async (_args, _context, extra) => {
      const result = await server.elicitForRequest(extra, {
        mode: "form",
        message: "Test enum variants",
        requestedSchema: {
          type: "object",
          properties: {
            untitledSingle: { type: "string", enum: ["option1", "option2", "option3"] },
            titledSingle: {
              type: "string",
              oneOf: [
                { const: "value1", title: "First Option" },
                { const: "value2", title: "Second Option" },
              ],
            },
            legacyEnum: {
              type: "string",
              enum: ["opt1", "opt2", "opt3"],
              enumNames: ["Option One", "Option Two", "Option Three"],
            },
            untitledMulti: {
              type: "array",
              items: { type: "string", enum: ["option1", "option2", "option3"] },
            },
            titledMulti: {
              type: "array",
              items: {
                anyOf: [
                  { const: "value1", title: "First Choice" },
                  { const: "value2", title: "Second Choice" },
                ],
              },
            },
          },
        },
      });
      return { content: [{ type: "text", text: JSON.stringify(result.content ?? {}) }] };
    },
  })
  .registerResource({
    uri: "test://static-text",
    name: "static-text",
    description: "Static text resource.",
    mimeType: "text/plain",
    read: async () => ({
      contents: [{ uri: "test://static-text", mimeType: "text/plain", text: "Static text" }],
    }),
  })
  .registerResource({
    uri: "test://static-binary",
    name: "static-binary",
    description: "Static binary resource.",
    mimeType: "application/octet-stream",
    read: async () => ({
      contents: [{
        uri: "test://static-binary",
        mimeType: "application/octet-stream",
        blob: "AAECAwQ=",
      }],
    }),
  })
  .registerResource({
    uri: "test://watched-resource",
    name: "watched-resource",
    description: "Subscribable resource.",
    mimeType: "text/plain",
    read: async () => ({
      contents: [{ uri: "test://watched-resource", mimeType: "text/plain", text: "Watched" }],
    }),
    subscribe: async () => undefined,
    unsubscribe: async () => undefined,
  })
  .registerResourceTemplate({
    uriTemplate: "test://template/{id}/data",
    name: "template-data",
    description: "Parameterized resource.",
    mimeType: "text/plain",
    read: async (uri, variables) => ({
      contents: [{
        uri: uri.toString(),
        mimeType: "text/plain",
        text: `Template data for ${String(variables.id)}`,
      }],
    }),
  })
  .registerPrompt({
    name: "test_simple_prompt",
    description: "A simple test prompt.",
    get: async () => ({
      messages: [{ role: "user", content: { type: "text", text: "Simple prompt" } }],
    }),
  })
  .registerPrompt({
    name: "test_prompt_with_arguments",
    description: "A parameterized test prompt.",
    arguments: [
      { name: "arg1", description: "First value", required: true },
      { name: "arg2", description: "Second value", required: true },
    ],
    complete: {
      arg1: async (value) => ({ completion: { values: [`${value}-complete`] } }),
    },
    get: async ({ arg1, arg2 }) => ({
      messages: [{
        role: "user",
        content: { type: "text", text: `Arguments: ${arg1} and ${arg2}` },
      }],
    }),
  })
  .registerPrompt({
    name: "test_prompt_with_embedded_resource",
    description: "A prompt containing an embedded resource.",
    arguments: [{
      name: "resourceUri",
      description: "URI of the resource to embed.",
      required: true,
    }],
    get: async ({ resourceUri }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "resource",
            resource: {
              uri: resourceUri,
              mimeType: "text/plain",
              text: "Embedded resource content for testing.",
            },
          },
        },
        {
          role: "user",
          content: { type: "text", text: "Please process the embedded resource above." },
        },
      ],
    }),
  })
  .registerPrompt({
    name: "test_prompt_with_image",
    description: "A prompt containing an image.",
    get: async () => ({
      messages: [{
        role: "user",
        content: { type: "image", data: pixel, mimeType: "image/png" },
      }],
    }),
  });

server = createMcpFnServer({
  info: { name: "mcpfn-conformance", version: "1.0.0" },
  registry,
  additionalCapabilities: { logging: {} },
});

let handler: Awaited<ReturnType<typeof server.createWebStandardHandler>>;
const httpServer = createServer(async (request, response) => {
  try {
    if (!handler) throw new Error("MCP handler is not ready");
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (url.pathname !== "/mcp") {
      response.writeHead(404).end("Not found");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const webRequest = new Request(url, {
      method: request.method,
      headers: new Headers(
        Object.entries(request.headers).flatMap(([key, value]) =>
          Array.isArray(value)
            ? value.map((entry) => [key, entry] as [string, string])
            : value === undefined ? [] : [[key, value] as [string, string]],
        ),
      ),
      ...(body.length ? { body } : {}),
    });
    const webResponse = await handler(webRequest);
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers.entries()));
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
    if (response.headersSent) {
      response.destroy();
    } else {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("Internal Server Error");
    }
  }
});

await new Promise<void>((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(0, "127.0.0.1", resolve);
});
const address = httpServer.address() as AddressInfo;
const origin = `http://127.0.0.1:${address.port}`;
handler = await server.createWebStandardHandler({
  sessionIdGenerator: randomUUID,
  enableDnsRebindingProtection: true,
  allowedHosts: [`127.0.0.1:${address.port}`],
  allowedOrigins: [origin],
});
process.stdout.write(`${origin}/mcp\n`);

const close = async () => {
  await server.close().catch(() => undefined);
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
};
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));
