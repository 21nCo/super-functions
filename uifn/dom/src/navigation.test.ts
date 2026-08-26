import { describe, expect, it, vi } from 'vitest';
import type { UIFnChangeMeta } from '@uifn/core';
import { createUIFnRovingFocusDomBinding } from './navigation';

describe('roving focus DOM ownership', () => {
  it('moves focus for keyboard navigation without stealing it for programmatic values', () => {
    const frames: Array<(timestamp: number) => void> = [];
    let subscriber: ((state: Readonly<{ active: string }>, meta?: Readonly<UIFnChangeMeta<any, { active: string }>>) => void) | undefined;
    const state = { active: 'second' };
    const focus = vi.fn();
    const element = { isConnected: true, focus } as unknown as HTMLElement;
    const platform = {
      scope: {
        assertAlive: vi.fn(),
        getActiveElement: () => null,
        requestAnimationFrame(callback: (timestamp: number) => void) {
          frames.push(callback);
          return () => undefined;
        },
      },
    };
    const controller = {
      getState: () => state,
      subscribe(callback: typeof subscriber) {
        subscriber = callback;
        return () => undefined;
      },
    };

    const binding = createUIFnRovingFocusDomBinding({
      platform: platform as never,
      controller,
      getActiveKey: (current) => current.active,
      getElement: () => element,
      focusInitial: false,
    });

    subscriber?.(state);
    subscriber?.(state, { inputModality: 'pointer' } as UIFnChangeMeta<any, { active: string }>);
    binding.update();
    expect(frames).toHaveLength(0);
    expect(focus).not.toHaveBeenCalled();

    subscriber?.(state, { inputModality: 'keyboard' } as UIFnChangeMeta<any, { active: string }>);
    expect(frames).toHaveLength(1);
    frames.shift()?.(0);
    expect(focus).toHaveBeenCalledOnce();

    binding.destroy();
  });
});
