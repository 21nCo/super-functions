import { expect, it } from "vitest";
import { LangFn } from "../src/client.js";
import { CostMeter } from "../src/observability/cost-meter.js";
import { OpenAIChatModel } from "../src/models/openai.js";
import { AnthropicChatModel } from "../src/models/anthropic.js";
import { OllamaChatModel } from "../src/models/ollama.js";
import { MistralChatModel } from "../src/models/mistral.js";
import { CustomChatModel } from "../src/models/base.js";
const sse = (objects: unknown[]) =>
  objects
    .map((x) => `data: ${typeof x === "string" ? x : JSON.stringify(x)}\n\n`)
    .join("");
const fixtures = [
  [
    OpenAIChatModel,
    sse([
      { choices: [{ delta: { content: "hello" } }] },
      { choices: [], usage: { prompt_tokens: 1000, completion_tokens: 2 } },
      "[DONE]",
    ]),
  ],
  [
    AnthropicChatModel,
    sse([
      {
        type: "message_start",
        message: { usage: { input_tokens: 1000, output_tokens: 0 } },
      },
      { type: "message_delta", usage: { output_tokens: 2 } },
      { type: "message_stop" },
    ]),
  ],
  [
    OllamaChatModel,
    JSON.stringify({ message: { content: "hello" } }) +
      "\n" +
      JSON.stringify({ done: true, prompt_eval_count: 1000, eval_count: 2 }),
  ],
  [
    MistralChatModel,
    sse([{ choices: [{ delta: { content: "hello" } }], usage: { prompt_tokens: 1000, completion_tokens: 2 } }, "[DONE]" ]),
  ],
] as const;
for (const [Model, wire] of fixtures) {
  it(`${Model.name} rejects over-budget reported usage before end`, async () => {
    const model = new Model({
      apiKey: "test",
      model: "test",
      fetchImpl: async (_url, init) => {
        if (Model === OpenAIChatModel)
          expect(JSON.parse(String(init?.body)).stream_options).toEqual({
            include_usage: true,
          });
        return new Response(wire);
      },
    });
    const client = new LangFn({
      model,
      observability: {
        costMeter: new CostMeter({
          prices: { [model.provider]: { test: { prompt: 1, completion: 0 } } },
        }),
        budgets: { perRequestUsd: 0.5 },
      },
    });
    const events = [];
    for await (const event of client.stream("hello")) events.push(event);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: { code: "BUDGET_EXCEEDED" },
    });
    expect(events.some((event) => event.type === "end")).toBe(false);
  });
  it(`${Model.name} preserves usage before normal completion`, async () => {
    const model = new Model({
      apiKey: "test",
      model: "test",
      fetchImpl: async () => new Response(wire),
    });
    const events = [];
    for await (const event of model.stream({ prompt: "hello" }))
      events.push(event);
    expect(events.filter((e) => e.type === "token_usage").at(-1)).toMatchObject(
      { prompt_tokens: 1000, completion_tokens: 2 },
    );
    expect(events.at(-1)?.type).toBe("end");
  });
}
it("custom completion fallback preserves usage", async () => {
  const model = new CustomChatModel({
    complete: () => ({
      content: "x",
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
      },
    }),
  });
  const events = [];
  for await (const e of model.stream({ prompt: "x" })) events.push(e);
  expect(events.map((e) => e.type)).toEqual(["content", "token_usage", "end"]);
});
it.each([
  [
    "missing pricing",
    { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    new CostMeter({ prices: {} }),
    "BUDGET_COST_UNAVAILABLE",
  ],
  ["missing usage", undefined, new CostMeter(), "BUDGET_COST_UNAVAILABLE"],
  [
    "invalid usage",
    { prompt_tokens: NaN, completion_tokens: 2, total_tokens: NaN },
    new CostMeter(),
    "INVALID_TOKEN_USAGE",
  ],
] as const)(
  "fails closed on %s when a budget is configured",
  async (_name, usage, costMeter, code) => {
    const model = new CustomChatModel({
      complete: () => ({ content: "x", usage }),
    });
    const client = new LangFn({
      model,
      observability: { costMeter, budgets: { perRequestUsd: 1 } },
    });
    const events = [];
    for await (const e of client.stream("x")) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: "error", error: { code } });
    expect(events.some((e) => e.type === "end")).toBe(false);
    await expect(client.complete("x")).rejects.toMatchObject({ code });
    await expect(
      client.chat([{ role: "user", content: "x" }]),
    ).rejects.toMatchObject({ code });
  },
);
