import { describe, expect, it, vi } from 'vitest';
import {
  copyTextToClipboard,
  getMediaQuerySnapshot,
  subscribeMediaQuery,
  type HookEnvironment,
  type MediaQueryChangeLike,
} from './hooks';

function createMatchMediaEnvironment(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryChangeLike) => void>();
  const addEventListener = vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => {
    listeners.add(listener);
  });
  const removeEventListener = vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => {
    listeners.delete(listener);
  });

  const environment: HookEnvironment = {
    matchMedia: vi.fn(() => ({
      matches: initialMatches,
      addEventListener,
      removeEventListener,
    })),
  };

  return {
    environment,
    addEventListener,
    removeEventListener,
    emit(matches: boolean) {
      listeners.forEach((listener) => listener({ matches }));
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

describe('adapter-kit hook behavior', () => {
  it('uses an SSR-safe media query fallback without environment access', () => {
    expect(getMediaQuerySnapshot('(min-width: 768px)', { environment: null })).toBe(false);
    expect(getMediaQuerySnapshot('(min-width: 768px)', { defaultValue: true, environment: {} })).toBe(true);
  });

  it('subscribes to media query changes and cleans up listeners exactly once', () => {
    const media = createMatchMediaEnvironment(false);
    const onChange = vi.fn();

    const subscription = subscribeMediaQuery('(min-width: 768px)', onChange, {
      environment: media.environment,
    });

    expect(subscription.value).toBe(false);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(1);

    media.emit(true);
    expect(onChange).toHaveBeenCalledWith(true);

    subscription.unsubscribe();
    subscription.unsubscribe();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(0);
  });

  it('returns explicit clipboard success and failure results', async () => {
    await expect(
      copyTextToClipboard('missing', { environment: {} })
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'clipboard-unavailable',
      },
    });

    await expect(
      copyTextToClipboard('denied', {
        environment: {
          clipboard: {
            writeText: vi.fn(async () => {
              throw new Error('denied');
            }),
          },
        },
      })
    ).resolves.toMatchObject({
      ok: false,
      text: 'denied',
      error: {
        code: 'clipboard-write-failed',
      },
    });

    await expect(
      copyTextToClipboard('copied', {
        environment: {
          clipboard: {
            writeText: vi.fn(async () => undefined),
          },
        },
      })
    ).resolves.toEqual({
      ok: true,
      text: 'copied',
      error: null,
    });
  });
});
