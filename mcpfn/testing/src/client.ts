import {
  createMcpFnClient,
  customTarget,
  type McpFnClient,
  type McpFnDiagnosticSink,
  type McpFnTarget,
} from "@mcpfn/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  CallToolResult,
  ClientCapabilities,
  CompleteRequest,
  CompleteResult,
  CreateTaskResult,
  GetPromptResult,
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
    info = { name: "mcpfn-test-client", version: "1.0.0" },
    options: McpFnTestClientOptions = {},
  ): Promise<McpFnTestClient<TContext>> {
    const session = createMcpFnClient({
      target,
      info,
      capabilities: options.capabilities,
      configure: options.configure,
      diagnostics: options.diagnostics,
    });
    await session.connect();
    return new McpFnTestClient<TContext>(session);
  }

  listTools(): Promise<Tool[]> { return this.session.tools.listAll(); }
  callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    return this.session.tools.call(name, args);
  }
  createToolTask(
    name: string,
    args: Record<string, unknown> = {},
    options: { ttl?: number } = {},
  ): Promise<CreateTaskResult> {
    return this.session.tools.createTask(name, args, options);
  }
  getTask(taskId: string): Promise<Task> { return this.session.tasks.get(taskId); }
  getTaskResult(taskId: string): Promise<CallToolResult> {
    return this.session.tasks.result(taskId);
  }
  listTasks(cursor?: string): Promise<ListTasksResult> {
    return this.session.tasks.list(cursor);
  }
  cancelTask(taskId: string): Promise<Task> { return this.session.tasks.cancel(taskId); }
  listResources(): Promise<Resource[]> { return this.session.resources.listAll(); }
  listResourceTemplates(): Promise<ResourceTemplate[]> {
    return this.session.resources.listTemplatesAll();
  }
  readResource(uri: string): Promise<ReadResourceResult> {
    return this.session.resources.read(uri);
  }
  subscribeResource(uri: string): Promise<void> {
    return this.session.resources.subscribe(uri);
  }
  unsubscribeResource(uri: string): Promise<void> {
    return this.session.resources.unsubscribe(uri);
  }
  listPrompts(): Promise<Prompt[]> { return this.session.prompts.listAll(); }
  getPrompt(name: string, args?: Record<string, string>): Promise<GetPromptResult> {
    return this.session.prompts.get(name, args);
  }
  complete(params: CompleteRequest["params"]): Promise<CompleteResult> {
    return this.session.prompts.complete(params);
  }
  close(): Promise<void> { return this.session.close(); }
}
