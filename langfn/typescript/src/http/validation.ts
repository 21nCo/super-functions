import { LangFnError, ValidationError } from "../core/errors.js";
import type { FeedbackRequest, Message } from "../core/types.js";

export interface CompleteBody {
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface ChatBody {
  messages: Message[];
  tools?: unknown[];
  tool_choice?: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type StreamBody =
  | {
      prompt: string;
      metadata?: Record<string, unknown>;
    }
  | {
      messages: Message[];
      metadata?: Record<string, unknown>;
    };

export interface EmbedBody {
  texts: string | string[];
}

export interface TracesQuery {
  limit?: number;
  provider?: string;
  model?: string;
}

export interface CanonicalSuccessEnvelope<T> {
  ok: true;
  traceId: string | null;
  data: T;
  error: null;
}

export interface CanonicalErrorEnvelope {
  ok: false;
  traceId: string | null;
  data: null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function createSuccessEnvelope<T>(data: T, traceId?: string | null): CanonicalSuccessEnvelope<T> {
  return {
    ok: true,
    traceId: traceId ?? null,
    data,
    error: null
  };
}

export function createErrorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  traceId?: string | null
): CanonicalErrorEnvelope {
  return {
    ok: false,
    traceId: traceId ?? null,
    data: null,
    error: {
      code,
      message,
      ...(details ? { details } : {})
    }
  };
}

export function toHttpErrorPayload(error: unknown): {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof ValidationError) {
    return { status: 400, code: "VALIDATION_ERROR", message: error.message, details: error.metadata };
  }
  if (error instanceof LangFnError) {
    return { status: statusForLangFnCode(error.code), code: error.code, message: error.message, details: error.metadata };
  }
  return { status: 500, code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) };
}

export async function parseJsonBody<T>(
  request: Request,
  parser: (value: unknown) => T
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: CanonicalErrorEnvelope }> {
  try {
    const parsed = parser(await request.json());
    return { ok: true, data: parsed };
  } catch (error) {
    const issues =
      error instanceof ValidationError
        ? [{ message: error.message, ...(error.metadata ? { metadata: error.metadata } : {}) }]
        : [{ message: error instanceof Error ? error.message : String(error) }];
    return {
      ok: false,
      status: 400,
      body: createErrorEnvelope("VALIDATION_ERROR", "Invalid request body", {
        issues
      })
    };
  }
}

export function parseMessages(input: Message[]): Message[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError("messages must be a non-empty array");
  }

  return input.map((message, index) => {
    if (!isRecord(message)) {
      throw new ValidationError("message must be an object", { metadata: { index } });
    }
    const role = asNonEmptyString(message.role, `messages[${index}].role`);
    if (!["system", "user", "assistant", "tool"].includes(role)) {
      throw new ValidationError("message role must be one of system, user, assistant, or tool", {
        metadata: { index, role }
      });
    }

    return {
      role: role as Message["role"],
      content: asNonEmptyString(message.content, `messages[${index}].content`),
      ...(typeof message.name === "string" && message.name.length > 0 ? { name: message.name } : {}),
      ...(typeof message.tool_call_id === "string" && message.tool_call_id.length > 0
        ? { tool_call_id: message.tool_call_id }
        : {})
    };
  });
}

export function parseCompleteBody(value: unknown): CompleteBody {
  const body = asRecord(value, "request body");
  return {
    prompt: asNonEmptyString(body.prompt, "prompt"),
    ...(body.metadata === undefined ? {} : { metadata: asOptionalRecord(body.metadata, "metadata") })
  };
}

export function parseChatBody(value: unknown): ChatBody {
  const body = asRecord(value, "request body");
  const tools = body.tools;
  const toolChoice = body.tool_choice;
  return {
    messages: parseMessages(asUnknownArray(body.messages, "messages") as Message[]),
    ...(tools === undefined ? {} : { tools: asUnknownArray(tools, "tools") }),
    ...(toolChoice === undefined ? {} : { tool_choice: asToolChoice(toolChoice) }),
    ...(body.metadata === undefined ? {} : { metadata: asOptionalRecord(body.metadata, "metadata") })
  };
}

export function parseStreamBody(value: unknown): StreamBody {
  const body = asRecord(value, "request body");
  if (typeof body.prompt === "string") {
    return {
      prompt: asNonEmptyString(body.prompt, "prompt"),
      ...(body.metadata === undefined ? {} : { metadata: asOptionalRecord(body.metadata, "metadata") })
    };
  }
  if (body.messages !== undefined) {
    return {
      messages: parseMessages(asUnknownArray(body.messages, "messages") as Message[]),
      ...(body.metadata === undefined ? {} : { metadata: asOptionalRecord(body.metadata, "metadata") })
    };
  }
  throw new ValidationError("stream request requires prompt or messages");
}

export function parseEmbedBody(value: unknown): EmbedBody {
  const body = asRecord(value, "request body");
  const texts = body.texts;
  if (typeof texts === "string") {
    return { texts: asNonEmptyString(texts, "texts") };
  }
  if (Array.isArray(texts) && texts.length > 0) {
    return {
      texts: texts.map((entry, index) => asNonEmptyString(entry, `texts[${index}]`))
    };
  }
  throw new ValidationError("texts must be a non-empty string or array of strings");
}

export function parseFeedbackBody(value: unknown): FeedbackRequest {
  const body = asRecord(value, "request body");
  const traceId = firstNonEmptyString(body.traceId, body.trace_id);
  if (!traceId) {
    throw new ValidationError("traceId is required");
  }
  if (typeof body.rating !== "number" || Number.isNaN(body.rating)) {
    throw new ValidationError("rating must be a number");
  }
  const clientKey = firstNonEmptyString(body.clientKey, body.client_key);
  return {
    traceId,
    ...(clientKey ? { clientKey } : {}),
    rating: body.rating,
    ...(typeof body.comment === "string" ? { comment: body.comment } : {}),
    ...(body.metadata === undefined ? {} : { metadata: asOptionalRecord(body.metadata, "metadata") })
  };
}

export function parseTracesQuery(input: Record<string, string>): TracesQuery {
  const limitValue = input.limit;
  let limit: number | undefined;
  if (limitValue !== undefined) {
    const parsed = Number(limitValue);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) {
      throw new ValidationError("limit must be an integer between 1 and 100");
    }
    limit = parsed;
  }

  return {
    ...(limit === undefined ? {} : { limit }),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {})
  };
}

function statusForLangFnCode(code: string): number {
  switch (code) {
    case "VALIDATION_ERROR":
      return 400;
    case "PROVIDER_AUTH":
      return 401;
    case "RATE_LIMITED":
    case "BUDGET_EXCEEDED":
    case "PROVIDER_RATE_LIMIT":
      return 429;
    default:
      return 500;
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function asOptionalRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function asUnknownArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty array`);
  }
  return value;
}

function asToolChoice(value: unknown): string | Record<string, unknown> {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return value;
  }
  throw new ValidationError("tool_choice must be a string or object");
}

function asNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
