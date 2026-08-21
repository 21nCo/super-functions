import { createRuntimeService } from './service';
import { createRuntimeScope } from './scope';
import type { RuntimeDefinition, RuntimeEvent } from './types';

export interface ControlledValueOptions<TValue> {
  readonly value?: TValue;
  readonly defaultValue: TValue;
  readonly onChange?: (value: TValue) => void;
  readonly isEqual?: (a: TValue, b: TValue) => boolean;
}

export interface ControlledValueResult<TValue> {
  readonly value: TValue;
  readonly changed: boolean;
  readonly controlled: boolean;
}

export interface ControlledValue<TValue> {
  isControlled(): boolean;
  getValue(): TValue;
  requestValue(nextValue: TValue): ControlledValueResult<TValue>;
  syncValue(nextValue: TValue): ControlledValueResult<TValue>;
  destroy(): void;
}

interface ControlledValueEvent<TValue> extends RuntimeEvent {
  readonly type: 'REQUEST' | 'SYNC';
  readonly nextValue: TValue;
}

/** Private controlled/uncontrolled policy shared by primitive definitions. */
export function createControlledValue<TValue>(
  options: ControlledValueOptions<TValue>,
): ControlledValue<TValue> {
  const controlled = options.value !== undefined;
  const isEqual = options.isEqual ?? Object.is;
  const definition: RuntimeDefinition<
    Record<string, never>,
    { value: TValue },
    'active',
    ControlledValueEvent<TValue>
  > = {
    id: 'controlled-value',
    initialState: 'active',
    initialContext: { value: controlled ? (options.value as TValue) : options.defaultValue },
    transitions: {
      REQUEST: {
        reduce: ({ context, event }) => ({
          context: controlled ? context as { value: TValue } : { value: event.nextValue },
          reason: 'value-requested',
          action: 'request-value',
          requestedValue: event.nextValue,
        }),
      },
      SYNC: {
        reduce: ({ event }) => ({
          context: { value: event.nextValue },
          reason: 'controlled-value-synced',
          action: 'sync-value',
          requestedValue: event.nextValue,
        }),
      },
    },
  };
  const service = createRuntimeService(definition, {}, {
    scope: createRuntimeScope({ id: 'controlled-value', mode: 'production' }),
  });
  const getValue = () => service.getSnapshot().context.value as TValue;

  return {
    isControlled: () => controlled,
    getValue,
    requestValue(nextValue) {
      const previousValue = getValue();
      const changed = !isEqual(previousValue, nextValue);
      service.send(
        { type: 'REQUEST', nextValue },
        {
          source: 'user',
          reason: 'value-requested',
          action: 'request-value',
          requestedValue: nextValue,
        },
      );
      if (changed) options.onChange?.(nextValue);
      return { value: getValue(), changed, controlled };
    },
    syncValue(nextValue) {
      const previousValue = getValue();
      const changed = !isEqual(previousValue, nextValue);
      service.send(
        { type: 'SYNC', nextValue },
        {
          source: 'controlled-sync',
          reason: 'controlled-value-synced',
          action: 'sync-value',
          requestedValue: nextValue,
        },
      );
      return { value: getValue(), changed, controlled };
    },
    destroy() {
      service.destroy();
    },
  };
}
