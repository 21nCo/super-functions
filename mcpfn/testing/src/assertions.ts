import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import type { McpFnManifest } from "@mcpfn/core";

import type { McpFnTestClient } from "./client.js";

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export class McpFnAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpFnAssertionError";
  }
}

export interface AssertManifestContractOptions {
  /** Exact tools expected to be visible for the test client's request context. */
  expectedToolNames?: readonly string[];
}

export async function assertManifestContract(
  client: McpFnTestClient<unknown>,
  manifest: McpFnManifest,
  options: AssertManifestContractOptions = {},
): Promise<Tool[]> {
  const actual = await client.listTools();
  const actualByName = new Map(actual.map((tool) => [tool.name, tool]));
  const manifestByName = new Map(manifest.tools.map((tool) => [tool.name, tool]));
  const expectedNames = [...(
    options.expectedToolNames ?? manifest.tools.map((tool) => tool.name)
  )].sort();
  const unknownExpectedNames = expectedNames.filter((name) => !manifestByName.has(name));
  if (unknownExpectedNames.length) {
    throw new McpFnAssertionError(
      `Expected visible tools are absent from the manifest: ${stableJson(unknownExpectedNames)}`,
    );
  }
  const actualNames = actual.map((tool) => tool.name).sort();
  if (stableJson(expectedNames) !== stableJson(actualNames)) {
    throw new McpFnAssertionError(
      `Tool inventory mismatch\nexpected: ${stableJson(expectedNames)}\nactual:   ${stableJson(actualNames)}`,
    );
  }
  for (const name of expectedNames) {
    const expected = manifestByName.get(name)!;
    const tool = actualByName.get(expected.name)!;
    const comparableExpected = {
      name: expected.name,
      description: expected.description,
      inputSchema: expected.inputSchema,
      outputSchema: expected.outputSchema,
      annotations: expected.annotations,
      execution: expected.execution,
      icons: expected.icons,
      title: expected.title,
      _meta: expected.metadata,
    };
    const comparableActual = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      execution: tool.execution,
      icons: tool.icons,
      title: tool.title,
      _meta: tool._meta,
    };
    if (stableJson(comparableExpected) !== stableJson(comparableActual)) {
      throw new McpFnAssertionError(
        `Contract mismatch for ${expected.name}\nexpected: ${stableJson(comparableExpected)}\nactual:   ${stableJson(comparableActual)}`,
      );
    }
  }

  const actualCapabilities = client.client.getServerCapabilities() ?? {};
  if (stableJson(manifest.capabilities ?? {}) !== stableJson(actualCapabilities)) {
    throw new McpFnAssertionError(
      `Capability mismatch\nexpected: ${stableJson(manifest.capabilities ?? {})}\nactual:   ${stableJson(actualCapabilities)}`,
    );
  }

  const actualResources = actualCapabilities.resources
    ? await client.listResources()
    : [];
  const comparableResources = actualResources.map(({ _meta, ...resource }) => ({
    ...resource,
    metadata: _meta,
  }));
  const staticResourceUris = new Set(
    (manifest.resources ?? []).map((resource) => resource.uri),
  );
  const resourceTemplates = (manifest.resourceTemplates ?? []).map(
    (template) => new UriTemplate(template.uriTemplate),
  );
  const comparableStaticResources = comparableResources.filter(
    (resource) =>
      staticResourceUris.has(resource.uri) ||
      !resourceTemplates.some((template) => template.match(resource.uri)),
  );
  if (stableJson(manifest.resources ?? []) !== stableJson(comparableStaticResources)) {
    throw new McpFnAssertionError(
      `Resource inventory mismatch\nexpected: ${stableJson(manifest.resources ?? [])}\nactual:   ${stableJson(comparableStaticResources)}`,
    );
  }

  const actualTemplates = actualCapabilities.resources
    ? await client.listResourceTemplates()
    : [];
  const comparableTemplates = actualTemplates.map(({ _meta, ...template }) => ({
    ...template,
    metadata: _meta,
  }));
  if (stableJson(manifest.resourceTemplates ?? []) !== stableJson(comparableTemplates)) {
    throw new McpFnAssertionError(
      `Resource template inventory mismatch\nexpected: ${stableJson(manifest.resourceTemplates ?? [])}\nactual:   ${stableJson(comparableTemplates)}`,
    );
  }

  const actualPrompts = actualCapabilities.prompts
    ? await client.listPrompts()
    : [];
  const comparablePrompts = actualPrompts.map(({ _meta, ...prompt }) => ({
    ...prompt,
    metadata: _meta,
  }));
  const expectedPrompts = (manifest.prompts ?? []).map(({ argumentsSchema: _schema, ...prompt }) => prompt);
  if (stableJson(expectedPrompts) !== stableJson(comparablePrompts)) {
    throw new McpFnAssertionError(
      `Prompt inventory mismatch\nexpected: ${stableJson(expectedPrompts)}\nactual:   ${stableJson(comparablePrompts)}`,
    );
  }
  return actual;
}

export function assertStructuredTextParity(result: {
  content?: unknown[];
  structuredContent?: Record<string, unknown>;
}): void {
  if (!result.structuredContent) {
    throw new McpFnAssertionError("Tool result has no structuredContent");
  }
  const text = (result.content ?? []).find(
    (entry): entry is { type: "text"; text: string } =>
      !!entry &&
      typeof entry === "object" &&
      (entry as { type?: unknown }).type === "text" &&
      typeof (entry as { text?: unknown }).text === "string",
  )?.text;
  if (!text) {
    throw new McpFnAssertionError("Tool result has no text content");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new McpFnAssertionError("Tool text content is not JSON");
  }
  if (stableJson(parsed) !== stableJson(result.structuredContent)) {
    throw new McpFnAssertionError(
      "Tool text content and structuredContent are not equivalent",
    );
  }
}
