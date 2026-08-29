import {
  McpFnError,
  McpFnRegistry,
  createMcpFnServer,
  structuredResult,
} from "mcpfn";

const numberResultSchema = {
  type: "object" as const,
  properties: { result: { type: "number" } },
  required: ["result"],
  additionalProperties: false,
};

export default function createCalculatorServer() {
  const registry = new McpFnRegistry()
    .register({
      name: "calculator_sum",
      description: "Add two finite numbers.",
      inputSchema: {
        type: "object",
        properties: {
          left: { type: "number" },
          right: { type: "number" },
        },
        required: ["left", "right"],
        additionalProperties: false,
      },
      outputSchema: numberResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async ({ left, right }) =>
        structuredResult({ result: Number(left) + Number(right) }),
    })
    .register({
      name: "calculator_divide",
      description: "Divide one finite number by another non-zero number.",
      inputSchema: {
        type: "object",
        properties: {
          dividend: { type: "number" },
          divisor: { type: "number" },
        },
        required: ["dividend", "divisor"],
        additionalProperties: false,
      },
      outputSchema: numberResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async ({ dividend, divisor }) => {
        if (divisor === 0) {
          throw new McpFnError(
            "CALCULATOR_DIVIDE_BY_ZERO",
            "The divisor must not be zero.",
          );
        }
        return structuredResult({
          result: Number(dividend) / Number(divisor),
        });
      },
    });

  return createMcpFnServer({
    info: {
      name: "mcpfn-calculator-example",
      version: "1.0.0",
      instructions: "Use the calculator tools for deterministic arithmetic.",
    },
    registry,
    transports: ["stdio", "streamable-http"],
  });
}
