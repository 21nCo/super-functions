export type ObservationStatus = "ok" | "error";
export type ObservationSeverity = "debug" | "info" | "warn" | "error";

export interface ObservationLogger {
  debug?(message: string, context?: Record<string, unknown>): void;
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
}

export interface ObservationScope {
  service?: string;
  component?: string;
  labels?: Record<string, string>;
}

export interface ObservationMetric {
  kind: string;
  operation: string;
  component?: string;
  resource?: string;
  labels?: Record<string, string>;
  durationMs?: number;
  ok?: boolean;
}

export interface ObservationEvent<
  TDomain extends string = string,
  TType extends string = string,
  TMetadata extends Record<string, unknown> = Record<string, unknown>,
> {
  domain: TDomain;
  type: TType;
  severity?: ObservationSeverity;
  component?: string;
  requestId?: string;
  actorId?: string;
  subjectId?: string;
  userId?: string;
  outcome?: string;
  metadata?: TMetadata;
}

export interface ObservationSpanInput {
  kind: string;
  operation: string;
  component?: string;
  resource?: string;
  labels?: Record<string, string>;
}

export interface ObservationSpan {
  end(input?: { ok?: boolean; labels?: Record<string, string> }): void;
}

export interface RequestObservationInput {
  request?: Request;
  requestId?: string;
  method?: string;
  path?: string;
  startTimeMs?: number;
  labels?: Record<string, string>;
}

export interface RequestObservationFinishInput {
  status?: number;
  totalDurationMs?: number;
  labels?: Record<string, string>;
}

export interface ObservationGroupSnapshot {
  kind: string;
  count: number;
  durationMs: number;
  maxDurationMs: number;
  errorCount: number;
}

export interface RequestObservationSnapshot {
  requestId: string;
  method?: string;
  path?: string;
  status?: number;
  totalDurationMs: number;
  labels: Record<string, string>;
  groups: Record<string, ObservationGroupSnapshot>;
  metrics: ObservationMetric[];
}

export interface RequestObservation<TEvent extends ObservationEvent = ObservationEvent> {
  readonly requestId: string;
  readonly method?: string;
  readonly path?: string;
  record(metric: ObservationMetric): void;
  event(event: TEvent): void | Promise<void>;
  span(input: ObservationSpanInput): ObservationSpan;
  finish(input?: RequestObservationFinishInput): RequestObservationSnapshot;
  snapshot(input?: RequestObservationFinishInput): RequestObservationSnapshot;
}

export interface ObservationEventChannel<TEvent extends ObservationEvent = ObservationEvent> {
  emit(event: TEvent): void | Promise<void>;
}

export interface ObservationMetricChannel {
  record(metric: ObservationMetric): void | Promise<void>;
}

export interface ObservationTraceChannel {
  span(input: ObservationSpanInput): ObservationSpan;
}

export interface SuperfunctionObservability<TEvent extends ObservationEvent = ObservationEvent> {
  readonly service?: string;
  readonly component?: string;
  readonly logger?: ObservationLogger;
  readonly events: ObservationEventChannel<TEvent>;
  readonly metrics: ObservationMetricChannel;
  readonly traces: ObservationTraceChannel;
  startRequest(input?: RequestObservationInput): RequestObservation<TEvent>;
  runWithRequest<T>(
    observation: RequestObservation<TEvent>,
    work: () => T | Promise<T>,
  ): Promise<T>;
  getCurrentRequest(): RequestObservation<TEvent> | undefined;
  record(metric: ObservationMetric): void;
  event(event: TEvent): void | Promise<void>;
  span(input: ObservationSpanInput): ObservationSpan;
  child(scope: ObservationScope): SuperfunctionObservability<TEvent>;
}

export interface RequestObservationContext<TEvent extends ObservationEvent = ObservationEvent> {
  run<T>(
    observation: RequestObservation<TEvent>,
    work: () => T | Promise<T>,
  ): Promise<T>;
  get(): RequestObservation<TEvent> | undefined;
}

export interface ObservabilityConfigInput<TEvent extends ObservationEvent = ObservationEvent> {
  service?: string;
  component?: string;
  logger?: ObservationLogger;
  labels?: Record<string, string>;
  events?: ObservationEventChannel<TEvent> | ((event: TEvent) => void | Promise<void>);
  metrics?: ObservationMetricChannel | ((metric: ObservationMetric) => void | Promise<void>);
  requestContext?: RequestObservationContext<TEvent>;
}

export type ObservabilityInput<TEvent extends ObservationEvent = ObservationEvent> =
  | false
  | null
  | undefined
  | ObservationLogger
  | SuperfunctionObservability<TEvent>
  | ObservabilityConfigInput<TEvent>;

