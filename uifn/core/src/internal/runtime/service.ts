import { createUIFnError, isUIFnError, type UIFnError } from '../../errors';
import { changedObjectKeys, deepFreeze, immutableSerializable, structuralEqual } from './immutable';
import { createRuntimeScope } from './scope';
import { createRuntimeTraceBuffer } from './trace';
import type {
  RuntimeActivityDefinition,
  RuntimeChangeMeta,
  RuntimeChildOptions,
  RuntimeCleanup,
  RuntimeDefinition,
  RuntimeEffect,
  RuntimeEffectApi,
  RuntimeEffectRequest,
  RuntimeEvent,
  RuntimeResourceKind,
  RuntimeScope,
  RuntimeSendOptions,
  RuntimeService,
  RuntimeSnapshot,
  RuntimeStatus,
  RuntimeTransitionArgs,
  RuntimeTransitionDefinition,
  RuntimeTransitionResult,
  RuntimeUpdateOptions,
} from './types';

declare const __UIFN_DEV_TRACE__: boolean;

interface RuntimeServiceOptions {
  readonly scope?: RuntimeScope;
}

interface EventEnvelope<TEvent extends RuntimeEvent> {
  readonly kind: 'event';
  readonly event: TEvent;
  readonly options: RuntimeSendOptions;
}

interface InputEnvelope<TInputs extends object> {
  readonly kind: 'inputs';
  readonly patch: Readonly<Partial<TInputs>>;
  readonly options: RuntimeUpdateOptions;
}

interface RefEnvelope<TRefs extends object> {
  readonly kind: 'ref';
  readonly key: keyof TRefs;
  readonly value: TRefs[keyof TRefs] | undefined;
}

interface ChildEnvelope {
  readonly kind: 'child';
  readonly key: string;
  readonly status: RuntimeStatus;
  readonly version: number;
  readonly errorPolicy: 'isolate' | 'propagate';
}

type QueueEnvelope<TInputs extends object, TEvent extends RuntimeEvent, TRefs extends object> =
  | EventEnvelope<TEvent>
  | InputEnvelope<TInputs>
  | RefEnvelope<TRefs>
  | ChildEnvelope;

interface ResourceRecord {
  readonly kind: RuntimeResourceKind;
  readonly key: string;
  readonly cleanup: RuntimeCleanup;
  active: boolean;
}

interface OwnedEffect {
  readonly key: string;
  readonly kind: 'effect' | 'activity';
  readonly abortController: AbortController;
  readonly owned: Set<RuntimeCleanup>;
  cleanup: RuntimeCleanup;
  active: boolean;
}

interface ChildRecord {
  readonly service: RuntimeService<object, unknown, unknown, RuntimeEvent, unknown, object>;
  readonly unsubscribe: RuntimeCleanup;
  readonly errorPolicy: 'isolate' | 'propagate';
}

interface Subscription<TSnapshot, TEvent extends RuntimeEvent> {
  readonly listener: (selected: unknown, meta?: RuntimeChangeMeta<TEvent, unknown, unknown, unknown>) => void;
  readonly selector: (snapshot: TSnapshot) => unknown;
  readonly equality: (previous: unknown, next: unknown) => boolean;
  selected: unknown;
  active: boolean;
}

const EMPTY_COMPUTED = Object.freeze({});
const RESOURCE_KINDS: readonly RuntimeResourceKind[] = [
  'effect', 'activity', 'timeout', 'interval', 'animation-frame', 'microtask',
  'observer', 'listener', 'promise', 'child-service', 'custom',
];

function once(cleanup: RuntimeCleanup): RuntimeCleanup {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    cleanup();
  };
}

function safeInputCopy<TInputs extends object>(inputs: TInputs): Readonly<TInputs> {
  return Object.freeze({ ...inputs });
}

function readonlyEvent<TEvent extends RuntimeEvent>(event: TEvent): Readonly<TEvent> {
  return Object.freeze({ ...event });
}

function changedInputKeys<TInputs extends object>(previous: Readonly<TInputs>, next: Readonly<TInputs>): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...keys].sort().filter((key) => !Object.is(
    (previous as Record<string, unknown>)[key],
    (next as Record<string, unknown>)[key],
  ));
}

function validateDefinitionId(id: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw createUIFnError({
      code: 'UIFN_RUNTIME_DEFINITION_INVALID',
      package: '@uifn/core',
      component: 'Runtime',
      message: 'Private runtime definitions require a stable lowercase id.',
      details: { id },
    });
  }
}

