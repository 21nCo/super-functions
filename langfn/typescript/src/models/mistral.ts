import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ToolCall,
  tokenUsage
} from "../core/types.js";
import { ProviderAuthError, ProviderError, RateLimitError } from "../core/errors.js";
import { toOpenAIMessage } from "./openai.js";
import { ChatModel } from "./base.js";
import { getTransportClient } from "./transport.js";

export interface MistralConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
}

export class MistralChatModel extends ChatModel {
  readonly provider = "mistral";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetchImpl?: typeof fetch;

  constructor(config: MistralConfig = {}) {
    super();
    this.apiKey = config.apiKey ?? "";
    this.model = config.model ?? "mistral-small-latest";
    this.baseUrl = config.baseUrl ?? "https://api.mistral.ai/v1";
    this.timeout = config.timeout ?? 60_000;
    this.fetchImpl = config.fetchImpl;
  }

  private get client() {
    return getTransportClient({
      baseUrl: this.baseUrl,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      timeout: this.timeout,
      fetchImpl: this.fetchImpl
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const chat = await this.chat({
      messages: [{ role: "user", content: request.prompt }],
      signal: request.signal,
      metadata: request.metadata
    });
    return { content: chat.message.content, usage: chat.usage, raw: chat.raw };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.request("/chat/completions", {
      method: "POST",
      signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        messages: request.messages.map(toOpenAIMessage),
        tools: request.tools?.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        })),
        tool_choice: request.tool_choice
      })
    });
    await raiseForStatus(this.provider, response);
    const data = await response.json();
    const message = data?.choices?.[0]?.message ?? {};
    const toolCalls = Array.isArray(message.tool_calls)
      ? message.tool_calls.map((entry: Record<string, any>) => {
          const fn = entry.function ?? {};
          let argumentsValue: Record<string, unknown> = {};
          try {
            argumentsValue =
              typeof fn.arguments === "string"
                ? (JSON.parse(fn.arguments) as Record<string, unknown>)
                : ((fn.arguments ?? {}) as Record<string, unknown>);
          } catch {
            argumentsValue = {};
          }
          return {
            id: String(entry.id ?? ""),
            name: String(fn.name ?? ""),
            arguments: argumentsValue
          } satisfies ToolCall;
        })
      : undefined;

    return {
      message: { role: "assistant", content: message.content ?? "", toolCalls },
      toolCalls,
      tool_calls: toolCalls,
      usage: data?.usage
        ? tokenUsage(Number(data.usage.prompt_tokens ?? 0), Number(data.usage.completion_tokens ?? 0))
        : undefined,
      raw: data
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const completion = await this.complete(request);
    yield { type: "content", content: completion.content, delta: completion.content };
    if (completion.usage) yield { type: "token_usage", prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens };
    yield { type: "end", finish_reason: "stop" };
  }
}

async function raiseForStatus(provider: string, response: Response): Promise<void> {
  if (response.ok) return;
  const body = await response.text();
  if (response.status === 401) {
    throw new ProviderAuthError(undefined, { provider, metadata: { status: response.status, body } });
  }
  if (response.status === 429) {
    throw new RateLimitError(undefined, { provider, metadata: { status: response.status, body } });
  }
  throw new ProviderError(`Mistral request failed (${response.status})`, {
    provider,
    metadata: { status: response.status, body }
  });
}
