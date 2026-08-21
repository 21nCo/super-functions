import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { UriTemplate } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import type {
  CallToolResult,
  CompleteResult,
  CreateTaskResult,
  GetPromptResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";

import { McpFnOutputValidationError, McpFnValidationError } from "./errors.js";
import type {
  McpFnListedTool,
  McpFnPromptDefinition,
  McpFnRequestExtra,
  McpFnResourceDefinition,
  McpFnResourceTemplateDefinition,
  McpFnTaskRequestExtra,
  McpFnToolDefinition,
} from "./types.js";

interface RegisteredTool<TContext> {
  definition: McpFnToolDefinition<TContext>;
  validateInput: ValidateFunction;
  validateOutput?: ValidateFunction;
}

interface RegisteredPrompt<TContext> {
  definition: McpFnPromptDefinition<TContext>;
  validateArguments: ValidateFunction;
}

interface RegisteredTemplate<TContext> {
  definition: McpFnResourceTemplateDefinition<TContext>;
  template: UriTemplate;
}

type ResourceMatch<TContext> =
  | { kind: "resource"; definition: McpFnResourceDefinition<TContext> }
  | {
      kind: "template";
      definition: McpFnResourceTemplateDefinition<TContext>;
      variables: Record<string, string | string[]>;
    };

function formatErrors(errors: ErrorObject[] | null | undefined): Array<{
  path: string;
  message: string;
  keyword: string;
}> {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "Schema validation failed",
    keyword: error.keyword,
  }));
}

function assertName(kind: string, name: string): void {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name)) {
    throw new McpFnValidationError(
      `Invalid MCP ${kind} name ${JSON.stringify(name)}`,
    );
  }
}

function assertUri(kind: string, uri: string): void {
  try {
    new URL(uri);
  } catch {
    throw new McpFnValidationError(`Invalid MCP ${kind} URI ${JSON.stringify(uri)}`);
  }
}

function promptSchema<TContext>(definition: McpFnPromptDefinition<TContext>) {
  if (definition.argumentsSchema) return definition.argumentsSchema;
  const properties = Object.fromEntries(
    (definition.arguments ?? []).map((argument) => [
      argument.name,
      { type: "string", ...(argument.description ? { description: argument.description } : {}) },
    ]),
  );
  return {
    type: "object" as const,
    properties,
    required: (definition.arguments ?? [])
      .filter((argument) => argument.required)
      .map((argument) => argument.name),
    additionalProperties: false,
  };
}

