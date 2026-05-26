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

describe('PlugFn connection OAuth runtime', () => {
  it('persists callback state, token, and connection records through first-class stores', async () => {
    const adapter = new MemoryAdapter();
    globalThis.fetch = createFetchStub();

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

    const persistedState = await adapter.findOne<{ consumed_at?: string | null }>({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthStates,
      where: [{ field: 'state_id', operator: 'eq', value: state! }],
    });
    const persistedConnection = await adapter.findOne<{ id: string }>({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.connections,
      where: [{ field: 'id', operator: 'eq', value: connection.id }],
    });
    const persistedToken = await adapter.findOne<{
      token_id: string;
      connection_id: string;
      encrypted_payload: string;
    }>({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
      where: [{ field: 'connection_id', operator: 'eq', value: connection.id }],
    });

    expect(persistedState?.consumed_at).toBeTruthy();
    expect(persistedConnection?.id).toBe(connection.id);
    expect(persistedToken?.connection_id).toBe(connection.id);
    expect(connection.credentials.tokenId).toBe(persistedToken?.token_id);
    expect(connection.credentials.encrypted).toBe(persistedToken?.encrypted_payload);
  });

  it('keeps the token row when refresh fails and leaves the connection record intact', async () => {
    const adapter = new MemoryAdapter();
    globalThis.fetch = createFetchStub({
      refreshError: {
        error: 'invalid_grant',
        error_description: 'refresh failed',
      },
      refreshStatus: 400,
    });

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

    const tokenBefore = await readTokenRow(adapter, connection.id);
    expect(tokenBefore).not.toBeNull();

    await expect(plug.connections.refresh(connection.id)).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_REFRESH_FAILED',
    });

    const tokenAfter = await readTokenRow(adapter, connection.id);
    const persistedConnection = await plug.connections.get(connection.id);

    expect(tokenAfter?.encrypted_payload).toBe(tokenBefore?.encrypted_payload);
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

function createFetchStub(options?: {
  refreshError?: Record<string, unknown>;
  refreshStatus?: number;
}) {
  return vi.fn(async (_url: string, init: RequestInit | undefined) => {
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
      if (options?.refreshError) {
        return new Response(JSON.stringify(options.refreshError), {
          status: options.refreshStatus ?? 400,
          headers: {
            'content-type': 'application/json',
          },
        });
      }

      return new Response(
        JSON.stringify({
          access_token: 'access-token-2',
          refresh_token: 'refresh-token-2',
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

async function readTokenRow(
  adapter: MemoryAdapter,
  connectionId: string
): Promise<{
  token_id: string;
  connection_id: string;
  encrypted_payload: string;
} | null> {
  return adapter.findOne({
    model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
    where: [{ field: 'connection_id', operator: 'eq', value: connectionId }],
  });
}
