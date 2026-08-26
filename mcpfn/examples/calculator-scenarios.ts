import type { McpFnScenario } from "@mcpfn/testing";

export default [
  {
    name: "adds two numbers",
    tool: "calculator_sum",
    arguments: { left: 2, right: 3 },
    expect: {
      isError: false,
      structuredContent: { result: 5 },
      structuredTextParity: true,
    },
  },
  {
    name: "rejects missing required inputs",
    tool: "calculator_sum",
    arguments: { left: 2 },
    expect: { isError: true },
    verify: (result) => assertTextErrorCode(result, "MCPFN_INVALID_ARGUMENTS"),
  },
  {
    name: "preserves domain error codes",
    tool: "calculator_divide",
    arguments: { dividend: 5, divisor: 0 },
    expect: {
      isError: true,
    },
    verify: (result) => assertTextErrorCode(result, "CALCULATOR_DIVIDE_BY_ZERO"),
  },
] satisfies McpFnScenario[];

function assertTextErrorCode(
  result: { content: unknown[]; structuredContent?: Record<string, unknown> },
  expectedCode: string,
): void {
  if (result.structuredContent !== undefined) {
    throw new Error("A success-only output schema must not receive structured error content");
  }
  const text = result.content.find(
    (entry): entry is { type: "text"; text: string } =>
      !!entry &&
      typeof entry === "object" &&
      (entry as { type?: unknown }).type === "text" &&
      typeof (entry as { text?: unknown }).text === "string",
  )?.text;
  const parsed = JSON.parse(text ?? "null") as { error?: { code?: string } };
  if (parsed?.error?.code !== expectedCode) {
    throw new Error(`Expected error code ${expectedCode}, received ${parsed?.error?.code}`);
  }
}
