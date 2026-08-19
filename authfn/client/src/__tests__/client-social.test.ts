import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import type { AuthFnRuntimeConfig } from 'authfn';
import { authFnSocialOAuthPlugin } from '@authfn/social-oauth';
import { createAuthFnClient } from '../index.js';

function createConfig(): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [
      authFnSocialOAuthPlugin()
    ],
    pluginRuntime: {
      socialOAuth: {
        providers: {
          google: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
            allowlistedReturnTo: ['https://app.example.com/post-auth']
          }
        },
        fetcher: async () => {
          throw new Error('social start should not exchange tokens');
        }
      }
    }
  };
}

describe('@authfn/client social flows', () => {
  it('starts social sign-in and returns the redirect envelope', async () => {
    const auth = createTestServer(createConfig());

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async (input, init) =>
        auth.router.handle(
          new Request(typeof input === 'string' ? input : input.toString(), {
            method: init?.method,
            headers: init?.headers,
            body: init?.body
          })
        )
    });

    const started = await client.startSocialSignIn({
      provider: 'google',
      returnTo: 'https://app.example.com/post-auth'
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error('social start should have succeeded');
    }

    expect(started.data).toEqual({
      provider: 'google',
      redirectTo: expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth'),
      stateId: expect.any(String),
      expiresAt: expect.any(String)
    });
  });

  it('lets the server infer callback mode when none is requested', async () => {
    let receivedCallbackMode: unknown;
    const auth = createTestServer(createConfig());

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async (input, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        receivedCallbackMode = body?.callbackMode;
        return auth.router.handle(
          new Request(typeof input === 'string' ? input : input.toString(), {
            method: init?.method,
            headers: init?.headers,
            body: init?.body
          })
        );
      }
    });

    const started = await client.startSocialSignIn({
      provider: 'google'
    });

    expect(started.ok).toBe(true);
    expect(receivedCallbackMode).toBeUndefined();
  });

  it('treats bare redirect responses as navigation-required errors', async () => {
    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async () =>
        new Response(null, {
          status: 303,
          headers: {
            location: 'https://app.example.com/post-auth',
            'x-request-id': 'req_redirect'
          }
        })
    });

    const started = await client.startSocialSignIn({
      provider: 'google'
    });

    expect(started.ok).toBe(false);
    if (started.ok) {
      throw new Error('redirect response should require explicit navigation');
    }
    expect(started.error.code).toBe('AUTHFN_REDIRECT_REQUIRES_NAVIGATION');
    expect(started.error.details?.redirectTo).toBe('https://app.example.com/post-auth');
    expect(started.requestId).toBe('req_redirect');
  });

  it('does not force json callback mode when returnTo is provided', async () => {
    let receivedCallbackMode: unknown;
    const auth = createTestServer(createConfig());

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async (input, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        receivedCallbackMode = body?.callbackMode;
        return auth.router.handle(
          new Request(typeof input === 'string' ? input : input.toString(), {
            method: init?.method,
            headers: init?.headers,
            body: init?.body
          })
        );
      }
    });

    const started = await client.startSocialSignIn({
      provider: 'google',
      returnTo: 'https://app.example.com/post-auth'
    });

    expect(started.ok).toBe(true);
    expect(receivedCallbackMode).toBeUndefined();
  });

  it('honors explicit redirect callback mode for browser navigation flows', async () => {
    let receivedCallbackMode: unknown;
    const auth = createTestServer(createConfig());

    const client = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async (input, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        receivedCallbackMode = body?.callbackMode;
        return auth.router.handle(
          new Request(typeof input === 'string' ? input : input.toString(), {
            method: init?.method,
            headers: init?.headers,
            body: init?.body
          })
        );
      }
    });

    const started = await client.startSocialSignIn({
      provider: 'google',
      returnTo: 'https://app.example.com/post-auth',
      callbackMode: 'redirect'
    });

    expect(started.ok).toBe(true);
    expect(receivedCallbackMode).toBe('redirect');
  });
});
