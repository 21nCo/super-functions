import { describe, expect, it } from "vitest";

import { LangFn } from "../src/client.js";
import {
  AgentMaxIterationsError,
  GraphInterruptError,
  GraphMaxStepsError,
  ValidationError
} from "../src/core/errors.js";
import { MockChatModel } from "../src/models/mock.js";
import { Chain } from "../src/orchestration/chain.js";
import { InMemoryCheckpointStore, StateGraph } from "../src/graph/index.js";
import { MultiAgentCoordinator, PlanExecuteAgent, ReActAgent } from "../src/agents/index.js";
import { Tool, type ToolContext, type ToolSchema } from "../src/tools/base.js";

interface AddArgs {
  a: number;
  b: number;
}

const addSchema: ToolSchema<AddArgs> = {
  jsonSchema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" }
    },
    required: ["a", "b"]
  },
  parse(data: unknown): AddArgs {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected add args object");
    }
    const { a, b } = data as Record<string, unknown>;
    if (typeof a !== "number" || typeof b !== "number") {
      throw new Error("Expected numeric add arguments");
    }
    return { a, b };
  }
};

async function add(args: AddArgs, _context: ToolContext): Promise<string> {
  return String(args.a + args.b);
}

describe("orchestration, graph, and agents", () => {
  it("runs sequential, parallel, map-reduce, and router chains deterministically", async () => {
    const sequential = Chain.sequential<number>([
      async (value: number) => value + 1,
      async (value: number) => value * 2
    ]);
    await expect(sequential.run(3)).resolves.toBe(8);

    const parallel = Chain.parallel<number>(
      [
        async (value: number) => {
          await delay(10);
          return value + 1;
        },
        async (value: number) => value * 2
      ],
      { concurrency: 1 }
    );
    await expect(parallel.run(3)).resolves.toEqual([4, 6]);

    const mapReduce = Chain.mapReduce<string, string, string>({
      concurrency: 1,
      map: async (value) => value.toUpperCase(),
      reduce: async (values) => values.join("|")
    });
    await expect(mapReduce.run(["a", "b"])).resolves.toBe("A|B");

    const router = Chain.router<string, string>({
      routes: {
        support: async () => "support",
        sales: async () => "sales"
      },
      router: async (value) => (value.includes("support") ? "support" : "sales")
    });
    await expect(router.run("support ticket")).resolves.toBe("support");

    const invalidRouter = Chain.router<string, string>({
      routes: { support: async () => "support" },
      router: async () => "unknown"
    });
    await expect(invalidRouter.run("support ticket")).rejects.toBeInstanceOf(ValidationError);
  });

  it("supports graph checkpoint, resume, and max-step enforcement", async () => {
    const graph = new StateGraph({ count: 0, done: false });
    graph
      .addNode("increment", async (state) => ({ ...state, count: Number(state.count) + 1 }))
      .addNode("decide", async (state) => ({ ...state, done: true }))
      .addEdge("increment", "decide")
      .addConditionalEdge("decide", async (state) => (state.done ? "__end__" : "increment"))
      .addInterrupt("increment")
      .setEntryPoint("increment");

    const compiled = graph.compile();
    const store = new InMemoryCheckpointStore<Record<string, unknown>>();
    await expect(compiled.invoke(undefined, { checkpointStore: store })).rejects.toBeInstanceOf(GraphInterruptError);

    const interrupt = await compiled.invoke(undefined, { checkpointStore: store }).catch((error) => error as GraphInterruptError);
    const checkpointId = String(interrupt.metadata.checkpointId ?? "");
    expect(checkpointId).toBeTruthy();

    const resumed = await compiled.resume(checkpointId, { checkpointStore: store, maxSteps: 3 });
    expect(resumed).toMatchObject({ count: 1, done: true });

    const looping = new StateGraph({ count: 0 });
    looping
      .addNode("loop", async (state) => ({ ...state, count: Number(state.count) + 1 }))
      .addEdge("loop", "loop")
      .setEntryPoint("loop");
    await expect(looping.compile().invoke(undefined, { maxSteps: 2 })).rejects.toBeInstanceOf(GraphMaxStepsError);
  });

  it("preserves ReAct transcripts and enforces iteration limits", async () => {
    let calls = 0;
    const lang = new LangFn({
      model: new MockChatModel({
        chat: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              message: { role: "assistant", content: "" },
              tool_calls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 3 } }]
            };
          }
          return {
            message: { role: "assistant", content: "5" }
          };
        }
      })
    });
    const react = new ReActAgent({
      model: lang,
      tools: [new Tool({ name: "add", description: "Add", schema: addSchema, execute: add })],
      max_iterations: 3
    });
    const result = await react.run("What is 2 + 3?");
    expect(result.output).toBe("5");
    expect(result.messages.some((message) => message.role === "tool" && message.tool_call_id === "call_1")).toBe(true);

    const limited = new ReActAgent({
      model: new LangFn({
        model: new MockChatModel({
          chat: async () => ({
            message: { role: "assistant", content: "" },
            tool_calls: [{ id: "call_1", name: "add", arguments: { a: 2, b: 3 } }]
          })
        })
      }),
      tools: [new Tool({ name: "add", description: "Add", schema: addSchema, execute: add })],
      max_iterations: 1
    });
    await expect(limited.run("What is 2 + 3?")).rejects.toBeInstanceOf(AgentMaxIterationsError);
  });

  it("runs plan-execute and bounded multi-agent coordination deterministically", async () => {
    const planner = new PlanExecuteAgent({
      planner: async () => ["summarize doc 1", "summarize doc 2", "compare summaries"],
      executor: async (step) => `done:${step}`,
      max_plan_steps: 5,
      max_execution_steps: 5
    });
    const planResult = await planner.run("Summarize two documents and compare them");
    expect(planResult.plan).toEqual(["summarize doc 1", "summarize doc 2", "compare summaries"]);
    expect(planResult.output).toContain("done:compare summaries");

    const coordinator = new MultiAgentCoordinator({
      agents: {
        researcher: { run: async (task: string) => `research:${task}` },
        writer: { run: async (task: string) => `draft:${task}` }
      },
      coordinator: async (_task, context) => {
        if (context.decisions.length === 0) return "researcher";
        if (context.decisions.length === 1) return "writer";
        return "__end__";
      },
      max_iterations: 3
    });
    const coordination = await coordinator.run("Research then draft");
    expect(coordination.decisions).toEqual(["researcher", "writer"]);
    expect(coordination.output).toContain("draft:");

    await expect(
      new PlanExecuteAgent({ planner: async () => [], executor: async () => "noop" }).run("fail")
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
