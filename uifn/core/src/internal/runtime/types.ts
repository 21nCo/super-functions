export interface RuntimeEvent {
  readonly type: string;
}

export type RuntimeStatus = 'idle' | 'running' | 'stopped' | 'done' | 'error' | 'destroyed';
export type RuntimeChangeSource = 'user' | 'programmatic' | 'controlled-sync' | 'effect' | 'system';
export type RuntimeInputModality = 'keyboard' | 'pointer' | 'touch' | 'virtual';

export interface RuntimeChildSnapshot {
  readonly status: RuntimeStatus;
  readonly version: number;
}

export interface RuntimeSnapshot<TState, TContext, TComputed> {
  readonly version: number;
  readonly status: RuntimeStatus;
  readonly state: Readonly<TState>;
  readonly context: Readonly<TContext>;
  readonly computed: Readonly<TComputed>;
  readonly children: Readonly<Record<string, RuntimeChildSnapshot>>;
}

export interface RuntimeChangeMeta<
  TEvent extends RuntimeEvent,
  TState,
  TContext,
  TComputed,
> {
  readonly transactionId: number;
  readonly event: Readonly<TEvent>;
  readonly action?: string;
  readonly source: RuntimeChangeSource;
  readonly reason: string;
  readonly inputModality?: RuntimeInputModality;
  readonly previousSnapshot: RuntimeSnapshot<TState, TContext, TComputed>;
  readonly nextSnapshot: RuntimeSnapshot<TState, TContext, TComputed>;
  readonly changedKeys: readonly string[];
  readonly requestedValue?: unknown;
  readonly timestamp: number;
}

export type RuntimeResourceKind =
  | 'effect'
  | 'activity'
  | 'timeout'
  | 'interval'
  | 'animation-frame'
  | 'microtask'
  | 'observer'
  | 'listener'
  | 'promise'
  | 'child-service'
  | 'custom';

export type RuntimeCleanup = () => void;

