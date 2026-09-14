import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  tokenUsage
} from "../core/types.js";
import { ChatModel } from "./base.js";

export interface MockChatModelConfig {
  responses?: string[];
  streams?: StreamEvent[][];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  complete?: (request: CompletionRequest) => Promise<CompletionResponse> | CompletionResponse;
  chat?: (request: ChatRequest) => Promise<ChatResponse> | ChatResponse;
}

export class MockChatModel extends ChatModel {
  readonly provider = "mock";
  readonly model = "mock-1";
  private readonly responses: string[];
  private readonly streams: StreamEvent[][];
  private readonly usage?: CompletionResponse["usage"];
  private readonly completeHandler?: MockChatModelConfig["complete"];
  private readonly chatHandler?: MockChatModelConfig["chat"];

  constructor(config: MockChatModelConfig = {}) {
    super();
    this.responses = [...(config.responses ?? [])];
    this.streams = [...(config.streams ?? [])];
    this.completeHandler = config.complete;
    this.chatHandler = config.chat;
    this.usage = config.usage
      ? tokenUsage(
          config.usage.prompt_tokens ?? 0,
          config.usage.completion_tokens ?? 0
        )
      : undefined;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.completeHandler) {
      return await this.completeHandler(request);
    }
    return {
      content: this.responses.shift() ?? request.prompt,
      raw: { mock: true },
      usage: this.usage
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (this.chatHandler) {
      return await this.chatHandler(request);
    }
    return {
      message: {
        role: "assistant",
        content: this.responses.shift() ?? JSON.stringify({ echo: request.messages })
      },
      raw: { mock: true },
      usage: this.usage
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    const scripted = this.streams.shift();
    if (scripted) {
      yield* scripted;
      return;
    }
    const completion = await this.complete(request);
    yield { type: "content", content: completion.content, delta: completion.content };
    yield { type: "end", finish_reason: "stop" };
  }
}
