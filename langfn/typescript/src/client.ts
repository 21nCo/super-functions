import { secureRandomUUID } from "./utils/random.js";
import {
  BatchRequest,
  BatchResult,
  ChatRequest,
  ChatResponse,
  CompletionRequest,
  CompletionResponse,
  FeedbackRequest,
  Message,
  StreamEvent,
  ToolSpec,
  TraceQuery,
  withTrace
} from "./core/types.js";
import {
  AbortError,
  LangFnError,
  TimeoutError,
  TraceNotFoundError,
  UnsupportedProviderError,
  ValidationError
} from "./core/errors.js";
import { CostMeter, type Budgets } from "./observability/cost-meter.js";
import { redact } from "./observability/redaction.js";
import { SPAN_TYPES } from "./observability/span-types.js";
import { TraceStorage, type TraceRecord } from "./observability/storage.js";
import { Tracer } from "./observability/tracer.js";
import { normalizeStream, toSSE } from "./streaming/sse.js";
import { ToolPolicy } from "./tools/policy.js";
import {
  AnthropicChatModel,
  ChatModel,
  CustomChatModel,
  CustomChatModelConfig,
  GoogleChatModel,
  MistralChatModel,
  MockChatModel,
  OllamaChatModel,
  OpenAIChatModel
} from "./models/index.js";
import { RetrievalChain } from "./rag/base.js";
import type { StructuredOutput } from "./structured/output.js";
import { CancellationToken } from "./utils/cancel.js";
import { mapWithConcurrency } from "./utils/concurrency.js";
import { RetryConfig, retryAsync } from "./utils/retry.js";

type StructuredParser<T> = Pick<StructuredOutput<any>, "parse"> | { parse(text: string): T };

export interface ObservabilityConfig {
  enabled?: boolean;
  tracer?: Tracer;
  costMeter?: CostMeter | {
    estimate(provider: string, model: string, usage: NonNullable<CompletionResponse["usage"]>): CompletionResponse["cost"];
  };
  budgets?: Budgets;
  traceStorage?: TraceStorage | {
    supportsScope?: boolean;
    save?(trace: Record<string, unknown>): Promise<void>;
    saveTrace?(trace: Record<string, unknown>): Promise<unknown>;
    saveFeedback?(feedback: Record<string, unknown>): Promise<unknown>;
    findMany(options?: TraceQuery): Promise<Record<string, unknown>[]>;
    findOne?(traceId: string, scope?: { tenantId?: string; userId?: string }): Promise<Record<string, unknown> | null>;
    listFeedback?(traceId: string): Promise<Record<string, unknown>[]>;
  };
  watchfn?: {
    track(name: string, payload: Record<string, unknown>): void;
  };
  exporter?: {
    export(name: string, payload: Record<string, unknown>): Promise<void> | void;
  };
  otlpExporter?: {
    export(payload: Record<string, unknown>): Promise<void> | void;
  };
  redactionKeys?: string[];
}

export interface LangFnConfig {
  model?: ChatModel | ProviderName;
  observability?: ObservabilityConfig;
  security?: ToolPolicy | ConstructorParameters<typeof ToolPolicy>[0];
  cache?: {
    get(
      prompt: string,
      model: string,
      provider: string,
      metadata?: Record<string, unknown>
    ): Promise<CompletionResponse | undefined>;
    set(
      prompt: string,
      model: string,
      provider: string,
      response: CompletionResponse,
      metadata?: Record<string, unknown>
    ): Promise<void>;
  };
  retry?: RetryConfig;
  retriever?: unknown;
}

export type ProviderName =
  | "openai"
  | "anthropic"
  | "ollama"
  | "google"
  | "mistral"
  | "custom"
  | "mock";

export interface ProviderModelConfigs {
  openai: ConstructorParameters<typeof OpenAIChatModel>[0];
  anthropic: ConstructorParameters<typeof AnthropicChatModel>[0];
  ollama: ConstructorParameters<typeof OllamaChatModel>[0];
  google: ConstructorParameters<typeof GoogleChatModel>[0];
  mistral: ConstructorParameters<typeof MistralChatModel>[0];
  custom: CustomChatModelConfig;
  mock: ConstructorParameters<typeof MockChatModel>[0];
}

