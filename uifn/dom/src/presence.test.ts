import { describe, expect, it, vi } from 'vitest';
import { createUIFnPresence } from './presence';
import type { UIFnDomScope } from './scope';

function fixture(style: Partial<CSSStyleDeclaration>) {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const timers: Array<{ callback: () => void; delay: number }> = [];
  const element = {
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener(type: string, callback: (event: Event) => void) {
      const callbacks = listeners.get(type) ?? new Set();
      callbacks.add(callback);
      listeners.set(type, callbacks);
    },
    removeEventListener(type: string, callback: (event: Event) => void) {
      listeners.get(type)?.delete(callback);
    },
  } as unknown as HTMLElement;
  const scope = {
    assertAlive: vi.fn(),
    track: (_kind: string, cleanup = () => undefined) => {
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        cleanup();
      };
    },
    setTimeout: vi.fn((callback: () => void, delay: number) => {
      timers.push({ callback, delay });
      return () => undefined;
    }),
    window: { getComputedStyle: () => style },
    environment: { now: () => 0, trace: vi.fn(), prefersReducedMotion: () => false },
  } as unknown as UIFnDomScope;
  const dispatch = (type: string) => listeners.get(type)?.forEach((callback) => callback({ type, target: element } as unknown as Event));
  return { element, scope, timers, dispatch };
}

describe('createUIFnPresence', () => {
  it('waits for every declared motion and the longest duration', () => {
    const test = fixture({
      animationName: 'none', animationDuration: '0s', animationDelay: '0s',
      transitionProperty: 'opacity, transform', transitionDuration: '10ms, 100ms', transitionDelay: '0ms, 0ms',
    });
    const presence = createUIFnPresence(test.scope, { element: test.element, present: true });

    presence.update({ present: false });
    expect(test.timers[0]?.delay).toBe(150);
    test.dispatch('transitionend');
    expect(presence.state).toBe('exiting');
    test.dispatch('transitionend');
    expect(presence.state).toBe('unmounted');
  });

  it('ignores excess duration entries beyond the motion-property list', () => {
    const test = fixture({
      animationName: 'none', animationDuration: '0s', animationDelay: '0s',
      transitionProperty: 'opacity', transitionDuration: '10ms, 100ms', transitionDelay: '0ms',
    });
    const presence = createUIFnPresence(test.scope, { element: test.element, present: true });

    presence.update({ present: false });
    expect(test.timers[0]?.delay).toBe(60);
    test.dispatch('transitionend');
    expect(presence.state).toBe('unmounted');
  });

  it('falls back to the longest-motion timeout when no event arrives', () => {
    const test = fixture({
      animationName: 'none', animationDuration: '0s', animationDelay: '0s',
      transitionProperty: 'transform', transitionDuration: '100ms', transitionDelay: '20ms',
    });
    const presence = createUIFnPresence(test.scope, { element: test.element, present: true });

    presence.update({ present: false });
    expect(test.timers[0]?.delay).toBe(170);
    test.timers[0]?.callback();
    expect(presence.state).toBe('unmounted');
  });
});
