import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlugFnRouter } from '../../src/router/http-router.js';
import { plugFn } from '../../src/core/plug-fn.js';
import { githubProvider } from '../../../providers/src/github/index.js';
import { MemoryAdapter } from '../../src/storage/adapters/memory.js';
import { DEFAULT_PLUGFN_STORAGE_MODELS } from '../../src/storage/adapters/database.js';

const BASE_URL = 'https://app.example.com';
const REDIRECT_URI = 'https://app.example.com/oauth/callback';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('PlugFn OAuth callback e2e', () => {
  it('redirects browser callbacks to returnTo when provided', async () => {
    const adapter = new MemoryAdapter();
    globalThis.fetch = createFetchStub();

    const plug = plugFn({
      database: adapter,
      auth: {
        async authenticate() {
          return {
            userId: 'user_e2e',
            tenantId: 'tenant_e2e',
          };
        },
      },
      baseUrl: BASE_URL,
      encryptionKey: ENCRYPTION_KEY,
      integrations: {
        github: {
          type: 'oauth2',
          clientId: 'github-client-id',
          clientSecret: 'github-client-secret',
          redirectUris: [REDIRECT_URI],
        },
      },
    });

    plug.providers.register(githubProvider);

    const router = createPlugFnRouter(plug);
    const returnTo = 'http://localhost:5173/integrations';
    const authResponse = await router.handle(
      new Request('http://localhost/connections/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'github',
          redirectUri: REDIRECT_URI,
          returnTo,
        }),
      })
    );

    expect(authResponse.status).toBe(200);
    const authPayload = (await authResponse.json()) as {
      ok: boolean;
      data: { authUrl: string };
    };
    const state = new URL(authPayload.data.authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const callbackResponse = await router.handle(
      new Request(`http://localhost/callback?code=oauth-code-1&state=${state}`)
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('location')).toBe(returnTo);
  });

  it('redirects browser callbacks to defaultReturnTo when state has no returnTo', async () => {
    const adapter = new MemoryAdapter();
    globalThis.fetch = createFetchStub();

    const plug = plugFn({
      database: adapter,
      auth: {
        async authenticate() {
          return {
            userId: 'user_e2e',
            tenantId: 'tenant_e2e',
          };
        },
      },
      baseUrl: BASE_URL,
      encryptionKey: ENCRYPTION_KEY,
      integrations: {
        github: {
          type: 'oauth2',
          clientId: 'github-client-id',
          clientSecret: 'github-client-secret',
          redirectUris: [REDIRECT_URI],
        },
      },
    });

    plug.providers.register(githubProvider);

    const defaultReturnTo = 'http://localhost:5173/';
    const router = createPlugFnRouter(plug, { defaultReturnTo });
    const authResponse = await router.handle(
      new Request('http://localhost/connections/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'github',
          redirectUri: REDIRECT_URI,
        }),
      })
    );

    const authPayload = (await authResponse.json()) as {
      ok: boolean;
      data: { authUrl: string };
    };
    const state = new URL(authPayload.data.authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const callbackResponse = await router.handle(
      new Request(`http://localhost/callback/github?code=oauth-code-1&state=${state}`)
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get('location')).toBe(defaultReturnTo);
  });

  it('completes the browser callback route and persists first-class OAuth records', async () => {
    const adapter = new MemoryAdapter();
    globalThis.fetch = createFetchStub();

    const plug = plugFn({
      database: adapter,
      auth: {
        async authenticate() {
          return {
            userId: 'user_e2e',
            tenantId: 'tenant_e2e',
          };
        },
      },
      baseUrl: BASE_URL,
      encryptionKey: ENCRYPTION_KEY,
      integrations: {
        github: {
          type: 'oauth2',
          clientId: 'github-client-id',
          clientSecret: 'github-client-secret',
          redirectUris: [REDIRECT_URI],
        },
      },
    });

    plug.providers.register(githubProvider);

    const router = createPlugFnRouter(plug);
    const authResponse = await router.handle(
      new Request('http://localhost/connections/start', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'github',
          redirectUri: REDIRECT_URI,
        }),
      })
    );

    expect(authResponse.status).toBe(200);
    const authPayload = (await authResponse.json()) as {
      ok: boolean;
      data: { authUrl: string };
    };
    const state = new URL(authPayload.data.authUrl).searchParams.get('state');

    expect(authPayload.ok).toBe(true);
    expect(state).toBeTruthy();

    const callbackResponse = await router.handle(
      new Request(`http://localhost/callback?code=oauth-code-1&state=${state}`)
    );

    expect(callbackResponse.status).toBe(200);
    const callbackPayload = (await callbackResponse.json()) as {
      ok: boolean;
      data: {
        connection: {
          id: string;
          provider: string;
          status: string;
        };
      };
    };

    expect(callbackPayload.ok).toBe(true);
    expect(callbackPayload.data.connection.provider).toBe('github');
    expect(callbackPayload.data.connection.status).toBe('active');

    const persistedState = await adapter.findOne<{ consumed_at?: string | null }>({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthStates,
      where: [{ field: 'state_id', operator: 'eq', value: state! }],
    });
    const persistedConnection = await adapter.findOne<{ id: string }>({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.connections,
      where: [{ field: 'id', operator: 'eq', value: callbackPayload.data.connection.id }],
    });
    const persistedToken = await adapter.findOne<{
      token_id: string;
      connection_id: string;
      encrypted_payload: string;
    }>({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
      where: [{ field: 'connection_id', operator: 'eq', value: callbackPayload.data.connection.id }],
    });

    expect(persistedState?.consumed_at).toBeTruthy();
    expect(persistedConnection?.id).toBe(callbackPayload.data.connection.id);
    expect(persistedToken?.connection_id).toBe(callbackPayload.data.connection.id);
    expect(persistedToken?.encrypted_payload).toBeTruthy();
  });
});

function createFetchStub() {
  return vi.fn(async (_url: string, init: RequestInit | undefined) => {
    const params = new URLSearchParams(String(init?.body ?? ''));
    const grantType = params.get('grant_type');

    if (grantType === 'authorization_code') {
      return new Response(
        JSON.stringify({
          access_token: 'gh-access-token-1',
          refresh_token: 'gh-refresh-token-1',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }

    throw new Error(`Unexpected grant type: ${grantType}`);
  }) as typeof globalThis.fetch;
}