export class LangFn {
  private readonly model?: ChatModel;
  private readonly config: LangFnConfig;
  private readonly securityPolicy: ToolPolicy;
  private tracer?: Tracer;
  private _embeddings?:
    | {
        embedQuery(text: string): Promise<number[]>;
        embedDocuments(texts: string[]): Promise<number[][]>;
      }
    | undefined;

  constructor(config: LangFnConfig = {}) {
    this.config = config;
    this.model = typeof config.model === "string" ? createModel(config.model) : config.model;
    this.securityPolicy = config.security instanceof ToolPolicy ? config.security : new ToolPolicy(config.security);
  }

  withModel<TProvider extends ProviderName>(
    provider: TProvider | ChatModel,
    providerConfig?: ProviderModelConfigs[TProvider]
  ): LangFn {
    if (provider instanceof ChatModel) {
      return new LangFn({ ...this.config, model: provider });
    }
    return new LangFn({ ...this.config, model: createModel(provider, providerConfig as Record<string, unknown>) });
  }

  async complete<TParsed = unknown>(
    prompt: string,
    options: {
      metadata?: Record<string, unknown>;
      timeout?: number;
      cancelToken?: CancellationToken;
      structured?: StructuredParser<TParsed>;
      structuredOutput?: StructuredParser<TParsed>;
      retry?: RetryConfig;
    } = {}
  ): Promise<CompletionResponse<TParsed>> {
    if (!prompt) {
      throw new ValidationError("complete() requires a non-empty prompt");
    }
    const request: CompletionRequest = { prompt, metadata: options.metadata };
    const traceId = randomTraceId();

    return await this.runWithObservability("completion", traceId, request.metadata, async () => {
      const cacheKey = this.requireModel();
      const cached = await this.config.cache?.get(prompt, cacheKey.model, cacheKey.provider, request.metadata);
      if (cached) {
        const finalized = this.finalizeCompletion(cached, traceId, options.structuredOutput ?? options.structured);
        await this.persistTrace({ kind: "completion", traceId, request: { prompt, metadata: request.metadata }, response: finalized });
        return finalized;
      }

      const response = await retryAsync(
        async () => {
          try {
            return await callWithTimeoutAndCancel(
              (signal) => this.requireModel().complete({ ...request, signal }),
              options.timeout,
              options.cancelToken?.signal ?? (options.retry ?? this.config.retry)?.signal
            );
          } catch (error) {
            throw normalizeUnknownError(error);
          }
        },
        { ...(options.retry ?? this.config.retry), signal: options.cancelToken?.signal ?? (options.retry ?? this.config.retry)?.signal }
      );

      const cacheable = withoutParsedCompletion(response);
      const finalized = this.finalizeCompletion(cacheable, traceId, options.structuredOutput ?? options.structured);
      await this.config.cache?.set(prompt, cacheKey.model, cacheKey.provider, cacheable, request.metadata);
      await this.persistTrace({
        kind: "completion",
        traceId,
        request: { prompt, metadata: request.metadata },
        response: finalized
      });
      return finalized;
    });
  }

