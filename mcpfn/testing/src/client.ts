import {
  createMcpFnClient,
  customTarget,
  type McpFnClient,
  type McpFnClientEventSink,
  type McpFnClientMediatedHandlers,
  type McpFnDiagnosticSink,
  type McpFnTarget,
} from "@mcpfn/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ClientCapabilities,
  CompleteRequest,
  CompleteResult,
  CreateTaskResult,
  GetPromptResult,
  Implementation,
  ListTasksResult,
  Prompt,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
  Task,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpFnServer } from "@mcpfn/core";

export interface McpFnTestClientOptions {
  capabilities?: ClientCapabilities;
  handlers?: McpFnClientMediatedHandlers;
  events?: McpFnClientEventSink;
  /** Install roots, sampling, elicitation, or notification handlers before initialize. */
  configure?(client: Client): void | Promise<void>;
  diagnostics?: McpFnDiagnosticSink;
}

export class McpFnTestClient<TContext = undefined> {
  readonly session: McpFnClient;

  private constructor(session: McpFnClient) {
    this.session = session;
  }

  get client(): Client {
    return this.session.protocol;
  }

  static async connect<TContext>(
    server: McpFnServer<TContext>,
    info = { name: "mcpfn-test-client", version: "1.0.0" },
    options: McpFnTestClientOptions = {},
  ): Promise<McpFnTestClient<TContext>> {
    const serverName = (server as McpFnServer<TContext> & { info?: { name?: string } })
      .info?.name ?? "mcpfn-server";
    return this.connectTarget<TContext>(customTarget({
      kind: "in-memory",
      descriptor: { server: serverName },
      open: async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        return { transport: clientTransport, close: () => server.close() };
      },
    }), info, options);
  }

  static async connectTarget<TContext = undefined>(
    target: McpFnTarget,
    info?: Implementation,
    options: McpFnTestClientOptions = {},
  ): Promise<McpFnTestClient<TContext>> {
    const session = createMcpFnClient({
      target,
      info: info ?? { name: "mcpfn-test-client", version: "1.0.0" },
      capabilities: options.capabilities,
      handlers: options.handlers,
      events: options.events,
      configure: options.configure,
      diagnostics: options.diagnostics,
    });
    try {
      await session.connect();
      return new McpFnTestClient<TContext>(session);
    } catch (error) {
      await session.close(true).catch(() => undefined);
      throw error;
    }
  }

  listTools(options?: RequestOptions): Promise<Tool[]> { return this.session.tools.listAll(options); }
  callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return this.session.tools.call(name, args);
  }
  callToolWithOptions(
    name: string,
    args: Record<string, unknown> = {},
    options?: RequestOptions,
  ): Promise<CallToolResult> {
    return this.session.tools.call(name, args, options);
  }
  createToolTask(
    name: string,
    args: Record<string, unknown> = {},
    options: { ttl?: number } = {},
  ): Promise<CreateTaskResult> {
    return this.session.tools.createTask(name, args, options);
  }
  createToolTaskWithOptions(
    name: string,
    args: Record<string, unknown> = {},
    task: { ttl?: number } = {},
    options?: RequestOptions,
  ): Promise<CreateTaskResult> {
    return this.session.tools.createTask(name, args, task, options);
  }
  getTask(taskId: string): Promise<Task> { return this.session.tasks.get(taskId); }
  getTaskResult(taskId: string): Promise<CallToolResult> {
    return this.session.tasks.result(taskId);
  }
  listTasks(cursor?: string): Promise<ListTasksResult> {
    return this.session.tasks.list(cursor);
  }
  cancelTask(taskId: string): Promise<Task> { return this.session.tasks.cancel(taskId); }
  getTaskWithOptions(taskId: string, options?: RequestOptions): Promise<Task> {
    return this.session.tasks.get(taskId, options);
  }
  getTaskResultWithOptions(taskId: string, options?: RequestOptions): Promise<CallToolResult> {
    return this.session.tasks.result(taskId, options);
  }
  listTasksWithOptions(cursor?: string, options?: RequestOptions): Promise<ListTasksResult> {
    return this.session.tasks.list(cursor, options);
  }
  cancelTaskWithOptions(taskId: string, options?: RequestOptions): Promise<Task> {
    return this.session.tasks.cancel(taskId, options);
  }
  listResources(options?: RequestOptions): Promise<Resource[]> {
    return this.session.resources.listAll(options);
  }
  listResourceTemplates(options?: RequestOptions): Promise<ResourceTemplate[]> {
    return this.session.resources.listTemplatesAll(options);
  }
  readResource(uri: string): Promise<ReadResourceResult> {
    return this.session.resources.read(uri);
  }
  readResourceWithOptions(uri: string, options?: RequestOptions): Promise<ReadResourceResult> {
    return this.session.resources.read(uri, options);
  }
  subscribeResource(uri: string): Promise<void> {
    return this.session.resources.subscribe(uri);
  }
  subscribeResourceWithOptions(uri: string, options?: RequestOptions): Promise<void> {
    return this.session.resources.subscribe(uri, options);
  }
  unsubscribeResource(uri: string): Promise<void> {
    return this.session.resources.unsubscribe(uri);
  }
  unsubscribeResourceWithOptions(uri: string, options?: RequestOptions): Promise<void> {
    return this.session.resources.unsubscribe(uri, options);
  }
  listPrompts(options?: RequestOptions): Promise<Prompt[]> {
    return this.session.prompts.listAll(options);
  }
  getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    return this.session.prompts.get(name, args);
  }
  getPromptWithOptions(
    name: string,
    args?: Record<string, string>,
    options?: RequestOptions,
  ): Promise<GetPromptResult> {
    return this.session.prompts.get(name, args, options);
  }
  complete(params: CompleteRequest["params"], options?: RequestOptions): Promise<CompleteResult> {
    return this.session.prompts.complete(params, options);
  }
  close(): Promise<void> { return this.session.close(); }
}
