import { describe, expect, it } from "vitest";

import { LangFn } from "../src/client.js";
import { TraceNotFoundError, ValidationError } from "../src/core/errors.js";
import { tokenUsage } from "../src/core/types.js";
import { MockChatModel } from "../src/models/mock.js";
import { CostMeter } from "../src/observability/cost-meter.js";
import { TraceStorage } from "../src/observability/storage.js";
import { normalizeStream } from "../src/streaming/sse.js";

class InMemoryAdapter {
  traces: Record<string, unknown>[] = [];
  spans: Record<string, unknown>[] = [];
  feedback: Record<string, unknown>[] = [];

  async create(params: { model: string; data: Record<string, unknown> }) {
    this.table(params.model).push(params.data);
    return params.data;
  }

  async findOne(params: { model: string; where: Array<{ field: string; value: unknown }> }) {
    return this.table(params.model).find((row) =>
      params.where.every((clause) => row[clause.field] === clause.value)
    ) ?? null;
  }

  async findMany(params: {
    model: string;
    where?: Array<{ field: string; value: unknown }>;
    orderBy?: Array<{ field: string; direction: "asc" | "desc" }>;
  }) {
    const rows = this.table(params.model).filter((row) =>
      (params.where ?? []).every((clause) => row[clause.field] === clause.value)
    );
    if (params.orderBy?.[0]) {
      const [{ field, direction }] = params.orderBy;
      rows.sort((left, right) => {
        const leftValue = Number(left[field] ?? 0);
        const rightValue = Number(right[field] ?? 0);
        return direction === "desc" ? rightValue - leftValue : leftValue - rightValue;
      });
    }
    return rows;
  }

  private table(name: string) {
    if (name === "langfn_traces") return this.traces;
    if (name === "langfn_trace_spans") return this.spans;
    if (name === "langfn_trace_feedback") return this.feedback;
    throw new Error(`Unknown table ${name}`);
  }
}

