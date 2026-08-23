import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomScope } from './scope';

export type UIFnPresenceState =
  | 'unmounted'
  | 'entering'
  | 'entered'
  | 'exiting'
  | 'exited';

export interface UIFnPresenceOptions {
  readonly element: HTMLElement | (() => HTMLElement | null);
  readonly present: boolean;
  readonly forceMount?: boolean;
  readonly initialAnimation?: boolean;
  readonly onStateChange?: (state: UIFnPresenceState) => void;
}

export interface UIFnPresence {
  readonly state: UIFnPresenceState;
  readonly mounted: boolean;
  readonly destroyed: boolean;
  update(options: Partial<UIFnPresenceOptions>): void;
  subscribe(callback: (state: UIFnPresenceState) => void): () => void;
  destroy(): void;
}

function resolveElement(options: UIFnPresenceOptions): HTMLElement | null {
  return typeof options.element === 'function' ? options.element() : options.element;
}

function parseTimeList(value: string): number[] {
  return value.split(',').map((entry) => {
    const trimmed = entry.trim();
    const value = Number.parseFloat(trimmed);
    if (!Number.isFinite(value)) return 0;
    return trimmed.endsWith('ms') ? value : value * 1_000;
  });
}

function motionList(
  names: string[],
  durations: number[],
  delays: number[],
): { duration: number; count: number } {
  let maximum = 0;
  let active = 0;
  for (let index = 0; index < names.length; index += 1) {
    const total = (durations[index % durations.length] ?? 0)
      + (delays[index % delays.length] ?? 0);
    maximum = Math.max(maximum, total);
    if (names[index] !== 'none' && total > 0) active += 1;
  }
  return { duration: maximum, count: active };
}

function motionPlan(scope: UIFnDomScope, element: HTMLElement) {
  if (scope.environment.prefersReducedMotion()) return { duration: 0, animations: 0, transitions: 0 };
  const style = scope.window.getComputedStyle(element);
  const animation = motionList(
    style.animationName.split(',').map((entry) => entry.trim()),
    parseTimeList(style.animationDuration),
    parseTimeList(style.animationDelay),
  );
  const transition = motionList(
    style.transitionProperty.split(',').map((entry) => entry.trim()),
    parseTimeList(style.transitionDuration),
    parseTimeList(style.transitionDelay),
  );
  return {
    duration: Math.max(animation.duration, transition.duration),
    animations: animation.count,
    transitions: transition.count,
  };
}

export function createUIFnPresence(
  scope: UIFnDomScope,
  initialOptions: UIFnPresenceOptions,
): UIFnPresence {
  scope.assertAlive('create presence');
  let options = initialOptions;
  let state: UIFnPresenceState = options.present
    ? options.initialAnimation ? 'unmounted' : 'entered'
    : options.forceMount ? 'exited' : 'unmounted';
  let destroyed = false;
  let cancelCompletion = () => undefined;
  const subscribers = new Set<(state: UIFnPresenceState) => void>();
  const releaseResource = scope.track('presence');

  const publish = (next: UIFnPresenceState) => {
    state = next;
    resolveElement(options)?.setAttribute('data-uifn-presence', next);
    options.onStateChange?.(next);
    subscribers.forEach((subscriber) => subscriber(next));
    scope.environment.trace({
      kind: 'dom-presence',
      operation: next,
      timestamp: scope.environment.now(),
    });
  };

  const completeAfterMotion = (expected: UIFnPresenceState, complete: UIFnPresenceState) => {
    cancelCompletion();
    const element = resolveElement(options);
    const plan = element ? motionPlan(scope, element) : { duration: 0, animations: 0, transitions: 0 };
    const duration = plan.duration;
    if (!element || duration <= 0) {
      publish(complete);
      return;
    }
    let active = true;
    let animations = plan.animations;
    let transitions = plan.transitions;
    const finish = () => {
      if (!active || destroyed || state !== expected) return;
      active = false;
      releaseEvents();
      releaseTimer();
      publish(complete);
    };
    const onEnd = (event: Event) => {
      if (event.target !== element) return;
      if (event.type.startsWith('animation')) animations = Math.max(0, animations - 1);
      else transitions = Math.max(0, transitions - 1);
      if (animations + transitions === 0) finish();
    };
    element.addEventListener('animationend', onEnd);
    element.addEventListener('animationcancel', onEnd);
    element.addEventListener('transitionend', onEnd);
    element.addEventListener('transitioncancel', onEnd);
    const releaseEvents = scope.track('listener', () => {
      element.removeEventListener('animationend', onEnd);
      element.removeEventListener('animationcancel', onEnd);
      element.removeEventListener('transitionend', onEnd);
      element.removeEventListener('transitioncancel', onEnd);
    });
    const releaseTimer = scope.setTimeout(finish, Math.ceil(duration) + 50);
    cancelCompletion = () => {
      if (!active) return;
      active = false;
      releaseEvents();
      releaseTimer();
    };
  };

  const transition = (present: boolean, initial = false) => {
    cancelCompletion();
    if (present) {
      if (state === 'entered' || state === 'entering') return;
      if (initial && options.initialAnimation === false) {
        publish('entered');
        return;
      }
      publish('entering');
      completeAfterMotion('entering', 'entered');
      return;
    }
    if (state === 'unmounted' || state === 'exited' || state === 'exiting') return;
    publish('exiting');
    completeAfterMotion('exiting', options.forceMount ? 'exited' : 'unmounted');
  };

  if (options.present && options.initialAnimation) transition(true, true);
  else resolveElement(options)?.setAttribute('data-uifn-presence', state);

  return {
    get state() {
      return state;
    },
    get mounted() {
      return state !== 'unmounted';
    },
    get destroyed() {
      return destroyed;
    },
    update(next) {
      scope.assertAlive('update presence');
      if (destroyed) {
        throw createUIFnError({
          code: 'UIFN_DOM_SERVICE_DESTROYED',
          package: '@uifn/dom',
          component: 'Presence',
          message: 'Cannot update a destroyed presence service.',
        });
      }
      const previousPresent = options.present;
      const previousForceMount = options.forceMount;
      options = { ...options, ...next };
      if (previousPresent !== options.present) transition(options.present);
      else if (!options.present && previousForceMount !== options.forceMount) {
        publish(options.forceMount ? 'exited' : 'unmounted');
      }
    },
    subscribe(callback) {
      scope.assertAlive('subscribe to presence');
      if (destroyed) throw createUIFnError({
        code: 'UIFN_DOM_SERVICE_DESTROYED',
        package: '@uifn/dom',
        component: 'Presence',
        message: 'Cannot subscribe to a destroyed presence service.',
      });
      subscribers.add(callback);
      callback(state);
      return () => subscribers.delete(callback);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelCompletion();
      resolveElement(options)?.removeAttribute('data-uifn-presence');
      subscribers.clear();
      releaseResource();
    },
  };
}
