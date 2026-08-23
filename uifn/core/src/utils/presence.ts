export interface PresenceSnapshot {
  present: boolean;
  wasPresent: boolean;
  hasAnimation: boolean;
  hasTransition: boolean;
}

export type PresenceState = 'mounted' | 'unmount-suspended' | 'unmounted';

export interface PresenceMotion {
  hasAnimation: boolean;
  hasTransition: boolean;
}

export interface PresenceManagerState {
  present: boolean;
  state: PresenceState;
  reducedMotion: boolean;
  timers: number;
  listeners: number;
  cleanupComplete: boolean;
}

export interface PresenceManager {
  getState: () => PresenceManagerState;
  setPresent: (
    present: boolean,
    motion?: PresenceMotion
  ) => PresenceManagerState;
  registerTimer: () => PresenceManagerState;
  clearTimer: () => PresenceManagerState;
  registerListener: () => PresenceManagerState;
  clearListener: () => PresenceManagerState;
  cleanup: () => PresenceManagerState;
  destroy: () => void;
}

export interface PresenceManagerOptions {
  reducedMotion?: boolean;
}

export function shouldSuspendUnmount(snapshot: PresenceSnapshot): boolean {
  return (
    snapshot.wasPresent &&
    !snapshot.present &&
    (snapshot.hasAnimation || snapshot.hasTransition)
  );
}

export function resolvePresenceState(snapshot: PresenceSnapshot): PresenceState {
  if (snapshot.present) {
    return 'mounted';
  }

  if (shouldSuspendUnmount(snapshot)) {
    return 'unmount-suspended';
  }

  return 'unmounted';
}

export function createPresenceManager(
  present: boolean,
  options: PresenceManagerOptions = {}
): PresenceManager {
  type PresenceEvent = RuntimeEvent & {
    type: 'SET_PRESENT' | 'REGISTER_TIMER' | 'CLEAR_TIMER' | 'REGISTER_LISTENER' | 'CLEAR_LISTENER' | 'CLEANUP';
    present?: boolean;
    motion?: PresenceMotion;
  };
  const initialContext: PresenceManagerState = {
    present,
    state: present ? 'mounted' : 'unmounted',
    reducedMotion: options.reducedMotion ?? false,
    timers: 0,
    listeners: 0,
    cleanupComplete: !present,
  };
  const withCleanup = (state: PresenceManagerState): PresenceManagerState => ({
    ...state,
    cleanupComplete: !state.present && state.timers === 0 && state.listeners === 0,
  });
  const definition: RuntimeDefinition<Record<string, never>, PresenceManagerState, 'active', PresenceEvent> = {
    id: 'presence-manager',
    initialState: 'active',
    initialContext,
    transitions: {
      SET_PRESENT: {
        reduce: ({ context, event }) => {
          const nextPresent = event.present ?? false;
          const hasAnimation = context.reducedMotion ? false : event.motion?.hasAnimation ?? false;
          const hasTransition = context.reducedMotion ? false : event.motion?.hasTransition ?? false;
          return {
            context: withCleanup({
              ...context,
              present: nextPresent,
              state: resolvePresenceState({ present: nextPresent, wasPresent: context.present, hasAnimation, hasTransition }),
            }),
            reason: 'presence-updated',
            action: 'set-present',
          };
        },
      },
      REGISTER_TIMER: {
        reduce: ({ context }) => ({ context: withCleanup({ ...context, timers: context.timers + 1 }), reason: 'timer-registered', action: 'register-timer' }),
      },
      CLEAR_TIMER: {
        reduce: ({ context }) => ({ context: withCleanup({ ...context, timers: Math.max(0, context.timers - 1) }), reason: 'timer-cleared', action: 'clear-timer' }),
      },
      REGISTER_LISTENER: {
        reduce: ({ context }) => ({ context: withCleanup({ ...context, listeners: context.listeners + 1 }), reason: 'listener-registered', action: 'register-listener' }),
      },
      CLEAR_LISTENER: {
        reduce: ({ context }) => ({ context: withCleanup({ ...context, listeners: Math.max(0, context.listeners - 1) }), reason: 'listener-cleared', action: 'clear-listener' }),
      },
      CLEANUP: {
        reduce: ({ context }) => ({
          context: withCleanup({ ...context, timers: 0, listeners: 0, state: context.present ? 'mounted' : 'unmounted' }),
          reason: 'presence-cleanup',
          action: 'cleanup',
        }),
      },
    },
  };
  const service = createRuntimeService(definition, {}, {
    scope: createRuntimeScope({ id: 'presence-manager', mode: 'production' }),
  });
  const getState = (): PresenceManagerState => ({ ...service.getSnapshot().context });
  const send = (event: PresenceEvent) => {
    service.send(event, { source: 'programmatic', reason: event.type.toLowerCase().replace(/_/g, '-') });
    return getState();
  };

  return {
    getState,
    setPresent(nextPresent, motion) {
      return send({ type: 'SET_PRESENT', present: nextPresent, motion });
    },
    registerTimer() {
      return send({ type: 'REGISTER_TIMER' });
    },
    clearTimer() {
      return send({ type: 'CLEAR_TIMER' });
    },
    registerListener() {
      return send({ type: 'REGISTER_LISTENER' });
    },
    clearListener() {
      return send({ type: 'CLEAR_LISTENER' });
    },
    cleanup() {
      return send({ type: 'CLEANUP' });
    },
    destroy() {
      service.destroy();
    },
  };
}
import { createRuntimeService } from '../internal/runtime/service';
import { createRuntimeScope } from '../internal/runtime/scope';
import type { RuntimeDefinition, RuntimeEvent } from '../internal/runtime/types';
