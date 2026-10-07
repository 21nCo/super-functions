import { describe, expect, it, vi } from "vitest";
import { LangFn } from "../src/client.js";
import { ProviderAuthError, TimeoutError } from "../src/core/errors.js";
import { GoogleChatModel } from "../src/models/google.js";
const reply = (parts: unknown[], extra = {}) => ({
  candidates: [{ content: { parts }, finishReason: "STOP" }],
  ...extra,
});
describe("Google native tool protocol", () => {
  it("preserves system instructions, signed model parts and matching tool results", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          reply(
            [
              {
                functionCall: { name: "lookup", args: { q: "x" } },
                thoughtSignature: "signed",
              },
            ],
            {
              usageMetadata: {
                promptTokenCount: 2,
                candidatesTokenCount: 3,
                thoughtsTokenCount: 4,
                totalTokenCount: 9,
              },
            },
          ),
        ),
      )
      .mockResolvedValueOnce(Response.json(reply([{ text: "done" }])));
    const model = new GoogleChatModel({ apiKey: "key", fetchImpl });
    const first = await model.chat({
      messages: [
        { role: "system", content: "policy" },
        { role: "user", content: "find" },
      ],
      tools: [{ name: "lookup", input_schema: { type: "object" } }],
    });
    expect(first.usage?.total_tokens).toBe(9);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).tools[0].functionDeclarations[0].description).toBe("lookup");
    await model.chat({
      messages: [
        { role: "user", content: "find" },
        first.message,
        {
          role: "tool",
          tool_call_id: first.toolCalls![0].id,
          content: '{"ok":true}',
        },
      ],
    });
    const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(payload.contents[1]).toEqual({
      role: "model",
      parts: [
        {
          functionCall: { name: "lookup", args: { q: "x" } },
          thoughtSignature: "signed",
        },
      ],
    });
    expect(payload.contents[2].parts[0].functionResponse).toEqual({
      name: "lookup",
      response: { result: { ok: true } },
    });
    expect(
      JSON.parse(fetchImpl.mock.calls[0][1].body).systemInstruction.parts[0]
        .text,
    ).toBe("policy");
    expect(fetchImpl.mock.calls[0][0]).not.toContain("key=");
  });
  it("returns the provider call ID with the matching function response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          reply([
            { functionCall: { id: "provider-call", name: "lookup", args: {} } },
          ]),
        ),
      )
      .mockResolvedValueOnce(Response.json(reply([{ text: "done" }])));
    const model = new GoogleChatModel({ apiKey: "key", fetchImpl });
    const first = await model.chat({
      messages: [{ role: "user", content: "lookup" }],
    });
    await model.chat({
      messages: [
        { role: "user", content: "lookup" },
        first.message,
        { role: "tool", tool_call_id: "provider-call", content: "{}" },
      ],
    });
    expect(
      JSON.parse(fetchImpl.mock.calls[1][1].body).contents[2].parts[0]
        .functionResponse.id,
    ).toBe("provider-call");
  });
  it("parses arbitrarily fragmented SSE including UTF-8 and returns a continuation message", async () => {
    const wire = `data: ${JSON.stringify(reply([{ text: "é" }, { functionCall: { name: "lookup", args: { q: "x" } } }]))}\r\n\r\n`;
    const bytes = new TextEncoder().encode(wire);
    const body = new ReadableStream({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    });
    const model = new GoogleChatModel({
      apiKey: "key",
      fetchImpl: vi.fn().mockResolvedValue(new Response(body)),
    });
    const events = [];
    for await (const event of model.streamChat({
      messages: [{ role: "user", content: "x" }],
    }))
      events.push(event);
    expect(events[0]).toMatchObject({ type: "content", delta: "é" });
    expect(events.find((e) => e.type === "tool_call")).toMatchObject({
      toolName: "lookup",
      args: { q: "x" },
    });
    expect(events.find((e) => e.type === "message")).toBeDefined();
    expect(events.at(-1)).toEqual({ type: "end", finish_reason: "tool_calls" });
  });
  it("rejects unpaired tool output before contacting the provider", async () => {
    const fetchImpl = vi.fn();
    const model = new GoogleChatModel({ apiKey: "key", fetchImpl });
    await expect(
      model.chat({
        messages: [{ role: "tool", tool_call_id: "missing", content: "{}" }],
      }),
    ).rejects.toThrow("matching prior");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects truncated streams and cancels the body on early exit", async () => {
    const cancel = vi.fn();
    const frame = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "first" }] } }] })}\n\n`;
    const body = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(frame));
      },
      cancel,
    });
    const model = new GoogleChatModel({
      apiKey: "key",
      fetchImpl: vi.fn().mockResolvedValue(new Response(body)),
    });
    for await (const _ of model.stream({ prompt: "x" })) break;
    expect(cancel).toHaveBeenCalledOnce();
    const bad = new GoogleChatModel({
      apiKey: "key",
      fetchImpl: vi.fn().mockResolvedValue(new Response("data: {")),
    });
    await expect(async () => {
      for await (const _ of bad.stream({ prompt: "x" })) {
      }
    }).rejects.toThrow("Truncated");
  });
  it("honors a pre-aborted request and rejects malformed function args", async () => {
    const fetchImpl = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const model = new GoogleChatModel({ apiKey: "key", fetchImpl });
    await expect(
      model.chat({
        messages: [{ role: "user", content: "x" }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    const bad = new GoogleChatModel({
      apiKey: "key",
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          Response.json(
            reply([{ functionCall: { name: "bad", args: "broken" } }]),
          ),
        ),
    });
    await expect(
      bad.chat({ messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow("Malformed");
  });

  it("preserves timeout identity during headers and retries the request", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) throw new Error("missing request signal");
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      }),
    );
    const client = new LangFn({
      model: new GoogleChatModel({ apiKey: "key", timeout: 5, fetchImpl }),
      retry: { maxAttempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
    });

    await expect(client.complete("slow")).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      provider: "google",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves timeout identity while consuming the response body", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error("missing request signal");
      return new Response(new ReadableStream({
        start(controller) {
          signal.addEventListener(
            "abort",
            () => controller.error(new DOMException("The operation was aborted", "AbortError")),
            { once: true },
          );
        },
      }));
    });
    const model = new GoogleChatModel({ apiKey: "key", timeout: 5, fetchImpl });

    await expect(model.chat({
      messages: [{ role: "user", content: "slow" }],
    })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("does not replace a classified HTTP error when cleanup crosses the timeout", async () => {
    const body = new ReadableStream({
      async cancel() {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    const model = new GoogleChatModel({
      apiKey: "key",
      timeout: 5,
      fetchImpl: async () => new Response(body, { status: 401 })
    });

    await expect(model.chat({
      messages: [{ role: "user", content: "hello" }]
    })).rejects.toBeInstanceOf(ProviderAuthError);
  });
});
