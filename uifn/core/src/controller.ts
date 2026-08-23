import { createUIFnError } from './errors';
import {
  changedObjectKeys,
  immutableSerializable,
  structuralEqual,
} from './internal/runtime/immutable';
import type { UIFnPartProps } from './parts';

export interface UIFnEvent {
  readonly type: string;
}

export type UIFnControllerStatus =
  | 'idle'
  | 'running'
  | 'stopped'
  | 'done'
  | 'error'
  | 'destroyed';

export type UIFnChangeSource =
  | 'user'
  | 'programmatic'
  | 'controlled-sync'
  | 'effect'
  | 'system';

export type UIFnInputModality = 'keyboard' | 'pointer' | 'touch' | 'virtual';

export interface UIFnSnapshot<TState> {
  readonly version: number;
  readonly status: UIFnControllerStatus;
  readonly state: Readonly<TState>;
}

export interface UIFnChangeMeta<
  TEvent extends UIFnEvent = UIFnEvent,
  TState = unknown,
> {
  readonly transactionId: number;
  readonly event: Readonly<TEvent>;
  readonly source: UIFnChangeSource;
  readonly reason: string;
  readonly inputModality?: UIFnInputModality;
  readonly previousSnapshot: Readonly<UIFnSnapshot<TState>>;
  readonly nextSnapshot: Readonly<UIFnSnapshot<TState>>;
  readonly changedKeys: readonly string[];
  readonly requestedValue?: unknown;
  readonly timestamp: number;
}

export type UIFnSubscriber<
  TValue,
  TEvent extends UIFnEvent = UIFnEvent,
  TState = TValue,
> = (value: Readonly<TValue>, meta?: Readonly<UIFnChangeMeta<TEvent, TState>>) => void;

export interface UIFnSubscribeOptions<TState, TSelected = TState> {
  readonly selector?: (
    state: Readonly<TState>,
    snapshot: Readonly<UIFnSnapshot<TState>>,
  ) => TSelected;
  readonly equality?: (previous: Readonly<TSelected>, next: Readonly<TSelected>) => boolean;
  readonly emitInitial?: boolean;
}

export type UIFnControllerUnsubscribe = () => void;

export interface UIFnController<
  TState,
  TActions extends object,
  TParts extends object,
  TInputs extends object = Record<string, never>,
  TEvent extends UIFnEvent = UIFnEvent,
> {
  readonly status: UIFnControllerStatus;
  readonly state: Readonly<TState>;
  readonly snapshot: Readonly<UIFnSnapshot<TState>>;
  readonly actions: Readonly<TActions>;
  readonly parts: Readonly<TParts>;
  getState(): Readonly<TState>;
  getSnapshot(): Readonly<UIFnSnapshot<TState>>;
  update(inputs: Partial<TInputs>): void;
  subscribe<TSelected = TState>(
    subscriber: UIFnSubscriber<TSelected, TEvent, TState>,
    options?: UIFnSubscribeOptions<TState, TSelected>,
  ): UIFnControllerUnsubscribe;
  destroy(): void;
}

export interface UIFnControllerBackendMeta<TEvent extends UIFnEvent = UIFnEvent> {
  readonly event?: Readonly<TEvent>;
  readonly source?: UIFnChangeSource;
  readonly reason?: string;
  readonly inputModality?: UIFnInputModality;
  readonly requestedValue?: unknown;
}

export interface UIFnControllerOptions<
  TState,
  TActions extends object,
  TParts extends object,
  TInputs extends object,
  TEvent extends UIFnEvent,
  TBackendMeta = unknown,
> {
  readonly actions: TActions;
  readonly parts: TParts;
  readonly getState: () => TState;
  readonly update: (inputs: Partial<TInputs>) => void;
  readonly subscribe: (
    subscriber: (state: TState, meta?: TBackendMeta) => void,
  ) => UIFnControllerUnsubscribe;
  readonly destroy?: () => void;
  readonly getStatus?: () => Exclude<UIFnControllerStatus, 'destroyed'>;
  readonly now?: () => number;
  readonly normalizeMeta?: (
    meta: TBackendMeta | undefined,
    operation: Readonly<UIFnControllerBackendMeta<TEvent>>,
  ) => Readonly<UIFnControllerBackendMeta<TEvent>>;
}

interface Subscription<TState, TEvent extends UIFnEvent> {
  active: boolean;
  listener: UIFnSubscriber<unknown, TEvent, TState>;
  selector: (state: Readonly<TState>, snapshot: Readonly<UIFnSnapshot<TState>>) => unknown;
  equality: (previous: unknown, next: unknown) => boolean;
  selected: unknown;
}

interface PendingChange<TState, TEvent extends UIFnEvent> {
  snapshot: Readonly<UIFnSnapshot<TState>>;
  meta: Readonly<UIFnChangeMeta<TEvent, TState>>;
}

const DEFAULT_EVENT = Object.freeze({ type: 'controller.change' }) as UIFnEvent;

