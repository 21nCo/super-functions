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

const testClientCleanupOwners = new WeakMap<
  McpFnTestClientCleanupError,
  { close: () => Promise<void>; pending?: Promise<void> }
>();

/** Connection failed and cleanup is still owned by this retryable error. */
export class McpFnTestClientCleanupError extends Error {
  constructor(close: () => Promise<void>, cause: unknown) {
    super(
      "Test client connection failed and cleanup remains pending; retain this error and retryCleanup()",
      { cause },
    );
    this.name = "McpFnTestClientCleanupError";
    testClientCleanupOwners.set(this, { close });
  }

  retryCleanup(): Promise<void> {
    const owner = testClientCleanupOwners.get(this);
    if (!owner) return Promise.resolve();
    if (owner.pending) return owner.pending;
    const pending = Promise.resolve().then(owner.close).then(
      () => { testClientCleanupOwners.delete(this); },
      () => { throw this; },
    ).finally(() => { owner.pending = undefined; });
    owner.pending = pending;
    return pending;
  }
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

  /** Create the session owner before connecting, so failed initialization remains closeable. */
  static createTarget<TContext = undefined>(
    target: McpFnTarget,
    info?: Implementation,
    options: McpFnTestClientOptions = {},
  ): McpFnTestClient<TContext> {
    return new McpFnTestClient<TContext>(createMcpFnClient({
      target,
      info: info ?? { name: "mcpfn-test-client", version: "1.0.0" },
      capabilities: options.capabilities,
      handlers: options.handlers,
      events: options.events,
      configure: options.configure,
      diagnostics: options.diagnostics,
    }));
  }

  static async connectTarget<TContext = undefined>(
    target: McpFnTarget,
    info?: Implementation,
    options: McpFnTestClientOptions = {},
  ): Promise<McpFnTestClient<TContext>> {
    const client = this.createTarget<TContext>(target, info, options);
    try {
      await client.session.connect();
      return client;
    } catch (error) {
      const connectionFailure = error instanceof Error && error.cause !== undefined
        ? error.cause
        : error;
      try { await client.close(); }
      catch { throw new McpFnTestClientCleanupError(() => client.close(), connectionFailure); }
      throw error;
    }
  }

  listTools(options?: RequestOptions): Promise<Tool[]> { return this.session.tools.listAll(options); }
  callTool(
    name: string,
    args: Record<string, unknown> = {},
    options?: RequestOptions,
  ): Promise<CallToolResult> {
    return this.session.tools.call(name, args, options);
  }
  createToolTask(
    name: string,
    args: Record<string, unknown> = {},
    task: { ttl?: number } = {},
    options?: RequestOptions,
  ): Promise<CreateTaskResult> {
    return this.session.tools.createTask(name, args, task, options);
  }
  getTask(taskId: string, options?: RequestOptions): Promise<Task> {
    return this.session.tasks.get(taskId, options);
  }
  getTaskResult(taskId: string, options?: RequestOptions): Promise<CallToolResult> {
    return this.session.tasks.result(taskId, options);
  }
  listTasks(cursor?: string, options?: RequestOptions): Promise<ListTasksResult> {
    return this.session.tasks.list(cursor, options);
  }
  cancelTask(taskId: string, options?: RequestOptions): Promise<Task> {
    return this.session.tasks.cancel(taskId, options);
  }
  listResources(options?: RequestOptions): Promise<Resource[]> {
    return this.session.resources.listAll(options);
  }
  listResourceTemplates(options?: RequestOptions): Promise<ResourceTemplate[]> {
    return this.session.resources.listTemplatesAll(options);
  }
  readResource(uri: string, options?: RequestOptions): Promise<ReadResourceResult> {
    return this.session.resources.read(uri, options);
  }
  subscribeResource(uri: string, options?: RequestOptions): Promise<void> {
    return this.session.resources.subscribe(uri, options);
  }
  unsubscribeResource(uri: string, options?: RequestOptions): Promise<void> {
    return this.session.resources.unsubscribe(uri, options);
  }
  listPrompts(options?: RequestOptions): Promise<Prompt[]> {
    return this.session.prompts.listAll(options);
  }
  getPrompt(
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