export interface InstrumentMethodsInput<TTarget extends object> {
  target: TTarget;
  observability?: SuperfunctionObservability;
  kind: string;
  component?: string;
  extract?: (input: {
    property: PropertyKey;
    args: unknown[];
  }) => {
    operation?: string;
    resource?: string;
    labels?: Record<string, string>;
  };
}

interface ResolvedConfig<TEvent extends ObservationEvent = ObservationEvent> {
  service?: string;
  component?: string;
  logger?: ObservationLogger;
  labels: Record<string, string>;
  events?: ObservationEventChannel<TEvent>;
  metrics?: ObservationMetricChannel;
  requestContext?: RequestObservationContext<TEvent>;
}

interface ObservabilityState<TEvent extends ObservationEvent = ObservationEvent> {
  requestContext: RequestObservationContext<TEvent>;
}

interface AsyncLocalStorageLike<TStore> {
  run<TResult>(store: TStore, callback: () => TResult): TResult;
  getStore(): TStore | undefined;
}

type AsyncLocalStorageConstructor = new <TStore>() => AsyncLocalStorageLike<TStore>;

const NodeAsyncLocalStorage = await loadNodeAsyncLocalStorage();

class RequestObservationImpl<TEvent extends ObservationEvent = ObservationEvent> implements RequestObservation<TEvent> {
  readonly requestId: string;
  readonly method?: string;
  readonly path?: string;
  private readonly startedAt: number;
  private readonly baseLabels: Record<string, string>;
  private readonly metrics: ObservationMetric[] = [];
  private finished: RequestObservationSnapshot | undefined;

  constructor(
    private readonly owner: SuperfunctionObservabilityImpl<TEvent>,
    input: RequestObservationInput,
  ) {
    const requestUrl = input.request ? new URL(input.request.url) : undefined;
    this.requestId = input.requestId ?? input.request?.headers.get("x-request-id") ?? randomId();
    this.method = input.method ?? input.request?.method;
    this.path = input.path ?? requestUrl?.pathname;
    this.startedAt = input.startTimeMs ?? now();
    this.baseLabels = { ...input.labels };
  }

  record(metric: ObservationMetric): void {
    if (this.finished) {
      return;
    }
    this.metrics.push(metric);
    void this.owner.emitMetric(metric);
  }

  event(event: TEvent): void | Promise<void> {
    return this.owner.event({
      ...event,
      requestId: event.requestId ?? this.requestId,
    });
  }

  span(input: ObservationSpanInput): ObservationSpan {
    const startedAt = now();
    let ended = false;
    return {
      end: (endInput = {}) => {
        if (ended) {
          return;
        }
        ended = true;
        this.record({
          kind: input.kind,
          operation: input.operation,
          component: input.component,
          resource: input.resource,
          labels: { ...input.labels, ...endInput.labels },
          durationMs: now() - startedAt,
          ok: endInput.ok ?? true,
        });
      },
    };
  }

  finish(input: RequestObservationFinishInput = {}): RequestObservationSnapshot {
    if (this.finished) {
      return this.finished;
    }
    this.finished = this.snapshot(input);
    return this.finished;
  }

  snapshot(input: RequestObservationFinishInput = {}): RequestObservationSnapshot {
    const totalDurationMs = input.totalDurationMs ?? now() - this.startedAt;
    const groups: Record<string, ObservationGroupSnapshot> = {};

    for (const metric of this.metrics) {
      const group = groups[metric.kind] ?? {
        kind: metric.kind,
        count: 0,
        durationMs: 0,
        maxDurationMs: 0,
        errorCount: 0,
      };
      group.count += 1;
      if (typeof metric.durationMs === "number") {
        group.durationMs += metric.durationMs;
        group.maxDurationMs = Math.max(group.maxDurationMs, metric.durationMs);
      }
      if (metric.ok === false) {
        group.errorCount += 1;
      }
      groups[metric.kind] = group;
    }

    return {
      requestId: this.requestId,
      method: this.method,
      path: this.path,
      status: input.status,
      totalDurationMs,
      labels: { ...this.baseLabels, ...input.labels },
      groups,
      metrics: [...this.metrics],
    };
  }
}

class SuperfunctionObservabilityImpl<TEvent extends ObservationEvent = ObservationEvent> implements SuperfunctionObservability<TEvent> {
  readonly service?: string;
  readonly component?: string;
  readonly logger?: ObservationLogger;
  readonly events: ObservationEventChannel<TEvent>;
  readonly metrics: ObservationMetricChannel;
  readonly traces: ObservationTraceChannel;
  private readonly state: ObservabilityState<TEvent>;

