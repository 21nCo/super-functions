import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { McpFnAssertionError, assertStructuredTextParity, stableJson } from "./assertions.js";
import type { McpFnTestClient } from "./client.js";

export interface McpFnScenario {
  name: string;
  tool: string;
  arguments?: Record<string, unknown>;
  expect?: {
    isError?: boolean;
    structuredContent?: unknown;
    structuredTextParity?: boolean;
  };
  verify?(result: CallToolResult): void | Promise<void>;
}

export interface McpFnScenarioResult {
  name: string;
  tool: string;
  status: "passed" | "failed";
  durationMs: number;
  error?: string;
}

export async function runScenarios(
  client: McpFnTestClient<unknown>,
  scenarios: McpFnScenario[],
): Promise<McpFnScenarioResult[]> {
  const results: McpFnScenarioResult[] = [];
  for (const scenario of scenarios) {
    const startedAt = performance.now();
    try {
      const result = await client.callTool(scenario.tool, scenario.arguments);
      if (
        scenario.expect?.isError !== undefined &&
        Boolean(result.isError) !== scenario.expect.isError
      ) {
        throw new McpFnAssertionError(
          `Expected isError=${scenario.expect.isError}, received ${Boolean(result.isError)}`,
        );
      }
      if (
        scenario.expect &&
        Object.prototype.hasOwnProperty.call(scenario.expect, "structuredContent") &&
        stableJson(result.structuredContent) !==
          stableJson(scenario.expect.structuredContent)
      ) {
        throw new McpFnAssertionError(
          `Structured result mismatch\nexpected: ${stableJson(scenario.expect.structuredContent)}\nactual:   ${stableJson(result.structuredContent)}`,
        );
      }
      if (scenario.expect?.structuredTextParity) {
        assertStructuredTextParity(result);
      }
      await scenario.verify?.(result);
      results.push({
        name: scenario.name,
        tool: scenario.tool,
        status: "passed",
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      results.push({
        name: scenario.name,
        tool: scenario.tool,
        status: "failed",
        durationMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
