export const SPAN_TYPES = {
  PROMPT_BUILD: "langfn.prompt.build",
  PROVIDER_CALL: "langfn.provider.call",
  PROVIDER_STREAM: "langfn.provider.stream",
  TOOL_EXECUTE: "langfn.tool.execute",
  TOOL_VALIDATE: "langfn.tool.validate",
  CHAIN_EXECUTE: "langfn.chain.execute",
  GRAPH_EXECUTE: "langfn.graph.execute",
  MEMORY_RETRIEVE: "langfn.memory.retrieve",
  MEMORY_SUMMARIZE: "langfn.memory.summarize",
  EVAL_RUN: "langfn.eval.run",
  EVAL_METRIC: "langfn.eval.metric"
} as const;

export type SpanType = (typeof SPAN_TYPES)[keyof typeof SPAN_TYPES];
