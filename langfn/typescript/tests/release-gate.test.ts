import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LangFn } from "../src/client.js";
import type { ChatRequest, CompletionRequest } from "../src/core/types.js";
import { createLangFnRouter } from "../src/http/routes.js";
import { MCPServer } from "../src/mcp/index.js";
import {
  AnthropicChatModel,
  GoogleChatModel,
  MistralChatModel,
  MockChatModel,
  OllamaChatModel,
  OpenAIChatModel
} from "../src/models/index.js";
import { Tracer } from "../src/observability/index.js";
import { Tool } from "../src/tools/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const langfnRoot = resolve(repoRoot, "langfn");
const absolutePathPattern =
  /(^|[\s("'`])(?:\/Users\/[^\s"'`)\]]+|\/home\/[^\s"'`)\]]+|[A-Za-z]:\\Users\\[^\s"'`)\]]+)/m;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("release gate contract", () => {
  it("ships runnable docs and the repo-root release gate command", () => {
    const rootReadme = read(resolve(langfnRoot, "README.md"));
    const tsReadme = read(resolve(langfnRoot, "typescript/README.md"));
    const compatibility = read(resolve(langfnRoot, "COMPATIBILITY.md"));
    const releaseGate = read(resolve(langfnRoot, ".conduct/release-gate.md"));
    const manifest = JSON.parse(read(resolve(repoRoot, "package.json")));

    expect(manifest.scripts["gate:langfn-release"]).toBe("node scripts/gate-langfn-release.mjs");
    for (const content of [rootReadme, tsReadme, compatibility, releaseGate]) {
      expect(content).toContain("0.1.0");
      expect(content).not.toMatch(absolutePathPattern);
    }
    expect(rootReadme).toContain("npm run gate:langfn-release");
    expect(releaseGate).toContain("npm --prefix langfn/typescript run build");
    expect(releaseGate).toContain("TypeScript");
  });

  it("records the first-party provider compatibility matrix", () => {
    const compatibility = read(resolve(langfnRoot, "COMPATIBILITY.md"));

    expect(compatibility).toContain("| openai | yes | yes | yes | yes | yes | yes |");
    expect(compatibility).toContain("| anthropic | yes | yes | yes | yes | no | yes |");
    expect(compatibility).toContain("| ollama | yes | yes | yes | no | no | yes |");
    expect(compatibility).toContain("| google | yes | yes | yes | yes | no | yes |");
    expect(compatibility).toContain("| mistral | yes | yes | yes | yes | no | yes |");
  });

  it("pins the adopted TypeScript consumer to the current shared contracts", () => {
    const pkg = JSON.parse(read(resolve(langfnRoot, "typescript/package.json")));
    expect(pkg.dependencies["@superfunctions/db"]).toBe("0.2.0");
    expect(pkg.dependencies["@superfunctions/http"]).toBe("0.2.0");
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.29.0");
  });

  it("provides smoke-ready providers plus HTTP, MCP, and observability surfaces", async () => {
    const openai = new OpenAIChatModel({
      apiKey: "sk-test",
      fetchImpl: createFetch((url, body) => {
        if (url.endsWith("/chat/completions") && body.includes('"stream":true')) {
          return sseResponse([
            'data: {"choices":[{"delta":{"content":"openai-stream"}}]}',
            "data: [DONE]"
          ]);
        }
        return jsonResponse({
          choices: [
            {
              message: {
                role: "assistant",
                content: "openai-chat",
                tool_calls: [{ id: "call_1", function: { name: "add", arguments: "{\"a\":2,\"b\":3}" } }]
              }
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        });
      })
    });
    const anthropic = new AnthropicChatModel({
      apiKey: "sk-test",
      fetchImpl: createFetch((_url, body) => {
        if (body.includes('"stream":true')) {
          return sseResponse([
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"anthropic-stream"}}',
            'data: {"type":"message_stop"}'
          ]);
        }
        return jsonResponse({
          content: [
            { type: "text", text: "anthropic-chat" },
            { type: "tool_use", id: "call_1", name: "add", input: { a: 2, b: 3 } }
          ],
          usage: { input_tokens: 1, output_tokens: 1 }
        });
      })
    });
    const ollama = new OllamaChatModel({
      fetchImpl: createFetch((_url, body) => {
        if (body.includes('"stream":true')) {
          return textResponse(
            `${JSON.stringify({ done: false, message: { content: "ollama-stream" } })}\n${JSON.stringify({ done: true })}\n`
          );
        }
        return jsonResponse({ message: { role: "assistant", content: "ollama-chat" }, prompt_eval_count: 1, eval_count: 1 });
      })
    });
    const google = new GoogleChatModel({
      apiKey: "google-test",
      fetchImpl: createFetch((url) => {
        const data = { candidates: [{ content: { parts: [{ text: "google-chat" }] }, finishReason: "STOP" }] };
        return url.includes("streamGenerateContent") ? textResponse(`data: ${JSON.stringify(data)}\n\n`) : jsonResponse(data);
      })
    });
    const mistral = new MistralChatModel({
      apiKey: "mistral-test",
      fetchImpl: createFetch(() =>
        jsonResponse({
          choices: [
            {
              message: {
                role: "assistant",
                content: "mistral-chat",
                tool_calls: [{ id: "call_1", function: { name: "add", arguments: "{\"a\":2,\"b\":3}" } }]
              }
            }
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 }
        })
      )
    });

    await expect(
      openai.chat({
        messages: [{ role: "user", content: "hi" }],
        tools: [toolSpec()]
      } satisfies ChatRequest)
    ).resolves.toMatchObject({
      message: { content: "openai-chat" },
      toolCalls: [{ name: "add" }]
    });
    await expect(collectStream(openai.stream({ prompt: "hi" } satisfies CompletionRequest))).resolves.toEqual([
      "openai-stream"
    ]);

    await expect(
      anthropic.chat({
        messages: [{ role: "user", content: "hi" }],
        tools: [toolSpec()]
      } satisfies ChatRequest)
    ).resolves.toMatchObject({
      message: { content: "anthropic-chat" },
      toolCalls: [{ name: "add" }]
    });
    await expect(collectStream(anthropic.stream({ prompt: "hi" } satisfies CompletionRequest))).resolves.toEqual([
      "anthropic-stream"
    ]);

    await expect(ollama.complete({ prompt: "hi" } satisfies CompletionRequest)).resolves.toMatchObject({
      content: "ollama-chat"
    });
    await expect(collectStream(ollama.stream({ prompt: "hi" } satisfies CompletionRequest))).resolves.toEqual([
      "ollama-stream"
    ]);

    await expect(
      google.chat({
        messages: [{ role: "user", content: "hi" }]
      } satisfies ChatRequest)
    ).resolves.toMatchObject({ message: { content: "google-chat" } });
    await expect(collectStream(google.stream({ prompt: "hi" } satisfies CompletionRequest))).resolves.toEqual([
      "google-chat"
    ]);

    await expect(
      mistral.chat({
        messages: [{ role: "user", content: "hi" }],
        tools: [toolSpec()]
      } satisfies ChatRequest)
    ).resolves.toMatchObject({
      message: { content: "mistral-chat" },
      toolCalls: [{ name: "add" }]
    });
    await expect(collectStream(mistral.stream({ prompt: "hi" } satisfies CompletionRequest))).resolves.toEqual([
      "mistral-chat"
    ]);

    const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ responses: ["ok"] }) }));
    const health = await router.handle(new Request("http://localhost/health"));
    expect(await health.json()).toMatchObject({ ok: true, data: { name: "langfn", version: "0.1.0" } });

    const tracer = new Tracer({ redactionKeys: ["apiKey"] });
    expect(tracer.sanitize({ apiKey: "secret", keep: 1 })).toEqual({ apiKey: "***REDACTED***", keep: 1 });

    const pingTool = new Tool({
      name: "ping",
      description: "Ping",
      schema: {
        parse(value) {
          return (value ?? {}) as Record<string, never>;
        },
        jsonSchema: { type: "object", properties: {} }
      },
      execute: async () => "pong"
    });
    const server = new MCPServer([pingTool]);
    expect(server.listTools()).toMatchObject([{ name: "ping" }]);
  });
});

function createFetch(
  handler: (url: string, body: string) => Response | Promise<Response>
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const body = typeof init?.body === "string" ? init.body : "";
    return await handler(url, body);
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

function sseResponse(lines: string[]): Response {
  return new Response(`${lines.join("\n\n")}\n\n`, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

function toolSpec() {
  return {
    name: "add",
    description: "Add numbers",
    input_schema: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } }
    }
  };
}

async function collectStream(stream: AsyncIterable<{ type: string; delta?: string }>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const event of stream) {
    if (event.type === "content" && event.delta) {
      chunks.push(event.delta);
    }
  }
  return chunks;
}
