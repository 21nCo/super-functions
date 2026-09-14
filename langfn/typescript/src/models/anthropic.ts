import { providerUsage } from "../core/usage.js";
import { readStreamLines } from "./stream-lines.js";
import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ToolCall,
  ToolSpec,
} from "../core/types.js";
import {
  ContextLengthError,
  NotConfiguredError,
  ProviderAuthError,
  ProviderError,
  RateLimitError
} from "../core/errors.js";
import { ChatModel } from "./base.js";
import { getTransportClient } from "./transport.js";
import { type Message } from "../core/types.js";
import { type SecretProvider, resolveSecret } from "../tools/policy.js";

export interface AnthropicConfig {
  apiKey?: string;
  apiKeyRef?: string;
  model?: string;
  baseUrl?: string;
  version?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
  secretProvider?: SecretProvider;
}

export class AnthropicChatModel extends ChatModel {
  readonly provider = "anthropic";
  readonly model: string;
  private readonly rawApiKey: string;
  private readonly apiKeyRef?: string;
  private readonly baseUrl: string;
  private readonly version: string;
  private readonly timeout: number;
  private readonly fetchImpl?: typeof fetch;
  private readonly secretProvider?: SecretProvider;

  constructor(config: AnthropicConfig = {}) {
    super();
    this.rawApiKey = config.apiKey ?? "";
    this.apiKeyRef = config.apiKeyRef;
    this.model = config.model ?? "claude-3-opus-20240229";
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
    this.version = config.version ?? "2023-06-01";
    this.timeout = config.timeout ?? 60_000;
    this.fetchImpl = config.fetchImpl;
    this.secretProvider = config.secretProvider;
  }

  private get apiKey(): string {
    return this.rawApiKey || resolveSecret(this.apiKeyRef, this.secretProvider) || "";
  }

  private get client() {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new NotConfiguredError("Anthropic API key is required");
    }
    return getTransportClient({
      baseUrl: this.baseUrl,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": this.version
      },
      timeout: this.timeout,
      fetchImpl: this.fetchImpl
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return await this.completeFromChat(request);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { system, messages } = splitSystemMessage(request.messages);
    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: 4096
    };
    if (system) payload.system = system;
    if (request.tools?.length) payload.tools = request.tools.map(toAnthropicTool);
    if (request.tool_choice !== undefined) {
      const choice = request.tool_choice;
      if (typeof choice !== "string") payload.tool_choice = choice;
      else if (choice === "auto" || choice === "none") payload.tool_choice = { type: choice };
      else if (choice === "required") payload.tool_choice = { type: "any" };
      else payload.tool_choice = { type: "tool", name: choice };
    }

    const response = await this.client.request("/messages", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(payload)
    });
    await raiseForStatus(this.provider, response);
    const data = await response.json();
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const content = blocks
      .filter((block: Record<string, any>) => block.type === "text")
      .map((block: Record<string, any>) => String(block.text ?? ""))
      .join("");
    const toolCalls = blocks
      .filter((block: Record<string, any>) => block.type === "tool_use")
      .map(
        (block: Record<string, any>) =>
          ({
            id: String(block.id ?? ""),
            name: String(block.name ?? ""),
            arguments: (block.input ?? {}) as Record<string, unknown>
          }) satisfies ToolCall
      );

    return {
      message: { role: "assistant", content, toolCalls: toolCalls.length ? toolCalls : undefined },
      toolCalls: toolCalls.length ? toolCalls : undefined,
      tool_calls: toolCalls.length ? toolCalls : undefined,
      usage: data?.usage
        ? providerUsage(data.usage.input_tokens, data.usage.output_tokens)
        : undefined,
      raw: data
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const response = await this.client.request("/messages", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: request.prompt }],
        max_tokens: 4096,
        stream: true
      })
    });
    await raiseForStatus(this.provider, response);
    if (!response.body) {
      throw new ProviderError("Anthropic stream response was empty", { provider: this.provider });
    }

    let promptTokens: unknown;
    let completionTokens: unknown;
    for await (const rawLine of readStreamLines(response.body)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const chunk = line.slice(5).trim();
      if (!chunk) continue;
      const event = JSON.parse(chunk);
      const usage = event.type === "message_start" ? event.message?.usage : event.usage;
      if (usage) {
        if (usage.input_tokens !== undefined) promptTokens = usage.input_tokens;
        if (usage.output_tokens !== undefined) completionTokens = usage.output_tokens;
        yield { type: "token_usage", ...providerUsage(promptTokens, completionTokens) };
      }
      if (event.type === "error") throw new ProviderError("Anthropic stream failed", { provider: this.provider });
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const delta = String(event.delta.text ?? "");
        yield { type: "content", content: delta, delta };
      }
      if (event.type === "message_stop") {
        yield { type: "end", finish_reason: "stop" };
        return;
      }
    }

    yield { type: "end", finish_reason: "stop" };
  }
}

function toAnthropicTool(tool: ToolSpec): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema ?? { type: "object", properties: {} }
  };
}

function splitSystemMessage(messages: Message[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: unknown }>;
} {
  let system: string | undefined;
  const result: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  for (const message of messages as Array<Message & Record<string, unknown>>) {
    if (message.role === "system") {
      system = system === undefined ? message.content : `${system}\n\n${message.content}`;
      continue;
    }

    if (message.role === "tool") {
      result.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id,
            content: message.content
          }
        ]
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const content: Array<Record<string, unknown>> = message.content ? [{ type: "text", text: message.content }] : [];
      for (const call of message.toolCalls) content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
      result.push({ role: "assistant", content });
      continue;
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const content: Array<Record<string, unknown>> = [];
      if (message.content) {
        content.push({ type: "text", text: message.content });
      }
      for (const rawCall of message.tool_calls as Array<Record<string, unknown>>) {
        const fn = (rawCall.function ?? {}) as Record<string, unknown>;
        let input: Record<string, unknown> = {};
        try {
          input =
            typeof fn.arguments === "string"
              ? (JSON.parse(fn.arguments) as Record<string, unknown>)
              : ((fn.arguments ?? {}) as Record<string, unknown>);
        } catch {
          input = {};
        }
        content.push({
          type: "tool_use",
          id: rawCall.id,
          name: fn.name,
          input
        });
      }
      result.push({ role: "assistant", content });
      continue;
    }

    result.push({
      role: message.role,
      content: message.content
    });
  }

  return { system, messages: result };
}

async function raiseForStatus(provider: string, response: Response): Promise<void> {
  if (response.ok) return;
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  if (response.status === 401) {
    throw new ProviderAuthError(undefined, { provider, metadata: { status: response.status, body } });
  }
  if (response.status === 429) {
    throw new RateLimitError(undefined, { provider, metadata: { status: response.status, body } });
  }
  if (response.status === 400) {
    const error = typeof body === "object" && body ? (body as Record<string, any>).error ?? {} : {};
    const message = String(error.message ?? "");
    if (String(error.type ?? "") === "invalid_request_error" && message.includes("prompt is too long")) {
      throw new ContextLengthError(undefined, { provider, metadata: { status: response.status, body } });
    }
  }

  throw new ProviderError(`Anthropic request failed (${response.status})`, {
    provider,
    metadata: { status: response.status, body }
  });
}
