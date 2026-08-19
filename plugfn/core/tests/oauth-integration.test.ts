import { afterEach, describe, expect, it, vi } from 'vitest';
import { plugFn } from '../src/core/plug-fn.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { DEFAULT_PLUGFN_STORAGE_MODELS } from '../src/storage/adapters/database.js';
import type { Provider } from '../src/types/provider.js';
import { AuthType } from '../src/types/provider.js';

const BASE_URL = 'https://app.21n.co';
const REDIRECT_URI = 'https://app.21n.co/oauth/callback';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('PlugFn OAuth e2e via shared packages', () => {
  it('creates an OAuth connection and blocks callback replay', async () => {
    const adapter = new MemoryAdapter();

    globalThis.fetch = vi.fn(async (_url: string, init: any) => {
      const params = new URLSearchParams(String(init?.body ?? ''));
      if (params.get('grant_type') === 'authorization_code') {
        return new Response(
          JSON.stringify({
            access_token: 'access-token-1',
            refresh_token: 'refresh-token-1',
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

      throw new Error('Unexpected token exchange request');
    }) as any;

    const plug = createPlug(adapter);

    const authUrl = await plug.connections.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const url = new URL(authUrl);
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const { connection } = await plug.connections.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    expect(connection.credentials.keyRef).toBe('plugfn-key-v1');
    expect(connection.credentials.encrypted).toBeTruthy();
    expect(connection.credentials.encrypted).not.toContain('access-token-1');

    const tokenRecord = await readTokenRecord(adapter, connection.id);
    expect(tokenRecord).not.toBeNull();
    expect(tokenRecord?.key_ref).toBe('plugfn-key-v1');
    expect(tokenRecord?.encrypted_payload).not.toContain('access-token-1');

    await expect(
      plug.connections.handleCallback({
        code: 'auth-code-2',
        state: state!,
        provider: 'google',
        redirectUri: REDIRECT_URI,
      })
    ).rejects.toMatchObject({
      code: 'OAUTH_STATE_REPLAYED',
    });
  });

  it('surfaces refresh failures without deleting local encrypted credentials', async () => {
    const adapter = new MemoryAdapter();

    globalThis.fetch = vi.fn(async (_url: string, init: any) => {
      const params = new URLSearchParams(String(init?.body ?? ''));
      const grantType = params.get('grant_type');

      if (grantType === 'authorization_code') {
        return new Response(
          JSON.stringify({
            access_token: 'access-token-1',
            refresh_token: 'refresh-token-1',
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

      if (grantType === 'refresh_token') {
        return new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'refresh failed',
          }),
          {
            status: 400,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }

      throw new Error('Unexpected token exchange request');
    }) as any;

    const plug = createPlug(adapter);

    const authUrl = await plug.connections.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const { connection } = await plug.connections.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const tokenBefore = await readTokenRecord(adapter, connection.id);
    expect(tokenBefore).not.toBeNull();

    await expect(plug.connections.refresh(connection.id)).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_REFRESH_FAILED',
    });

    const tokenAfter = await readTokenRecord(adapter, connection.id);
    expect(tokenAfter?.encrypted_payload).toBe(tokenBefore?.encrypted_payload);

    const persistedConnection = await plug.connections.get(connection.id);
    expect(persistedConnection.id).toBe(connection.id);
  });
});

function createPlug(adapter: MemoryAdapter) {
  const plug = plugFn({
    database: adapter,
    auth: {
      async getUserId() {
        return 'user-1';
      },
      async requireAuth() {
        return 'user-1';
      },
    },
    baseUrl: BASE_URL,
    encryptionKey: ENCRYPTION_KEY,
    integrations: {
      google: {
        type: 'oauth2',
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        redirectUris: [REDIRECT_URI],
      },
    },
  });

  plug.providers.register(createGoogleProvider());
  return plug;
}

function createGoogleProvider(): Provider {
  return {
    name: 'google',
    displayName: 'Google',
    version: '1.0.0',
    description: 'Google OAuth provider',
    baseUrl: 'https://www.googleapis.com',
    auth: {
      type: AuthType.OAuth2,
      config: {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['openid', 'email', 'profile'],
        scopeSeparator: ' ',
      },
    },
    actions: {},
  };
}

async function readTokenRecord(adapter: MemoryAdapter, connectionId: string): Promise<any | null> {
  return adapter.findOne({
    model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
    where: [{ field: 'connection_id', operator: 'eq', value: connectionId }],
  });
}