  async chat<TParsed = unknown>(
    messages: Message[],
    options: {
      tools?: Array<ToolSpec | { json_schema(): ToolSpec }>;
      tool_choice?: string | Record<string, unknown>;
      metadata?: Record<string, unknown>;
      timeout?: number;
      cancelToken?: CancellationToken;
      structured?: StructuredParser<TParsed>;
      structuredOutput?: StructuredParser<TParsed>;
      retry?: RetryConfig;
    } = {}
  ): Promise<ChatResponse<TParsed>> {
    if (!messages.length) {
      throw new ValidationError("chat() requires at least one message");
    }

    const request: ChatRequest = {
      messages,
      metadata: options.metadata,
      tools: options.tools?.map(toToolSpec),
      tool_choice: options.tool_choice
    };
    const traceId = randomTraceId();

    return await this.runWithObservability("chat", traceId, request.metadata, async () => {
      const response = await retryAsync(
        async () => {
          try {
            return await callWithTimeoutAndCancel(
              (signal) => this.requireModel().chat({ ...request, signal }),
              options.timeout,
              options.cancelToken?.signal ?? (options.retry ?? this.config.retry)?.signal
            );
          } catch (error) {
            throw normalizeUnknownError(error);
          }
        },
        { ...(options.retry ?? this.config.retry), signal: options.cancelToken?.signal ?? (options.retry ?? this.config.retry)?.signal }
      );

      const finalized = this.finalizeChat(response, traceId, options.structuredOutput ?? options.structured);
      await this.persistTrace({
        kind: "chat",
        traceId,
        request: { messages, metadata: request.metadata },
        response: finalized
      });
      return finalized;
    });
  }

  async *stream(
    input: string | Message[],
    options: {
      metadata?: Record<string, unknown>;
      timeout?: number;
      cancelToken?: CancellationToken;
    } = {}
  ): AsyncIterable<StreamEvent> {
    const traceId = randomTraceId();
    const tracer = this.resolveTracer();
    let span: Awaited<ReturnType<Tracer["span"]>> | undefined;
    const streamedContent: string[] = [];
    let latestUsage: CompletionResponse["usage"];
    let terminalEvent: StreamEvent | undefined;

    try {
      span = tracer && this.config.observability?.enabled
        ? await tracer.span(SPAN_TYPES.PROVIDER_STREAM, {
            traceId,
            metadata: {
              metadata: options.metadata ?? {},
              mode: Array.isArray(input) ? "chat" : "completion"
            }
          })
        : undefined;
      if (typeof input === "string") {
        const controller = new AbortController();
        const stream = this.requireModel().stream({ prompt: input, metadata: options.metadata, signal: controller.signal });
        for await (const event of normalizeStream(
          iterateWithTimeoutAndCancel(stream, options.timeout, options.cancelToken?.signal ?? this.config.retry?.signal, controller),
          traceId
        )) {
          if (event.type === "content") {
            streamedContent.push(event.delta);
          } else if (event.type === "token_usage") {
            latestUsage = {
              prompt_tokens: event.prompt_tokens,
              completion_tokens: event.completion_tokens,
              total_tokens: event.total_tokens ?? event.prompt_tokens + event.completion_tokens,
              promptTokens: event.prompt_tokens,
              completionTokens: event.completion_tokens,
              totalTokens: event.total_tokens ?? event.prompt_tokens + event.completion_tokens
            };
            this.enforceBudget(this.attachCost(latestUsage)?.total);
          }
          if (event.type === "end" && !latestUsage) this.enforceBudget(undefined);
          if (event.type === "end" || event.type === "error") terminalEvent = event;
          else yield event;
        }
      } else {
        const response = this.finalizeChat(
          await retryAsync(
            async () =>
              callWithTimeoutAndCancel(
                (signal) => this.requireModel().chat({
                  signal,
                  messages: input,
                  metadata: options.metadata
                }),
                options.timeout,
                options.cancelToken?.signal ?? this.config.retry?.signal
              ),
            { ...this.config.retry, signal: options.cancelToken?.signal ?? this.config.retry?.signal }
          ),
          traceId
        );
        for await (const event of normalizeStream(
          (async function* (): AsyncIterable<StreamEvent> {
            yield {
              type: "content",
              content: response.message.content,
              delta: response.message.content
            };
            if (response.usage) {
              yield {
                type: "token_usage",
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens
              };
            }
            yield { type: "end", finish_reason: "stop" };
          })(),
          traceId
        )) {
          if (event.type === "content") {
            streamedContent.push(event.delta);
          } else if (event.type === "token_usage") {
            latestUsage = {
              prompt_tokens: event.prompt_tokens,
              completion_tokens: event.completion_tokens,
              total_tokens: event.total_tokens ?? event.prompt_tokens + event.completion_tokens,
              promptTokens: event.prompt_tokens,
              completionTokens: event.completion_tokens,
              totalTokens: event.total_tokens ?? event.prompt_tokens + event.completion_tokens
            };
          }
          if (event.type === "end" || event.type === "error") terminalEvent = event;
          else yield event;
        }
      }

      const streamCost = this.attachCost(latestUsage);
      await this.persistTrace({
        kind: Array.isArray(input) ? "stream_chat" : "stream_completion",
        traceId,
        request: Array.isArray(input)
          ? { messages: input, metadata: options.metadata }
          : { prompt: input, metadata: options.metadata },
        response: {
          content: streamedContent.join(""),
          usage: latestUsage,
          traceId,
          trace_id: traceId,
          cost: streamCost
        }
      });
    } catch (error) {
      const normalizedError = normalizeUnknownError(error);
      try { await span?.fail(normalizedError); } catch { /* Preserve the primary stream failure. */ }
      terminalEvent = withTrace<StreamEvent>(
        {
          type: "error",
          error: {
            code: normalizedError.code,
            message: normalizedError.message
          }
        },
        traceId
      );
    } finally {
      try {
        await span?.[Symbol.asyncDispose]();
      } catch (error) {
        if (!terminalEvent || terminalEvent.type === "end") {
          const normalizedError = normalizeUnknownError(error);
          terminalEvent = withTrace<StreamEvent>(
            {
              type: "error",
              error: {
                code: normalizedError.code,
                message: normalizedError.message
              }
            },
            traceId
          );
        }
      }
    }
    if (terminalEvent) yield terminalEvent;
  }