export class McpFnRegistry<TContext = undefined> {
  private readonly ajv: Ajv;
  private readonly tools = new Map<string, RegisteredTool<TContext>>();
  private readonly resources = new Map<string, McpFnResourceDefinition<TContext>>();
  private readonly resourceTemplates = new Map<string, RegisteredTemplate<TContext>>();
  private readonly prompts = new Map<string, RegisteredPrompt<TContext>>();

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    // npm workspaces may install ajv-formats with its own compatible Ajv copy.
    // The runtime contract is stable; erase only that duplicate-package type identity.
    addFormats(this.ajv as never);
  }

  register<TDefinition extends McpFnToolDefinition<TContext>>(
    definition: TDefinition,
  ): this {
    assertName("tool", definition.name);
    if (this.tools.has(definition.name)) {
      throw new McpFnValidationError(`Duplicate MCP tool: ${definition.name}`);
    }
    if (!definition.description.trim()) {
      throw new McpFnValidationError(
        `Tool ${definition.name} requires a non-empty description`,
      );
    }
    if (definition.inputSchema.type !== "object") {
      throw new McpFnValidationError(
        `Tool ${definition.name} inputSchema must be an object schema`,
      );
    }
    const taskSupport = definition.execution?.taskSupport ?? "forbidden";
    if ((taskSupport === "required" || taskSupport === "optional") && !definition.taskHandler) {
      throw new McpFnValidationError(
        `Tool ${definition.name} declares taskSupport=${taskSupport} but has no taskHandler`,
      );
    }
    if (taskSupport === "forbidden" && definition.taskHandler) {
      throw new McpFnValidationError(
        `Tool ${definition.name} has a taskHandler but forbids task execution`,
      );
    }

    let validateInput: ValidateFunction;
    let validateOutput: ValidateFunction | undefined;
    try {
      validateInput = this.ajv.compile(definition.inputSchema);
      validateOutput = definition.outputSchema
        ? this.ajv.compile(definition.outputSchema)
        : undefined;
    } catch (error) {
      throw new McpFnValidationError(
        `Tool ${definition.name} contains an invalid JSON Schema`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }

    this.tools.set(definition.name, {
      definition,
      validateInput,
      validateOutput,
    });
    return this;
  }

  registerAll(definitions: McpFnToolDefinition<TContext>[]): this {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  registerResource(definition: McpFnResourceDefinition<TContext>): this {
    assertUri("resource", definition.uri);
    assertName("resource", definition.name);
    if (this.resources.has(definition.uri)) {
      throw new McpFnValidationError(`Duplicate MCP resource: ${definition.uri}`);
    }
    this.resources.set(definition.uri, definition);
    return this;
  }

  registerResourceTemplate(
    definition: McpFnResourceTemplateDefinition<TContext>,
  ): this {
    assertName("resource template", definition.name);
    if (this.resourceTemplates.has(definition.name)) {
      throw new McpFnValidationError(
        `Duplicate MCP resource template: ${definition.name}`,
      );
    }
    let template: UriTemplate;
    try {
      template = new UriTemplate(definition.uriTemplate);
    } catch (error) {
      throw new McpFnValidationError(
        `Invalid resource URI template ${JSON.stringify(definition.uriTemplate)}`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    if (!template.variableNames.length) {
      throw new McpFnValidationError(
        `Resource template ${definition.name} must contain at least one variable`,
      );
    }
    for (const name of Object.keys(definition.complete ?? {})) {
      if (!template.variableNames.includes(name)) {
        throw new McpFnValidationError(
          `Resource template ${definition.name} has a completer for unknown variable ${name}`,
        );
      }
    }
    this.resourceTemplates.set(definition.name, { definition, template });
    return this;
  }

  registerPrompt(definition: McpFnPromptDefinition<TContext>): this {
    assertName("prompt", definition.name);
    if (this.prompts.has(definition.name)) {
      throw new McpFnValidationError(`Duplicate MCP prompt: ${definition.name}`);
    }
    const argumentNames = (definition.arguments ?? []).map(({ name }) => name);
    if (new Set(argumentNames).size !== argumentNames.length) {
      throw new McpFnValidationError(`Prompt ${definition.name} has duplicate arguments`);
    }
    for (const name of Object.keys(definition.complete ?? {})) {
      if (!argumentNames.includes(name)) {
        throw new McpFnValidationError(
          `Prompt ${definition.name} has a completer for unknown argument ${name}`,
        );
      }
    }
    let validateArguments: ValidateFunction;
    try {
      validateArguments = this.ajv.compile(promptSchema(definition));
    } catch (error) {
      throw new McpFnValidationError(
        `Prompt ${definition.name} contains an invalid arguments JSON Schema`,
        { cause: error instanceof Error ? error.message : String(error) },
      );
    }
    this.prompts.set(definition.name, { definition, validateArguments });
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  hasOutputSchema(name: string): boolean {
    return Boolean(this.tools.get(name)?.validateOutput);
  }

  definitions(): McpFnToolDefinition<TContext>[] {
    return [...this.tools.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  resourceDefinitions(): McpFnResourceDefinition<TContext>[] {
    return [...this.resources.values()].sort((left, right) => left.uri.localeCompare(right.uri));
  }

  resourceTemplateDefinitions(): McpFnResourceTemplateDefinition<TContext>[] {
    return [...this.resourceTemplates.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  promptDefinitions(): McpFnPromptDefinition<TContext>[] {
    return [...this.prompts.values()]
      .map(({ definition }) => definition)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  capabilities(options: { listChanged?: boolean } = {}): ServerCapabilities {
    const capabilities: ServerCapabilities = {};
    if (this.tools.size) capabilities.tools = { listChanged: options.listChanged ?? true };
    if (this.resources.size || this.resourceTemplates.size) {
      capabilities.resources = {
        listChanged: options.listChanged ?? true,
        subscribe: [...this.resources.values()].some((value) => value.subscribe) ||
          [...this.resourceTemplates.values()].some(({ definition }) => definition.subscribe),
      };
    }
    if (this.prompts.size) capabilities.prompts = { listChanged: options.listChanged ?? true };
    if (
      [...this.resourceTemplates.values()].some(({ definition }) => definition.complete) ||
      [...this.prompts.values()].some(({ definition }) => definition.complete)
    ) capabilities.completions = {};
    if (this.definitions().some((definition) => {
      const support = definition.execution?.taskSupport;
      return support === "optional" || support === "required";
    })) capabilities.tasks = { requests: { tools: { call: {} } } };
    return capabilities;
  }

  listTools(): McpFnListedTool[] {
    return this.definitions().map((definition) => ({
      name: definition.name,
      ...(definition.title ? { title: definition.title } : {}),
      description: definition.description,
      inputSchema: definition.inputSchema as McpFnListedTool["inputSchema"],
      ...(definition.outputSchema
        ? { outputSchema: definition.outputSchema as McpFnListedTool["outputSchema"] }
        : {}),
      ...(definition.annotations ? { annotations: definition.annotations } : {}),
      ...(definition.execution ? { execution: definition.execution } : {}),
      ...(definition.icons ? { icons: definition.icons } : {}),
      ...(definition.metadata ? { _meta: definition.metadata } : {}),
    }));
  }

  async listResources(
    context: TContext,
    extra: McpFnRequestExtra,
  ): Promise<Resource[]> {
    const resources: Resource[] = this.resourceDefinitions().map((definition) => ({
      uri: definition.uri,
      name: definition.name,
      ...(definition.title ? { title: definition.title } : {}),
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.mimeType ? { mimeType: definition.mimeType } : {}),
      ...(definition.annotations ? { annotations: definition.annotations } : {}),
      ...(definition.icons ? { icons: definition.icons } : {}),
      ...(definition.metadata ? { _meta: definition.metadata } : {}),
    }));
    for (const { definition } of this.resourceTemplates.values()) {
      if (definition.list) resources.push(...(await definition.list(context, extra)).resources);
    }
    return resources.sort((left, right) => left.uri.localeCompare(right.uri));
  }

  listResourceTemplates(): ResourceTemplate[] {
    return this.resourceTemplateDefinitions().map((definition) => ({
      uriTemplate: definition.uriTemplate,
      name: definition.name,
      ...(definition.title ? { title: definition.title } : {}),
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.mimeType ? { mimeType: definition.mimeType } : {}),
      ...(definition.annotations ? { annotations: definition.annotations } : {}),
      ...(definition.icons ? { icons: definition.icons } : {}),
      ...(definition.metadata ? { _meta: definition.metadata } : {}),
    }));
  }

  listPrompts() {
    return this.promptDefinitions().map((definition) => ({
      name: definition.name,
      ...(definition.title ? { title: definition.title } : {}),
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.arguments ? { arguments: definition.arguments } : {}),
      ...(definition.icons ? { icons: definition.icons } : {}),
      ...(definition.metadata ? { _meta: definition.metadata } : {}),
    }));
  }

  private normalizeAndValidateArgs(
    registered: RegisteredTool<TContext>,
    args: unknown,
  ): { args: Record<string, unknown>; issues?: ReturnType<typeof formatErrors> } {
    const normalizedArgs = args ?? {};
    if (!registered.validateInput(normalizedArgs)) {
      return {
        args: normalizedArgs && typeof normalizedArgs === "object" && !Array.isArray(normalizedArgs)
          ? normalizedArgs as Record<string, unknown>
          : {},
        issues: formatErrors(registered.validateInput.errors),
      };
    }
    return { args: normalizedArgs as Record<string, unknown> };
  }

  async callTool(
    name: string,
    args: unknown,
    context: TContext,
    extra: McpFnRequestExtra,
  ): Promise<CallToolResult> {
    const registered = this.tools.get(name);
    if (!registered) throw new McpFnValidationError(`Unknown MCP tool: ${name}`, { name });
    const normalized = this.normalizeAndValidateArgs(registered, args);
    if (normalized.issues) {
      if (registered.definition.handleInvalidArguments) {
        return this.finalizeResult(
          registered,
          await registered.definition.handleInvalidArguments(
            normalized.args,
            normalized.issues,
            context,
            extra,
          ),
        );
      }
      throw new McpFnValidationError(`Invalid arguments for ${name}`, { issues: normalized.issues });
    }
    return this.finalizeResult(
      registered,
      await registered.definition.handler(normalized.args, context, extra),
    );
  }

  taskSupport(name: string) {
    return this.tools.get(name)?.definition.execution?.taskSupport ?? "forbidden";
  }

  async createToolTask(
    name: string,
    args: unknown,
    context: TContext,
    extra: McpFnTaskRequestExtra,
  ): Promise<CreateTaskResult> {
    const registered = this.tools.get(name);
    if (!registered) throw new McpFnValidationError(`Unknown MCP tool: ${name}`, { name });
    const normalized = this.normalizeAndValidateArgs(registered, args);
    if (normalized.issues) {
      throw new McpFnValidationError(`Invalid arguments for ${name}`, { issues: normalized.issues });
    }
    if (!registered.definition.taskHandler) {
      throw new McpFnValidationError(`Tool ${name} does not support task execution`);
    }
    const taskStore = new Proxy(extra.taskStore, {
      get: (target, property, receiver) => {
        if (property === "storeTaskResult") {
          return async (
            taskId: string,
            status: "completed" | "failed",
            result: CallToolResult,
          ) => target.storeTaskResult(
            taskId,
            status,
            this.finalizeResult(registered, result),
          );
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return registered.definition.taskHandler.createTask(
      normalized.args,
      context,
      { ...extra, taskStore },
    );
  }

  private matchResource(uri: string): ResourceMatch<TContext> | undefined {
    const exact = this.resources.get(uri);
    if (exact) return { kind: "resource", definition: exact };
    for (const { definition, template } of this.resourceTemplates.values()) {
      const variables = template.match(uri);
      if (variables) return { kind: "template", definition, variables };
    }
    return undefined;
  }

  async readResource(
    uri: string,
    context: TContext,
    extra: McpFnRequestExtra,
  ): Promise<ReadResourceResult> {
    const match = this.matchResource(uri);
    if (!match) throw new McpFnValidationError(`Unknown MCP resource: ${uri}`);
    const url = new URL(uri);
    return match.kind === "resource"
      ? match.definition.read(url, context, extra)
      : match.definition.read(url, match.variables, context, extra);
  }

  async changeSubscription(
    uri: string,
    subscribed: boolean,
    context: TContext,
    extra: McpFnRequestExtra,
  ): Promise<void> {
    const match = this.matchResource(uri);
    if (!match) throw new McpFnValidationError(`Unknown MCP resource: ${uri}`);
    const url = new URL(uri);
    if (match.kind === "resource") {
      const callback = subscribed ? match.definition.subscribe : match.definition.unsubscribe;
      if (!callback) {
        throw new McpFnValidationError(
          `Resource ${uri} does not support ${subscribed ? "subscriptions" : "unsubscription"}`,
        );
      }
      await callback(url, context, extra);
      return;
    }
    const callback = subscribed ? match.definition.subscribe : match.definition.unsubscribe;
    if (!callback) {
      throw new McpFnValidationError(
        `Resource ${uri} does not support ${subscribed ? "subscriptions" : "unsubscription"}`,
      );
    }
    await callback(url, match.variables, context, extra);
  }

  async getPrompt(
    name: string,
    args: Record<string, string> | undefined,
    context: TContext,
    extra: McpFnRequestExtra,
  ): Promise<GetPromptResult> {
    const registered = this.prompts.get(name);
    if (!registered) throw new McpFnValidationError(`Unknown MCP prompt: ${name}`);
    const normalized = args ?? {};
    if (!registered.validateArguments(normalized)) {
      throw new McpFnValidationError(`Invalid arguments for prompt ${name}`, {
        issues: formatErrors(registered.validateArguments.errors),
      });
    }
    return registered.definition.get(normalized, context, extra);
  }

  async complete(
    ref: { type: "ref/prompt"; name: string } | { type: "ref/resource"; uri: string },
    argument: { name: string; value: string },
    context: Record<string, string> | undefined,
    extra: McpFnRequestExtra,
  ): Promise<CompleteResult> {
    const empty = { completion: { values: [], total: 0, hasMore: false } };
    if (ref.type === "ref/prompt") {
      const prompt = this.prompts.get(ref.name);
      if (!prompt) throw new McpFnValidationError(`Unknown MCP prompt: ${ref.name}`);
      return prompt.definition.complete?.[argument.name]?.(argument.value, context, extra) ?? empty;
    }
    const template = [...this.resourceTemplates.values()]
      .find(({ definition }) => definition.uriTemplate === ref.uri);
    if (!template) {
      if (this.resources.has(ref.uri)) return empty;
      throw new McpFnValidationError(`Unknown MCP resource template: ${ref.uri}`);
    }
    return template.definition.complete?.[argument.name]?.(argument.value, context, extra) ?? empty;
  }

  private finalizeResult(
    registered: RegisteredTool<TContext>,
    result: CallToolResult,
  ): CallToolResult {
    if (registered.validateOutput && result.isError) {
      const { structuredContent: _omitted, ...errorWithoutStructuredContent } = result;
      return errorWithoutStructuredContent;
    }
    if (registered.validateOutput) {
      if (!result.structuredContent) {
        throw new McpFnOutputValidationError(
          `Tool ${registered.definition.name} declares outputSchema but returned no structuredContent`,
        );
      }
      if (!registered.validateOutput(result.structuredContent)) {
        throw new McpFnOutputValidationError(
          `Invalid output from ${registered.definition.name}`,
          { issues: formatErrors(registered.validateOutput.errors) },
        );
      }
    }
    return result;
  }
}
