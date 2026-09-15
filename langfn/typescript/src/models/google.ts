import { secureRandomUUID } from "../utils/random.js";
import { parseMessageToolCalls } from "./openai.js";
import {
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  StreamEvent,
  ToolCall,
  tokenUsage,
} from "../core/types.js";
import {
  NotConfiguredError,
  ProviderAuthError,
  ProviderError,
  RateLimitError,
} from "../core/errors.js";
import { ChatModel } from "./base.js";

export interface GoogleConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  fetchImpl?: typeof fetch;
}
type Part = Record<string, any>;

/** Native Gemini REST adapter. Google parts are retained for signed tool continuation. */
export class GoogleChatModel extends ChatModel {
  readonly provider = "google";
  readonly model: string;
  readonly capabilities = {
    tools: true,
    streaming: true,
    chatStreaming: true,
    embeddings: false,
  } as const;
  private readonly config: GoogleConfig;

  constructor(config: GoogleConfig = {}) {
    super();
    this.config = config;
    this.model = config.model ?? "gemini-2.5-flash";
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.chat({
      messages: [{ role: "user", content: request.prompt }],
      signal: request.signal,
    });
    return {
      content: response.message.content,
      usage: response.usage,
      raw: response.raw,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const operation = await this.request(request, false);
    try {
      const data = await operation.response.json();
      return this.parse(data);
    } finally {
      operation.close();
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamEvent> {
    yield* this.streamChat({
      messages: [{ role: "user", content: request.prompt }],
      signal: request.signal,
    });
  }

  async *streamChat(request: ChatRequest): AsyncIterable<StreamEvent> {
    const operation = await this.request(request, true);
    const reader = operation.response.body?.getReader();
    if (!reader) {
      operation.close();
      throw this.error("Google stream response was empty");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let finish: string | undefined;
    let usage: ReturnType<typeof tokenUsage> | undefined;
    const parts: Part[] = [];
    try {
      for (;;) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        if (buffer.length > 4 * 1024 * 1024)
          throw this.error("Google stream event exceeds limit");
        // SSE framing can be split at any byte boundary, including CRLF.
        let match: RegExpExecArray | null;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const payload = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!payload) continue;
          let data: any;
          try {
            data = JSON.parse(payload);
          } catch {
            throw this.error("Malformed Google stream JSON");
          }
          const candidate = this.candidate(data);
          if (data.usageMetadata) usage = this.usage(data.usageMetadata);
          for (const part of candidate?.content?.parts ?? []) {
            this.validatePart(part);
            parts.push(part);
            if (typeof part.text === "string" && !part.thought) {
              content += part.text;
              yield { type: "content", content, delta: part.text };
            }
          }
          if (candidate?.finishReason) finish = candidate.finishReason;
        }
        if (chunk.done) break;
      }
      if (buffer.trim()) throw this.error("Truncated Google stream event");
      if (!finish)
        throw this.error("Google stream ended without a finish reason");
      const calls = this.calls(parts);
      for (const call of calls)
        yield {
          type: "tool_call",
          id: call.id,
          toolName: call.name,
          args: call.arguments,
        };
      if (usage)
        yield {
          type: "token_usage",
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        };
      // Preserve exact signed parts for the next turn, including non-text thought signatures.
      yield {
        type: "message",
        message: {
          role: "assistant",
          content,
          toolCalls: calls,
          providerData: { googleParts: parts },
        },
      };
      yield {
        type: "end",
        finish_reason: calls.length ? "tool_calls" : finish.toLowerCase(),
      };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      operation.close();
    }
  }

  private payload(request: ChatRequest): Record<string, unknown> {
    const pending = new Map<string, ToolCall & { providerId?: string }>();
    const contents: Array<{ role: string; parts: Part[] }> = [];
    const system: Part[] = [];
    for (const message of request.messages) {
      if (message.role === "system") {
        system.push({ text: message.content });
        continue;
      }
      let role = message.role === "assistant" ? "model" : "user";
      let parts: Part[];
      if (message.role === "tool") {
        const call = message.tool_call_id
          ? pending.get(message.tool_call_id)
          : undefined;
        if (!call)
          throw this.error(
            "Tool result requires a matching prior tool call id",
          );
        if (message.name && message.name !== call.name)
          throw this.error("Tool result name does not match its call");
        let result: unknown;
        try {
          result = JSON.parse(message.content);
        } catch {
          result = message.content;
        }
        parts = [
          {
            functionResponse: {
              ...(call.providerId ? { id: call.providerId } : {}),
              name: call.name,
              response: { result },
            },
          },
        ];
        pending.delete(call.id);
      } else {
        const calls = parseMessageToolCalls(message) ?? [];
        const preserved = message.providerData?.googleParts;
        parts = preserved
          ? structuredClone(preserved)
          : [
              ...(message.content ? [{ text: message.content }] : []),
              ...calls.map((call) => ({
                functionCall: {
                  id: call.id,
                  name: call.name,
                  args: call.arguments,
                },
              })),
            ];
        for (const call of calls) {
          const wire = parts.find(
            (part) => part.functionCall?.id === call.id,
          )?.functionCall;
          pending.set(call.id, { ...call, providerId: wire?.id });
        }
      }
      if (!parts.length) throw this.error("Empty message parts");
      parts.forEach((part) => this.validatePart(part));
      const previous = contents.at(-1);
      if (previous?.role === role) previous.parts.push(...parts);
      else contents.push({ role, parts });
    }
    if (!contents.length)
      throw this.error("At least one non-system message is required");
    if (pending.size)
      throw this.error("Missing tool results for prior tool calls");
    const payload: Record<string, unknown> = { contents };
    if (system.length) payload.systemInstruction = { parts: system };
    if (request.tools?.length)
      payload.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description?.trim() || tool.name,
            parametersJsonSchema: tool.input_schema ?? {
              type: "object",
              properties: {},
            },
          })),
        },
      ];
    if (request.tool_choice !== undefined) {
      const choice = request.tool_choice;
      if (typeof choice !== "string")
        throw this.error(
          "Google tool_choice must be auto, none, required, or a declared function name",
        );
      const mode = { auto: "AUTO", none: "NONE", required: "ANY" }[choice];
      if (!mode && !request.tools?.some((tool) => tool.name === choice))
        throw this.error("Unknown tool_choice");
      payload.toolConfig = {
        functionCallingConfig: mode
          ? { mode }
          : { mode: "ANY", allowedFunctionNames: [choice] },
      };
    }
    return payload;
  }

  private async request(request: ChatRequest, stream: boolean) {
    if (!this.config.apiKey)
      throw new NotConfiguredError("Google API key is required");
    const body = JSON.stringify(this.payload(request));
    const controller = new AbortController();
    const abort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abort, { once: true });
    if (request.signal?.aborted) abort();
    const timeout = this.config.timeout ?? 60_000;
    const timer =
      timeout > 0
        ? setTimeout(
            () => controller.abort(new Error("Google request timed out")),
            timeout,
          )
        : undefined;
    const close = () => {
      if (timer) clearTimeout(timer);
      request.signal?.removeEventListener("abort", abort);
    };
    try {
      controller.signal.throwIfAborted();
      const base = (
        this.config.baseUrl ??
        "https://generativelanguage.googleapis.com/v1beta"
      ).replace(/\/$/, "");
      const response = await (this.config.fetchImpl ?? fetch)(
        `${base}/models/${encodeURIComponent(this.model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.config.apiKey,
          },
          body,
          signal: controller.signal,
          redirect: "error",
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        const options = {
          provider: this.provider,
          metadata: { status: response.status },
        };
        if (response.status === 401 || response.status === 403)
          throw new ProviderAuthError(undefined, options);
        if (response.status === 429)
          throw new RateLimitError(undefined, options);
        throw new ProviderError(
          `Google request failed (${response.status})`,
          options,
        );
      }
      return { response, close };
    } catch (error) {
      close();
      throw error;
    }
  }

  private candidate(data: any) {
    if (
      !data ||
      typeof data !== "object" ||
      data.error ||
      data.promptFeedback?.blockReason
    )
      throw this.error("Google response was blocked or malformed");
    const candidate = data.candidates?.[0];
    if (!candidate && !data.usageMetadata)
      throw this.error("Google response has no candidate");
    if (
      candidate?.finishReason &&
      !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)
    )
      throw this.error(`Google generation stopped: ${candidate.finishReason}`);
    return candidate;
  }
  private validatePart(part: Part) {
    if (!part || typeof part !== "object" || Array.isArray(part))
      throw this.error("Malformed Google part");
    if (part.functionCall) {
      const call = part.functionCall;
      if (
        typeof call.name !== "string" ||
        !call.name ||
        (call.args !== undefined &&
          (!call.args ||
            typeof call.args !== "object" ||
            Array.isArray(call.args)))
      )
        throw this.error("Malformed Google function call");
    }
  }
  private calls(parts: Part[]): ToolCall[] {
    return parts
      .filter((part) => part.functionCall)
      .map((part) => ({
        id: part.functionCall.id ?? secureRandomUUID(),
        name: part.functionCall.name,
        arguments: part.functionCall.args ?? {},
      }));
  }
  private usage(raw: any) {
    const result = tokenUsage(
      Number(raw.promptTokenCount ?? 0),
      Number(raw.candidatesTokenCount ?? 0) +
        Number(raw.thoughtsTokenCount ?? 0),
    );
    if (raw.totalTokenCount !== undefined)
      result.total_tokens = result.totalTokens = Number(raw.totalTokenCount);
    return result;
  }
  private parse(data: any): ChatResponse {
    const candidate = this.candidate(data);
    const parts: Part[] = candidate?.content?.parts;
    if (!Array.isArray(parts) || !parts.length)
      throw this.error("Google response has no content");
    parts.forEach((part) => this.validatePart(part));
    const calls = this.calls(parts);
    return {
      message: {
        role: "assistant",
        content: parts
          .filter((part) => !part.thought)
          .map((part) => part.text ?? "")
          .join(""),
        toolCalls: calls,
        providerData: { googleParts: parts },
      },
      toolCalls: calls,
      tool_calls: calls,
      usage: data.usageMetadata ? this.usage(data.usageMetadata) : undefined,
      raw: data,
    };
  }
  private error(message: string) {
    return new ProviderError(message, { provider: this.provider });
  }
}