  async *streamSSE(
    input: string | Message[],
    options: {
      metadata?: Record<string, unknown>;
      timeout?: number;
      cancelToken?: CancellationToken;
    } = {}
  ): AsyncIterable<string> {
    yield* toSSE(this, input as never, options);
  }

  async completeBatch(
    requests: Array<BatchRequest | string>,
    options: {
      concurrency?: number;
      timeout?: number;
      partialResults?: boolean;
      retry?: RetryConfig;
    } = {}
  ): Promise<BatchResult[]> {
    const concurrency = options.concurrency ?? 5;
    const partialResults = options.partialResults ?? true;
    if (concurrency < 1) {
      throw new ValidationError("completeBatch() requires concurrency >= 1");
    }

    const normalized = requests.map((request) =>
      typeof request === "string" ? ({ prompt: request } satisfies BatchRequest) : request
    );
    const outcomes = await mapWithConcurrency(normalized, concurrency, async (request) =>
      this.complete(request.prompt, {
        metadata: request.metadata,
        timeout: options.timeout,
        retry: options.retry
      })
    );

    const results = outcomes.map((outcome, index) => {
      if (outcome instanceof Error) {
        const error = normalizeUnknownError(outcome);
        return {
          ok: false,
          index,
          error: {
            code: error.code,
            message: error.message
          }
        } satisfies BatchResult;
      }
      return {
        ok: true,
        index,
        content: outcome.content,
        traceId: outcome.traceId,
        trace_id: outcome.trace_id,
        response: outcome
      } satisfies BatchResult;
    });

    if (!partialResults) {
      const failureIndex = outcomes.findIndex((outcome) => outcome instanceof Error);
      if (failureIndex >= 0) {
        throw normalizeUnknownError(outcomes[failureIndex]);
      }
    }
    return results;
  }

  async embed(texts: string | string[]): Promise<number[] | number[][]> {
    const model = this.requireModel();
    if (!this._embeddings) {
      const { OpenAIEmbeddings } = await import("./rag/openai.js");
      if (!(model instanceof OpenAIChatModel)) {
        throw new ValidationError("embed() requires an OpenAI model or configured embeddings provider");
      }
      this._embeddings = new OpenAIEmbeddings({
        transport: () => model.transport
      });
    }

    const embeddings = this._embeddings;
    if (!embeddings) {
      throw new ValidationError("Embeddings are not configured");
    }
    return typeof texts === "string"
      ? embeddings.embedQuery(texts)
      : embeddings.embedDocuments(texts);
  }

