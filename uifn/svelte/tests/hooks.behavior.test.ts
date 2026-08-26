import type { HookEnvironment, MediaQueryChangeLike } from '@uifn/dom';
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { copyToClipboardAction, createCopyToClipboard } from '../lib/hooks/copy-to-clipboard.js';
import { createMediaQuery } from '../lib/hooks/media-query.js';

function createMediaEnvironment(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryChangeLike) => void>();
  const queryList = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => {
      listeners.delete(listener);
    }),
  };
  const environment: HookEnvironment = {
    matchMedia: vi.fn(() => queryList),
  };

  return {
    environment,
    queryList,
    emit(matches: boolean) {
      queryList.matches = matches;
      listeners.forEach((listener) => listener({ matches }));
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

async function flushMicrotasks() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe('Svelte hook equivalents', () => {
  it('uses the configured media-query fallback without matchMedia access', () => {
    const matches = createMediaQuery('(min-width: 768px)', {
      defaultValue: true,
      environment: {},
    });

    expect(get(matches)).toBe(true);
  });

  it('subscribes to media-query changes and removes the listener on unsubscribe', () => {
    const media = createMediaEnvironment(false);
    const matches = createMediaQuery('(min-width: 768px)', {
      environment: media.environment,
    });
    const values: boolean[] = [];

    const unsubscribe = matches.subscribe((value) => values.push(value));

    expect(values.at(-1)).toBe(false);
    expect(media.queryList.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(1);

    media.emit(true);
    expect(values.at(-1)).toBe(true);

    unsubscribe();
    expect(media.queryList.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(0);
  });

  it('reports unavailable, rejected, successful, and reset clipboard states', async () => {
    const missing = createCopyToClipboard({ environment: {} });
    await expect(missing.copy('missing')).resolves.toMatchObject({
      ok: false,
      error: { code: 'clipboard-unavailable' },
    });
    expect(get(missing.status)).toBe('error');
    expect(get(missing.error)?.code).toBe('clipboard-unavailable');

    const rejectedWrite = vi.fn(async () => {
      throw new Error('denied');
    });
    const rejected = createCopyToClipboard({
      environment: { clipboard: { writeText: rejectedWrite } },
    });
    await rejected.copy('denied');
    expect(get(rejected.status)).toBe('error');
    expect(get(rejected.error)?.code).toBe('clipboard-write-failed');
    expect(rejectedWrite).toHaveBeenCalledWith('denied');

    const successfulWrite = vi.fn(async () => undefined);
    const successful = createCopyToClipboard({
      environment: { clipboard: { writeText: successfulWrite } },
    });
    await successful.copy('copied');
    expect(get(successful.status)).toBe('success');
    expect(get(successful.copiedText)).toBe('copied');

    successful.reset();
    expect(get(successful.status)).toBe('idle');
    expect(get(successful.copiedText)).toBeNull();
    expect(get(successful.error)).toBeNull();
  });

  it('cleans up the clipboard action click listener on destroy', async () => {
    const successfulWrite = vi.fn(async () => undefined);
    const onResult = vi.fn();
    const node = document.createElement('button');
    node.textContent = 'fallback text';

    const action = copyToClipboardAction(node, {
      environment: { clipboard: { writeText: successfulWrite } },
      text: () => 'first',
      onResult,
    });

    node.click();
    await flushMicrotasks();
    expect(successfulWrite).toHaveBeenCalledWith('first');
    expect(onResult).toHaveBeenCalledTimes(1);

    action.update({
      environment: { clipboard: { writeText: successfulWrite } },
      text: 'second',
      onResult,
    });
    node.click();
    await flushMicrotasks();
    expect(successfulWrite).toHaveBeenLastCalledWith('second');
    expect(onResult).toHaveBeenCalledTimes(2);

    action.destroy();
    node.click();
    await flushMicrotasks();
    expect(onResult).toHaveBeenCalledTimes(2);
  });
});
