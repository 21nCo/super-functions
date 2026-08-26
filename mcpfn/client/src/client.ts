import { randomUUID } from "node:crypto";

import { Client, type ClientOptions } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  CallToolResultSchema,
  CreateTaskResultSchema,
  type CallToolResult,
  type ClientCapabilities,
  type CompleteRequest,
  type CompleteResult,
  type CreateTaskResult,
  type GetPromptResult,
  type Implementation,
  type ListTasksResult,
  type Prompt,
  type ReadResourceResult,
  type Resource,
  type ResourceTemplate,
  type ServerCapabilities,
  type Task,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { redactOAuthValue } from "@superfunctions/oauth-core";

import type {
  McpFnClientState,
  McpFnConfigureClient,
  McpFnDiagnosticEvent,
  McpFnDiagnosticPhase,
  McpFnDiagnosticSink,
  McpFnTarget,
  McpFnTransportHandle,
} from "./types.js";
import { McpFnClientError } from "./types.js";

export interface McpFnClientOptions {
  target: McpFnTarget;
  info?: Implementation;
  capabilities?: ClientCapabilities;
  clientOptions?: Omit<ClientOptions, "capabilities">;
  configure?: McpFnConfigureClient;
  diagnostics?: McpFnDiagnosticSink;
  requestId?: () => string;
  clock?: () => Date;
  connectRetries?: number;
  connectRetryDelayMs?: number;
}

export class McpFnClient {
  private readonly options: McpFnClientOptions;
  private readonly listeners = new Set<McpFnDiagnosticSink>();
  private _state: McpFnClientState = "idle";
  private _protocol?: Client;
  private handle?: McpFnTransportHandle;
  private connectPromise?: Promise<void>;
  private closePromise?: Promise<void>;
  private connectController?: AbortController;

  readonly tools = {
    listAll: (options?: RequestOptions) => this.listTools(options),
    call: (name: string, args: Record<string, unknown> = {}, options?: RequestOptions) =>
      this.operation("tools/call", () => this.protocol.callTool(
        { name, arguments: args },
        undefined,
        options,
      ) as Promise<CallToolResult>),
    createTask: (
      name: string,
      args: Record<string, unknown> = {},
      task: { ttl?: number } = {},
      options?: RequestOptions,
    ) => this.operation("tools/call:task", () => this.protocol.request(
      { method: "tools/call", params: { name, arguments: args, task } },
      CreateTaskResultSchema,
      options,
    ) as Promise<CreateTaskResult>),
  };

  readonly resources = {
    listAll: (options?: RequestOptions) => this.listResources(options),
    listTemplatesAll: (options?: RequestOptions) => this.listResourceTemplates(options),
    read: (uri: string, options?: RequestOptions): Promise<ReadResourceResult> =>
      this.operation("resources/read", () => this.protocol.readResource({ uri }, options)),
    subscribe: async (uri: string, options?: RequestOptions): Promise<void> => {
      await this.operation("resources/subscribe", () =>
        this.protocol.subscribeResource({ uri }, options));
    },
    unsubscribe: async (uri: string, options?: RequestOptions): Promise<void> => {
      await this.operation("resources/unsubscribe", () =>
        this.protocol.unsubscribeResource({ uri }, options));
    },
  };

  readonly prompts = {
    listAll: (options?: RequestOptions) => this.listPrompts(options),
    get: (
      name: string,
      args?: Record<string, string>,
      options?: RequestOptions,
    ): Promise<GetPromptResult> => this.operation("prompts/get", () =>
      this.protocol.getPrompt({ name, ...(args ? { arguments: args } : {}) }, options)),
    complete: (
      params: CompleteRequest["params"],
      options?: RequestOptions,
    ): Promise<CompleteResult> => this.operation("completion/complete", () =>
      this.protocol.complete(params, options)),
  };