  constructor(
    private readonly config: ResolvedConfig<TEvent>,
    state?: ObservabilityState<TEvent>,
  ) {
    this.state = state ?? {
      requestContext:
        config.requestContext ?? createDefaultRequestContext<TEvent>(),
    };
    this.service = config.service;
    this.component = config.component;
    this.logger = config.logger;
    this.events = {
      emit: (event) => this.event(event),
    };
    this.metrics = {
      record: (metric) => this.record(metric),
    };
    this.traces = {
      span: (input) => this.span(input),
    };
  }

  startRequest(input: RequestObservationInput = {}): RequestObservation<TEvent> {
    return new RequestObservationImpl<TEvent>(this, {
      ...input,
      labels: { ...this.config.labels, ...input.labels },
    });
  }

  async runWithRequest<T>(
    observation: RequestObservation<TEvent>,
    work: () => T | Promise<T>,
  ): Promise<T> {
    return this.state.requestContext.run(observation, work);
  }

  getCurrentRequest(): RequestObservation<TEvent> | undefined {
    return this.state.requestContext.get();
  }

  record(metric: ObservationMetric): void {
    const normalized = this.normalizeMetric(metric);
    const current = this.getCurrentRequest();
    if (current) {
      current.record(normalized);
      return;
    }
    void this.emitMetric(normalized);
  }

  async event(event: TEvent): Promise<void> {
    const normalized = {
      ...event,
      component: event.component ?? this.component,
    };
    logEvent(this.logger, normalized);
    await this.config.events?.emit(normalized);
  }

  span(input: ObservationSpanInput): ObservationSpan {
    const current = this.getCurrentRequest();
    if (current) {
      return current.span(input);
    }

    const startedAt = now();
    let ended = false;
    return {
      end: (endInput = {}) => {
        if (ended) {
          return;
        }
        ended = true;
        this.record({
          kind: input.kind,
          operation: input.operation,
          component: input.component,
          resource: input.resource,
          labels: { ...input.labels, ...endInput.labels },
          durationMs: now() - startedAt,
          ok: endInput.ok ?? true,
        });
      },
    };
  }

  child(scope: ObservationScope): SuperfunctionObservability<TEvent> {
    return new SuperfunctionObservabilityImpl<TEvent>({
      ...this.config,
      service: scope.service ?? this.service,
      component: scope.component ?? this.component,
      labels: { ...this.config.labels, ...scope.labels },
    }, this.state);
  }

  async emitMetric(metric: ObservationMetric): Promise<void> {
    await this.config.metrics?.record(metric);
  }

  private normalizeMetric(metric: ObservationMetric): ObservationMetric {
    return {
      ...metric,
      component: metric.component ?? this.component,
      labels: { ...this.config.labels, ...metric.labels },
    };
  }
}

export function createObservability<TEvent extends ObservationEvent = ObservationEvent>(
  input: Exclude<ObservabilityInput<TEvent>, false | null | undefined> = {},
): SuperfunctionObservability<TEvent> {
  if (isSuperfunctionObservability<TEvent>(input)) {
    return input;
  }

  if (isLogger(input)) {
    return new SuperfunctionObservabilityImpl<TEvent>({
      logger: input,
      labels: {},
    });
  }

  return new SuperfunctionObservabilityImpl<TEvent>({
    service: input.service,
    component: input.component,
    logger: input.logger,
    labels: input.labels ?? {},
    events: normalizeEventChannel(input.events),
    metrics: normalizeMetricChannel(input.metrics),
    requestContext: input.requestContext,
  });
}

export function normalizeObservability<TEvent extends ObservationEvent = ObservationEvent>(
  input: ObservabilityInput<TEvent>,
): SuperfunctionObservability<TEvent> | undefined {
  if (!input) {
    return undefined;
  }
  return createObservability(input as Exclude<ObservabilityInput<TEvent>, false | null | undefined>);
}

export function instrumentMethods<TTarget extends object>(
  input: InstrumentMethodsInput<TTarget>,
): TTarget {
  const { target, observability, kind, component, extract } = input;
  if (!observability) {
    return target;
  }

  return new Proxy(target, {
    get(currentTarget, property, receiver) {
      const value = Reflect.get(currentTarget, property, receiver);
      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        const extracted = extract?.({ property, args }) ?? {};
        const startedAt = now();
        try {
          const result = await value.apply(currentTarget, args);
          observability.metrics.record({
            kind,
            component,
            operation: extracted.operation ?? String(property),
            resource: extracted.resource,
            labels: extracted.labels,
            durationMs: now() - startedAt,
            ok: true,
          });
          return result;
        } catch (error) {
          observability.metrics.record({
            kind,
            component,
            operation: extracted.operation ?? String(property),
            resource: extracted.resource,
            labels: extracted.labels,
            durationMs: now() - startedAt,
            ok: false,
          });
          throw error;
        }
      };
    },
  }) as TTarget;
}

