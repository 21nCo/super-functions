import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  WebStandardStreamableHTTPServerTransport,
  type HandleRequestOptions,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { TaskMessageQueue, TaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  CreateMessageResultSchema,
  CreateMessageResultWithToolsSchema,
  ElicitResultSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListRootsResultSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  type LoggingMessageNotification,
  type ResourceUpdatedNotification,
  type ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";

import { errorResult } from "./errors.js";
import { assertMcpAppContracts } from "./apps.js";
import { createManifest, type CreateManifestOptions } from "./manifest.js";
import type { McpFnRegistry } from "./registry.js";
import type {
  McpFnClientRequestOptions,
  McpFnElicitationParams,
  McpFnElicitationResult,
  McpFnManifest,
  McpFnRequestExtra,
  McpFnRootsResult,
  McpFnSamplingParams,
  McpFnSamplingResult,
  McpFnServerInfo,
  McpFnTaskRequestExtra,
  McpFnListedTool,
} from "./types.js";

export interface McpFnToolVisibilityInput<TContext> {
  tool: McpFnListedTool;
  context: TContext;
  extra: McpFnRequestExtra;
}

export interface McpFnServerOptions<TContext> extends CreateManifestOptions {
  info: McpFnServerInfo;
  registry: McpFnRegistry<TContext>;
  context?: (extra: McpFnRequestExtra) => TContext | Promise<TContext>;
  /**
   * Per-request discovery and invocation filter. Returning false hides the
   * tool from tools/list and makes tools/call indistinguishable from an
   * unknown tool. Static manifests remain the complete server contract.
   */
  toolVisibility?: (
    input: McpFnToolVisibilityInput<TContext>,
  ) => boolean | Promise<boolean>;
  /** Maximum entries returned by each list request. Defaults to 100. */
  pageSize?: number;
  additionalCapabilities?: ServerCapabilities;
  taskStore?: TaskStore;
  taskMessageQueue?: TaskMessageQueue;
  defaultTaskPollInterval?: number;
  maxTaskQueueSize?: number;
  enforceStrictCapabilities?: boolean;
}

function mergeCapabilities(
  base: ServerCapabilities,
  extra: ServerCapabilities | undefined,
): ServerCapabilities {
  const merged = { ...base, ...extra };
  for (const key of ["prompts", "resources", "tools", "tasks"] as const) {
    if (base[key] || extra?.[key]) {
      (merged as Record<string, unknown>)[key] = {
        ...(base[key] as object | undefined),
        ...(extra?.[key] as object | undefined),
      };
    }
  }
  return merged;
}

function page<T>(
  values: T[],
  cursor: string | undefined,
  pageSize: number,
): { values: T[]; nextCursor?: string } {
  let offset = 0;
  if (cursor !== undefined) {
    const match = /^mcpfn:(\d+)$/.exec(cursor);
    if (!match) throw new McpError(ErrorCode.InvalidParams, "Invalid McpFn pagination cursor");
    offset = Number(match[1]);
    if (!Number.isSafeInteger(offset) || offset > values.length) {
      throw new McpError(ErrorCode.InvalidParams, "Expired McpFn pagination cursor");
    }
  }
  const selected = values.slice(offset, offset + pageSize);
  const nextOffset = offset + selected.length;
  return {
    values: selected,
    ...(nextOffset < values.length ? { nextCursor: `mcpfn:${nextOffset}` } : {}),
  };
}

export class McpFnServer<TContext = undefined> {
  readonly registry: McpFnRegistry<TContext>;
  readonly info: McpFnServerInfo;
  readonly protocol: Server;
  readonly capabilities: ServerCapabilities;
  private readonly contextFactory: (
    extra: McpFnRequestExtra,
  ) => TContext | Promise<TContext>;
  private readonly toolVisibility?: McpFnServerOptions<TContext>["toolVisibility"];
  private readonly manifestOptions: CreateManifestOptions;
  private readonly pageSize: number;
  private connected = false;

  constructor(options: McpFnServerOptions<TContext>) {
    this.info = options.info;
    this.registry = options.registry;
    assertMcpAppContracts(this.registry);
    this.contextFactory = options.context ?? (() => undefined as TContext);
    this.toolVisibility = options.toolVisibility;
    this.pageSize = options.pageSize ?? 100;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1) {
      throw new Error("McpFn pageSize must be a positive integer");
    }
    const registryCapabilities = this.registry.capabilities();
    if (registryCapabilities.tasks && !options.taskStore) {
      throw new Error("Task-capable McpFn tools require a taskStore");
    }
    if (registryCapabilities.tasks && options.taskStore) {
      registryCapabilities.tasks = {
        ...registryCapabilities.tasks,
        list: {},
        cancel: {},
      };
    }
    this.capabilities = mergeCapabilities(registryCapabilities, options.additionalCapabilities);
    this.manifestOptions = {
      protocolVersions: options.protocolVersions,
      transports: options.transports,
      extensions: options.extensions,
      capabilities: this.capabilities,
      clientRequirements: options.clientRequirements,
    };
    this.protocol = new Server(
      { name: options.info.name, version: options.info.version },
      {
        capabilities: this.capabilities,
        instructions: options.info.instructions,
        taskStore: options.taskStore,
        taskMessageQueue: options.taskMessageQueue,
        defaultTaskPollInterval: options.defaultTaskPollInterval,
        maxTaskQueueSize: options.maxTaskQueueSize,
        enforceStrictCapabilities: options.enforceStrictCapabilities,
        debouncedNotificationMethods: [
          "notifications/tools/list_changed",
          "notifications/resources/list_changed",
          "notifications/prompts/list_changed",
        ],
      },
    );
    this.installHandlers();
  }

  private installHandlers(): void {
    if (this.capabilities.tools) {
      this.protocol.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
        const tools = this.registry.listTools();
        const visibleTools = this.toolVisibility
          ? await this.filterVisibleTools(tools, await this.contextFactory(extra), extra)
          : tools;
        const result = page(visibleTools, request.params?.cursor, this.pageSize);
        return { tools: result.values, ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}) };
      });
      this.protocol.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const context = await this.contextFactory(extra);
        const listedTool = this.registry.listTools().find((tool) => tool.name === request.params.name);
        if (!listedTool || (this.toolVisibility
          && !(await this.toolVisibility({ tool: listedTool, context, extra })))) {
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${request.params.name} not found`);
        }
        const taskSupport = this.registry.taskSupport(request.params.name);
        const isTaskRequest = Boolean(request.params.task);
        if (taskSupport === "required" && !isTaskRequest) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool ${request.params.name} requires task augmentation`,
          );
        }
        if (taskSupport === "forbidden" && isTaskRequest) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Tool ${request.params.name} does not support task augmentation`,
          );
        }
        try {
          if (isTaskRequest) {
            if (!extra.taskStore) throw new Error("No task store is available");
            return await this.registry.createToolTask(
              request.params.name,
              request.params.arguments,
              context,
              extra as McpFnTaskRequestExtra,
            );
          }
          return await this.registry.callTool(
            request.params.name,
            request.params.arguments,
            context,
            extra,
          );
        } catch (error) {
          if (isTaskRequest) throw error;
          return errorResult(error, {
            includeStructuredContent: !this.registry.hasOutputSchema(request.params.name),
          });
        }
      });
    }

    if (this.capabilities.resources) {
      this.protocol.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
        const context = await this.contextFactory(extra);
        const result = page(
          await this.registry.listResources(context, extra),
          request.params?.cursor,
          this.pageSize,
        );
        return {
          resources: result.values,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        };
      });
      this.protocol.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
        const result = page(
          this.registry.listResourceTemplates(),
          request.params?.cursor,
          this.pageSize,
        );
        return {
          resourceTemplates: result.values,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        };
      });
      this.protocol.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
        const context = await this.contextFactory(extra);
        return this.registry.readResource(request.params.uri, context, extra);
      });
      if (this.capabilities.resources.subscribe) {
        this.protocol.setRequestHandler(SubscribeRequestSchema, async (request, extra) => {
          const context = await this.contextFactory(extra);
          await this.registry.changeSubscription(request.params.uri, true, context, extra);
          return {};
        });
        this.protocol.setRequestHandler(UnsubscribeRequestSchema, async (request, extra) => {
          const context = await this.contextFactory(extra);
          await this.registry.changeSubscription(request.params.uri, false, context, extra);
          return {};
        });
      }
    }

    if (this.capabilities.prompts) {
      this.protocol.setRequestHandler(ListPromptsRequestSchema, async (request) => {
        const result = page(this.registry.listPrompts(), request.params?.cursor, this.pageSize);
        return {
          prompts: result.values,
          ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        };
      });
      this.protocol.setRequestHandler(GetPromptRequestSchema, async (request, extra) => {
        const context = await this.contextFactory(extra);
        return this.registry.getPrompt(
          request.params.name,
          request.params.arguments,
          context,
          extra,
        );
      });
    }

    if (this.capabilities.completions) {
      this.protocol.setRequestHandler(CompleteRequestSchema, async (request, extra) => {
        const context = await this.contextFactory(extra);
        return this.registry.complete(
          request.params.ref,
          request.params.argument,
          request.params.context?.arguments,
          context,
          extra,
        );
      });
    }
  }

  private async filterVisibleTools(
    tools: McpFnListedTool[],
    context: TContext,
    extra: McpFnRequestExtra,
  ): Promise<McpFnListedTool[]> {
    if (!this.toolVisibility) return tools;
    const decisions = await Promise.all(tools.map((tool) =>
      this.toolVisibility!({ tool, context, extra })));
    return tools.filter((_, index) => decisions[index]);
  }

  manifest(): McpFnManifest {
    return createManifest(this.info, this.registry, this.manifestOptions);
  }

  async connect(transport: Transport): Promise<void> {
    if (this.connected) throw new Error("McpFnServer is already connected to a transport");
    await this.protocol.connect(transport);
    this.connected = true;
  }

  async serveStdio(): Promise<void> {
    await this.connect(new StdioServerTransport());
  }

  async createWebStandardHandler(
    options: ConstructorParameters<typeof WebStandardStreamableHTTPServerTransport>[0] = {},
  ): Promise<(request: Request, options?: HandleRequestOptions) => Promise<Response>> {
    const transport = new WebStandardStreamableHTTPServerTransport(options);
    await this.connect(transport);
    return (request: Request, handleOptions?: HandleRequestOptions) =>
      transport.handleRequest(request, handleOptions);
  }

  sample(
    params: McpFnSamplingParams,
    options?: McpFnClientRequestOptions,
  ): Promise<McpFnSamplingResult> {
    return this.protocol.createMessage(params, options);
  }

  sampleForRequest(
    extra: McpFnRequestExtra,
    params: McpFnSamplingParams,
    options?: McpFnClientRequestOptions,
  ): Promise<McpFnSamplingResult> {
    const schema = params.tools?.length
      ? CreateMessageResultWithToolsSchema
      : CreateMessageResultSchema;
    return extra.sendRequest(
      { method: "sampling/createMessage", params },
      schema,
      options,
    ) as Promise<McpFnSamplingResult>;
  }

  elicit(
    params: McpFnElicitationParams,
    options?: McpFnClientRequestOptions,
  ): Promise<McpFnElicitationResult> {
    return this.protocol.elicitInput(params, options);
  }

  elicitForRequest(
    extra: McpFnRequestExtra,
    params: McpFnElicitationParams,
    options?: McpFnClientRequestOptions,
  ): Promise<McpFnElicitationResult> {
    return extra.sendRequest(
      { method: "elicitation/create", params },
      ElicitResultSchema,
      options,
    );
  }

  listRoots(options?: RequestOptions): Promise<McpFnRootsResult> {
    return this.protocol.listRoots(undefined, options);
  }

  listRootsForRequest(
    extra: McpFnRequestExtra,
    options?: McpFnClientRequestOptions,
  ): Promise<McpFnRootsResult> {
    return extra.sendRequest(
      { method: "roots/list" },
      ListRootsResultSchema,
      options,
    );
  }

  sendLoggingMessage(params: LoggingMessageNotification["params"], sessionId?: string) {
    return this.protocol.sendLoggingMessage(params, sessionId);
  }

  sendResourceUpdated(params: ResourceUpdatedNotification["params"]) {
    return this.protocol.sendResourceUpdated(params);
  }

  sendResourceListChanged() {
    return this.protocol.sendResourceListChanged();
  }

  sendToolListChanged() {
    return this.protocol.sendToolListChanged();
  }

  sendPromptListChanged() {
    return this.protocol.sendPromptListChanged();
  }

  async close(): Promise<void> {
    await this.protocol.close();
    this.connected = false;
  }
}

export function createMcpFnServer<TContext = undefined>(
  options: McpFnServerOptions<TContext>,
): McpFnServer<TContext> {
  return new McpFnServer(options);
}
