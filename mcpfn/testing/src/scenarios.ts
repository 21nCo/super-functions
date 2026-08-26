import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import { McpFnAssertionError, assertStructuredTextParity, stableJson } from "./assertions.js";
import type { McpFnTestClient } from "./client.js";

export interface McpFnToolScenario {
  name: string;
  kind?: "tools.call";
  tool: string;
  arguments?: Record<string, unknown>;
  expect?: {
    isError?: boolean;
    structuredContent?: unknown;
    structuredTextParity?: boolean;
  };
  verify?(result: CallToolResult): void | Promise<void>;
}

export interface McpFnInventoryScenario {
  name: string;
  kind: "tools.list" | "resources.list" | "resources.templates.list" | "prompts.list";
  expectNames?: string[];
}

export interface McpFnResourceScenario {
  name: string;
  kind: "resources.read" | "resources.subscribe" | "resources.unsubscribe";
  uri: string;
  expect?: unknown;
}

export interface McpFnPromptScenario {
  name: string;
  kind: "prompts.get";
  prompt: string;
  arguments?: Record<string, string>;
  expect?: unknown;
}

export interface McpFnInitializeScenario {
  name: string;
  kind: "initialize";
  expectCapabilities?: Record<string, unknown>;
}

export type McpFnScenario =
  | McpFnToolScenario
  | McpFnInventoryScenario
  | McpFnResourceScenario
  | McpFnPromptScenario
  | McpFnInitializeScenario;

export interface McpFnScenarioResult {
  name: string;
  operation: string;
  tool?: string;
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
    const operation = scenario.kind ?? "tools.call";
    try {
      await executeScenario(client, scenario);
      results.push({
        name: scenario.name,
        operation,
        ...(isToolScenario(scenario) ? { tool: scenario.tool } : {}),
        status: "passed",
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      results.push({
        name: scenario.name,
        operation,
        ...(isToolScenario(scenario) ? { tool: scenario.tool } : {}),
        status: "failed",
        durationMs: performance.now() - startedAt,
        error: redactOAuthValue(error instanceof Error ? error.message : String(error)),
      });
    }
  }
  return results;
}

async function executeScenario(
  client: McpFnTestClient<unknown>,
  scenario: McpFnScenario,
): Promise<void> {
  const kind = scenario.kind ?? "tools.call";
  if (kind === "tools.call" && isToolScenario(scenario)) {
    const result = await client.callTool(scenario.tool, scenario.arguments);
    if (result.isError && scenario.expect?.isError === undefined) {
      throw new McpFnAssertionError(
        "Tool returned isError=true without an explicit expect.isError=true assertion",
      );
    }
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
      stableJson(result.structuredContent) !== stableJson(scenario.expect.structuredContent)
    ) {
      throw new McpFnAssertionError(
        `Structured result mismatch\nexpected: ${stableJson(scenario.expect.structuredContent)}\nactual:   ${stableJson(result.structuredContent)}`,
      );
    }
    if (scenario.expect?.structuredTextParity) assertStructuredTextParity(result);
    await scenario.verify?.(result);
    return;
  }
  if (kind === "initialize" && scenario.kind === "initialize") {
    const actual = client.client.getServerCapabilities() ?? {};
    if (scenario.expectCapabilities && stableJson(actual) !== stableJson(scenario.expectCapabilities)) {
      throw new McpFnAssertionError(
        `Capability mismatch\nexpected: ${stableJson(scenario.expectCapabilities)}\nactual:   ${stableJson(actual)}`,
      );
    }
    return;
  }
  if (isInventoryScenario(scenario)) {
    const values = kind === "tools.list"
      ? await client.listTools()
      : kind === "resources.list"
        ? await client.listResources()
        : kind === "resources.templates.list"
          ? await client.listResourceTemplates()
          : await client.listPrompts();
    if (scenario.expectNames) {
      const actual = values.map((value) => value.name).sort();
      const expected = [...scenario.expectNames].sort();
      if (stableJson(actual) !== stableJson(expected)) {
        throw new McpFnAssertionError(
          `Inventory mismatch\nexpected: ${stableJson(expected)}\nactual:   ${stableJson(actual)}`,
        );
      }
    }
    return;
  }
  if (scenario.kind === "resources.read") {
    assertExpected(await client.readResource(scenario.uri), scenario.expect);
    return;
  }
  if (scenario.kind === "resources.subscribe") {
    await client.subscribeResource(scenario.uri);
    return;
  }
  if (scenario.kind === "resources.unsubscribe") {
    await client.unsubscribeResource(scenario.uri);
    return;
  }
  if (scenario.kind === "prompts.get") {
    assertExpected(
      await client.getPrompt(scenario.prompt, scenario.arguments),
      scenario.expect,
    );
    return;
  }
  throw new McpFnAssertionError(`Unsupported scenario operation ${kind}`);
}

function assertExpected(actual: unknown, expected: unknown): void {
  if (expected !== undefined && stableJson(actual) !== stableJson(expected)) {
    throw new McpFnAssertionError(
      `Scenario result mismatch\nexpected: ${stableJson(expected)}\nactual:   ${stableJson(actual)}`,
    );
  }
}

function isToolScenario(scenario: McpFnScenario): scenario is McpFnToolScenario {
  return "tool" in scenario;
}

function isInventoryScenario(scenario: McpFnScenario): scenario is McpFnInventoryScenario {
  return ["tools.list", "resources.list", "resources.templates.list", "prompts.list"]
    .includes(scenario.kind ?? "");
}
