import { describe, expect, it, vi } from 'vitest';
import { createTestServer } from './test-server.js';
import {
  createAuthFnTransportAuth
} from '../transport-auth.js';
import { createAuthFnSessionTransportAuth } from '../transport-auth-internal.js';

describe('createAuthFnTransportAuth', () => {
  it('returns cookie credentials by default', async () => {
    const auth = createAuthFnTransportAuth();

    expect(await auth.getCredentials?.()).toBe('include');
    expect(await auth.getRequestHeaders?.()).toEqual({});
  });

  it('maps configured bearer token and headers into request headers', async () => {
    const auth = createAuthFnSessionTransportAuth({
      bearerToken: async () => ' session-token ',
      headers: () => ({ 'x-custom-auth-context': 'custom' }),
      plugins: [
        {
          getRequestHeaders: () => ({ 'x-plugin-auth-context': 'plugin' })
        }
      ]
    });

    expect(await auth.getRequestHeaders?.()).toEqual({
      authorization: 'Bearer session-token',
      'x-custom-auth-context': 'custom',
      'x-plugin-auth-context': 'plugin'
    });
    expect(await auth.getCredentials?.()).toBe('omit');
  });

  it('keeps explicit bearer-token credential overrides', async () => {
    const auth = createAuthFnSessionTransportAuth({
      bearerToken: 'session-token',
      credentials: 'include'
    });

    expect(await auth.getCredentials?.()).toBe('include');
  });

  it('delegates unauthorized handling when provided', async () => {
    const onUnauthorized = vi.fn(() => 'retry' as const);
    const auth = createAuthFnTransportAuth({ onUnauthorized });
    const event = {
      endpoint: 'pull',
      url: 'https://account.example.com/datafn/pull',
      status: 403,
      result: { ok: false }
    };

    expect(await auth.onUnauthorized?.(event)).toBe('retry');
    expect(onUnauthorized).toHaveBeenCalledWith(event);
  });
});
