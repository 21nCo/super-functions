import { readStreamLines } from "./stream-lines.js";
import { providerUsage } from "../core/usage.js";
import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent
} from "../core/types.js";
import { ProviderAuthError, ProviderError, RateLimitError } from "../core/errors.js";
import { parseToolCalls, toOpenAIMessage } from "./openai.js";
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
    const toolCalls = parseToolCalls(message.tool_calls);

    return {
      message: { role: "assistant", content: message.content ?? "", toolCalls },
      toolCalls,
      tool_calls: toolCalls,
      usage: data?.usage
        ? providerUsage(data.usage.prompt_tokens, data.usage.completion_tokens, data.usage.total_tokens)
        : undefined,
      raw: data
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const response = await this.client.request("/chat/completions", {
      method: "POST", signal: request.signal,
      body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: request.prompt }], stream: true })
    });
    await raiseForStatus(this.provider, response);
    if (!response.body) throw new ProviderError("Mistral stream response was empty");
    for await (const rawLine of readStreamLines(response.body)) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break;
      if (!payload) continue;
      const data = JSON.parse(payload);
      if (data.error) throw new ProviderError("Mistral stream failed");
      if (data.usage) yield { type: "token_usage", ...providerUsage(data.usage.prompt_tokens, data.usage.completion_tokens, data.usage.total_tokens) };
      const delta = data.choices?.[0]?.delta?.content;
      if (delta) yield { type: "content", content: delta, delta };
    }
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
