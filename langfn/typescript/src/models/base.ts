import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent
} from "../core/types.js";

export abstract class ChatModel {
  abstract provider: string;
  abstract model: string;

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract stream(request: CompletionRequest): AsyncIterable<StreamEvent>;

  protected async completeFromChat(request: CompletionRequest): Promise<CompletionResponse> {
    const chat = await this.chat({
      messages: [{ role: "user", content: request.prompt }],
      metadata: request.metadata
    });
    return {
      content: chat.message.content,
      usage: chat.usage,
      raw: chat.raw
    };
  }
}

export interface CustomChatModelConfig {
  model?: string;
  provider?: string;
  complete?: (request: CompletionRequest) => Promise<CompletionResponse> | CompletionResponse;
  chat?: (request: ChatRequest) => Promise<ChatResponse> | ChatResponse;
  stream?: (request: CompletionRequest) => AsyncIterable<StreamEvent>;
}

export class CustomChatModel extends ChatModel {
  readonly provider: string;
  readonly model: string;
  private readonly completeHandler?: CustomChatModelConfig["complete"];
  private readonly chatHandler?: CustomChatModelConfig["chat"];
  private readonly streamHandler?: CustomChatModelConfig["stream"];

  constructor(config: CustomChatModelConfig = {}) {
    super();
    this.provider = config.provider ?? "custom";
    this.model = config.model ?? "custom-model";
    this.completeHandler = config.complete;
    this.chatHandler = config.chat;
    this.streamHandler = config.stream;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (this.completeHandler) {
      return await this.completeHandler(request);
    }
    if (!this.chatHandler) {
      throw new Error("CustomChatModel requires a complete or chat handler");
    }
    return await this.completeFromChat(request);
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (this.chatHandler) {
      return await this.chatHandler(request);
    }
    if (!this.completeHandler) {
      throw new Error("CustomChatModel requires a chat or complete handler");
    }
    const completion = await this.completeHandler({
      prompt: request.messages[request.messages.length - 1]?.content ?? "",
      metadata: request.metadata
    });
    return {
      message: { role: "assistant", content: completion.content },
      usage: completion.usage,
      raw: completion.raw
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    if (this.streamHandler) {
      yield* this.streamHandler(request);
      return;
    }
    const completion = await this.complete(request);
    yield { type: "content", content: completion.content, delta: completion.content };
    yield { type: "end", finish_reason: "stop" };
  }
}
