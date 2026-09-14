import { expect, it, vi } from "vitest";
import { OpenAIChatModel } from "../src/models/openai.js";
import { OllamaChatModel } from "../src/models/ollama.js";
import { MistralChatModel } from "../src/models/mistral.js";
import { AnthropicChatModel } from "../src/models/anthropic.js";
import { GoogleChatModel } from "../src/models/google.js";
import { readStreamLines } from "../src/models/stream-lines.js";
import { executeApiCall } from "../src/tools/api_call.js";
import { getTransportClient } from "../src/models/transport.js";
const frame = (x: unknown) => `data: ${JSON.stringify(x)}\n\n`;
const collect = async (stream: AsyncIterable<unknown>) => {
  for await (const _ of stream) {
    /* drain */
  }
};

it.each([undefined, null, -1, "10", NaN, Infinity])(
  "rejects incomplete or malformed usage counters: %s",
  async (bad) => {
    for (const Model of [
      OpenAIChatModel,
      MistralChatModel,
      AnthropicChatModel,
      OllamaChatModel,
    ]) {
      const data =
        Model === OllamaChatModel
          ? { prompt_eval_count: bad, eval_count: 2, done: true }
          : Model === AnthropicChatModel
            ? { usage: { input_tokens: bad, output_tokens: 2 }, content: [] }
            : {
                usage: { prompt_tokens: bad, completion_tokens: 2 },
                choices: [{ message: { content: "ok" } }],
              };
      // JSON turns non-finite numbers into null, which must also fail closed.
      const fetchImpl = vi.fn(async (_: unknown, init?: RequestInit) => {
        const stream = JSON.parse(String(init?.body)).stream;
        const wire =
          !stream || Model === OllamaChatModel
            ? JSON.stringify(data)
            : frame(
                Model === AnthropicChatModel
                  ? { type: "message_start", message: data }
                  : data,
              );
        return new Response(wire);
      });
      const model = new Model({ fetchImpl, apiKey: "test" });
      await expect(
        model.chat({ messages: [{ role: "user", content: "x" }] }),
      ).rejects.toMatchObject({ code: "INVALID_TOKEN_USAGE" });
      await expect(
        collect(model.stream({ prompt: "x" })),
      ).rejects.toMatchObject({ code: "INVALID_TOKEN_USAGE" });
    }
  },
);
it.each(["{", "[]", "null", "1", undefined])(
  "rejects invalid tool arguments instead of executing defaults: %s",
  async (args) => {
    for (const Model of [OpenAIChatModel, MistralChatModel]) {
      const model = new Model({
        apiKey: "test",
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        id: "call",
                        function: { name: "write", arguments: args },
                      },
                    ],
                  },
                },
              ],
            }),
          ),
      });
      await expect(
        model.chat({ messages: [{ role: "user", content: "x" }] }),
      ).rejects.toThrow(/Invalid tool call/);
    }
  },
);
it("emits Mistral content before the response completes and cancels on early return", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(
        new TextEncoder().encode(
          frame({ choices: [{ delta: { content: "first" } }] }),
        ),
      );
    },
    cancel,
  });
  const model = new MistralChatModel({
    fetchImpl: async (_url, init) => {
      expect(JSON.parse(String(init?.body)).stream).toBe(true);
      return new Response(body);
    },
  });
  const stream = model.stream({ prompt: "x" })[Symbol.asyncIterator]();
  expect((await stream.next()).value).toMatchObject({
    type: "content",
    delta: "first",
  });
  await stream.return!();
  expect(cancel).toHaveBeenCalledOnce();
});
it("bounds unfinished lines across chunks and releases the reader", async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([65, 65, 65]));
      c.enqueue(new Uint8Array([65, 65]));
    },
    cancel,
  });
  await expect(collect(readStreamLines(body, 4))).rejects.toMatchObject({
    code: "RESPONSE_TOO_LARGE",
  });
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
});
it.each(["application/json", "text/plain"])(
  "bounds API response bytes before %s decoding",
  async (contentType) => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(10));
      },
      cancel,
    });
    await expect(
      executeApiCall(
        { url: "https://api.example.test" },
        {
          allowedHosts: ["api.example.test"],
          maxResponseBytes: 4,
          fetchImpl: async () =>
            new Response(body, { headers: { "content-type": contentType } }),
        },
      ),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it("preserves provider timeout identity for header and body deadlines", async () => {
  for (const headersArrive of [false, true]) {
    const client = getTransportClient({
      baseUrl: "https://timeout.test",
      timeout: 5,
      fetchImpl: async (_url, init) => {
        if (headersArrive)
          return new Response(new ReadableStream({ cancel() {} }));
        return new Promise((_resolve, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(init!.signal!.reason),
          ),
        );
      },
    });
    await expect(
      client.request("/").then((r) => r.text()),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  }
});
it("continues Google snake_case tool calls", async () => {
  const model = new GoogleChatModel({
    apiKey: "test",
    fetchImpl: async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.contents[0].parts[0].functionCall.name).toBe("lookup");
      expect(payload.contents[1].parts[0].functionResponse.name).toBe("lookup");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "done" }] } }],
        }),
      );
    },
  });
  await expect(
    model.chat({
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "c",
              type: "function",
              function: { name: "lookup", arguments: "{}" },
            },
          ],
        },
        { role: "tool", content: "{}", tool_call_id: "c" },
      ],
    }),
  ).resolves.toMatchObject({ message: { content: "done" } });
});

