import { describe, it, expect, vi } from "vitest";
import { LangFn } from "../src/client.js";
import { CustomChatModel } from "../src/models/base.js";
import { MockChatModel } from "../src/models/mock.js";
import { CancellationToken } from "../src/utils/cancel.js";
import { RateLimitError } from "../src/core/errors.js";
import { parseMessages } from "../src/http/validation.js";
import { getTransportClient } from "../src/models/transport.js";
import { InMemoryCheckpointStore } from "../src/graph/checkpoint.js";
import { TraceStorage } from "../src/observability/storage.js";

describe("second review regressions", () => {
  it("cancels a long provider retry backoff promptly", async () => {
    vi.useFakeTimers();
    try {
      const call = vi.fn(async () => { throw new RateLimitError("limited", { retryAfter: 3600 }); });
      const lang = new LangFn({ model: new MockChatModel({ complete: call }) });
      const cancelToken = new CancellationToken();
      const pending = lang.complete("hi", { cancelToken });
      const rejected = expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1);
      cancelToken.cancel();
      await rejected;
      expect(call).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("cancels a stalled stream and forwards the abort to the provider", async () => {
    let signal: AbortSignal | undefined;
    const model = new CustomChatModel({ stream: async function* (request) {
      signal = request.signal;
      await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }));
    } });
    const token = new CancellationToken();
    const iterator = new LangFn({ model }).stream("hi", { cancelToken: token })[Symbol.asyncIterator]();
    const pending = iterator.next();
    await new Promise(resolve => setTimeout(resolve, 0)); token.cancel();
    expect(await pending).toMatchObject({ value: { type: "error", error: { code: "ABORT" } } });
    expect(signal?.aborted).toBe(true);
  });

  it("preserves validated assistant continuation fields", () => {
    const assistant = { role: "assistant" as const, content: "", toolCalls: [{ id: "c", name: "lookup", arguments: { q: "x" } }], providerData: { googleParts: [{ functionCall: { name: "lookup", args: { q: "x" } }, thoughtSignature: "signed" }] } };
    expect(parseMessages([assistant, { role: "tool", content: "result", tool_call_id: "c" }])[0]).toEqual(assistant);
    expect(() => parseMessages([{ role: "assistant", content: "", toolCalls: [{ id: "", name: "lookup", arguments: {} }] }])).toThrow();
    expect(() => parseMessages([{ role: "user", content: "hi", providerData: assistant.providerData }])).toThrow();
  });

  it("preserves response metadata when wrapping the body", async () => {
    const original = new Response("body");
    Object.defineProperties(original, { url: { value: "https://test/final" }, redirected: { value: true }, type: { value: "cors" } });
    const client = getTransportClient({ baseUrl: "https://test", fetchImpl: vi.fn(async () => original) as typeof fetch });
    const response = await client.request("/start");
    expect([response.url, response.redirected, response.type]).toEqual([original.url, true, "cors"]);
    expect(await response.text()).toBe("body");
  });

  it("bounds abandoned checkpoint retention", async () => {
    const store = new InMemoryCheckpointStore(2);
    for (const id of ["a", "b", "c"]) await store.save({ id, state: {}, node: "step", steps: 0 });
    expect(await store.load("a")).toBeUndefined();
    await store.remove("b"); expect(await store.load("b")).toBeUndefined();
    expect(await store.load("c")).toBeDefined();
  });

  it("scopes feedback idempotency even when trace IDs collide", async () => {
    const tables: Record<string, any[]> = { langfn_traces: ["a", "b"].map(tenantId => ({ traceId: "same", tenantId, userId: "u" })) };
    const db = {
      async create({ model, data }: any) { (tables[model] ??= []).push(data); },
      async findOne({ model, where }: any) { return tables[model]?.find(row => where.every((c: any) => row[c.field] === c.value)) ?? null; },
      async upsert({ model, where, create }: any) {
        const existing = await this.findOne({ model, where });
        if (existing) return existing;
        (tables[model] ??= []).push(create);
        return create;
      }
    };
    const storage = new TraceStorage(db as any);
    for (const tenantId of ["a", "b"]) {
      const result = await storage.saveFeedback({ traceId: "same", clientKey: "key", rating: 1, comment: tenantId, scope: { tenantId, userId: "u" } });
      expect(result.comment).toBe(tenantId);
    }
    expect(tables.langfn_trace_feedback).toHaveLength(2);
  });

  it("rejects custom stores that cannot safely implement scoped access", async () => {
    const lang = new LangFn({ model: new MockChatModel(), observability: { traceStorage: { findMany: async () => [], saveFeedback: async () => {} } } });
    await expect(lang.getTraces({ tenantId: "t", limit: 1 })).rejects.toThrow("scope-aware");
    await expect(lang.feedback({ traceId: "id", rating: 1, scope: { tenantId: "t" } })).rejects.toThrow("scope-aware");
  });
});

it("continues Gemini tool calls through two HTTP chat requests", async () => {
  const { GoogleChatModel } = await import("../src/models/google.js");
  const { createLangFnRouter } = await import("../src/http/routes.js");
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ functionCall: { name: "lookup", args: { q: "x" } }, thoughtSignature: "signed" }] }, finishReason: "STOP" }] }))
    .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "done" }] }, finishReason: "STOP" }] }));
  const router = createLangFnRouter(new LangFn({ model: new GoogleChatModel({ apiKey: "fixture", fetchImpl }) }));
  const chat = (messages: unknown[]) => router.handle(new Request("https://test/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages }) }));
  const first = await (await chat([{ role: "user", content: "find" }])).json();
  const assistant = first.data.message;
  const second = await chat([{ role: "user", content: "find" }, assistant, { role: "tool", content: '{"ok":true}', tool_call_id: first.data.toolCalls[0].id }]);
  expect(second.status).toBe(200);
  const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(payload.contents[1].parts[0].thoughtSignature).toBe("signed");
  expect(payload.contents[2].parts[0].functionResponse.name).toBe("lookup");
});
