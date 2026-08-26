import type { ChangeMeta } from '../../primitives/shared';
import { createRuntimeScope } from './scope';
import { createRuntimeService } from './service';
import type { RuntimeDefinition, RuntimeEvent } from './types';

type StateChannelSubscriber<TState, TValue = unknown> = (
  state: TState,
  meta?: ChangeMeta<TValue>,
) => void;

export interface StateChannel<TState, TValue = unknown> {
  getState(): TState;
  setState(nextState: TState, meta?: ChangeMeta<TValue>): void;
  patchState(partial: Partial<TState>, meta?: ChangeMeta<TValue>): void;
  subscribe(listener: StateChannelSubscriber<TState, TValue>): () => void;
  destroy(): void;
}

interface StateChannelContext<TState> {
  value: TState;
}

interface StateChannelEvent<TState, TValue> extends RuntimeEvent {
  readonly type: 'SET';
  readonly nextState: TState;
  readonly changeMeta?: ChangeMeta<TValue>;
}

function shallowEqualState<TState>(left: TState, right: TState): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftRecord = left as Record<PropertyKey, unknown>;
  const rightRecord = right as Record<PropertyKey, unknown>;
  const leftKeys = Reflect.ownKeys(leftRecord);
  const rightKeys = Reflect.ownKeys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && Object.is(leftRecord[key], rightRecord[key]));
}

/** Private bridge used while primitive reducers move onto the canonical runtime. */
export function createStateChannel<TState, TValue = unknown>(
  initialState: TState,
): StateChannel<TState, TValue> {
  const definition: RuntimeDefinition<
    Record<string, never>,
    StateChannelContext<TState>,
    'active',
    StateChannelEvent<TState, TValue>
  > = {
    id: 'primitive-state-channel',
    initialState: 'active',
    initialContext: { value: initialState },
    transitions: {
      SET: {
        reduce: ({ event }) => ({
          context: { value: event.nextState },
          reason: event.changeMeta?.reason ?? 'state-channel-update',
          action: 'set-state',
          requestedValue: event.changeMeta?.nextValue,
        }),
      },
    },
  };
  const service = createRuntimeService(definition, {}, {
    scope: createRuntimeScope({ id: 'primitive-state-channel', mode: 'production' }),
  });
  let projectedState = initialState;

  const getState = () => service.getSnapshot().context.value as TState;
  const setState = (nextState: TState, meta?: ChangeMeta<TValue>) => {
    // Re-entrant DOM bindings enqueue while the runtime is still notifying
    // subscribers. Compare and merge against the queued tail, not only the
    // currently published snapshot: `opening -> open` must retain both FIFO
    // transitions even when the published snapshot is already `open`.
    if (shallowEqualState(projectedState, nextState)) return;
    const previousProjectedState = projectedState;
    projectedState = nextState;
    try {
      service.send(
        { type: 'SET', nextState, changeMeta: meta },
        {
          source: meta?.source ?? 'programmatic',
          reason: meta?.reason ?? 'state-channel-update',
          inputModality: meta?.inputModality,
          requestedValue: meta?.nextValue,
        },
      );
    } catch (error) {
      projectedState = shallowEqualState(getState(), previousProjectedState)
        ? previousProjectedState
        : getState();
      throw error;
    }
  };

  return {
    getState,
    setState,
    patchState(partial, meta) {
      setState({ ...projectedState, ...partial }, meta);
    },
    subscribe(listener) {
      return service.subscribe<TState>(
        (value, runtimeMeta) => {
          const stateEvent = runtimeMeta?.event as StateChannelEvent<TState, TValue> | undefined;
          listener(value as TState, stateEvent?.changeMeta);
        },
        {
          emitInitial: false,
          selector: (runtimeSnapshot) => runtimeSnapshot.context.value,
        },
      );
    },
    destroy() {
      service.destroy();
    },
  };
}