function once(callback: () => void): () => void {
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    callback();
  };
}

function readonlySnapshot<TState>(
  state: TState,
  version: number,
  status: UIFnControllerStatus,
): Readonly<UIFnSnapshot<TState>> {
  return immutableSerializable({
    version,
    status,
    state,
  }, '$controllerSnapshot') as Readonly<UIFnSnapshot<TState>>;
}

function destroyedError(operation: string): Error {
  return createUIFnError({
    code: 'UIFN_CONTROLLER_DESTROYED',
    package: '@uifn/core',
    component: 'Controller',
    message: `Cannot ${operation} on a destroyed controller.`,
    details: { operation },
  });
}

function operationEvent<TEvent extends UIFnEvent>(
  operation: string,
): Readonly<TEvent> {
  return Object.freeze({ type: operation }) as Readonly<TEvent>;
}

function normalizeBackendMeta<TEvent extends UIFnEvent, TBackendMeta>(
  meta: TBackendMeta | undefined,
  fallback: Readonly<UIFnControllerBackendMeta<TEvent>>,
): Readonly<UIFnControllerBackendMeta<TEvent>> {
  if (!meta || typeof meta !== 'object') return fallback;
  const candidate = meta as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === 'object'
    && typeof (candidate.event as { type?: unknown }).type === 'string'
    ? candidate.event as Readonly<TEvent>
    : fallback.event;
  const source = typeof candidate.source === 'string'
    ? candidate.source as UIFnChangeSource
    : fallback.source;
  const inputModality = typeof candidate.inputModality === 'string'
    ? candidate.inputModality as UIFnInputModality
    : fallback.inputModality;
  return Object.freeze({
    event,
    source,
    reason: typeof candidate.reason === 'string' ? candidate.reason : fallback.reason,
    inputModality,
    requestedValue: candidate.requestedValue ?? candidate.nextValue ?? fallback.requestedValue,
  });
}

function wrapPartResult<T>(result: T, assertRunning: (operation: string) => void): T {
  if (!result || typeof result !== 'object') return result;
  const props = result as UIFnPartProps;
  if (!props.on) return result;
  const on = Object.fromEntries(
    Object.entries(props.on).map(([name, handler]) => [
      name,
      typeof handler !== 'function'
        ? handler
        : (...args: unknown[]) => {
            assertRunning(`run part handler ${name}`);
            return (handler as (...handlerArgs: unknown[]) => unknown)(...args);
          },
    ]),
  );
  return { ...props, on } as T;
}

function guardedParts<TParts extends object>(
  parts: TParts,
  assertRunning: (operation: string) => void,
): Readonly<TParts> {
  const cache = new WeakMap<object, object>();
  const visit = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    const existing = cache.get(value);
    if (existing) return existing;
    const proxy = new Proxy(value, {
      get(target, property, receiver) {
        const result = Reflect.get(target, property, receiver);
        if (property === 'getProps' && typeof result === 'function') {
          return (...args: unknown[]) => wrapPartResult(
            Reflect.apply(result, target, args),
            assertRunning,
          );
        }
        return visit(result);
      },
      set() {
        return false;
      },
      deleteProperty() {
        return false;
      },
    });
    cache.set(value, proxy);
    return proxy;
  };
  return visit(parts) as Readonly<TParts>;
}

export function createUIFnController<
  TState,
  TActions extends object,
  TParts extends object,
  TInputs extends object = Record<string, never>,
  TEvent extends UIFnEvent = UIFnEvent,
  TBackendMeta = unknown,
