import { providerUsage } from "../core/usage.js";
import { LangFn } from "../client.js";
import { ValidationError } from "../core/errors.js";
import {
  StreamEvent,
  withTrace,
  type ContentEvent,
  type MessageEvent,
  type Message,
  type EndEvent,
  type ErrorEvent,
  type ReasoningEvent,
  type TokenUsageEvent,
  type ToolCallEvent,
  type ToolResultEvent,
  type TraceEvent
} from "../core/types.js";

type EventLike = StreamEvent | Record<string, unknown>;

export async function* normalizeStream(
  stream: AsyncIterable<EventLike>,
  traceId: string
): AsyncIterable<StreamEvent> {
  let terminalSeen = false;
  for await (const event of stream) {
    if (terminalSeen) {
      throw new ValidationError("Stream emitted events after a terminal event");
    }
    const normalized = normalizeStreamEvent(event, traceId);
    yield normalized;
    if (normalized.type === "end" || normalized.type === "error") {
      terminalSeen = true;
    }
  }

  if (!terminalSeen) {
    yield withTrace<EndEvent>({ type: "end", finish_reason: "stop" }, traceId);
  }
}

export function normalizeStreamEvent(event: EventLike, traceId: string): StreamEvent {
  const raw = event as Record<string, unknown>;
  const type = raw.type;
  switch (type) {
    case "message": {
      const message = raw.message;
      if (!message || typeof message !== "object" || Array.isArray(message) ||
          !("role" in message) || typeof message.role !== "string" || !["system", "user", "assistant", "tool"].includes(message.role) ||
          !("content" in message) || typeof message.content !== "string") {
        throw new ValidationError("Stream message event requires a valid message");
      }
      return withTrace<MessageEvent>({ type, message: message as Message }, traceId);
    }
    case "content":
      return withTrace<ContentEvent>(
        {
          type,
          content: streamText(raw.content ?? raw.delta ?? ""),
          delta: streamText(raw.delta ?? raw.content ?? "")
        },
        traceId
      );
    case "tool_call":
      return withTrace<ToolCallEvent>(
        {
          type,
          id: streamText(raw.id ?? ""),
          toolName: streamText(raw.toolName ?? raw.tool_name ?? ""),
          args: (raw.args as Record<string, unknown> | undefined) ?? {}
        },
        traceId
      );
    case "tool_result":
      return withTrace<ToolResultEvent>(
        {
          type,
          toolCallId: streamText(raw.toolCallId ?? raw.tool_call_id ?? ""),
          result: raw.result
        },
        traceId
      );
    case "token_usage": {
      const total = raw.total_tokens !== undefined ? raw.total_tokens : raw.totalTokens;
      const usage = providerUsage(
        raw.prompt_tokens !== undefined ? raw.prompt_tokens : raw.promptTokens,
        raw.completion_tokens !== undefined ? raw.completion_tokens : raw.completionTokens,
        total,
      );
      return withTrace<TokenUsageEvent>({
        type, prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
        ...(total !== undefined ? { total_tokens: usage.total_tokens } : {}),
      }, traceId);
    }
    case "trace_event":
      return withTrace<TraceEvent>(
        {
          type,
          span: streamText(raw.span ?? ""),
          metadata: (raw.metadata as Record<string, unknown> | undefined) ?? {}
        },
        traceId
      );
    case "reasoning":
      return withTrace<ReasoningEvent>(
        {
          type,
          step: streamText(raw.step ?? ""),
          thinking: streamText(raw.thinking ?? "")
        },
        traceId
      );
    case "end":
      return withTrace<EndEvent>(
        {
          type,
          finish_reason: streamText(raw.finish_reason ?? "stop")
        },
        traceId
      );
    case "error":
      return withTrace<ErrorEvent>(
        {
          type,
          error: raw.error
        },
        traceId
      );
    default:
      throw new ValidationError(`Unsupported stream event type: ${String(type)}`);
  }
}

export function toSSEFrame(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function* toSSE(
  lang: LangFn,
  input: string | Array<{ role: string; content: string }>,
  options: { metadata?: Record<string, unknown>; timeout?: number; cancelToken?: unknown } = {}
): AsyncIterable<string> {
  for await (const event of lang.stream(input as never, options as never)) {
    yield toSSEFrame(event);
  }
}

function streamText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  throw new ValidationError("Stream text fields must contain text or scalar values");
}
