import Ajv from "ajv";
import addFormats from "ajv-formats";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import { ServerCapabilitiesSchema } from "@modelcontextprotocol/sdk/types.js";

import { compareCodeUnits, sha256 } from "./canonical.js";
import { assertMcpAppContracts } from "./apps.js";
import { McpFnValidationError } from "./errors.js";
import {
  unsupportedUriTemplateOperator,
  uriTemplatesOverlap,
} from "./uri-template.js";
import {
  assertPromptSchemaSupportsStringValues,
  promptArguments,
  schemaPromptArguments,
  type McpFnRegistry,
} from "./registry.js";
import type {
  McpFnManifest,
  McpFnManifestPrompt,
  McpFnManifestResource,
  McpFnManifestResourceTemplate,
  McpFnManifestTool,
  McpFnServerInfo,
} from "./types.js";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";

export interface CreateManifestOptions {
  protocolVersions?: string[];
  transports?: Array<"stdio" | "streamable-http">;
  capabilities?: ServerCapabilities;
  clientRequirements?: McpFnManifest["clientRequirements"];
  extensions?: Record<string, unknown>;
}

function assertSortedUnique(label: string, values: string[]): void {
  const canonical = [...new Set(values)].sort(compareCodeUnits);
  if (
    canonical.length !== values.length ||
    canonical.some((value, index) => value !== values[index])
  ) throw new McpFnValidationError(`${label} must be sorted and unique`);
}

function assertObject(label: string, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpFnValidationError(`${label} must be an object`);
  }
}

function assertName(label: string, name: unknown): asserts name is string {
  if (typeof name !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(name)) {
    throw new McpFnValidationError(`${label} requires a name (letters, digits, dot, dash, or underscore)`);
  }
}

function assertMetadata(label: string, value: unknown): void {
  if (value !== undefined) assertObject(label, value);
}

function assertSortedBy<T>(label: string, values: T[], select: (value: T) => string): void {
  assertSortedUnique(label, values.map(select));
}

export function createManifest<TContext>(
  info: McpFnServerInfo,
  registry: McpFnRegistry<TContext>,
  options: CreateManifestOptions = {},
): McpFnManifest {
  assertMcpAppContracts(registry);
  const tools: McpFnManifestTool[] = registry.definitions().map((tool) => ({
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    ...(tool.execution ? { execution: tool.execution } : {}),
    ...(tool.icons ? { icons: tool.icons } : {}),
    ...(tool.metadata ? { metadata: tool.metadata } : {}),
  }));
  const resources: McpFnManifestResource[] = registry.resourceDefinitions().map((resource) => ({
    uri: resource.uri,
    name: resource.name,
    ...(resource.title ? { title: resource.title } : {}),
    ...(resource.description ? { description: resource.description } : {}),
    ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
    ...(resource.annotations ? { annotations: resource.annotations } : {}),
    ...(resource.icons ? { icons: resource.icons } : {}),
    ...(resource.subscribe ? { subscribable: true } : {}),
    ...(resource.metadata ? { metadata: resource.metadata } : {}),
  }));
  const resourceTemplates: McpFnManifestResourceTemplate[] =
    registry.resourceTemplateDefinitions().map((resource) => ({
      uriTemplate: resource.uriTemplate,
      name: resource.name,
      ...(resource.title ? { title: resource.title } : {}),
      ...(resource.description ? { description: resource.description } : {}),
      ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
      ...(resource.annotations ? { annotations: resource.annotations } : {}),
      ...(resource.icons ? { icons: resource.icons } : {}),
      ...(resource.subscribe ? { subscribable: true } : {}),
      ...(resource.metadata ? { metadata: resource.metadata } : {}),
    }));
  const prompts: McpFnManifestPrompt[] = registry.promptDefinitions().map((prompt) => ({
    name: prompt.name,
    ...(prompt.title ? { title: prompt.title } : {}),
    ...(prompt.description ? { description: prompt.description } : {}),
    ...(promptArguments(prompt) ? { arguments: promptArguments(prompt) } : {}),
    ...(prompt.argumentsSchema ? { argumentsSchema: prompt.argumentsSchema } : {}),
    ...(prompt.icons ? { icons: prompt.icons } : {}),
    ...(prompt.metadata ? { metadata: prompt.metadata } : {}),
  }));
  const body = {
    formatVersion: 1 as const,
    server: {
      name: info.name,
      version: info.version,
      ...(info.instructions ? { instructions: info.instructions } : {}),
    },
    ...(options.protocolVersions
      ? { protocolVersions: [...new Set(options.protocolVersions)].sort() }
      : {}),
    ...(options.transports
      ? { transports: [...new Set(options.transports)].sort() as Array<"stdio" | "streamable-http"> }
      : {}),
    capabilities: options.capabilities ?? registry.capabilities(),
    ...(options.clientRequirements
      ? {
          clientRequirements: {
            ...options.clientRequirements,
            ...(options.clientRequirements.elicitation
              ? { elicitation: [...new Set(options.clientRequirements.elicitation)].sort() }
              : {}),
          },
        }
      : {}),
    ...(options.extensions ? { extensions: options.extensions } : {}),
    tools,
    resources,
    resourceTemplates,
    prompts,
  };
  return { ...body, hash: sha256(body) };
}

