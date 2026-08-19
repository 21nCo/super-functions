import { describe, expect, it, vi } from 'vitest';
import { PlugFnClientError, createPlugFnClient, resolveDefaultRedirectUri } from './index.js';

describe('resolveDefaultRedirectUri', () => {
  it('derives provider callback URLs from absolute baseUrl', () => {
    expect(
      resolveDefaultRedirectUri('https://app.test/api/plugfn', 'github')
    ).toBe('https://app.test/api/plugfn/callback/github');
  });

  it('derives provider callback URLs from relative baseUrl and browser origin', () => {
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { origin: 'http://localhost:5173' },
    });

    expect(resolveDefaultRedirectUri('/api/plugfn', 'linear')).toBe(
      'http://localhost:5173/api/plugfn/callback/linear'
    );

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
});

describe('createPlugFnClient', () => {
  it('starts a connection through the browser-safe route', async () => {
    const fetchMock = vi.fn(async () => {
      return Response.json({
        ok: true,
        data: { authUrl: 'https://github.com/login/oauth/authorize' },
        meta: { requestId: 'req_test', timestamp: new Date().toISOString() },
      });
    });
    const client = createPlugFnClient({
      baseUrl: 'https://app.test/api/plugfn',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const started = await client.startConnection({
      provider: 'github',
      redirect: 'none',
    });

    expect(started.authUrl).toContain('github.com');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.test/api/plugfn/connections/start',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      provider: 'github',
      redirectUri: 'https://app.test/api/plugfn/callback/github',
    });
  });

  it('throws typed PlugFn client errors from deterministic envelopes', async () => {
    const fetchMock = vi.fn(async () => {
      return Response.json(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'missing provider',
            status: 400,
            retryable: false,
            details: {},
          },
          meta: { requestId: 'req_test', timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    });
    const client = createPlugFnClient({
      baseUrl: 'https://app.test/api/plugfn',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(client.listProviders()).rejects.toMatchObject({
      name: 'PlugFnClientError',
      code: 'VALIDATION_ERROR',
      status: 400,
    } satisfies Partial<PlugFnClientError>);
  });
});