  readonly tasks = {
    get: (taskId: string, options?: RequestOptions): Promise<Task> =>
      this.operation("tasks/get", () =>
        this.protocol.experimental.tasks.getTask(taskId, options)),
    result: (taskId: string, options?: RequestOptions): Promise<CallToolResult> =>
      this.operation("tasks/result", () =>
        this.protocol.experimental.tasks.getTaskResult(
          taskId,
          CallToolResultSchema,
          options,
        ) as Promise<CallToolResult>),
    list: (cursor?: string, options?: RequestOptions): Promise<ListTasksResult> =>
      this.operation("tasks/list", () =>
        this.protocol.experimental.tasks.listTasks(cursor, options)),
    cancel: (taskId: string, options?: RequestOptions): Promise<Task> =>
      this.operation("tasks/cancel", () =>
        this.protocol.experimental.tasks.cancelTask(taskId, options)),
  };

  constructor(options: McpFnClientOptions) {
    this.options = options;
    if ((options.connectRetries ?? 0) < 0) {
      throw new Error("McpFn connectRetries must not be negative");
    }
    if (options.diagnostics) this.listeners.add(options.diagnostics);
  }

  get state(): McpFnClientState {
    return this._state;
  }

  get protocol(): Client {
    if (!this._protocol || this._state !== "connected") {
      throw new McpFnClientError(
        "MCPFN_CLIENT_NOT_CONNECTED",
        "McpFn client is not connected",
        { phase: "capability-operation" },
      );
    }
    return this._protocol;
  }

  getServerCapabilities(): ServerCapabilities | undefined {
    return this._protocol?.getServerCapabilities();
  }

  getServerVersion(): Implementation | undefined {
    return this._protocol?.getServerVersion();
  }

  getTargetDescriptor() {
    return this.options.target.describe();
  }