  async feedback(
    traceOrRequest: string | FeedbackRequest,
    options?: { rating: number; comment?: string; metadata?: Record<string, unknown>; clientKey?: string }
  ): Promise<void> {
    const request: FeedbackRequest =
      typeof traceOrRequest === "string"
        ? {
            traceId: traceOrRequest,
            clientKey: options?.clientKey,
            rating: options?.rating as number,
            comment: options?.comment,
            metadata: options?.metadata
          }
        : traceOrRequest;

    const traceId = request.traceId ?? ("trace_id" in request ? request.trace_id : undefined);
    const clientKey = request.clientKey ?? ("client_key" in request ? request.client_key : undefined);
    if (!traceId || request.rating === undefined) {
      throw new ValidationError("feedback() requires traceId and rating");
    }

    const storage = this.config.observability?.traceStorage;
    if (request.scope) {
      if (!storage?.supportsScope || !storage.findOne) throw new ValidationError("Scoped feedback requires a scope-aware trace store with findOne");
      const trace = await storage.findOne(traceId, request.scope);
      if (!trace || !matchesTraceScope(trace, request.scope)) throw new TraceNotFoundError("Trace not found");
    }
    const payload = this.redactObservabilityPayload({
      scope: request.scope,
      traceId,
      clientKey,
      rating: request.rating,
      comment: request.comment,
      metadata: request.metadata ?? {}
    });
    if (storage?.saveFeedback) {
      await storage.saveFeedback(payload);
    } else if (storage?.findOne) {
      const trace = await storage.findOne(traceId);
      if (!trace) {
        throw new TraceNotFoundError("Trace not found", { metadata: { traceId } });
      }
    }
    await this.resolveTracer()?.emit("feedback", payload);
  }

  async getTraces(query: TraceQuery = {}): Promise<Record<string, unknown>[]> {
    const storage = this.config.observability?.traceStorage;
    if ((query.tenantId !== undefined || query.userId !== undefined) && !storage?.supportsScope) throw new ValidationError("Scoped trace queries require a scope-aware trace store");
    const traces = ((await storage?.findMany(query)) ?? []) as Record<string, unknown>[];
    return traces.filter(trace => matchesTraceScope(trace, query));
  }

  async createReactAgent(tools: unknown[], options: { max_iterations?: number; system_prompt?: string } = {}) {
    const { ReActAgent } = await import("./agents/react.js");
      return new ReActAgent({
        model: this,
        tools: tools as any[],
        ...options
      });
  }

  async createToolAgent(tools: unknown[], options: { max_iterations?: number } = {}) {
    const { ToolAgent } = await import("./agents/tool_agent.js");
      return new ToolAgent({
        lang: this,
        tools: tools as any[],
        ...options
      });
  }

  getSecurityPolicy(): ToolPolicy {
    return this.securityPolicy;
  }

  async createPlanExecuteAgent(
    options: {
      planner?: (goal: string) => Promise<string[]> | string[];
      executor?: (step: string, context: { goal: string; stepIndex: number; previousResults: string[] }) => Promise<string> | string;
      max_plan_steps?: number;
      max_execution_steps?: number;
    } = {}
  ) {
    const { PlanExecuteAgent } = await import("./agents/plan_execute.js");
    return new PlanExecuteAgent({ lang: this, ...options });
  }

  createPromptRegistry(config: unknown): unknown {
    return config;
  }

  createRagChain(config: {
    retriever: { getRelevantDocuments(query: string, options?: { k?: number; filter?: Record<string, unknown> }): Promise<any[]> };
    generator?: (payload: { query: string; documents: any[] }) => Promise<string> | string;
  }) {
    return new RetrievalChain({ ...config, lang: this });
  }

  private requireModel(): ChatModel {
    if (!this.model) {
      throw new ValidationError("LangFn requires a model. Use new LangFn({ model }) or withModel(...).");
    }
    return this.model;
  }

