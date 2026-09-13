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
      if (error instanceof Error && error.name === "AbortError") throw error;
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
      if (error instanceof Error && error.name === "AbortError") throw error;
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line);
        if (chunk.done) {
          yield { type: "end", finish_reason: "stop" };
          return;
        }
        const delta = String(chunk.message?.content ?? "");
        if (delta) {
          yield { type: "content", content: delta, delta };
        }
      }
    }

    yield { type: "end", finish_reason: "stop" };
  }
}
