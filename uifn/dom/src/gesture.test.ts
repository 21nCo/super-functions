import { describe, expect, it, vi } from 'vitest';
import type { UIFnDomScope } from './scope';
import { createUIFnRangeGestureDomBinding } from './gesture';

describe('range gesture DOM binding', () => {
  it('refreshes touch-action when a live controller changes orientation', () => {
    const style = { touchAction: '' };
    const element = {
      style,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    } as unknown as HTMLElement;
    const cleanups: Array<() => void> = [];
    const scope = {
      assertAlive: vi.fn(),
      track: vi.fn((_kind, cleanup?: () => void) => {
        const release = cleanup ?? (() => undefined);
        cleanups.push(release);
        return release;
      }),
      environment: { now: () => 0 },
    } as unknown as UIFnDomScope;
    let state = { orientation: 'horizontal' };
    const subscribers = new Set<() => void>();
    const binding = createUIFnRangeGestureDomBinding({
      scope,
      primitive: 'Carousel',
      element,
      controller: {
        actions: {},
        getState: () => state,
        subscribe(subscriber) {
          subscribers.add(subscriber);
          return () => subscribers.delete(subscriber);
        },
      },
    });

    expect(style.touchAction).toBe('pan-y');
    state = { orientation: 'vertical' };
    subscribers.forEach((subscriber) => subscriber());
    expect(style.touchAction).toBe('pan-x');

    binding.destroy();
    expect(style.touchAction).toBe('');
    expect(subscribers.size).toBe(0);
    expect(cleanups).toHaveLength(1);
  });
});