it("preserves and rejects malformed totals through completion, chat and fallback streaming", async () => {
  const { LangFn } = await import("../src/client.js");
  const { CustomChatModel } = await import("../src/models/base.js");
  const usage = {
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: -1,
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: -1,
  };
  const model = new CustomChatModel({
    complete: () => ({ content: "x", usage }),
    chat: () => ({ message: { role: "assistant", content: "x" }, usage }),
  });
  const client = new LangFn({ model });
  await expect(client.complete("x")).rejects.toMatchObject({
    code: "INVALID_TOKEN_USAGE",
  });
  await expect(
    client.chat([{ role: "user", content: "x" }]),
  ).rejects.toMatchObject({ code: "INVALID_TOKEN_USAGE" });
  const events = [];
  for await (const event of client.stream("x")) events.push(event);
  expect(events.at(-1)).toMatchObject({
    type: "error",
    error: { code: "INVALID_TOKEN_USAGE" },
  });
  expect(events.some((event) => event.type === "end")).toBe(false);
});

it("does not spawn a process if stdio closes during lazy loading", async () => {
  const { StdioMCPTransport } = await import("../src/mcp/stdio.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );
  const start = vi
    .spyOn(StdioClientTransport.prototype, "start")
    .mockRejectedValue(new Error("unexpected spawn"));
  try {
    const transport = new StdioMCPTransport({ command: "not-executed" });
    const starting = transport.start();
    await transport.close();
    await expect(starting).rejects.toThrow("closed during start");
    expect(start).not.toHaveBeenCalled();
  } finally {
    start.mockRestore();
  }
});

it("preserves BOM characters after the start of a UTF-8 stream", async () => {
  const bytes = new TextEncoder().encode("\uFEFFfirst\n\uFEFFsecond\nlast");
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } });
  const lines = [];
  for await (const line of readStreamLines(body)) lines.push(line);
  expect(lines).toEqual(["first", "\uFEFFsecond", "last"]);
});

it("requires real credentials even with an injected OpenAI transport", async () => {
  const fetchImpl = vi.fn();
  const model = new OpenAIChatModel({ fetchImpl });
  await expect(model.complete({prompt:"x"})).rejects.toMatchObject({code:"NOT_CONFIGURED"});
  await expect(collect(model.stream({prompt:"x"}))).rejects.toMatchObject({code:"NOT_CONFIGURED"});
  const { LangFn } = await import("../src/client.js");
  await expect(new LangFn({model}).embed("x")).rejects.toMatchObject({code:"NOT_CONFIGURED"});
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("shares endpoint, fetch, organization and rotating credentials with embeddings", async () => {
  const { LangFn } = await import("../src/client.js");
  let key = "first";
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({data:[{index:0,embedding:[1,2]}]})));
  const lang = new LangFn({model:new OpenAIChatModel({apiKeyRef:"key", secretProvider:()=>key, baseUrl:"https://proxy.example/v1", organization:"org", fetchImpl})});
  expect(await lang.embed("x")).toEqual([1,2]);
  key = "second";
  await lang.embed(["y"]);
  expect(fetchImpl.mock.calls.map(c=>String(c[0]))).toEqual(["https://proxy.example/v1/embeddings","https://proxy.example/v1/embeddings"]);
  expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("authorization")).toBe("Bearer second");
  expect(new Headers(fetchImpl.mock.calls[1][1]?.headers).get("openai-organization")).toBe("org");
});

it("forwards only trusted policy response limits through the API tool", async () => {
  const { ApiCallTool } = await import("../src/tools/api_call.js");
  const { ToolPolicy } = await import("../src/tools/policy.js");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("hello")));
  try {
    await expect(ApiCallTool.run({url:"https://limit.example",maxResponseBytes:1000}, {metadata:{},policy:new ToolPolicy({allowedHosts:["limit.example"],maxResponseBytes:4})})).rejects.toMatchObject({code:"RESPONSE_TOO_LARGE"});
    expect(await ApiCallTool.run({url:"https://limit.example"}, {metadata:{},policy:new ToolPolicy({allowedHosts:["limit.example"],maxResponseBytes:5})})).toBe("hello");
  } finally { vi.unstubAllGlobals(); }
});