export function readObservationGroup(
  snapshot: RequestObservationSnapshot | undefined,
  kind: string,
): ObservationGroupSnapshot {
  return snapshot?.groups[kind] ?? {
    kind,
    count: 0,
    durationMs: 0,
    maxDurationMs: 0,
    errorCount: 0,
  };
}

export function roundObservationMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSuperfunctionObservability<TEvent extends ObservationEvent>(
  value: unknown,
): value is SuperfunctionObservability<TEvent> {
  return Boolean(value) &&
    typeof value === "object" &&
    typeof (value as SuperfunctionObservability).startRequest === "function" &&
    typeof (value as SuperfunctionObservability).runWithRequest === "function" &&
    typeof (value as SuperfunctionObservability).events === "object" &&
    typeof (value as SuperfunctionObservability).metrics === "object";
}

function isLogger(value: unknown): value is ObservationLogger {
  return Boolean(value) &&
    typeof value === "object" &&
    (
      typeof (value as ObservationLogger).info === "function" ||
      typeof (value as ObservationLogger).debug === "function" ||
      typeof (value as ObservationLogger).warn === "function" ||
      typeof (value as ObservationLogger).error === "function"
    );
}

function normalizeEventChannel<TEvent extends ObservationEvent>(
  events: ObservabilityConfigInput<TEvent>["events"],
): ObservationEventChannel<TEvent> | undefined {
  if (!events) {
    return undefined;
  }
  return typeof events === "function" ? { emit: events } : events;
}

function normalizeMetricChannel(
  metrics: ObservabilityConfigInput["metrics"],
): ObservationMetricChannel | undefined {
  if (!metrics) {
    return undefined;
  }
  return typeof metrics === "function" ? { record: metrics } : metrics;
}

function createStackRequestContext<TEvent extends ObservationEvent>(): RequestObservationContext<TEvent> {
  const stack: RequestObservation<TEvent>[] = [];
  return {
    async run<T>(
      observation: RequestObservation<TEvent>,
      work: () => T | Promise<T>,
    ): Promise<T> {
      stack.push(observation);
      try {
        return await work();
      } finally {
        const index = stack.lastIndexOf(observation);
        if (index >= 0) {
          stack.splice(index, 1);
        }
      }
    },
    get(): RequestObservation<TEvent> | undefined {
      return stack.at(-1);
    },
  };
}

function createDefaultRequestContext<
  TEvent extends ObservationEvent,
>(): RequestObservationContext<TEvent> {
  if (!NodeAsyncLocalStorage) {
    return createStackRequestContext<TEvent>();
  }

  const storage = new NodeAsyncLocalStorage<RequestObservation<TEvent>>();
  return {
    async run<T>(
      observation: RequestObservation<TEvent>,
      work: () => T | Promise<T>,
    ): Promise<T> {
      return await storage.run(observation, work);
    },
    get(): RequestObservation<TEvent> | undefined {
      return storage.getStore();
    },
  };
}

async function loadNodeAsyncLocalStorage(): Promise<AsyncLocalStorageConstructor | undefined> {
  try {
    // Keep the specifier dynamic so browser and edge bundlers can retain the
    // synchronous fallback without resolving a Node-only built-in.
    const specifier: string = "node:async_hooks";
    const module = await import(specifier) as {
      AsyncLocalStorage?: AsyncLocalStorageConstructor;
    };
    return module.AsyncLocalStorage;
  } catch {
    return undefined;
  }
}

function logEvent(logger: ObservationLogger | undefined, event: ObservationEvent): void {
  const context = {
    domain: event.domain,
    requestId: event.requestId,
    actorId: event.actorId,
    subjectId: event.subjectId,
    userId: event.userId,
    outcome: event.outcome,
    metadata: event.metadata,
  };
  switch (event.severity) {
    case "debug":
      logger?.debug?.(event.type, context);
      break;
    case "warn":
      logger?.warn?.(event.type, context);
      break;
    case "error":
      logger?.error?.(event.type, context);
      break;
    default:
      logger?.info?.(event.type, context);
      break;
  }
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Secure random identifier generation is unavailable");
}
