import type { McpFnScenario } from "@mcpfn/testing";

export default [
  {
    name: "echoes a message from the external official SDK server",
    tool: "echo",
    arguments: { message: "transport-neutral" },
    expect: {
      isError: false,
      structuredContent: { message: "transport-neutral" },
      structuredTextParity: true,
    },
  },
] satisfies McpFnScenario[];