>(
  options: UIFnControllerOptions<
    TState,
    TActions,
    TParts,
    TInputs,
    TEvent,
    TBackendMeta
  >,
): UIFnController<TState, TActions, TParts, TInputs, TEvent> {
  const now = options.now ?? (() => Date.now());
  const subscriptions = new Set<Subscription<TState, TEvent>>();
  const pendingChanges: PendingChange<TState, TEvent>[] = [];
  let destroyed = false;
  let notifying = false;
  let transactionId = 0;
  let operation: Readonly<UIFnControllerBackendMeta<TEvent>> = Object.freeze({
    event: DEFAULT_EVENT as Readonly<TEvent>,
    source: 'system',
    reason: 'controller-change',
  });
  let snapshot = readonlySnapshot(
    options.getState(),
    0,
    options.getStatus?.() ?? 'running',
  );

  const assertRunning = (name: string) => {
    if (destroyed) throw destroyedError(name);
  };

  const drain = () => {
    if (notifying) return;
    notifying = true;
    try {
      while (pendingChanges.length > 0) {
        const change = pendingChanges.shift()!;
        for (const subscription of [...subscriptions]) {
          if (!subscription.active) continue;
          const selected = subscription.selector(change.snapshot.state, change.snapshot);
          if (subscription.equality(subscription.selected, selected)) continue;
          subscription.selected = selected;
          try {
            (subscription.listener as (
              value: unknown,
              meta: Readonly<UIFnChangeMeta<TEvent, TState>>,
            ) => void)(selected, change.meta);
          } catch {
            // Subscriber failures are isolated at the controller boundary.
          }
        }
      }
    } finally {
      notifying = false;
    }
  };

  const publish = (nextState: TState, backendMeta?: TBackendMeta, forceStatus?: UIFnControllerStatus) => {
    const nextStatus = forceStatus ?? options.getStatus?.() ?? 'running';
    if (structuralEqual(snapshot.state, nextState) && snapshot.status === nextStatus) return;
    const previousSnapshot = snapshot;
    snapshot = readonlySnapshot(nextState, previousSnapshot.version + 1, nextStatus);
    transactionId += 1;
    const normalized = options.normalizeMeta?.(backendMeta, operation)
      ?? normalizeBackendMeta<TEvent, TBackendMeta>(backendMeta, operation);
    const event = normalized.event ?? operation.event ?? operationEvent<TEvent>('controller.change');
    const meta = immutableSerializable({
      transactionId,
      event,
      source: normalized.source ?? 'system',
      reason: normalized.reason ?? event.type,
      inputModality: normalized.inputModality,
      previousSnapshot,
      nextSnapshot: snapshot,
      changedKeys: changedObjectKeys('state', previousSnapshot.state, snapshot.state),
      requestedValue: normalized.requestedValue,
      timestamp: now(),
    }, '$controllerChangeMeta') as Readonly<UIFnChangeMeta<TEvent, TState>>;
    pendingChanges.push({ snapshot, meta });
    drain();
  };

  const backendUnsubscribe = options.subscribe((state, meta) => publish(state, meta));

  const runOperation = <TResult>(
    nextOperation: Readonly<UIFnControllerBackendMeta<TEvent>>,
    callback: () => TResult,
  ): TResult => {
    assertRunning(nextOperation.reason ?? nextOperation.event?.type ?? 'mutate');
    const previousOperation = operation;
    const previousSnapshot = snapshot;
    operation = nextOperation;
    try {
      const result = callback();
      if (snapshot === previousSnapshot) publish(options.getState());
      return result;
    } finally {
      operation = previousOperation;
    }
  };

  const actions = new Proxy(options.actions, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => runOperation(
        Object.freeze({
          event: operationEvent<TEvent>(`action.${String(property)}`),
          source: 'programmatic',
          reason: String(property),
          requestedValue: args.length === 1 ? args[0] : args.length > 1 ? args : undefined,
        }),
        () => Reflect.apply(value, target, args),
      );
    },
    set() {
      return false;
    },
    deleteProperty() {
      return false;
    },
  }) as Readonly<TActions>;

  const parts = guardedParts(options.parts, assertRunning);

  const controller: UIFnController<TState, TActions, TParts, TInputs, TEvent> = {
    get status() {
      return snapshot.status;
    },
    get state() {
      return snapshot.state;
    },
    get snapshot() {
      return snapshot;
    },
    actions,
    parts,
    getState() {
      return snapshot.state;
    },
    getSnapshot() {
      return snapshot;
    },
    update(inputs) {
      runOperation(
        Object.freeze({
          event: operationEvent<TEvent>('controller.update'),
          source: 'controlled-sync',
          reason: 'controlled-input-sync',
          requestedValue: inputs,
        }),
        () => options.update(Object.freeze({ ...inputs }) as Partial<TInputs>),
      );
    },
    subscribe<TSelected = TState>(
      subscriber: UIFnSubscriber<TSelected, TEvent, TState>,
      subscribeOptions: UIFnSubscribeOptions<TState, TSelected> = {},
    ) {
      const selector = subscribeOptions.selector ?? ((state: Readonly<TState>) => state as unknown as TSelected);
      const selected = selector(snapshot.state, snapshot);
      if (destroyed) {
        if (subscribeOptions.emitInitial ?? true) subscriber(selected);
        return () => undefined;
      }
      const subscription: Subscription<TState, TEvent> = {
        active: true,
        listener: subscriber as UIFnSubscriber<unknown, TEvent, TState>,
        selector,
        equality: (subscribeOptions.equality ?? Object.is) as (
          previous: unknown,
          next: unknown,
        ) => boolean,
        selected,
      };
      subscriptions.add(subscription);
      if (subscribeOptions.emitInitial ?? true) {
        try {
          subscriber(selected);
        } catch {
          // Initial subscriber failures are isolated too.
        }
      }
      return once(() => {
        subscription.active = false;
        subscriptions.delete(subscription);
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        backendUnsubscribe();
      } catch {
        // Teardown continues so one cleanup failure cannot retain other resources.
      }
      try {
        options.destroy?.();
      } catch {
        // The terminal snapshot and subscription cleanup are still mandatory.
      } finally {
        publish(snapshot.state as TState, undefined, 'destroyed');
        subscriptions.clear();
        pendingChanges.length = 0;
      }
    },
  };

  return Object.freeze(controller);
}
