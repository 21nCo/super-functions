export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Record<string, unknown>[];
  toolCalls?: ToolCall[];
  providerData?: { googleParts?: Record<string, any>[] };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolSpec {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface Cost {
  input: number;
  output: number;
  total: number;
  currency?: string;
}

export interface CompletionRequest {
  signal?: AbortSignal;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface CompletionResponse<TParsed = unknown> {
  content: string;
  usage?: TokenUsage;
  cost?: Cost;
  raw?: unknown;
  traceId?: string;
  trace_id?: string;
  parsed?: TParsed;
}

export interface ChatRequest {
  signal?: AbortSignal;
  messages: Message[];
  metadata?: Record<string, unknown>;
  tools?: ToolSpec[];
  tool_choice?: string | Record<string, unknown>;
}

export interface ChatResponse<TParsed = unknown> {
  message: Message;
  toolCalls?: ToolCall[];
  tool_calls?: ToolCall[];
  usage?: TokenUsage;
  cost?: Cost;
  raw?: unknown;
  traceId?: string;
  trace_id?: string;
  parsed?: TParsed;
}

export interface BatchRequest {
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface BatchError {
  code: string;
  message: string;
}

export interface BatchResult<TParsed = unknown> {
  ok: boolean;
  index: number;
  content?: string;
  traceId?: string;
  trace_id?: string;
  response?: CompletionResponse<TParsed>;
  error?: BatchError;
}

export interface TraceScope {
  tenantId?: string;
  userId?: string;
}

export interface FeedbackRequest {
  scope?: TraceScope;
  traceId?: string;
  trace_id?: string;
  clientKey?: string;
  client_key?: string;
  rating: number;
  comment?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceQuery extends TraceScope {
  limit?: number;
  provider?: string;
  model?: string;
}

export interface ContentEvent {
  type: "content";
  content: string;
  delta: string;
  traceId?: string;
  trace_id?: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  traceId?: string;
  trace_id?: string;
}

export interface ToolResultEvent {
  type: "tool_result";
  toolCallId: string;
  result: unknown;
  traceId?: string;
  trace_id?: string;
}

export interface TokenUsageEvent {
  type: "token_usage";
  total_tokens?: number;
  prompt_tokens: number;
  completion_tokens: number;
  traceId?: string;
  trace_id?: string;
}

export interface TraceEvent {
  type: "trace_event";
  span: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  trace_id?: string;
}

export interface ReasoningEvent {
  type: "reasoning";
  step: string;
  thinking: string;
  traceId?: string;
  trace_id?: string;
}

export interface EndEvent {
  type: "end";
  finish_reason: string;
  traceId?: string;
  trace_id?: string;
}

export interface ErrorEvent {
  type: "error";
  error: unknown;
  traceId?: string;
  trace_id?: string;
}

export interface MessageEvent {
  traceId?: string;
  trace_id?: string;
  type: "message";
  message: Message;
}

export type StreamEvent =
  | MessageEvent
  | ContentEvent
  | ToolCallEvent
  | ToolResultEvent
  | TokenUsageEvent
  | TraceEvent
  | ReasoningEvent
  | EndEvent
  | ErrorEvent;

export function tokenUsage(promptTokens = 0, completionTokens = 0): TokenUsage {
  const totalTokens = promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    promptTokens,
    completionTokens,
    totalTokens
  };
}

export function withTrace<T extends { traceId?: string; trace_id?: string }>(value: T, traceId: string): T {
  return {
    ...value,
    traceId,
    trace_id: traceId
  };
}