describe("streaming and observability", () => {
  it("normalizes the canonical stream taxonomy and enforces terminal events", async () => {
    const client = new LangFn({
      model: new MockChatModel({
        streams: [[
          { type: "content", delta: "Hel", content: "Hel" },
          { type: "content", delta: "lo", content: "lo" },
          { type: "tool_call", id: "call_1", toolName: "lookup_weather", args: { city: "Paris" } },
          { type: "tool_result", toolCallId: "call_1", result: { temperatureC: 18 } },
          { type: "reasoning", step: "1", thinking: "Need weather data" },
          { type: "trace_event", span: "langfn.provider.stream", metadata: { phase: "mid" } },
          { type: "token_usage", prompt_tokens: 3, completion_tokens: 2 },
          { type: "end", finish_reason: "stop" }
        ]]
      })
    });

    const events = await collect(client.stream("hello"));
    expect(events.map((event) => event.type)).toEqual([
      "content",
      "content",
      "tool_call",
      "tool_result",
      "reasoning",
      "trace_event",
      "token_usage",
      "end"
    ]);
    expect(new Set(events.map((event) => event.traceId ?? event.trace_id)).size).toBe(1);
    expect(events.at(-1)?.type).toBe("end");

    await expect(
      (async () => {
        const broken = normalizeStream(
          (async function* () {
            yield { type: "end", finish_reason: "stop" };
            yield { type: "content", content: "oops", delta: "oops" };
          })(),
          "trace-test"
        );
        for await (const _event of broken) {
          // exhaust the generator
        }
      })()
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("terminates cancelled and timed out streams with canonical error events", async () => {
    const timeoutClient = new LangFn({
      model: new MockChatModel({
        streams: [[
          {
            type: "content",
            content: "late",
            delta: "late"
          }
        ]],
        complete: async () => ({ content: "unused" })
      })
    }).withModel("custom", {
      stream: async function* () {
        await new Promise((resolve) => setTimeout(resolve, 25));
        yield { type: "content", content: "late", delta: "late" };
      }
    });

    const timeoutEvents = await collect(timeoutClient.stream("slow", { timeout: 5 }));
    expect(timeoutEvents).toHaveLength(1);
    expect(timeoutEvents[0]).toMatchObject({ type: "error", error: { code: "PROVIDER_TIMEOUT" } });
  });

  it("emits one terminal error when trace persistence fails after provider completion", async () => {
    const client = new LangFn({
      model: new MockChatModel({ responses: ["done"] }),
      observability: {
        enabled: true,
        traceStorage: {
          saveTrace: async () => { throw new Error("trace unavailable"); },
          findMany: async () => [],
        },
      },
    });

    const events = await collect(client.stream("hello"));
    expect(events.filter((event) => event.type === "end" || event.type === "error"))
      .toEqual([expect.objectContaining({ type: "error" })]);
    expect(events.some((event) => event.type === "end")).toBe(false);
  });

  it("persists fresh traces and idempotent feedback through shared storage", async () => {
    const adapter = new InMemoryAdapter();
    const storage = new TraceStorage(adapter as never);
    const client = new LangFn({
      model: new MockChatModel({ responses: ["one", "two"] }),
      observability: {
        enabled: true,
        traceStorage: storage
      }
    });

    const first = await client.complete("first");
    const second = await client.complete("second");
    expect(first.traceId).not.toBe(second.traceId);

    const traces = await client.getTraces();
    expect(traces).toHaveLength(2);

    await client.feedback({ traceId: second.traceId, clientKey: "web-1", rating: 5 });
    await client.feedback({ traceId: second.traceId, clientKey: "web-1", rating: 5 });
    expect(await storage.listFeedback(second.traceId!)).toHaveLength(1);

    await expect(client.feedback({ traceId: "missing", rating: 1 })).rejects.toBeInstanceOf(TraceNotFoundError);
  });

  it("redacts stored and exported observability payloads and enforces budgets", async () => {
    const adapter = new InMemoryAdapter();
    const storage = new TraceStorage(adapter as never);
    const watchEvents: Array<Record<string, unknown>> = [];
    const exporterEvents: Array<Record<string, unknown>> = [];
    const otlpEvents: Array<Record<string, unknown>> = [];
    const client = new LangFn({
      model: new MockChatModel({
        responses: ["ok"],
        usage: { prompt_tokens: 1000, completion_tokens: 0 }
      }),
      observability: {
        enabled: true,
        traceStorage: storage,
        costMeter: new CostMeter({ prices: { mock: { "mock-1": { prompt: 1.0, completion: 0.0 } } } }),
        budgets: { perRequestUsd: 0.5 },
        watchfn: {
          track(_name, payload) {
            watchEvents.push(payload);
          }
        },
        exporter: {
          async export(_name, payload) {
            exporterEvents.push(payload);
          }
        },
        otlpExporter: {
          async export(payload) {
            otlpEvents.push(payload);
          }
        },
        redactionKeys: ["apiKey", "email"]
      }
    });

    await expect(
      client.complete("secret", {
        metadata: {
          apiKey: "secret",
          email: "user@example.com"
        }
      })
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });

    const budgetOkClient = new LangFn({
      model: new MockChatModel({
        responses: ["ok"],
        usage: tokenUsage(1, 1)
      }),
      observability: {
        enabled: true,
        traceStorage: storage,
        costMeter: new CostMeter({ prices: { mock: { "mock-1": { prompt: 0.1, completion: 0.1 } } } }),
        budgets: { perRequestUsd: 1.0 },
        watchfn: {
          track(_name, payload) {
            watchEvents.push(payload);
          }
        },
        exporter: {
          async export(_name, payload) {
            exporterEvents.push(payload);
          }
        },
        otlpExporter: {
          async export(payload) {
            otlpEvents.push(payload);
          }
        },
        redactionKeys: ["apiKey", "email"]
      }
    });

    await budgetOkClient.complete("secret", {
      metadata: {
        apiKey: "secret",
        email: "user@example.com"
      }
    });

    const traceRow = adapter.traces.at(-1) as Record<string, unknown>;
    expect(JSON.stringify(traceRow.metadata)).not.toContain("user@example.com");
    expect(JSON.stringify(traceRow.metadata)).toContain("***REDACTED***");
    expect(JSON.stringify(watchEvents)).toContain("***REDACTED***");
    expect(JSON.stringify(exporterEvents)).toContain("***REDACTED***");
    expect(JSON.stringify(otlpEvents)).toContain("***REDACTED***");
  });
});

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

it('rejects streaming usage above the per-request budget before end', async () => {
  const model = { provider: 'mock', model: 'mock-1', async *stream() { yield { type: 'token_usage', prompt_tokens: 1000, completion_tokens: 0 }; yield { type: 'end', finish_reason: 'stop' }; } } as any;
  const client = new LangFn({ model, observability: { costMeter: new CostMeter({ prices: { mock: { 'mock-1': { prompt: 1, completion: 0 } } } }), budgets: { perRequestUsd: 0.5 } } });
  const events = []; for await (const event of client.stream('hello')) events.push(event);
  expect(events.some(event => event.type === 'error' && event.error.code === 'BUDGET_EXCEEDED')).toBe(true);
  expect(events.some(event => event.type === 'end')).toBe(false);
  expect(events.at(-1)?.type).toBe('error');
});
