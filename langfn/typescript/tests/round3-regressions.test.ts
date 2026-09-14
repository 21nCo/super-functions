import { describe, it, expect, vi } from "vitest";
import { LangFn } from "../src/client.js";
import { CustomChatModel } from "../src/models/base.js";
import { MockChatModel } from "../src/models/mock.js";
import { OpenAIChatModel } from "../src/models/openai.js";
import { OllamaChatModel } from "../src/models/ollama.js";
import { RateLimitError, ProviderError } from "../src/core/errors.js";
import { createLangFnRouter } from "../src/http/routes.js";
import { TraceStorage } from "../src/observability/storage.js";
import { InMemoryCheckpointStore, StateGraph } from "../src/graph/index.js";
import { enforceOutboundPolicy } from "../src/tools/policy.js";
import { executeApiCall } from "../src/tools/api_call.js";

function traces() {
  const tables: Record<string, any[]> = {};
  const db = {
    async create({ model, data }: any) { (tables[model] ??= []).push(data); return data; },
    async findMany({ model, where = [] }: any) { return (tables[model] ?? []).filter(row => where.every((c: any) => row[c.field] === c.value)); },
    async findOne(args: any) { return (await this.findMany(args))[0] ?? null; }
  };
  return { tables, storage: new TraceStorage(db as any) };
}

