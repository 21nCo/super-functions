import { describe, expect, it, vi } from 'vitest';
import { createUIFnPresence } from './presence';
import type { UIFnDomScope } from './scope';

describe('createUIFnPresence', () => {
  it('waits for the longest motion before completing', () => {
    let now = 0;
    const listeners = new Map<string, Set<(event: Event) => void>>();
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
      setTimeout: vi.fn(() => () => undefined),
      window: {
        getComputedStyle: () => ({
          animationDuration: '0s', animationDelay: '0s',
          transitionDuration: '10ms, 100ms', transitionDelay: '0ms, 0ms',
        }),
      },
      environment: {
        now: () => now,
        trace: vi.fn(),
        prefersReducedMotion: () => false,
      },
    } as unknown as UIFnDomScope;
    const presence = createUIFnPresence(scope, { element, present: true });

    presence.update({ present: false });
    expect(presence.state).toBe('exiting');
    now = 10;
    listeners.get('transitionend')?.forEach((callback) => callback({ type: 'transitionend', target: element } as unknown as Event));
    expect(presence.state).toBe('exiting');
    now = 100;
    listeners.get('transitionend')?.forEach((callback) => callback({ type: 'transitionend', target: element } as unknown as Event));
    expect(presence.state).toBe('unmounted');
  });
});