  private finalizeCompletion<TParsed>(
    response: CompletionResponse,
    traceId: string,
    structured?: StructuredParser<TParsed>
  ): CompletionResponse<TParsed> {
    const finalized = withTrace(
      {
        ...withoutParsedCompletion(response),
        cost: this.attachCost(response.usage)
      },
      traceId
    );
    this.enforceBudget(finalized.cost?.total);
    if (structured) {
      finalized.parsed = structured.parse(finalized.content);
    }
    return finalized as CompletionResponse<TParsed>;
  }

  private finalizeChat<TParsed>(
    response: ChatResponse,
    traceId: string,
    structured?: StructuredParser<TParsed>
  ): ChatResponse<TParsed> {
    const finalized = withTrace(
      {
        ...response,
        tool_calls: response.tool_calls ?? response.toolCalls,
        toolCalls: response.toolCalls ?? response.tool_calls,
        cost: this.attachCost(response.usage)
      },
      traceId
    );
    this.enforceBudget(finalized.cost?.total);
    if (structured) {
      finalized.parsed = structured.parse(finalized.message.content);
    }
    return finalized as ChatResponse<TParsed>;
  }

  private attachCost(usage: CompletionResponse["usage"]): CompletionResponse["cost"] {
    if (!usage) return undefined;
    if (![usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(value => Number.isFinite(value) && value >= 0)) {
      throw new LangFnError("Provider reported invalid token usage", { code: "INVALID_TOKEN_USAGE" });
    }
    return this.config.observability?.costMeter?.estimate(
      this.requireModel().provider,
      this.requireModel().model,
      usage
    );
  }

  private enforceBudget(totalCost?: number): void {
    const limit = this.config.observability?.budgets?.perRequestUsd;
    if (limit === undefined) return;
    if (!Number.isFinite(limit) || limit < 0) throw new LangFnError("Invalid request budget", { code: "INVALID_BUDGET" });
    if (totalCost === undefined || !Number.isFinite(totalCost) || totalCost < 0) {
      throw new LangFnError("Request budget requires valid usage and pricing", { code: "BUDGET_COST_UNAVAILABLE" });
    }
    if (totalCost > limit) {
      throw new LangFnError("Budget exceeded", {
        code: "BUDGET_EXCEEDED",
        metadata: { perRequestUsd: limit, totalCost }
      });
    }
  }

  private async persistTrace(payload: {
    kind: string;
    traceId: string;
    request: Record<string, unknown>;
    response: CompletionResponse | ChatResponse;
  }): Promise<void> {
    const storage = this.config.observability?.traceStorage;
    if (!this.model) return;
    const response = payload.response;
    const content = "content" in response ? response.content : response.message.content;
    const traceRecord = this.redactObservabilityPayload<TraceRecord>({
      ...traceOwner(payload.request.metadata),
      traceId: payload.traceId,
      kind: payload.kind,
      provider: this.model.provider,
      model: this.model.model,
      input: JSON.stringify(payload.request),
      output: content,
      usage: response.usage,
      cost: response.cost,
      metadata: (payload.request.metadata as Record<string, unknown> | undefined) ?? {}
    });
    const storedTraceRecord = traceRecord as TraceRecord & Record<string, unknown>;
    if (storage?.saveTrace) {
      await storage.saveTrace(storedTraceRecord);
    } else if (storage?.save) {
      await storage.save(storedTraceRecord);
    }
    await this.resolveTracer()?.emit("trace", storedTraceRecord);
  }

  private async runWithObservability<T>(
    kind: string,
    traceId: string,
    metadata: Record<string, unknown> | undefined,
    fn: () => Promise<T>
  ): Promise<T> {
    const tracer = this.resolveTracer();
    if (!this.config.observability?.enabled || !tracer) {
      return await fn();
    }

    return tracer.trace(SPAN_TYPES.PROVIDER_CALL, { kind, metadata: metadata ?? {} }, fn, { traceId });
  }

  private resolveTracer(): Tracer | undefined {
    if (!this.config.observability?.enabled) {
      return undefined;
    }
    if (!this.tracer) {
      this.tracer =
        this.config.observability.tracer ??
        new Tracer({
          storage: this.config.observability.traceStorage as TraceStorage | undefined,
          watch: this.config.observability.watchfn,
          exporter: this.config.observability.exporter,
          otlpExporter: this.config.observability.otlpExporter,
          redactionKeys: this.config.observability.redactionKeys
        });
    }
    return this.tracer;
  }

  private redactObservabilityPayload<T>(payload: T): T {
    const tracer = this.resolveTracer();
    if (tracer) {
      return tracer.sanitize(payload);
    }
    return redact(payload, { keys: this.config.observability?.redactionKeys });
  }
}

function withoutParsedCompletion(response: CompletionResponse): CompletionResponse {
  const cacheable = { ...response };
  delete cacheable.parsed;
  return cacheable;
}

export function langfn(config: LangFnConfig = {}): LangFn {
  return new LangFn(config);
}

function createModel(provider: ProviderName, config: Record<string, unknown> = {}): ChatModel {
  switch (provider) {
    case "openai":
      return new OpenAIChatModel(config);
    case "anthropic":
      return new AnthropicChatModel(config);
    case "ollama":
      return new OllamaChatModel(config);
    case "google":
      return new GoogleChatModel(config);
    case "mistral":
      return new MistralChatModel(config);
    case "custom":
      return new CustomChatModel(config);
    case "mock":
      return new MockChatModel(config);
    default:
      throw new UnsupportedProviderError(String(provider));
  }
}

function toToolSpec(tool: ToolSpec | { json_schema(): ToolSpec }): ToolSpec {
  if ("json_schema" in tool) {
    const schema = tool.json_schema();
    return {
      name: schema.name,
      description: schema.description,
      input_schema:
        schema.input_schema ??
        ((schema as unknown as Record<string, unknown>).parameters as Record<string, unknown> | undefined)
    };
  }
  return tool;
}

function normalizeUnknownError(error: unknown): LangFnError {
  if (error instanceof LangFnError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AbortError();
  }
  return new LangFnError(error instanceof Error ? error.message : String(error), { code: "UNKNOWN" });
}

async function callWithTimeoutAndCancel<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeout?: number,
  cancelSignal?: AbortSignal
): Promise<T> {
  if (cancelSignal?.aborted) throw new AbortError();
  const controller = new AbortController();
  const cancel = () => controller.abort(new AbortError());
  cancelSignal?.addEventListener("abort", cancel, { once: true });
  const timer = timeout === undefined ? undefined : setTimeout(() => controller.abort(new TimeoutError()), timeout);
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  try {
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    if (timer) clearTimeout(timer);
    cancelSignal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}

async function* iterateWithTimeoutAndCancel(
  stream: AsyncIterable<StreamEvent>,
  timeout?: number,
  cancelSignal?: AbortSignal,
  controller = new AbortController()
): AsyncIterable<StreamEvent> {
  const iterator = stream[Symbol.asyncIterator]();
  try {
    while (true) {
      const result = await callWithTimeoutAndCancel(async signal => {
        const abort = () => controller.abort(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        try { return await iterator.next(); }
        finally { signal.removeEventListener("abort", abort); }
      }, timeout, cancelSignal);
      if (result.done) return;
      yield result.value;
    }
  } finally {
    controller.abort(new AbortError());
    // Custom iterators may ignore the signal; cleanup must not stall cancellation.
    void Promise.resolve().then(() => iterator.return?.()).catch(() => {});
  }
}

function randomTraceId(): string {
  return secureRandomUUID();
}

function traceOwner(metadata: unknown): { tenantId?: string; userId?: string } {
  const value = metadata as Record<string, unknown> | undefined;
  return {
    tenantId: typeof value?.tenantId === "string" ? value.tenantId : undefined,
    userId: typeof value?.userId === "string" ? value.userId : undefined
  };
}
function matchesTraceScope(trace: { tenantId?: unknown; userId?: unknown }, scope: { tenantId?: string; userId?: string }): boolean {
  return (scope.tenantId === undefined || trace.tenantId === scope.tenantId) &&
    (scope.userId === undefined || trace.userId === scope.userId);
}
