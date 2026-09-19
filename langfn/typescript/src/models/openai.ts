import { providerUsage } from "../core/usage.js";
import { readStreamLines } from "./stream-lines.js";
import {
  Message,
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
import { type SecretProvider, resolveSecret } from "../tools/policy.js";

export interface OpenAIConfig {
  apiKey?: string;
  apiKeyRef?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
  secretProvider?: SecretProvider;
}

export class OpenAIChatModel extends ChatModel {
  readonly provider = "openai";
  readonly model: string;
  private readonly rawApiKey: string;
  private readonly apiKeyRef?: string;
  readonly baseUrl: string;
  readonly timeout: number;
  private readonly organization?: string;
  private readonly project?: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly secretProvider?: SecretProvider;

  constructor(config: OpenAIConfig = {}) {
    super();
    this.rawApiKey = config.apiKey ?? "";
    this.apiKeyRef = config.apiKeyRef;
    this.model = config.model ?? "gpt-4o-mini";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.timeout = config.timeout ?? 60_000;
    this.organization = config.organization;
    this.project = config.project;
    this.fetchImpl = config.fetchImpl;
    this.secretProvider = config.secretProvider;
  }

  get apiKey(): string {
    const resolved = this.rawApiKey || resolveSecret(this.apiKeyRef, this.secretProvider) || "";
    if (resolved) {
      return resolved;
    }
    return "";
  }

  get transport() {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new NotConfiguredError("OpenAI API key is required");
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    };
    if (this.organization) headers["openai-organization"] = this.organization;
    if (this.project) headers["openai-project"] = this.project;
    return getTransportClient({
      baseUrl: this.baseUrl,
      headers,
      timeout: this.timeout,
      fetchImpl: this.fetchImpl
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return await this.completeFromChat(request);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const payload: Record<string, unknown> = {
      model: this.model,
      messages: request.messages.map(toOpenAIMessage)
    };
    if (request.tools?.length) payload.tools = request.tools.map(toOpenAITool);
    if (request.tool_choice !== undefined) payload.tool_choice = request.tool_choice;

    const response = await this.transport.request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(payload)
    });
    await raiseForStatus(this.provider, response);

    const data = await response.json();
    const message = data?.choices?.[0]?.message ?? {};
    const toolCalls = parseToolCalls(message.tool_calls);
    const usage = data?.usage
      ? providerUsage(data.usage.prompt_tokens, data.usage.completion_tokens, data.usage.total_tokens)
      : undefined;

    return {
      message: {
        role: "assistant",
        content: message.content ?? "",
        toolCalls
      },
      toolCalls,
      tool_calls: toolCalls,
      usage,
      raw: data
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const response = await this.transport.request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: request.prompt }],
        stream: true,
        stream_options: { include_usage: true }
      })
    });
    await raiseForStatus(this.provider, response);

    if (!response.body) {
      throw new ProviderError("OpenAI stream response was empty", { provider: this.provider });
    }

    for await (const rawLine of readStreamLines(response.body)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const chunk = line.slice(5).trim();
      if (chunk === "[DONE]") {
        yield { type: "end", finish_reason: "stop" };
        return;
      }
      if (!chunk) continue;
      const data = JSON.parse(chunk);
      if (data.error) throw new ProviderError("OpenAI stream failed", { provider: this.provider });
      if (data.usage) yield { type: "token_usage", ...providerUsage(data.usage.prompt_tokens, data.usage.completion_tokens, data.usage.total_tokens) };
      const delta = data?.choices?.[0]?.delta?.content;
      if (delta) {
        yield { type: "content", content: delta, delta };
      }
    }

    throw new ProviderError("OpenAI stream ended before the [DONE] sentinel", { provider: this.provider });
  }
}

export function toOpenAIMessage(message: Message): Record<string, unknown> {
  const wire: Record<string, unknown> = { role: message.role, content: message.content };
  if (message.name !== undefined) wire.name = message.name;
  if (message.tool_call_id !== undefined) wire.tool_call_id = message.tool_call_id;
  const calls = parseMessageToolCalls(message);
  if (calls?.length) wire.tool_calls = calls.map(call => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.arguments) }
  }));
  return wire;
}

function toOpenAITool(tool: ToolSpec): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema ?? { type: "object", properties: {} }
    }
  };
}

export function parseToolCalls(raw: unknown): ToolCall[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new ProviderError("Invalid tool calls");
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new ProviderError("Invalid tool call");
    const fn = entry.function ?? entry;
    let args: unknown = fn.arguments;
    if (typeof args === "string") {
      try { args = JSON.parse(args); }
      catch { throw new ProviderError("Invalid tool call arguments JSON"); }
    }
    if (typeof entry.id !== "string" || !entry.id || typeof fn.name !== "string" || !fn.name ||
        !args || typeof args !== "object" || Array.isArray(args)) {
      throw new ProviderError("Invalid tool call shape");
    }
    return { id: entry.id, name: fn.name, arguments: args as Record<string, unknown> };
  });
}

export function parseMessageToolCalls(
  message: Pick<Message, "toolCalls" | "tool_calls">,
): ToolCall[] | undefined {
  const canonical = parseToolCalls(message.toolCalls);
  const compatibility = parseToolCalls(message.tool_calls);
  if (canonical?.length && compatibility?.length) {
    if (stableToolCalls(canonical) !== stableToolCalls(compatibility)) {
      throw new ProviderError("Conflicting tool call aliases");
    }
    return canonical;
  }
  return canonical?.length ? canonical : compatibility?.length ? compatibility : undefined;
}

function stableToolCalls(calls: ToolCall[]): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  };
  return JSON.stringify(sortKeys(calls));
}

export async function raiseForStatus(provider: string, response: Response): Promise<void> {
  if (response.ok) return;

  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
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
    throw new RateLimitError(undefined, {
      provider,
      retryAfter,
      metadata: { status: response.status, body }
    });
  }
  if (response.status === 400) {
    const error = typeof body === "object" && body ? (body as Record<string, any>).error ?? {} : {};
    const message = String(error.message ?? "");
    const code = String(error.code ?? error.type ?? "");
    if (
      code === "context_length_exceeded" ||
      (code === "invalid_request_error" && message.toLowerCase().includes("maximum context length"))
    ) {
      throw new ContextLengthError(undefined, { provider, metadata: { status: response.status, body } });
    }
  }

  throw new ProviderError(`OpenAI request failed (${response.status})`, {
    provider,
    metadata: { status: response.status, body }
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const seconds = Number(normalized);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds : undefined;
  const retryAt = Date.parse(normalized);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(0, (retryAt - Date.now()) / 1_000);
}