export interface RuntimeScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
  requestAnimationFrame(callback: (timestamp: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  queueMicrotask(callback: () => void): void;
}

export interface RuntimeInstrumentation {
  onServiceCreate?(definitionId: string, scopeId: string): void;
  onServiceDestroy?(definitionId: string, scopeId: string): void;
}

export interface RuntimeTraceRecord {
  readonly sequence: number;
  readonly kind:
    | 'service'
    | 'event'
    | 'transaction'
    | 'effect'
    | 'activity'
    | 'resource'
    | 'child'
    | 'listener-error'
    | 'error';
  readonly operation: string;
  readonly definitionId: string;
  readonly scopeId: string;
  readonly transactionId?: number;
  readonly eventType?: string;
  readonly eventKeys?: readonly string[];
  readonly source?: RuntimeChangeSource;
  readonly reason?: string;
  readonly previousVersion?: number;
  readonly nextVersion?: number;
  readonly changedKeys?: readonly string[];
  readonly status?: RuntimeStatus;
  readonly code?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
}

export interface RuntimeTraceSink {
  (record: RuntimeTraceRecord): void;
}

export interface RuntimeScopeOptions {
  readonly id: string;
  readonly hydrationSeed?: string;
  readonly mode?: 'production' | 'development' | 'test';
  readonly scheduler?: RuntimeScheduler;
  readonly traceLimit?: number;
  readonly traceSink?: RuntimeTraceSink;
  readonly instrumentation?: RuntimeInstrumentation;
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly maxEventSteps?: number;
}

export interface RuntimeScope {
  readonly id: string;
  readonly hydrationSeed: string;
  readonly mode: 'production' | 'development' | 'test';
  readonly scheduler: RuntimeScheduler;
  readonly traceLimit: number;
  readonly traceSink?: RuntimeTraceSink;
  readonly instrumentation?: RuntimeInstrumentation;
  readonly maxEventSteps: number;
  nextId(token: string): string;
  claimId(id: string): string;
  getCapability<T>(name: string): T | undefined;
  requireCapability<T>(name: string): T;
  child(key: string): RuntimeScope;
}

export interface RuntimeTransitionArgs<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> {
  readonly event: Readonly<TEvent>;
  readonly inputs: Readonly<TInputs>;
  readonly context: Readonly<TContext>;
  readonly state: Readonly<TState>;
  readonly computed: Readonly<TComputed>;
  readonly snapshot: RuntimeSnapshot<TState, TContext, TComputed>;
  readonly scope: RuntimeScope;
  getRef<TKey extends keyof TRefs>(key: TKey): TRefs[TKey] | undefined;
}

export interface RuntimeEffectApi<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> {
  readonly signal: AbortSignal;
  readonly scope: RuntimeScope;
  readonly scheduler: RuntimeScheduler;
  getSnapshot(): RuntimeSnapshot<TState, TContext, TComputed>;
  getInputs(): Readonly<TInputs>;
  getRef<TKey extends keyof TRefs>(key: TKey): TRefs[TKey] | undefined;
  isCurrent(): boolean;
  send(event: TEvent, options?: RuntimeSendOptions): void;
  guard<TArgs extends readonly unknown[], TResult>(
    callback: (...args: TArgs) => TResult,
  ): (...args: TArgs) => TResult | undefined;
  register(kind: 'observer' | 'listener' | 'custom', key: string, cleanup: RuntimeCleanup): RuntimeCleanup;
  delay(key: string, delayMs: number, callback: () => void): RuntimeCleanup;
  interval(key: string, intervalMs: number, callback: () => void): RuntimeCleanup;
  frame(key: string, callback: (timestamp: number) => void): RuntimeCleanup;
  microtask(key: string, callback: () => void): RuntimeCleanup;
  trackPromise<T>(
    key: string,
    promise: Promise<T>,
    onFulfilled: (value: T) => void,
    onRejected?: (error: unknown) => void,
  ): RuntimeCleanup;
  spawnChild<
    TChildInputs extends object,
    TChildContext,
    TChildState,
    TChildEvent extends RuntimeEvent,
    TChildComputed,
    TChildRefs extends object,
  >(
    key: string,
    definition: RuntimeDefinition<
      TChildInputs,
      TChildContext,
      TChildState,
      TChildEvent,
      TChildComputed,
      TChildRefs
    >,
    inputs: TChildInputs,
    options?: RuntimeChildOptions,
  ): RuntimeService<
    TChildInputs,
    TChildContext,
    TChildState,
    TChildEvent,
    TChildComputed,
    TChildRefs
  >;
}

export type RuntimeEffect<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> = (
  api: RuntimeEffectApi<TInputs, TContext, TState, TEvent, TComputed, TRefs>,
) => RuntimeCleanup;

export interface RuntimeEffectRequest<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> {
  readonly key: string;
  readonly run: RuntimeEffect<TInputs, TContext, TState, TEvent, TComputed, TRefs>;
}

export interface RuntimeTransitionResult<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> {
  readonly state?: TState;
  readonly context?: TContext;
  readonly status?: Exclude<RuntimeStatus, 'idle' | 'destroyed'>;
  readonly reason: string;
  readonly action?: string;
  readonly requestedValue?: unknown;
  readonly effects?: readonly RuntimeEffectRequest<
    TInputs,
    TContext,
    TState,
    TEvent,
    TComputed,
    TRefs
  >[];
}

export interface RuntimeTransitionDefinition<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> {
  readonly guard?: (
    args: RuntimeTransitionArgs<TInputs, TContext, TState, TEvent, TComputed, TRefs>,
  ) => boolean;
  readonly reduce: (
    args: RuntimeTransitionArgs<TInputs, TContext, TState, TEvent, TComputed, TRefs>,
  ) => RuntimeTransitionResult<TInputs, TContext, TState, TEvent, TComputed, TRefs> | undefined;
}

export interface RuntimeActivityDefinition<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed,
  TRefs extends object,
> {
  readonly key: string;
  readonly when: (args: {
    readonly inputs: Readonly<TInputs>;
    readonly snapshot: RuntimeSnapshot<TState, TContext, TComputed>;
  }) => boolean;
  readonly run: RuntimeEffect<TInputs, TContext, TState, TEvent, TComputed, TRefs>;
}

export interface RuntimeDefinition<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed = Record<string, never>,
  TRefs extends object = Record<string, never>,
> {
  readonly id: string;
  readonly initialState: TState;
  readonly initialContext: TContext | ((inputs: Readonly<TInputs>, scope: RuntimeScope) => TContext);
  readonly validateInputs?: (inputs: Readonly<TInputs>) => void | true | readonly string[];
  readonly compute?: (args: {
    readonly inputs: Readonly<TInputs>;
    readonly context: Readonly<TContext>;
    readonly state: Readonly<TState>;
    readonly scope: RuntimeScope;
    getRef<TKey extends keyof TRefs>(key: TKey): TRefs[TKey] | undefined;
  }) => TComputed;
  readonly transitions: Readonly<
    Record<
      string,
      | RuntimeTransitionDefinition<TInputs, TContext, TState, TEvent, TComputed, TRefs>
      | readonly RuntimeTransitionDefinition<TInputs, TContext, TState, TEvent, TComputed, TRefs>[]
    >
  >;
  readonly always?: readonly RuntimeTransitionDefinition<
    TInputs,
    TContext,
    TState,
    TEvent,
    TComputed,
    TRefs
  >[];
  readonly onInputs?: (
    args: RuntimeTransitionArgs<TInputs, TContext, TState, TEvent, TComputed, TRefs> & {
      readonly previousInputs: Readonly<TInputs>;
      readonly nextInputs: Readonly<TInputs>;
    },
  ) => RuntimeTransitionResult<TInputs, TContext, TState, TEvent, TComputed, TRefs> | undefined;
  readonly startEffects?: readonly RuntimeEffectRequest<
    TInputs,
    TContext,
    TState,
    TEvent,
    TComputed,
    TRefs
  >[];
  readonly activities?: readonly RuntimeActivityDefinition<
    TInputs,
    TContext,
    TState,
    TEvent,
    TComputed,
    TRefs
  >[];
  readonly onError?: (error: unknown, phase: string) => 'error' | 'recover';
}

export interface RuntimeSendOptions {
  readonly source?: RuntimeChangeSource;
  readonly reason?: string;
  readonly action?: string;
  readonly inputModality?: RuntimeInputModality;
  readonly requestedValue?: unknown;
}

export interface RuntimeUpdateOptions extends Omit<RuntimeSendOptions, 'inputModality'> {
  readonly source?: 'programmatic' | 'controlled-sync' | 'effect' | 'system';
}

export interface RuntimeSubscribeOptions<TSnapshot, TSelected> {
  readonly emitInitial?: boolean;
  readonly selector?: (snapshot: TSnapshot) => TSelected;
  readonly equality?: (previous: TSelected, next: TSelected) => boolean;
}

export interface RuntimeChildOptions {
  readonly errorPolicy?: 'isolate' | 'propagate';
}

export interface RuntimeService<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed = Record<string, never>,
  TRefs extends object = Record<string, never>,
> {
  readonly definitionId: string;
  readonly scope: RuntimeScope;
  readonly status: RuntimeStatus;
  getInputs(): Readonly<TInputs>;
  getSnapshot(): RuntimeSnapshot<TState, TContext, TComputed>;
  send(event: TEvent, options?: RuntimeSendOptions): void;
  update(inputs: Partial<TInputs>, options?: RuntimeUpdateOptions): void;
  setRef<TKey extends keyof TRefs>(key: TKey, value: TRefs[TKey] | undefined): void;
  getRef<TKey extends keyof TRefs>(key: TKey): TRefs[TKey] | undefined;
  subscribe<TSelected = RuntimeSnapshot<TState, TContext, TComputed>>(
    subscriber: (
      selected: TSelected,
      meta?: RuntimeChangeMeta<TEvent, TState, TContext, TComputed>,
    ) => void,
    options?: RuntimeSubscribeOptions<RuntimeSnapshot<TState, TContext, TComputed>, TSelected>,
  ): RuntimeCleanup;
  spawnChild<
    TChildInputs extends object,
    TChildContext,
    TChildState,
    TChildEvent extends RuntimeEvent,
    TChildComputed,
    TChildRefs extends object,
  >(
    key: string,
    definition: RuntimeDefinition<
      TChildInputs,
      TChildContext,
      TChildState,
      TChildEvent,
      TChildComputed,
      TChildRefs
    >,
    inputs: TChildInputs,
    options?: RuntimeChildOptions,
  ): RuntimeService<
    TChildInputs,
    TChildContext,
    TChildState,
    TChildEvent,
    TChildComputed,
    TChildRefs
  >;
  stop(reason?: string): void;
  destroy(): void;
  getTrace(): readonly RuntimeTraceRecord[];
  getResourceCounts(): Readonly<Record<RuntimeResourceKind, number>>;
}