export function validateManifest(value: unknown): McpFnManifest {
  assertObject("McpFn manifest", value);
  const manifest = value as Partial<McpFnManifest>;
  if (manifest.formatVersion !== 1) {
    throw new McpFnValidationError("Unsupported McpFn manifest formatVersion");
  }
  if (
    !manifest.server || typeof manifest.server.name !== "string" || !manifest.server.name.trim() ||
    typeof manifest.server.version !== "string" || !manifest.server.version.trim()
  ) throw new McpFnValidationError("Manifest server name and version are required");
  if (
    manifest.server.instructions !== undefined &&
    typeof manifest.server.instructions !== "string"
  ) throw new McpFnValidationError("Manifest server instructions must be a string");
  if (!Array.isArray(manifest.tools)) {
    throw new McpFnValidationError("Manifest tools must be an array");
  }
  for (const [label, entries] of [
    ["resources", manifest.resources],
    ["resourceTemplates", manifest.resourceTemplates],
    ["prompts", manifest.prompts],
  ] as const) {
    if (entries !== undefined && !Array.isArray(entries)) {
      throw new McpFnValidationError(`Manifest ${label} must be an array`);
    }
  }
  if (
    manifest.protocolVersions !== undefined &&
    (!Array.isArray(manifest.protocolVersions) ||
      manifest.protocolVersions.some((version) => typeof version !== "string" || !version))
  ) throw new McpFnValidationError("Manifest protocolVersions must contain non-empty strings");
  if (manifest.protocolVersions) assertSortedUnique("Manifest protocolVersions", manifest.protocolVersions);
  if (
    manifest.transports !== undefined &&
    (!Array.isArray(manifest.transports) ||
      manifest.transports.some((transport) => transport !== "stdio" && transport !== "streamable-http"))
  ) throw new McpFnValidationError("Manifest contains an unsupported transport");
  if (manifest.transports) assertSortedUnique("Manifest transports", manifest.transports);
  if (manifest.capabilities !== undefined) {
    const parsed = ServerCapabilitiesSchema.safeParse(manifest.capabilities);
    if (!parsed.success) throw new McpFnValidationError("Manifest capabilities are invalid");
  }
  if (manifest.clientRequirements !== undefined) {
    assertObject("Manifest clientRequirements", manifest.clientRequirements);
    if (
      manifest.clientRequirements.sampling !== undefined &&
      typeof manifest.clientRequirements.sampling !== "boolean"
    ) throw new McpFnValidationError("Manifest sampling requirement must be a boolean");
    if (
      manifest.clientRequirements.roots !== undefined &&
      typeof manifest.clientRequirements.roots !== "boolean"
    ) throw new McpFnValidationError("Manifest roots requirement must be a boolean");
    if (
      manifest.clientRequirements.elicitation !== undefined &&
      (!Array.isArray(manifest.clientRequirements.elicitation) ||
        manifest.clientRequirements.elicitation.some((mode) => mode !== "form" && mode !== "url"))
    ) throw new McpFnValidationError("Manifest elicitation requirements are invalid");
    if (manifest.clientRequirements.elicitation) {
      assertSortedUnique(
        "Manifest elicitation requirements",
        manifest.clientRequirements.elicitation,
      );
    }
  }
  assertMetadata("Manifest extensions", manifest.extensions);

  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv as never);
  for (const tool of manifest.tools) {
    assertObject("Every manifest tool", tool);
    assertName("Every manifest tool", tool.name);
    if (typeof tool.description !== "string" || !tool.description.trim()) {
      throw new McpFnValidationError(`Manifest tool ${tool.name} requires a description`);
    }
    if (!tool.inputSchema || tool.inputSchema.type !== "object") {
      throw new McpFnValidationError(`Manifest tool ${tool.name} requires an object inputSchema`);
    }
    if (tool.outputSchema !== undefined) {
      assertObject(`Manifest tool ${tool.name} outputSchema`, tool.outputSchema);
      if (tool.outputSchema.type !== "object") {
        throw new McpFnValidationError(`Manifest tool ${tool.name} requires an object outputSchema`);
      }
    }
    try {
      ajv.compile(tool.inputSchema);
      if (tool.outputSchema !== undefined) ajv.compile(tool.outputSchema);
    } catch (error) {
      throw new McpFnValidationError(
        `Manifest tool ${tool.name} contains an invalid JSON Schema`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    for (const [label, metadata] of [
      ["annotations", tool.annotations],
      ["execution", tool.execution],
      ["metadata", tool.metadata],
    ] as const) assertMetadata(`Manifest tool ${tool.name} ${label}`, metadata);
    const taskSupport = tool.execution?.taskSupport;
    if (
      taskSupport !== undefined &&
      taskSupport !== "forbidden" &&
      taskSupport !== "optional" &&
      taskSupport !== "required"
    ) {
      throw new McpFnValidationError(
        `Manifest tool ${tool.name} has invalid taskSupport=${String(taskSupport)}`,
      );
    }
  }
  assertSortedBy("Manifest tool names", manifest.tools, (tool) => tool.name);

  for (const resource of manifest.resources ?? []) {
    assertObject("Every manifest resource", resource);
    assertName("Every manifest resource", resource.name);
    try { new URL(resource.uri); } catch {
      throw new McpFnValidationError(`Manifest resource ${resource.name} has an invalid URI`);
    }
    if (resource.subscribable !== undefined && typeof resource.subscribable !== "boolean") {
      throw new McpFnValidationError(
        `Manifest resource ${resource.name} subscribable must be a boolean`,
      );
    }
    assertMetadata(`Manifest resource ${resource.name} metadata`, resource.metadata);
  }
  assertSortedBy("Manifest resource URIs", manifest.resources ?? [], (resource) => resource.uri);

  const resourceTemplateUris: string[] = [];
  for (const resource of manifest.resourceTemplates ?? []) {
    assertObject("Every manifest resource template", resource);
    assertName("Every manifest resource template", resource.name);
    const unsupportedOperator = unsupportedUriTemplateOperator(resource.uriTemplate);
    if (unsupportedOperator) {
      throw new McpFnValidationError(
        `Manifest resource template ${resource.name} uses unsupported URI template operator ${unsupportedOperator}`,
      );
    }
    let template: UriTemplate;
    try { template = new UriTemplate(resource.uriTemplate); } catch {
      throw new McpFnValidationError(
        `Manifest resource template ${resource.name} has an invalid URI template`,
      );
    }
    if (!template.variableNames.length) {
      throw new McpFnValidationError(
        `Manifest resource template ${resource.name} must contain at least one variable`,
      );
    }
    if (resourceTemplateUris.some((uriTemplate) =>
      uriTemplatesOverlap(uriTemplate, resource.uriTemplate)
    )) {
      throw new McpFnValidationError(
        `Manifest contains an ambiguous resource URI template: ${resource.uriTemplate}`,
      );
    }
    resourceTemplateUris.push(resource.uriTemplate);
    if (resource.subscribable !== undefined && typeof resource.subscribable !== "boolean") {
      throw new McpFnValidationError(
        `Manifest resource template ${resource.name} subscribable must be a boolean`,
      );
    }
    assertMetadata(`Manifest resource template ${resource.name} metadata`, resource.metadata);
  }
  assertSortedBy(
    "Manifest resource template names",
    manifest.resourceTemplates ?? [],
    (resource) => resource.name,
  );

  for (const prompt of manifest.prompts ?? []) {
    assertObject("Every manifest prompt", prompt);
    assertName("Every manifest prompt", prompt.name);
    assertMetadata(`Manifest prompt ${prompt.name} metadata`, prompt.metadata);
    if (prompt.arguments !== undefined && !Array.isArray(prompt.arguments)) {
      throw new McpFnValidationError(`Manifest prompt ${prompt.name} arguments must be an array`);
    }
    const argumentNames: string[] = [];
    for (const argument of prompt.arguments ?? []) {
      assertObject(`Manifest prompt ${prompt.name} argument`, argument);
      assertName(`Manifest prompt ${prompt.name} argument`, argument.name);
      if (argument.description !== undefined && typeof argument.description !== "string") {
        throw new McpFnValidationError(
          `Manifest prompt ${prompt.name} argument ${argument.name} description must be a string`,
        );
      }
      if (argument.required !== undefined && typeof argument.required !== "boolean") {
        throw new McpFnValidationError(
          `Manifest prompt ${prompt.name} argument ${argument.name} required must be a boolean`,
        );
      }
      argumentNames.push(argument.name);
    }
    if (new Set(argumentNames).size !== argumentNames.length) {
      throw new McpFnValidationError(`Manifest prompt ${prompt.name} has duplicate arguments`);
    }
    if (prompt.argumentsSchema !== undefined) {
      assertObject(`Manifest prompt ${prompt.name} argumentsSchema`, prompt.argumentsSchema);
      if (prompt.argumentsSchema.type !== "object") {
        throw new McpFnValidationError(
          `Manifest prompt ${prompt.name} argumentsSchema must be an object schema`,
        );
      }
      try { ajv.compile(prompt.argumentsSchema); } catch {
        throw new McpFnValidationError(
          `Manifest prompt ${prompt.name} has an invalid arguments JSON Schema`,
        );
      }
      assertPromptSchemaSupportsStringValues(
        prompt.argumentsSchema,
        `Manifest prompt ${prompt.name} argumentsSchema`,
      );
      if (prompt.arguments) {
        const declared = prompt.arguments
          .map(({ name, required }) => ({ name, required: required === true }))
          .sort((left, right) => compareCodeUnits(left.name, right.name));
        const schemaDeclared = schemaPromptArguments(prompt)!.map(
          ({ name, required }) => ({ name, required: required === true }),
        );
        if (JSON.stringify(declared) !== JSON.stringify(schemaDeclared)) {
          throw new McpFnValidationError(
            `Manifest prompt ${prompt.name} arguments and argumentsSchema disagree`,
          );
        }
      }
    }
  }
  assertSortedBy("Manifest prompt names", manifest.prompts ?? [], (prompt) => prompt.name);

  if (typeof manifest.hash !== "string" || !/^[a-f0-9]{64}$/.test(manifest.hash)) {
    throw new McpFnValidationError("Manifest hash must be a lowercase SHA-256 digest");
  }
  const { hash: _ignored, ...body } = manifest as McpFnManifest;
  const expectedHash = sha256(body);
  if (manifest.hash !== expectedHash) {
    throw new McpFnValidationError("Manifest hash does not match its contents", {
      expectedHash,
      actualHash: manifest.hash,
    });
  }
  return manifest as McpFnManifest;
}
