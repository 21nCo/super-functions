import { createEffect } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it, vi } from 'vitest';
import type { HookEnvironment, MediaQueryChangeLike } from '@uifn/dom';
import { createCopyToClipboard } from '../hooks/copy-to-clipboard.js';
import { createMediaQuery } from '../hooks/media-query.js';

function createMediaEnvironment(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryChangeLike) => void>();
  const queryList = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: 'change', listener: (event: MediaQueryChangeLike) => void) => listeners.delete(listener)),
  };
  const environment: HookEnvironment = { matchMedia: vi.fn(() => queryList) };
  return {
    environment,
    queryList,
    emit(matches: boolean) {
      queryList.matches = matches;
      listeners.forEach((listener) => listener({ matches }));
    },
    listenerCount: () => listeners.size,
  };
}

describe('Solid hook bindings', () => {
  it('uses the configured SSR fallback without ambient matchMedia access', () => {
    const host = document.createElement('div');
    let value = false;
    const dispose = render(() => {
      const matches = createMediaQuery('(min-width: 768px)', { defaultValue: true, environment: {} });
      value = matches();
      return null;
    }, host);
    expect(value).toBe(true);
    dispose();
  });

  it('tracks media-query changes and removes the listener on owner cleanup', async () => {
    const media = createMediaEnvironment(false);
    const host = document.createElement('div');
    const output = document.createElement('output');
    const dispose = render(() => {
      const matches = createMediaQuery('(min-width: 768px)', { environment: media.environment });
      createEffect(() => { output.textContent = String(matches()); });
      return output;
    }, host);
    await Promise.resolve();
    expect(output.textContent).toBe('false');
    expect(media.listenerCount()).toBe(1);
    media.emit(true);
    expect(output.textContent).toBe('true');
    dispose();
    expect(media.queryList.removeEventListener).toHaveBeenCalledTimes(1);
    expect(media.listenerCount()).toBe(0);
  });

  it('uses the hydration fallback until the owner mounts', async () => {
    const media = createMediaEnvironment(true);
    const host = document.createElement('div');
    const output = document.createElement('output');
    let initialValue: boolean | undefined;
    const dispose = render(() => {
      const matches = createMediaQuery('(min-width: 768px)', {
        defaultValue: false,
        environment: media.environment,
      });
      initialValue = matches();
      createEffect(() => { output.textContent = String(matches()); });
      return output;
    }, host);
    expect(initialValue).toBe(false);
    await Promise.resolve();
    expect(output.textContent).toBe('true');
    dispose();
  });

  it('reports unavailable, rejected, successful, and reset clipboard states', async () => {
    const host = document.createElement('div');
    let run!: () => Promise<void>;
    const dispose = render(() => {
      run = async () => {
        const missing = createCopyToClipboard({ environment: {} });
        await expect(missing.copy('missing')).resolves.toMatchObject({ ok: false, error: { code: 'clipboard-unavailable' } });
        expect(missing.status()).toBe('error');

        const rejectedWrite = vi.fn(async () => { throw new Error('denied'); });
        const rejected = createCopyToClipboard({ environment: { clipboard: { writeText: rejectedWrite } } });
        await rejected.copy('denied');
        expect(rejected.error()?.code).toBe('clipboard-write-failed');

        const successfulWrite = vi.fn(async () => undefined);
        const successful = createCopyToClipboard({ environment: { clipboard: { writeText: successfulWrite } } });
        await successful.copy('copied');
        expect(successful.status()).toBe('success');
        expect(successful.copiedText()).toBe('copied');
        successful.reset();
        expect(successful.status()).toBe('idle');
        expect(successful.copiedText()).toBeNull();
      };
      return null;
    }, host);
    await run();
    dispose();
  });
});
