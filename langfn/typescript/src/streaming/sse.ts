import { LangFn } from "../client.js";
import { ValidationError } from "../core/errors.js";
import {
  StreamEvent,
  withTrace,
  type ContentEvent,
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
    case "content":
      return withTrace<ContentEvent>(
        {
          type,
          content: String(raw.content ?? raw.delta ?? ""),
          delta: String(raw.delta ?? raw.content ?? "")
        },
        traceId
      );
    case "tool_call":
      return withTrace<ToolCallEvent>(
        {
          type,
          id: String(raw.id ?? ""),
          toolName: String(raw.toolName ?? raw.tool_name ?? ""),
          args: (raw.args as Record<string, unknown> | undefined) ?? {}
        },
        traceId
      );
    case "tool_result":
      return withTrace<ToolResultEvent>(
        {
          type,
          toolCallId: String(raw.toolCallId ?? raw.tool_call_id ?? ""),
          result: raw.result
        },
        traceId
      );
    case "token_usage":
      return withTrace<TokenUsageEvent>(
        {
          type,
          prompt_tokens: Number(raw.prompt_tokens ?? raw.promptTokens ?? 0),
          completion_tokens: Number(raw.completion_tokens ?? raw.completionTokens ?? 0)
        },
        traceId
      );
    case "trace_event":
      return withTrace<TraceEvent>(
        {
          type,
          span: String(raw.span ?? ""),
          metadata: (raw.metadata as Record<string, unknown> | undefined) ?? {}
        },
        traceId
      );
    case "reasoning":
      return withTrace<ReasoningEvent>(
        {
          type,
          step: String(raw.step ?? ""),
          thinking: String(raw.thinking ?? "")
        },
        traceId
      );
    case "end":
      return withTrace<EndEvent>(
        {
          type,
          finish_reason: String(raw.finish_reason ?? "stop")
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