describe("third review regressions", () => {
  it.each(["http://[::1]", "http://[fd00::1]", "http://[fe80::1]", "http://[::ffff:127.0.0.1]", "http://127.1", "http://2130706433", "http://0x7f000001", "http://100.64.0.1", "http://localhost.", "http://attacker.example"])("denies untrusted outbound destination %s", url => {
    expect(() => enforceOutboundPolicy(url)).toThrow();
  });
  it("allows explicit trusted destinations and disables redirects", async () => {
    expect(() => enforceOutboundPolicy("https://8.8.8.8")).not.toThrow();
    expect(() => enforceOutboundPolicy("https://api.example.com", { allowedHosts: ["api.example.com"] })).not.toThrow();
    expect(() => enforceOutboundPolicy("http://[::1]", { allowPrivateNetwork: true })).not.toThrow();
    expect(() => enforceOutboundPolicy("file:///etc/passwd", { allowPrivateNetwork: true })).toThrow();
    expect(() => enforceOutboundPolicy("https://user:pass@api.example.com", { allowedHosts: ["api.example.com"] })).toThrow();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      throw new TypeError("redirect refused");
    });
    await expect(executeApiCall({ url: "https://api.example.com" }, { allowedHosts: ["api.example.com"], fetchImpl: fetchImpl as typeof fetch })).rejects.toThrow("redirect refused");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("round-trips OpenAI tool calls through HTTP using only wire fields", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call", type: "function", function: { name: "lookup", arguments: '{"q":"x"}' } }] } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { role: "assistant", content: "done" } }] }));
    const router = createLangFnRouter(new LangFn({ model: new OpenAIChatModel({ apiKey: "fixture", fetchImpl }) }));
    const chat = (messages: unknown[]) => router.handle(new Request("https://test/chat", { method: "POST", body: JSON.stringify({ messages }) }));
    const first = await (await chat([{ role: "user", content: "find" }])).json();
    const assistant = { ...first.data.message, providerData: { googleParts: [{ text: "private provider state" }] } };
    expect(assistant.toolCalls).toEqual([{ id: "call", name: "lookup", arguments: { q: "x" } }]);
    expect((await chat([{ role: "user", content: "find" }, assistant, { role: "tool", content: "result", tool_call_id: "call" }])).status).toBe(200);
    const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(payload.messages[1]).toEqual({ role: "assistant", content: "", tool_calls: [{ id: "call", type: "function", function: { name: "lookup", arguments: '{"q":"x"}' } }] });
    expect(payload.messages[2]).toEqual({ role: "tool", content: "result", tool_call_id: "call" });
  });
  it("persists fresh scoped traces for cache hits and accepts their feedback", async () => {
    const { storage, tables } = traces();
    let cached: any;
    const model = new MockChatModel(); const call = vi.spyOn(model, "complete");
    const lang = new LangFn({ model, cache: { get: async () => cached, set: async (_p, _m, _v, value) => { cached = value; } }, observability: { traceStorage: storage } });
    const metadata = { tenantId: "t", userId: "u" };
    const first = await lang.complete("hi", { metadata });
    const second = await lang.complete("hi", { metadata });
    expect(call).toHaveBeenCalledOnce(); expect(second.traceId).not.toBe(first.traceId);
    await lang.feedback({ traceId: second.traceId!, rating: 1, scope: metadata });
    expect(tables.langfn_traces).toHaveLength(2); expect(tables.langfn_trace_feedback).toHaveLength(1);
  });
  it("normalizes both feedback scope forms and rejects conflicts", async () => {
    const { storage, tables } = traces();
    for (const tenantId of ["a", "b"]) {
      await storage.saveTrace({ traceId: "same", tenantId, userId: "u" });
      expect(await storage.saveFeedback({ traceId: "same", tenantId, userId: "u", clientKey: "key", rating: 1, comment: tenantId })).toMatchObject({ comment: tenantId, tenantId });
    }
    expect(tables.langfn_trace_feedback).toHaveLength(2);
    await expect(storage.saveFeedback({ traceId: "same", tenantId: "b", scope: { tenantId: "a" }, rating: 1 })).rejects.toThrow("Conflicting");
    await expect(storage.saveFeedback({ traceId: "same", tenantId: "c", rating: 1 })).rejects.toThrow();
  });
  it.each(["tenantContext", "rateLimit", "params", "query", "url", "json", "formData", "text"])("rejects reserved auth context key %s", contextKey => {
    expect(() => createLangFnRouter(new LangFn({ model: new MockChatModel() }), { auth: { contextKey } })).toThrow("reserved");
  });
  it.each(["reader", "request"])("aborts provider work when the SSE %s is cancelled", async mode => {
    let signal: AbortSignal | undefined;
    let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
    const model = new CustomChatModel({ stream: async function* (request) {
      signal = request.signal; started();
      await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }));
    } });
    const controller = new AbortController();
    const router = createLangFnRouter(new LangFn({ model }));
    const response = await router.handle(new Request("https://test/stream", { method: "POST", body: JSON.stringify({ prompt: "hi" }), signal: controller.signal }));
    const reader = response.body!.getReader(); const pending = reader.read();
    await ready;
    if (mode === "reader") await reader.cancel(); else controller.abort();
    expect((await pending).done).toBe(true);
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
  });
  it.each(["complete", "chat", "stream-chat"])("honors configured retry cancellation for %s", async mode => {
    vi.useFakeTimers();
    try {
      const call = vi.fn(async () => { throw new RateLimitError("limited", { retryAfter: 3600 }); });
      const abort = new AbortController();
      const lang = new LangFn({ model: new CustomChatModel({ complete: call, chat: call }), retry: { signal: abort.signal } });
      const messages = [{ role: "user" as const, content: "hi" }];
      const pending = mode === "complete" ? lang.complete("hi") : mode === "chat" ? lang.chat(messages) : lang.stream(messages)[Symbol.asyncIterator]().next();
      const check = mode === "stream-chat" ? expect(pending).resolves.toMatchObject({ value: { type: "error" } }) : expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(1); abort.abort(); await check;
      expect(call).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("suppresses synchronous iterator cleanup errors without masking provider failures", async () => {
    const model = new MockChatModel();
    model.stream = () => ({ [Symbol.asyncIterator]: () => ({ next: async () => { throw new ProviderError("original"); }, return: () => { throw new Error("cleanup"); } }) });
    const iterator = new LangFn({ model }).stream("hi")[Symbol.asyncIterator]();
    expect(await iterator.next()).toMatchObject({ value: { type: "error", error: { code: "PROVIDER_ERROR" } } });
  });
  it("wraps an unrequested Ollama fetch abort as a provider failure", async () => {
    const model = new OllamaChatModel({ fetchImpl: async () => { throw new DOMException("internal", "AbortError"); } });
    await expect(model.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toBeInstanceOf(ProviderError);
    await expect(model.stream({ prompt: "hi" })[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(ProviderError);
  });
  it("consumes checkpoints atomically before side effects and never calls post-run cleanup", async () => {
    const store = new InMemoryCheckpointStore<{ value: number }>();
    const remove = vi.spyOn(store, "remove").mockRejectedValue(new Error("storage unavailable"));
    const effect = vi.fn(async (s: { value: number }) => ({ value: s.value + 1 }));
    const graph = new StateGraph({ value: 0 }).addNode("effect", effect).setEntryPoint("effect").compile();
    await store.save({ id: "c", state: { value: 0 }, node: "effect", steps: 0 });
    const results = await Promise.allSettled([1, 2].map(() => graph.resume("c", { checkpointStore: store })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(effect).toHaveBeenCalledOnce(); expect(remove).not.toHaveBeenCalled();
    await expect(graph.resume("c", { checkpointStore: store })).rejects.toThrow("Unknown checkpoint");
    await expect(graph.resume("c", { checkpointStore: { save: () => {}, load: () => ({ id: "c", state: { value: 0 }, node: "effect", steps: 0 }) } })).rejects.toThrow("atomic take");
    expect(effect).toHaveBeenCalledOnce();
  });
});
