import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
import {
  CallToolResultSchema,
  CreateTaskResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpFnServer } from "@mcpfn/core";

export interface McpFnTestClientOptions {
  capabilities?: ClientCapabilities;
  /** Install roots, sampling, elicitation, or notification handlers before initialize. */
  configure?(client: Client): void | Promise<void>;
}

export class McpFnTestClient<TContext = undefined> {
  readonly client: Client;
  private readonly server: McpFnServer<TContext>;
  private closed = false;

  private constructor(client: Client, server: McpFnServer<TContext>) {
    this.client = client;
    this.server = server;
  }

  static async connect<TContext>(
    server: McpFnServer<TContext>,
    info = { name: "mcpfn-test-client", version: "1.0.0" },
    options: McpFnTestClientOptions = {},
  ): Promise<McpFnTestClient<TContext>> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(info, { capabilities: options.capabilities ?? {} });
    await options.configure?.(client);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return new McpFnTestClient(client, server);
  }

  async listTools(): Promise<Tool[]> {
    const values: Tool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listTools(cursor ? { cursor } : undefined);
      values.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return values;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    return (await this.client.callTool({ name, arguments: args })) as CallToolResult;
  }

  async createToolTask(
    name: string,
    args: Record<string, unknown> = {},
    options: { ttl?: number } = {},
  ): Promise<CreateTaskResult> {
    return this.client.request(
      {
        method: "tools/call",
        params: { name, arguments: args, task: options },
      },
      CreateTaskResultSchema,
    );
  }

  getTask(taskId: string): Promise<Task> {
    return this.client.experimental.tasks.getTask(taskId);
  }

  getTaskResult(taskId: string): Promise<CallToolResult> {
    return this.client.experimental.tasks.getTaskResult(
      taskId,
      CallToolResultSchema,
    ) as Promise<CallToolResult>;
  }

  listTasks(cursor?: string): Promise<ListTasksResult> {
    return this.client.experimental.tasks.listTasks(cursor);
  }

  cancelTask(taskId: string): Promise<Task> {
    return this.client.experimental.tasks.cancelTask(taskId);
  }

  async listResources(): Promise<Resource[]> {
    const values: Resource[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listResources(cursor ? { cursor } : undefined);
      values.push(...page.resources);
      cursor = page.nextCursor;
    } while (cursor);
    return values;
  }

  async listResourceTemplates(): Promise<ResourceTemplate[]> {
    const values: ResourceTemplate[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listResourceTemplates(cursor ? { cursor } : undefined);
      values.push(...page.resourceTemplates);
      cursor = page.nextCursor;
    } while (cursor);
    return values;
  }

  readResource(uri: string): Promise<ReadResourceResult> {
    return this.client.readResource({ uri });
  }

  async subscribeResource(uri: string): Promise<void> {
    await this.client.subscribeResource({ uri });
  }

  async unsubscribeResource(uri: string): Promise<void> {
    await this.client.unsubscribeResource({ uri });
  }

  async listPrompts(): Promise<Prompt[]> {
    const values: Prompt[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.client.listPrompts(cursor ? { cursor } : undefined);
      values.push(...page.prompts);
      cursor = page.nextCursor;
    } while (cursor);
    return values;
  }

  getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<GetPromptResult> {
    return this.client.getPrompt({ name, ...(args ? { arguments: args } : {}) });
  }

  complete(params: CompleteRequest["params"]): Promise<CompleteResult> {
    return this.client.complete(params);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.client.close().catch(() => undefined);
    await this.server.close().catch(() => undefined);
  }
}