function normalizeRuntimeError(error: unknown, phase: string, definitionId: string): UIFnError {
  if (isUIFnError(error)) return error;
  return createUIFnError({
    code: 'UIFN_UNSTABLE_ERROR',
    package: '@uifn/core',
    component: definitionId,
    message: 'Private runtime work threw a non-uifn error.',
    details: { phase, originalErrorName: error instanceof Error ? error.name : typeof error },
    cause: error,
  });
}

export function createRuntimeService<
  TInputs extends object,
  TContext,
  TState,
  TEvent extends RuntimeEvent,
  TComputed = Record<string, never>,
  TRefs extends object = Record<string, never>,
>(
  definition: RuntimeDefinition<TInputs, TContext, TState, TEvent, TComputed, TRefs>,
  initialInputs: TInputs,
  options: RuntimeServiceOptions = {},
): RuntimeService<TInputs, TContext, TState, TEvent, TComputed, TRefs> {
  validateDefinitionId(definition.id);
  const scope = options.scope ?? createRuntimeScope({ id: definition.id, mode: 'production' });
  const trace = createRuntimeTraceBuffer({
    enabled: scope.mode !== 'production',
    limit: scope.traceLimit,
    sink: scope.traceSink,
  });
  const queue: QueueEnvelope<TInputs, TEvent, TRefs>[] = [];
  const refs = new Map<keyof TRefs, TRefs[keyof TRefs]>();
  const subscriptions = new Set<Subscription<RuntimeSnapshot<TState, TContext, TComputed>, TEvent>>();
  const effects = new Map<string, OwnedEffect>();
  const activities = new Map<string, OwnedEffect>();
  const resources = new Map<string, ResourceRecord>();
  const children = new Map<string, ChildRecord>();
  let resourceSequence = 0;
  let processing = false;
  let destroying = false;
  let transactionSequence = 0;
  let inputs = safeInputCopy(initialInputs);
  let lastError: UIFnError | undefined;

  const validateInputs = (candidate: Readonly<TInputs>) => {
    try {
      const result = definition.validateInputs?.(candidate);
      if (Array.isArray(result) && result.length > 0) {
        throw createUIFnError({
          code: 'UIFN_RUNTIME_INPUT_INVALID',
          package: '@uifn/core',
          component: definition.id,
          message: 'Runtime inputs failed definition validation.',
          details: { issues: [...result] },
          recoverable: true,
        });
      }
    } catch (error) {
      if (isUIFnError(error)) throw error;
      throw createUIFnError({
        code: 'UIFN_RUNTIME_INPUT_INVALID',
        package: '@uifn/core',
        component: definition.id,
        message: 'Runtime input validation threw an unstable error.',
        details: { originalErrorName: error instanceof Error ? error.name : typeof error },
        recoverable: true,
        cause: error,
      });
    }
  };

  validateInputs(inputs);
  let context = immutableSerializable(
    typeof definition.initialContext === 'function'
      ? (definition.initialContext as (runtimeInputs: Readonly<TInputs>, runtimeScope: RuntimeScope) => TContext)(inputs, scope)
      : definition.initialContext,
    '$.context',
  ) as Readonly<TContext>;
  let state = immutableSerializable(definition.initialState, '$.state') as Readonly<TState>;

  const getRef = <TKey extends keyof TRefs>(key: TKey): TRefs[TKey] | undefined => refs.get(key) as TRefs[TKey] | undefined;
  const compute = (): Readonly<TComputed> => immutableSerializable(
    definition.compute?.({ inputs, context, state, scope, getRef }) ?? EMPTY_COMPUTED as TComputed,
    '$.computed',
  ) as Readonly<TComputed>;
  let computed = compute();

  const childSnapshot = (): Readonly<Record<string, { status: RuntimeStatus; version: number }>> => immutableSerializable(
    Object.fromEntries([...children.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => {
      const snapshot = child.service.getSnapshot();
      return [key, { status: snapshot.status, version: snapshot.version }];
    })),
    '$.children',
  );

  const makeSnapshot = (version: number, status: RuntimeStatus): RuntimeSnapshot<TState, TContext, TComputed> => deepFreeze({
    version,
    status,
    state,
    context,
    computed,
    children: childSnapshot(),
  }) as RuntimeSnapshot<TState, TContext, TComputed>;

  let snapshot = makeSnapshot(0, 'running');

  const emitTrace = (
    record: Omit<Parameters<typeof trace.emit>[0], 'definitionId' | 'scopeId' | 'timestamp'>,
  ) => trace.emit({
    ...record,
    definitionId: definition.id,
    scopeId: scope.id,
    timestamp: scope.scheduler.now(),
  });

  const runCleanup = (cleanup: RuntimeCleanup, phase: string) => {
    try {
      cleanup();
    } catch (error) {
      const normalized = normalizeRuntimeError(error, phase, definition.id);
      lastError = normalized;
      __UIFN_DEV_TRACE__ && emitTrace({ kind: 'error', operation: phase, code: normalized.code, status: snapshot.status });
    }
  };

  const registerResource = (
    kind: Exclude<RuntimeResourceKind, 'effect' | 'activity' | 'child-service'>,
    owner: string,
    key: string,
    cleanup: RuntimeCleanup,
  ): RuntimeCleanup => {
    resourceSequence += 1;
    const resourceKey = `${owner}:${kind}:${key}:${resourceSequence}`;
    const record: ResourceRecord = { kind, key: resourceKey, cleanup: once(cleanup), active: true };
    resources.set(resourceKey, record);
    __UIFN_DEV_TRACE__ && emitTrace({ kind: 'resource', operation: 'register', status: snapshot.status, details: { kind, key } });
    return once(() => {
      if (!record.active) return;
      record.active = false;
      resources.delete(resourceKey);
      runCleanup(record.cleanup, `${kind}-cleanup`);
      __UIFN_DEV_TRACE__ && emitTrace({ kind: 'resource', operation: 'cleanup', status: snapshot.status, details: { kind, key } });
    });
  };

  const notify = (meta: RuntimeChangeMeta<TEvent, TState, TContext, TComputed>) => {
    for (const subscription of [...subscriptions]) {
      if (!subscription.active || destroying) continue;
      try {
        const selected = subscription.selector(snapshot);
        if (subscription.equality(subscription.selected, selected)) continue;
        subscription.selected = selected;
        subscription.listener(selected, meta as RuntimeChangeMeta<TEvent, unknown, unknown, unknown>);
      } catch (error) {
        const normalized = normalizeRuntimeError(error, 'subscriber', definition.id);
        __UIFN_DEV_TRACE__ && emitTrace({ kind: 'listener-error', operation: 'isolated', code: normalized.code, status: snapshot.status });
      }
    }
  };

  const publish = (
    next: {
      state: Readonly<TState>;
      context: Readonly<TContext>;
      computed: Readonly<TComputed>;
      status: RuntimeStatus;
    },
    event: TEvent,
    sendOptions: RuntimeSendOptions,
    forcedChangedKeys: readonly string[] = [],
  ): RuntimeChangeMeta<TEvent, TState, TContext, TComputed> | undefined => {
    const previousSnapshot = snapshot;
    const changedKeys = [
      ...forcedChangedKeys,
      ...changedObjectKeys('state', previousSnapshot.state, next.state),
      ...changedObjectKeys('context', previousSnapshot.context, next.context),
      ...changedObjectKeys('computed', previousSnapshot.computed, next.computed),
      ...(previousSnapshot.status === next.status ? [] : ['status']),
      ...changedObjectKeys('children', previousSnapshot.children, childSnapshot()),
    ].filter((value, index, values) => values.indexOf(value) === index);
    if (changedKeys.length === 0) {
      __UIFN_DEV_TRACE__ && emitTrace({
        kind: 'transaction', operation: 'no-op', eventType: event.type,
        eventKeys: Object.keys(event), source: sendOptions.source ?? 'programmatic',
        reason: sendOptions.reason ?? event.type, previousVersion: snapshot.version,
        nextVersion: snapshot.version, changedKeys: [], status: snapshot.status,
      });
      return undefined;
    }
    state = next.state;
    context = next.context;
    computed = next.computed;
    transactionSequence += 1;
    snapshot = makeSnapshot(previousSnapshot.version + 1, next.status);
    const meta = Object.freeze({
      transactionId: transactionSequence,
      event: readonlyEvent(event),
      action: sendOptions.action,
      source: sendOptions.source ?? 'programmatic',
      reason: sendOptions.reason ?? event.type,
      inputModality: sendOptions.inputModality,
      previousSnapshot,
      nextSnapshot: snapshot,
      changedKeys: Object.freeze(changedKeys),
      requestedValue: sendOptions.requestedValue,
      timestamp: scope.scheduler.now(),
    }) as RuntimeChangeMeta<TEvent, TState, TContext, TComputed>;
    __UIFN_DEV_TRACE__ && emitTrace({
      kind: 'transaction', operation: 'commit', transactionId: meta.transactionId,
      eventType: event.type, eventKeys: Object.keys(event), source: meta.source,
      reason: meta.reason, previousVersion: previousSnapshot.version,
      nextVersion: snapshot.version, changedKeys, status: snapshot.status,
    });
    notify(meta);
    return meta;
  };

  const disposeOwnedEffect = (record: OwnedEffect, reason: string) => {
    if (!record.active) return;
    record.active = false;
    record.abortController.abort(reason);
    runCleanup(record.cleanup, `${record.kind}-cleanup`);
    for (const dispose of [...record.owned].reverse()) runCleanup(dispose, `${record.kind}-resource-cleanup`);
    record.owned.clear();
    __UIFN_DEV_TRACE__ && emitTrace({ kind: record.kind, operation: 'cleanup', status: snapshot.status, details: { key: record.key, reason } });
  };

  const handleError = (error: unknown, phase: string): UIFnError => {
    const normalized = normalizeRuntimeError(error, phase, definition.id);
    lastError = normalized;
    __UIFN_DEV_TRACE__ && emitTrace({ kind: 'error', operation: phase, code: normalized.code, status: snapshot.status });
    if (definition.onError?.(normalized, phase) === 'recover') return normalized;
    if (!destroying && snapshot.status !== 'destroyed' && snapshot.status !== 'error') {
      disposeAll('error');
      const errorEvent = { type: '@@uifn.error' } as TEvent;
      publish(
        { state, context, computed, status: 'error' },
        errorEvent,
        { source: 'system', reason: phase, action: 'runtime-error' },
      );
    }
    return normalized;
  };

  let service!: RuntimeService<TInputs, TContext, TState, TEvent, TComputed, TRefs>;

  const removeChild = (key: string, reason: string, publishRemoval: boolean) => {
    const child = children.get(key);
    if (!child) return;
    children.delete(key);
    child.unsubscribe();
    child.service.destroy();
    __UIFN_DEV_TRACE__ && emitTrace({ kind: 'child', operation: 'destroy', status: snapshot.status, details: { key, reason } });
    if (publishRemoval && !destroying && snapshot.status === 'running') {
      enqueue({ kind: 'child', key, status: 'destroyed', version: child.service.getSnapshot().version, errorPolicy: child.errorPolicy });
    }
  };

  const startOwnedEffect = (
    kind: 'effect' | 'activity',
    key: string,
    run: RuntimeEffect<TInputs, TContext, TState, TEvent, TComputed, TRefs>,
  ) => {
    const collection = kind === 'effect' ? effects : activities;
    const previous = collection.get(key);
    if (previous) disposeOwnedEffect(previous, 'replaced');
    const abortController = new AbortController();
    const record: OwnedEffect = {
      key,
      kind,
      abortController,
      owned: new Set(),
      cleanup: () => undefined,
      active: true,
    };
    collection.set(key, record);

    const own = (dispose: RuntimeCleanup) => {
      const ownedDispose = once(() => {
        dispose();
        record.owned.delete(ownedDispose);
      });
      record.owned.add(ownedDispose);
      return ownedDispose;
    };
    const isCurrent = () => record.active && collection.get(key) === record && !destroying && snapshot.status !== 'destroyed';
    const effectApi: RuntimeEffectApi<TInputs, TContext, TState, TEvent, TComputed, TRefs> = {
      signal: abortController.signal,
      scope,
      scheduler: scope.scheduler,
      getSnapshot: () => snapshot,
      getInputs: () => inputs,
      getRef,
      isCurrent,
      send(event, sendOptions = {}) {
        if (isCurrent()) service.send(event, { source: 'effect', ...sendOptions });
      },
      guard(callback) {
        return (...args) => isCurrent() ? callback(...args) : undefined;
      },
      register(resourceKind, resourceKey, cleanup) {
        if (typeof cleanup !== 'function') {
          throw createUIFnError({
            code: 'UIFN_EFFECT_CLEANUP_MISSING', package: '@uifn/core', component: definition.id,
            message: 'Runtime resources require an explicit cleanup function.', details: { kind, key, resourceKind, resourceKey },
          });
        }
        return own(registerResource(resourceKind, `${kind}:${key}`, resourceKey, cleanup));
      },
      delay(resourceKey, delayMs, callback) {
        let dispose: RuntimeCleanup = () => undefined;
        const handle = scope.scheduler.setTimeout(() => {
          dispose();
          if (isCurrent()) callback();
        }, delayMs);
        dispose = own(registerResource('timeout', `${kind}:${key}`, resourceKey, () => scope.scheduler.clearTimeout(handle)));
        return dispose;
      },
      interval(resourceKey, intervalMs, callback) {
        const handle = scope.scheduler.setInterval(() => {
          if (isCurrent()) callback();
        }, intervalMs);
        return own(registerResource('interval', `${kind}:${key}`, resourceKey, () => scope.scheduler.clearInterval(handle)));
      },
      frame(resourceKey, callback) {
        let dispose: RuntimeCleanup = () => undefined;
        const handle = scope.scheduler.requestAnimationFrame((timestamp) => {
          dispose();
          if (isCurrent()) callback(timestamp);
        });
        dispose = own(registerResource('animation-frame', `${kind}:${key}`, resourceKey, () => scope.scheduler.cancelAnimationFrame(handle)));
        return dispose;
      },
      microtask(resourceKey, callback) {
        let active = true;
        let dispose: RuntimeCleanup = () => undefined;
        scope.scheduler.queueMicrotask(() => {
          if (!active) return;
          dispose();
          if (isCurrent()) callback();
        });
        dispose = own(registerResource('microtask', `${kind}:${key}`, resourceKey, () => { active = false; }));
        return dispose;
      },
      trackPromise(resourceKey, promise, onFulfilled, onRejected) {
        let active = true;
        const dispose = own(registerResource('promise', `${kind}:${key}`, resourceKey, () => { active = false; }));
        promise.then(
          (value) => {
            if (!active) return;
            dispose();
            if (isCurrent()) onFulfilled(value);
          },
          (error) => {
            if (!active) return;
            dispose();
            if (!isCurrent()) return;
            if (onRejected) onRejected(error);
            else handleError(error, 'effect-promise');
          },
        );
        return dispose;
      },
      spawnChild(childKey, childDefinition, childInputs, childOptions) {
        const child = service.spawnChild(childKey, childDefinition, childInputs, childOptions);
        own(() => removeChild(childKey, `${kind}-cleanup`, true));
        return child;
      },
    };

    try {
      const cleanup = run(effectApi);
      if (typeof cleanup !== 'function') {
        throw createUIFnError({
          code: 'UIFN_EFFECT_CLEANUP_MISSING',
          package: '@uifn/core',
          component: definition.id,
          message: 'Every runtime effect and activity must return cleanup.',
          details: { kind, key },
        });
      }
      record.cleanup = once(cleanup);
      __UIFN_DEV_TRACE__ && emitTrace({ kind, operation: 'setup', status: snapshot.status, details: { key } });
    } catch (error) {
      collection.delete(key);
      disposeOwnedEffect(record, 'setup-failed');
      throw handleError(error, `${kind}-setup`);
    }
  };

  const reconcileActivities = () => {
    const definitions = definition.activities ?? [];
    const desired = new Set<string>();
    for (const activity of definitions) {
      let enabled = false;
      try {
        enabled = activity.when({ inputs, snapshot });
      } catch (error) {
        throw handleError(error, 'activity-guard');
      }
      if (enabled) {
        desired.add(activity.key);
        if (!activities.has(activity.key)) startOwnedEffect('activity', activity.key, activity.run);
      }
    }
    for (const [key, record] of activities) {
      if (!desired.has(key)) {
        activities.delete(key);
        disposeOwnedEffect(record, 'predicate-false');
      }
    }
  };

  const transitionArgs = (event: TEvent): RuntimeTransitionArgs<TInputs, TContext, TState, TEvent, TComputed, TRefs> => ({
    event: readonlyEvent(event), inputs, context, state, computed, snapshot, scope, getRef,
  });

  const chooseTransition = (
    candidates: RuntimeTransitionDefinition<TInputs, TContext, TState, TEvent, TComputed, TRefs>
      | readonly RuntimeTransitionDefinition<TInputs, TContext, TState, TEvent, TComputed, TRefs>[],
    args: RuntimeTransitionArgs<TInputs, TContext, TState, TEvent, TComputed, TRefs>,
  ) => (Array.isArray(candidates) ? candidates : [candidates]).find((candidate) => candidate.guard?.(args) ?? true);

  const applyResult = (
    event: TEvent,
    result: RuntimeTransitionResult<TInputs, TContext, TState, TEvent, TComputed, TRefs> | undefined,
    sendOptions: RuntimeSendOptions,
    forcedChangedKeys: readonly string[] = [],
  ) => {
    if (!result) {
      publish({ state, context, computed, status: snapshot.status }, event, sendOptions);
      return;
    }
    const nextState = Object.prototype.hasOwnProperty.call(result, 'state')
      ? immutableSerializable(result.state as TState, '$.state') as Readonly<TState>
      : state;
    const nextContext = Object.prototype.hasOwnProperty.call(result, 'context')
      ? immutableSerializable(result.context as TContext, '$.context') as Readonly<TContext>
      : context;
    const previousState = state;
    const previousContext = context;
    state = nextState;
    context = nextContext;
    let nextComputed: Readonly<TComputed>;
    try {
      nextComputed = compute();
    } finally {
      state = previousState;
      context = previousContext;
    }
    const metaOptions: RuntimeSendOptions = {
      ...sendOptions,
      reason: result.reason,
      action: result.action ?? sendOptions.action,
      requestedValue: result.requestedValue ?? sendOptions.requestedValue,
    };
    const nextStatus = result.status ?? snapshot.status;
    if (nextStatus !== 'running') disposeAll(`status-${nextStatus}`);
    publish({
      state: nextState,
      context: nextContext,
      computed: nextComputed,
      status: nextStatus,
    }, event, metaOptions, forcedChangedKeys);
    if (nextStatus !== 'running') return;
    reconcileActivities();
    for (const effect of result.effects ?? []) startOwnedEffect('effect', effect.key, effect.run);
  };

  const processEvent = (envelope: EventEnvelope<TEvent>) => {
    const candidates = definition.transitions[envelope.event.type];
    if (!candidates) {
      throw createUIFnError({
        code: 'UIFN_RUNTIME_EVENT_INVALID',
        package: '@uifn/core',
        component: definition.id,
        message: 'Runtime received an event not declared by its definition.',
        details: { eventType: envelope.event.type },
        recoverable: true,
      });
    }
    __UIFN_DEV_TRACE__ && emitTrace({
      kind: 'event', operation: 'dequeue', eventType: envelope.event.type,
      eventKeys: Object.keys(envelope.event), source: envelope.options.source ?? 'programmatic',
      reason: envelope.options.reason ?? envelope.event.type, status: snapshot.status,
    });
    const args = transitionArgs(envelope.event);
    let result;
    try {
      const transition = chooseTransition(candidates, args);
      result = transition?.reduce(args);
    } catch (error) {
      throw handleError(error, 'transition');
    }
    applyResult(envelope.event, result, envelope.options);
  };

  const processInputs = (envelope: InputEnvelope<TInputs>) => {
    const previousInputs = inputs;
    const nextInputs = safeInputCopy({ ...inputs, ...envelope.patch } as TInputs);
    validateInputs(nextInputs);
    const changedKeys = changedInputKeys(previousInputs, nextInputs);
    if (changedKeys.length === 0) return;
    inputs = nextInputs;
    const event = { type: '@@uifn.inputs' } as TEvent;
    try {
      const result = definition.onInputs?.({
        ...transitionArgs(event),
        previousInputs,
        nextInputs,
      });
      applyResult(event, result ?? {
        reason: envelope.options.reason ?? 'inputs-updated',
        action: envelope.options.action ?? 'update-inputs',
      }, { source: envelope.options.source ?? 'programmatic', ...envelope.options }, changedKeys.map((key) => `inputs.${key}`));
    } catch (error) {
      inputs = previousInputs;
      if (isUIFnError(error) && snapshot.status === 'error') throw error;
      throw handleError(error, 'input-update');
    }
  };

  const processRef = (envelope: RefEnvelope<TRefs>) => {
    const previous = refs.get(envelope.key);
    const hadPrevious = refs.has(envelope.key);
    if (envelope.value === undefined) refs.delete(envelope.key);
    else refs.set(envelope.key, envelope.value);
    const event = { type: '@@uifn.ref' } as TEvent;
    try {
      const nextComputed = compute();
      publish({ state, context, computed: nextComputed, status: snapshot.status }, event, {
        source: 'system', reason: 'ref-updated', action: 'set-ref',
      });
      reconcileActivities();
    } catch (error) {
      if (hadPrevious) refs.set(envelope.key, previous as TRefs[keyof TRefs]);
      else refs.delete(envelope.key);
      if (isUIFnError(error) && snapshot.status === 'error') throw error;
      throw handleError(error, 'ref-update');
    }
  };

  const processChild = (envelope: ChildEnvelope) => {
    const event = { type: '@@uifn.child' } as TEvent;
    publish({ state, context, computed, status: snapshot.status }, event, {
      source: 'system', reason: 'child-updated', action: 'child-service',
    }, [`children.${envelope.key}`]);
    if (envelope.status === 'error' && envelope.errorPolicy === 'propagate') {
      handleError(createUIFnError({
        code: 'UIFN_RUNTIME_CHILD_FAILED', package: '@uifn/core', component: definition.id,
        message: 'A child runtime service entered the error state.', details: { child: envelope.key, version: envelope.version },
      }), 'child-service');
    }
  };

  const processAlways = (): number => {
    let steps = 0;
    while (definition.always?.length) {
      const event = { type: '@@uifn.always' } as TEvent;
      const args = transitionArgs(event);
      const beforeVersion = snapshot.version;
      let result;
      try {
        const transition = definition.always.find((candidate) => candidate.guard?.(args) ?? true);
        if (!transition) break;
        result = transition.reduce(args);
      } catch (error) {
        throw handleError(error, 'always-transition');
      }
      applyResult(event, result, { source: 'system', reason: result?.reason ?? 'always-transition' });
      steps += 1;
      if (snapshot.version === beforeVersion) break;
      if (steps > scope.maxEventSteps) break;
    }
    return steps;
  };

  const drain = () => {
    if (processing || destroying) return;
    processing = true;
    let steps = 0;
    try {
      while (queue.length > 0 && !destroying) {
        steps += 1;
        if (steps > scope.maxEventSteps) {
          queue.length = 0;
          throw handleError(createUIFnError({
            code: 'UIFN_RUNTIME_EVENT_CYCLE', package: '@uifn/core', component: definition.id,
            message: 'Runtime exceeded the configured event/always-transition step cap.',
            details: { maxEventSteps: scope.maxEventSteps },
          }), 'event-cycle');
        }
        const envelope = queue.shift()!;
        if (envelope.kind === 'event') processEvent(envelope);
        else if (envelope.kind === 'inputs') processInputs(envelope);
        else if (envelope.kind === 'ref') processRef(envelope);
        else processChild(envelope);
        steps += processAlways();
      }
    } finally {
      processing = false;
    }
  };

  const enqueue = (envelope: QueueEnvelope<TInputs, TEvent, TRefs>) => {
    queue.push(envelope);
    drain();
  };

  const disposeAll = (reason: string) => {
    for (const key of [...children.keys()].reverse()) removeChild(key, reason, false);
    for (const [key, record] of [...effects.entries()].reverse()) {
      effects.delete(key);
      disposeOwnedEffect(record, reason);
    }
    for (const [key, record] of [...activities.entries()].reverse()) {
      activities.delete(key);
      disposeOwnedEffect(record, reason);
    }
    for (const record of [...resources.values()].reverse()) {
      if (record.active) {
        record.active = false;
        resources.delete(record.key);
        runCleanup(record.cleanup, `${record.kind}-cleanup`);
      }
    }
  };

  service = {
    definitionId: definition.id,
    scope,
    get status() {
      return snapshot.status;
    },
    getInputs: () => inputs,
    getSnapshot: () => snapshot,
    send(event, sendOptions = {}) {
      if (snapshot.status === 'destroyed') {
        throw createUIFnError({
          code: 'UIFN_CONTROLLER_DESTROYED', package: '@uifn/core', component: definition.id,
          message: 'Cannot mutate a destroyed runtime controller.', details: { operation: 'send', eventType: event.type },
        });
      }
      if (snapshot.status !== 'running') {
        throw createUIFnError({
          code: 'UIFN_RUNTIME_NOT_RUNNING', package: '@uifn/core', component: definition.id,
          message: 'Cannot send an event to a runtime service that is not running.', details: { status: snapshot.status, eventType: event.type },
        });
      }
      if (!event || typeof event.type !== 'string' || event.type.length === 0) {
        throw createUIFnError({
          code: 'UIFN_RUNTIME_EVENT_INVALID', package: '@uifn/core', component: definition.id,
          message: 'Runtime events require a non-empty string type.', recoverable: true,
        });
      }
      enqueue({ kind: 'event', event: readonlyEvent(event) as TEvent, options: sendOptions });
    },
    update(patch, updateOptions = {}) {
      if (snapshot.status === 'destroyed') {
        throw createUIFnError({
          code: 'UIFN_CONTROLLER_DESTROYED', package: '@uifn/core', component: definition.id,
          message: 'Cannot update inputs on a destroyed runtime controller.', details: { operation: 'update' },
        });
      }
      if (snapshot.status !== 'running') {
        throw createUIFnError({
          code: 'UIFN_RUNTIME_NOT_RUNNING', package: '@uifn/core', component: definition.id,
          message: 'Cannot update inputs on a runtime service that is not running.', details: { status: snapshot.status },
        });
      }
      const safePatch = Object.freeze({ ...patch });
      const next = safeInputCopy({ ...inputs, ...safePatch } as TInputs);
      validateInputs(next);
      if (!processing && changedInputKeys(inputs, next).length === 0) return;
      enqueue({ kind: 'inputs', patch: safePatch, options: updateOptions });
    },
    setRef(key, value) {
      if (snapshot.status === 'destroyed') {
        throw createUIFnError({
          code: 'UIFN_CONTROLLER_DESTROYED', package: '@uifn/core', component: definition.id,
          message: 'Cannot update refs on a destroyed runtime controller.', details: { operation: 'setRef', key: String(key) },
        });
      }
      if (!processing && Object.is(refs.get(key), value)) return;
      enqueue({ kind: 'ref', key, value: value as TRefs[keyof TRefs] | undefined });
    },
    getRef,
    subscribe(subscriber, subscribeOptions = {}) {
      const selector = subscribeOptions.selector ?? ((value: RuntimeSnapshot<TState, TContext, TComputed>) => value as unknown);
      const equality = subscribeOptions.equality ?? Object.is;
      const record: Subscription<RuntimeSnapshot<TState, TContext, TComputed>, TEvent> = {
        listener: subscriber as Subscription<RuntimeSnapshot<TState, TContext, TComputed>, TEvent>['listener'],
        selector,
        equality,
        selected: selector(snapshot),
        active: true,
      };
      subscriptions.add(record);
      if (subscribeOptions.emitInitial ?? true) {
        try {
          subscriber(record.selected as never);
        } catch (error) {
          const normalized = normalizeRuntimeError(error, 'subscriber-initial', definition.id);
          __UIFN_DEV_TRACE__ && emitTrace({ kind: 'listener-error', operation: 'initial-isolated', code: normalized.code, status: snapshot.status });
        }
      }
      return once(() => {
        record.active = false;
        subscriptions.delete(record);
      });
    },
    spawnChild(key, childDefinition, childInputs, childOptions: RuntimeChildOptions = {}) {
      if (children.has(key)) {
        throw createUIFnError({
          code: 'UIFN_RUNTIME_CHILD_DUPLICATE', package: '@uifn/core', component: definition.id,
          message: 'Runtime child keys must be unique within a service.', details: { key },
        });
      }
      const child = createRuntimeService(childDefinition, childInputs, { scope: scope.child(key) });
      const errorPolicy = childOptions.errorPolicy ?? 'isolate';
      const unsubscribe = child.subscribe((childState) => {
        if (destroying) return;
        enqueue({
          kind: 'child', key, status: childState.status,
          version: childState.version, errorPolicy,
        });
      }, { emitInitial: false });
      children.set(key, {
        service: child as RuntimeService<object, unknown, unknown, RuntimeEvent, unknown, object>,
        unsubscribe,
        errorPolicy,
      });
      __UIFN_DEV_TRACE__ && emitTrace({ kind: 'child', operation: 'spawn', status: snapshot.status, details: { key, childDefinition: childDefinition.id } });
      enqueue({ kind: 'child', key, status: child.status, version: child.getSnapshot().version, errorPolicy });
      return child;
    },
    stop(reason = 'stop') {
      if (snapshot.status === 'destroyed' || snapshot.status === 'stopped') return;
      queue.length = 0;
      disposeAll(reason);
      const event = { type: '@@uifn.stop' } as TEvent;
      publish({ state, context, computed, status: 'stopped' }, event, { source: 'system', reason, action: 'stop' });
    },
    destroy() {
      if (snapshot.status === 'destroyed') return;
      destroying = true;
      queue.length = 0;
      disposeAll('destroy');
      const previousSnapshot = snapshot;
      transactionSequence += 1;
      snapshot = makeSnapshot(previousSnapshot.version + 1, 'destroyed');
      const event = readonlyEvent({ type: '@@uifn.destroy' } as TEvent);
      const meta = deepFreeze({
        transactionId: transactionSequence,
        event,
        action: 'destroy',
        source: 'system' as const,
        reason: 'destroy',
        previousSnapshot,
        nextSnapshot: snapshot,
        changedKeys: Object.freeze(['status', 'children']),
        timestamp: scope.scheduler.now(),
      }) as RuntimeChangeMeta<TEvent, TState, TContext, TComputed>;
      __UIFN_DEV_TRACE__ && emitTrace({
        kind: 'service', operation: 'destroy', transactionId: meta.transactionId,
        eventType: event.type, source: 'system', reason: 'destroy',
        previousVersion: previousSnapshot.version, nextVersion: snapshot.version,
        changedKeys: meta.changedKeys, status: snapshot.status,
      });
      destroying = false;
      notify(meta);
      subscriptions.clear();
      scope.instrumentation?.onServiceDestroy?.(definition.id, scope.id);
    },
    getTrace: () => trace.snapshot(),
    getResourceCounts() {
      const counts = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, 0])) as Record<RuntimeResourceKind, number>;
      counts.effect = effects.size;
      counts.activity = activities.size;
      counts['child-service'] = children.size;
      for (const resource of resources.values()) counts[resource.kind] += 1;
      return Object.freeze(counts);
    },
  };

  scope.instrumentation?.onServiceCreate?.(definition.id, scope.id);
  __UIFN_DEV_TRACE__ && emitTrace({ kind: 'service', operation: 'create', status: snapshot.status });
  try {
    reconcileActivities();
    for (const effect of definition.startEffects ?? []) startOwnedEffect('effect', effect.key, effect.run);
  } catch (error) {
    if (!isUIFnError(error)) throw handleError(error, 'start');
    throw error;
  }
  return service;
}
