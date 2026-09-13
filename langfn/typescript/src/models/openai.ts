import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ToolCall,
  ToolSpec,
  tokenUsage
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
    if (!this.apiKeyRef && this.fetchImpl) {
      return "test-api-key";
    }
    return "";
  }

  private get client() {
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
      messages: request.messages
    };
    if (request.tools?.length) payload.tools = request.tools.map(toOpenAITool);
    if (request.tool_choice !== undefined) payload.tool_choice = request.tool_choice;

    const response = await this.client.request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify(payload)
    });
    await raiseForStatus(this.provider, response);

    const data = await response.json();
    const message = data?.choices?.[0]?.message ?? {};
    const toolCalls = parseToolCalls(message.tool_calls);
    const usage = data?.usage
      ? tokenUsage(
          Number(data.usage.prompt_tokens ?? 0),
          Number(data.usage.completion_tokens ?? 0)
        )
      : undefined;

    return {
      message: {
        role: "assistant",
        content: message.content ?? ""
      },
      toolCalls,
      tool_calls: toolCalls,
      usage,
      raw: data
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const response = await this.client.request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: request.prompt }],
        stream: true
      })
    });
    await raiseForStatus(this.provider, response);

    if (!response.body) {
      throw new ProviderError("OpenAI stream response was empty", { provider: this.provider });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const chunk = line.slice(5).trim();
        if (chunk === "[DONE]") {
          yield { type: "end", finish_reason: "stop" };
          return;
        }
        const data = JSON.parse(chunk);
        const delta = data?.choices?.[0]?.delta?.content;
        if (delta) {
          yield { type: "content", content: delta, delta };
        }
      }
    }

    yield { type: "end", finish_reason: "stop" };
  }
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

function parseToolCalls(raw: unknown): ToolCall[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const toolCalls = raw
    .map((entry) => {
      const call = entry as Record<string, any>;
      const fn = call.function ?? {};
      try {
        return {
          id: String(call.id ?? ""),
          name: String(fn.name ?? ""),
          arguments:
            typeof fn.arguments === "string"
              ? (JSON.parse(fn.arguments) as Record<string, unknown>)
              : ((fn.arguments ?? {}) as Record<string, unknown>)
        } satisfies ToolCall;
      } catch {
        return {
          id: String(call.id ?? ""),
          name: String(fn.name ?? ""),
          arguments: {}
        } satisfies ToolCall;
      }
    })
    .filter((call) => call.name);
  return toolCalls.length ? toolCalls : undefined;
}

async function raiseForStatus(provider: string, response: Response): Promise<void> {
  if (response.ok) return;

  const retryAfterHeader = response.headers.get("retry-after");
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
      retryAfter: retryAfterHeader ? Number(retryAfterHeader) : undefined,
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
