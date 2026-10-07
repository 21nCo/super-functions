import { describe, expect, it, vi } from "vitest";
import { LangFn } from "../src/client.js";
import { MockChatModel } from "../src/models/mock.js";
import { createLangFnRouter } from "../src/http/routes.js";
import { TraceStorage } from "../src/observability/storage.js";
import { StateGraph } from "../src/graph/index.js";
import { getTransportClient } from "../src/models/transport.js";
import { OpenAIChatModel } from "../src/models/openai.js";
import { CancellationToken } from "../src/utils/cancel.js";
import { ProviderError } from "../src/core/errors.js";

describe("review regressions", () => {
  it("isolates traces and feedback using the configured authentication context key", async () => {
    const rows: Record<string, any[]> = {};
    const db = {
      async create({ model, data }: any) { (rows[model] ??= []).push(data); return data; },
      async findMany({ model, where = [] }: any) { return (rows[model] ?? []).filter(row => where.every((c: any) => row[c.field] === c.value)); },
      async findOne(args: any) { return (await this.findMany(args))[0] ?? null; }
    };
    const storage = new TraceStorage(db as any);
    const lang = new LangFn({ model: new MockChatModel({ responses: ["private"] }), observability: { traceStorage: storage } });
    const router = createLangFnRouter(lang, { auth: { contextKey: "identity", validateBearerToken: async token => ({ id: token, type: "bearer", subject: { actorId: token, actorType: "user", tenantId: `tenant-${token}` } }) } });
    const call = (user: string, path: string, data?: any) => router.handle(new Request(`https://test${path}`, { method: data ? "POST" : "GET", headers: { authorization: `Bearer ${user}`, "content-type": "application/json", "x-tenant-id": "tenant-a", "x-user-id": "a" }, body: data ? JSON.stringify(data) : undefined }));
    const completed = await (await call("a", "/complete", { prompt: "private", metadata: { tenantId: "spoof", userId: "spoof" } })).json();
    expect(rows.langfn_traces[0]).toMatchObject({ tenantId: "tenant-a", userId: "a" });
    expect((await (await call("b", "/traces")).json()).data.traces).toEqual([]);
    expect((await (await call("a", "/traces")).json()).data.traces).toHaveLength(1);
    expect((await call("b", "/feedback", { traceId: completed.traceId, rating: 1 })).status).toBe(404);
    expect(rows.langfn_trace_feedback).toBeUndefined();
    expect((await call("a", "/feedback", { traceId: completed.traceId, rating: 1 })).status).toBe(200);
    const anonymous = createLangFnRouter(lang);
    expect((await anonymous.handle(new Request("https://test/traces"))).status).toBe(401);
  });

  it("does not expose provider bodies or unexpected exception text over HTTP", async () => {
    for (const error of [new Error("api-secret"), new ProviderError("api-secret", { metadata: { body: "api-secret" } })]) {
      const router = createLangFnRouter(new LangFn({ model: new MockChatModel({ complete: async () => { throw error; } }), retry: { maxAttempts: 1 } }));
      const response = await router.handle(new Request("https://test/complete", { method: "POST", body: JSON.stringify({ prompt: "hi" }) }));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await response.text()).not.toContain("api-secret");
    }
  });

  it("resumes an interrupt with its graph's default checkpoint store", async () => {
    const graph = new StateGraph({ value: 0 }).addNode("step", s => ({ value: s.value + 1 })).setEntryPoint("step").addInterrupt("step").compile();
    let checkpointId: string | undefined;
    try { await graph.invoke(); } catch (error: any) { checkpointId = error.metadata.checkpointId; }
    expect(checkpointId).toBeTruthy();
    expect(await graph.resume(checkpointId!)).toEqual({ value: 1 });
  });

  it("enforces timeout through stalled body reads even with a caller signal", async () => {
    let signal: AbortSignal | undefined;
    const cancel = vi.fn();
    const client = getTransportClient({ baseUrl: "https://test", timeout: 15, fetchImpl: (async (_url, init) => { signal = init?.signal as AbortSignal; return new Response(new ReadableStream({ cancel })); }) as typeof fetch });
    const response = await client.request("/stall", { signal: new AbortController().signal });
    await expect(response.text()).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("aborts provider fetches on client timeout and cancellation, and skips precancelled calls", async () => {
    const signals: AbortSignal[] = [];
    const model = new OpenAIChatModel({ apiKey: "test", fetchImpl: (async (_url, init) => {
      const signal = init!.signal!; signals.push(signal);
      return await new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }) as typeof fetch });
    const lang = new LangFn({ model, retry: { maxAttempts: 1 } });
    await expect(lang.complete("hello", { timeout: 10 })).rejects.toThrow();
    expect(signals[0].aborted).toBe(true);
    const token = new CancellationToken();
    const pending = lang.complete("hello", { cancelToken: token });
    await new Promise(resolve => setTimeout(resolve, 0)); token.cancel();
    await expect(pending).rejects.toThrow();
    expect(signals[1].aborted).toBe(true);
    await expect(lang.complete("hello", { cancelToken: token })).rejects.toThrow();
    expect(signals).toHaveLength(2);
  });
});
