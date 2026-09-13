import { describe, it, expect } from "vitest";
import { Chain } from "../src/orchestration/chain.js";

describe("Chain", () => {
  it("should run sequential steps", async () => {
    const chain = Chain.sequential([
      async (x) => `Processed: ${x}`,
      async (x) => `Final: ${x}`
    ]);

    const result = await chain.run("Input");
    expect(result).toBe("Final: Processed: Input");
  });

  it("should run parallel steps", async () => {
    const chain = Chain.parallel([
      async (x) => `A: ${x}`,
      async (x) => `B: ${x}`
    ]);

    const result = await chain.run("Input");
    expect(result).toEqual(["A: Input", "B: Input"]);
  });
});

describe("StateGraph", () => {
  it("should run a simple graph", async () => {
    const graph = new StateGraph<{ count: number }>({ count: 0 })
      .addNode("increment", async (state) => ({ count: state.count + 1 }))
      .addNode("double", async (state) => ({ count: state.count * 2 }))
      .setEntryPoint("increment")
      .addEdge("increment", "double")
      .compile();

    const result = await graph.invoke();
    expect(result.count).toBe(2);
  });
});

describe("PromptTemplate", () => {
  it("should format templates", () => {
    const template = new PromptTemplate({
      template: "Hello {name}, welcome to {place}!"
    });

    const result = template.format({ name: "Alice", place: "Wonderland" });
    expect(result).toBe("Hello Alice, welcome to Wonderland!");
  });
});

import { StateGraph } from "../src/graph/state_graph.js";
import { PromptTemplate } from "../src/prompts/template.js";
