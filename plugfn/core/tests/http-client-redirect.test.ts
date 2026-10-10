import { afterEach, describe, expect, it, vi } from 'vitest';
import { FetchHttpClient } from '../src/utils/request.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Model workerd: `redirect: "error"` is rejected before any request is sent. */
function workerdFetch(response: () => Response) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    if (init.redirect === 'error') {
      throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
    }
    return response();
  });
}

describe('HTTP client redirect handling', () => {
  it('sends redirect "error" requests as manual so Workers accept them', async () => {
    const fetchMock = workerdFetch(() => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    globalThis.fetch = fetchMock as any;

    const response = await new FetchHttpClient().get('https://api.example.com/items', { redirect: 'error' });

    expect(response.data).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it.each([301, 302, 303, 307, 308])('rejects a %i response without following it', async (status) => {
    const fetchMock = workerdFetch(() => new Response(null, {
      status,
      headers: { location: 'https://attacker.example/steal' },
    }));
    globalThis.fetch = fetchMock as any;

    await expect(
      new FetchHttpClient().post('https://api.example.com/items', { a: 1 }, { redirect: 'error' })
    ).rejects.toThrow(new TypeError('Redirect blocked: request requires redirect "error"'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The rejection must come from the redirect response, not from workerd
    // refusing `redirect: "error"` before the request is sent.
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
  });

  it('cancels a redirect response body before rejecting', async () => {
    const cancel = vi.fn();
    const fetchMock = workerdFetch(() => new Response(new ReadableStream({ cancel }), {
      status: 302,
      headers: { location: 'https://attacker.example/steal' },
    }));
    globalThis.fetch = fetchMock as any;

    await expect(
      new FetchHttpClient().get('https://api.example.com/items', { redirect: 'error' })
    ).rejects.toThrow(new TypeError('Redirect blocked: request requires redirect "error"'));
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('still rejects the redirect when cancelling its body fails', async () => {
    const cancel = vi.fn(() => Promise.reject(new Error('cancel failed')));
    globalThis.fetch = workerdFetch(() => new Response(new ReadableStream({ cancel }), {
      status: 307,
      headers: { location: 'https://attacker.example/steal' },
    })) as any;

    await expect(
      new FetchHttpClient().get('https://api.example.com/items', { redirect: 'error' })
    ).rejects.toThrow(new TypeError('Redirect blocked: request requires redirect "error"'));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects an opaque redirect from browser fetch', async () => {
    const opaque = new Response(null, { status: 200 });
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
    globalThis.fetch = workerdFetch(() => opaque) as any;

    await expect(
      new FetchHttpClient().get('https://api.example.com/items', { redirect: 'error' })
    ).rejects.toThrow('Redirect blocked');
  });

  it('passes other redirect modes through unchanged', async () => {
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as any;
    const client = new FetchHttpClient();

    await client.get('https://api.example.com/a', { redirect: 'follow' });
    await client.get('https://api.example.com/b');

    expect(fetchMock.mock.calls[0][1].redirect).toBe('follow');
    expect(fetchMock.mock.calls[1][1].redirect).toBeUndefined();
  });
});