  onDiagnostic(listener: McpFnDiagnosticSink): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.closePromise) await this.closePromise;
    if (this._state === "connected") return;
    if (this.connectPromise) return this.connectPromise;
    if (this._state === "authorization-required") {
      throw new McpFnClientError(
        "MCPFN_AUTHORIZATION_REQUIRED",
        "MCP authorization is required; complete the callback before reconnecting",
        { phase: "authorization-request", retryable: true },
      );
    }
    if (this._state === "closed") this._state = "idle";
    const controller = new AbortController();
    this.connectController = controller;
    this.connectPromise = this.connectInternal(controller.signal).finally(() => {
      if (this.connectController === controller) this.connectController = undefined;
      this.connectPromise = undefined;
    });
    return this.connectPromise;
  }

  private async connectInternal(signal: AbortSignal): Promise<void> {
    const retries = this.options.connectRetries ?? 0;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (signal.aborted) throw connectAbortedError(lastError);
      const requestId = this.requestId();
      this._state = "connecting";
      await this.emit("transport-connect", "started", requestId, undefined, { attempt });
      try {
        this.handle = await this.options.target.open({
          requestId,
          signal,
          diagnostic: (event) => this.dispatch(event),
        });
        if (signal.aborted) {
          const lateHandle = this.handle;
          this.handle = undefined;
          await closeTransportHandle(lateHandle);
          throw connectAbortedError();
        }
      } catch (error) {
        if (signal.aborted) {
          throw connectAbortedError(error);
        }
        lastError = error;
        await this.emit("transport-connect", "failed", requestId, "MCPFN_TARGET_OPEN_FAILED", {
          attempt,
          message: errorMessage(error),
        });
        if (attempt < retries) {
          await delay(this.options.connectRetryDelayMs ?? 100, signal);
          continue;
        }
        this._state = "idle";
        throw new McpFnClientError(
          "MCPFN_TARGET_OPEN_FAILED",
          "Failed to open the MCP target",
          { phase: "transport-connect", retryable: true, cause: error },
        );
      }

      const protocol = new Client(
        this.options.info ?? { name: "mcpfn-client", version: "0.0.1" },
        {
          ...this.options.clientOptions,
          capabilities: this.options.capabilities ?? {},
        },
      );
      this._protocol = protocol;
      protocol.onerror = (error) => {
        void this.emit("capability-operation", "failed", this.requestId(), errorCode(error), {
          message: error.message,
          source: "protocol",
        });
      };
      protocol.onclose = () => {
        if (this._protocol !== protocol || this._state !== "connected") return;
        const handle = this.handle;
        this._protocol = undefined;
        this.handle = undefined;
        this._state = "idle";
        void closeTransportHandle(handle);
        void this.emit("transport-close", "succeeded", this.requestId());
      };
      await this.emit("mcp-initialize", "started", requestId);
      try {
        await this.options.configure?.(protocol);
        await protocol.connect(this.handle.transport);
        if (signal.aborted) {
          await this.cleanupAttempt();
          throw connectAbortedError();
        }
        this._state = "connected";
        await this.emit("transport-connect", "succeeded", requestId, undefined, { attempt });
        await this.emit("mcp-initialize", "succeeded", requestId, undefined, {
          server: protocol.getServerVersion(),
          capabilities: protocol.getServerCapabilities(),
        });
        return;
      } catch (error) {
        lastError = error;
        if (signal.aborted) {
          await this.cleanupAttempt();
          throw connectAbortedError(error);
        }
        if (error instanceof UnauthorizedError) {
          this._state = "authorization-required";
          await this.emit(
            "authorization-request",
            "succeeded",
            requestId,
            "MCPFN_AUTHORIZATION_REQUIRED",
          );
          throw new McpFnClientError(
            "MCPFN_AUTHORIZATION_REQUIRED",
            "MCP authorization is required; complete the callback and retry",
            { phase: "authorization-request", retryable: true, cause: error },
          );
        }
        await this.emit("mcp-initialize", "failed", requestId, errorCode(error), {
          message: errorMessage(error),
          attempt,
        });
        await this.cleanupAttempt();
        if (attempt < retries) {
          await delay(this.options.connectRetryDelayMs ?? 100, signal);
          continue;
        }
      }
    }
    this._state = "idle";
    throw new McpFnClientError(
      "MCPFN_CONNECT_FAILED",
      "Failed to connect and initialize the MCP session",
      { phase: "mcp-initialize", retryable: true, cause: lastError },
    );
  }

  async completeAuthorization(
    callback: string | { code: string; state?: string },
  ): Promise<void> {
    const authorizationCode = typeof callback === "string" ? callback : callback.code;
    const state = typeof callback === "string" ? undefined : callback.state;
    const requestId = this.requestId();
    if (this._state !== "authorization-required" || !this.handle?.finishAuthorization) {
      throw new McpFnClientError(
        "MCPFN_AUTH_CALLBACK_UNSUPPORTED",
        "The current target has no pending authorization callback",
        { phase: "authorization-callback" },
      );
    }
    await this.emit("authorization-callback", "started", requestId);
    await this.emit("token-exchange", "started", requestId);
    try {
      await this.handle.finishAuthorization(authorizationCode, state);
      await this.emit("token-exchange", "succeeded", requestId);
      await this.emit("authorization-callback", "succeeded", requestId);
    } catch (error) {
      await this.emit("token-exchange", "failed", requestId, errorCode(error), {
        message: errorMessage(error),
      });
      throw new McpFnClientError(
        "MCPFN_AUTH_CALLBACK_FAILED",
        "Failed to exchange the MCP authorization callback",
        { phase: "token-exchange", cause: error },
      );
    }
    await this.cleanupAttempt();
    this._state = "idle";
    await this.connect();
  }

  /** Explicit reconnect. McpFn never replays the caller's capability operation. */
  async reconnect(): Promise<void> {
    await this.close(false);
    this._state = "idle";
    await this.connect();
  }

  async terminateSession(): Promise<void> {
    await this.handle?.terminateSession?.();
  }

  async close(permanent = true): Promise<void> {
    if (this.closePromise) return this.closePromise;
    if (this._state === "closed" && permanent) return;
    this.closePromise = (async () => {
      this._state = "closing";
      const requestId = this.requestId();
      await this.emit("transport-close", "started", requestId);
      const pendingConnect = this.connectPromise;
      this.connectController?.abort();
      await pendingConnect?.catch(() => undefined);
      await this.cleanupAttempt();
      this._state = permanent ? "closed" : "idle";
      await this.emit("transport-close", "succeeded", requestId);
    })().finally(() => {
      this.closePromise = undefined;
    });
    return this.closePromise;
  }

  private async cleanupAttempt(): Promise<void> {
    const protocol = this._protocol;
    const handle = this.handle;
    this._protocol = undefined;
    this.handle = undefined;
    await protocol?.close().catch(() => undefined);
    await handle?.close?.().catch(() => undefined);
  }

  private async listTools(options?: RequestOptions): Promise<Tool[]> {
    return this.operation("tools/list", async () => {
      const values: Tool[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.protocol.listTools(cursor ? { cursor } : undefined, options);
        values.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      return values;
    });
  }

  private async listResources(options?: RequestOptions): Promise<Resource[]> {
    return this.operation("resources/list", async () => {
      const values: Resource[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.protocol.listResources(cursor ? { cursor } : undefined, options);
        values.push(...page.resources);
        cursor = page.nextCursor;
      } while (cursor);
      return values;
    });
  }

  private async listResourceTemplates(options?: RequestOptions): Promise<ResourceTemplate[]> {
    return this.operation("resources/templates/list", async () => {
      const values: ResourceTemplate[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.protocol.listResourceTemplates(
          cursor ? { cursor } : undefined,
          options,
        );
        values.push(...page.resourceTemplates);
        cursor = page.nextCursor;
      } while (cursor);
      return values;
    });
  }

  private async listPrompts(options?: RequestOptions): Promise<Prompt[]> {
    return this.operation("prompts/list", async () => {
      const values: Prompt[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.protocol.listPrompts(cursor ? { cursor } : undefined, options);
        values.push(...page.prompts);
        cursor = page.nextCursor;
      } while (cursor);
      return values;
    });
  }

  private async operation<T>(name: string, run: () => Promise<T>): Promise<T> {
    const requestId = this.requestId();
    await this.emit("capability-operation", "started", requestId, undefined, { operation: name });
    try {
      const result = await run();
      await this.emit("capability-operation", "succeeded", requestId, undefined, {
        operation: name,
      });
      return result;
    } catch (error) {
      await this.emit("capability-operation", "failed", requestId, errorCode(error), {
        operation: name,
        message: errorMessage(error),
      });
      throw error;
    }
  }

  private requestId(): string {
    return this.options.requestId?.() ?? randomUUID();
  }

  private async emit(
    phase: McpFnDiagnosticPhase,
    outcome: McpFnDiagnosticEvent["outcome"],
    requestId: string,
    code?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.dispatch({
      phase,
      outcome,
      ...(code ? { code } : {}),
      requestId,
      at: (this.options.clock?.() ?? new Date()).toISOString(),
      target: redactOAuthValue(this.options.target.describe()),
      ...(details ? { details: redactOAuthValue(details) } : {}),
    });
  }

  private async dispatch(event: McpFnDiagnosticEvent): Promise<void> {
    const redacted = redactOAuthValue(event);
    await Promise.allSettled(
      [...this.listeners].map(async (listener) => listener(redacted)),
    );
  }
}

export function createMcpFnClient(options: McpFnClientOptions): McpFnClient {
  return new McpFnClient(options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? String(code) : undefined;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => finish();
    const timer = setTimeout(() => finish(), ms);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) finish();
  });
}

async function closeTransportHandle(handle: McpFnTransportHandle | undefined): Promise<void> {
  if (!handle) return;
  if (handle.close) {
    await handle.close().catch(() => undefined);
  } else {
    await handle.transport.close().catch(() => undefined);
  }
}

function connectAbortedError(cause?: unknown): McpFnClientError {
  return new McpFnClientError(
    "MCPFN_CONNECT_ABORTED",
    "McpFn connection was aborted",
    { phase: "transport-connect", cause },
  );
}
