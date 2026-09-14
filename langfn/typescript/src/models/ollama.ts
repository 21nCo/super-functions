import { readStreamLines } from "./stream-lines.js";
import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  tokenUsage
} from "../core/types.js";
import { ProviderError } from "../core/errors.js";
import { ChatModel } from "./base.js";
import { getTransportClient } from "./transport.js";

export interface OllamaConfig {
  model?: string;
  baseUrl?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
}

export class OllamaChatModel extends ChatModel {
  readonly provider = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly fetchImpl?: typeof fetch;

  constructor(config: OllamaConfig = {}) {
    super();
    this.model = config.model ?? "llama3";
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.timeout = config.timeout ?? 60_000;
    this.fetchImpl = config.fetchImpl;
  }

  private get client() {
    return getTransportClient({
      baseUrl: this.baseUrl,
      headers: { "content-type": "application/json" },
      timeout: this.timeout,
      fetchImpl: this.fetchImpl
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return await this.completeFromChat(request);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    let response: Response;
    try {
      response = await this.client.request("/api/chat", {
        method: "POST",
      signal: request.signal,
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          stream: false
        })
      });
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      throw new ProviderError("Could not connect to Ollama", { provider: this.provider, cause: error });
    }

    if (!response.ok) {
      throw new ProviderError(`Ollama request failed (${response.status})`, {
        provider: this.provider,
        metadata: { status: response.status, body: await response.text() }
      });
    }

    const data = await response.json();
    return {
      message: {
        role: data?.message?.role ?? "assistant",
        content: data?.message?.content ?? ""
      },
      usage:
        data?.eval_count !== undefined
          ? tokenUsage(Number(data.prompt_eval_count ?? 0), Number(data.eval_count ?? 0))
          : undefined,
      raw: data
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    let response: Response;
    try {
      response = await this.client.request("/api/chat", {
        method: "POST",
      signal: request.signal,
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: request.prompt }],
          stream: true
        })
      });
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason;
      throw new ProviderError("Could not connect to Ollama", { provider: this.provider, cause: error });
    }

    if (!response.ok) {
      throw new ProviderError(`Ollama request failed (${response.status})`, {
        provider: this.provider,
        metadata: { status: response.status, body: await response.text() }
      });
    }
    if (!response.body) {
      throw new ProviderError("Ollama stream response was empty", { provider: this.provider });
    }

    for await (const rawLine of readStreamLines(response.body)) {
      const line = rawLine;
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.prompt_eval_count !== undefined || chunk.eval_count !== undefined) yield { type: "token_usage", prompt_tokens: Number(chunk.prompt_eval_count ?? 0), completion_tokens: Number(chunk.eval_count ?? 0) };
      if (chunk.error) throw new ProviderError("Ollama stream failed", { provider: this.provider });
      const delta = String(chunk.message?.content ?? "");
      if (delta) yield { type: "content", content: delta, delta };
      if (chunk.done) {
        yield { type: "end", finish_reason: "stop" };
        return;
      }
    }

    yield { type: "end", finish_reason: "stop" };
  }
}
