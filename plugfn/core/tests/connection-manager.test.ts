import { describe, it, expect, vi } from 'vitest';
import type { OAuthTokenEndpointRequest, OAuthTokenHttpClient } from '@superfunctions/oauth-http';
import { ConnectionManager, createConnectionManagerOAuthDependencies } from '../src/core/connection-manager.js';
import { AdapterConnectionStorage } from '../src/storage/connection-storage.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { DEFAULT_PLUGFN_STORAGE_MODELS } from '../src/storage/adapters/database.js';
import { NoopLogger } from '../src/utils/logger.js';
import type { Provider } from '../src/types/provider.js';
import { AuthType } from '../src/types/provider.js';
import { ConnectionStatus } from '../src/types/connection.js';

const BASE_URL = 'https://app.21n.co';
const REDIRECT_URI = 'https://app.21n.co/oauth/callback';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('ConnectionManager OAuth shared integration', () => {
  it('persists state in adapter storage and consumes callback from another manager instance', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();

    const envA = createManagerEnvironment(adapter, tokenClient);
    const envB = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await envA.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const url = new URL(authUrl);
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    const { connection } = await envB.manager.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    expect(connection.provider).toBe('google');
    expect(connection.credentials.keyRef).toBe('plugfn-key-v1');
  });

  it('rejects callback replay with OAUTH_STATE_REPLAYED', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();

    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    await env.manager.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    await expect(
      env.manager.handleCallback({
        code: 'auth-code-2',
        state: state!,
        provider: 'google',
        redirectUri: REDIRECT_URI,
      })
    ).rejects.toMatchObject({
      code: 'OAUTH_STATE_REPLAYED',
    });
  });

  it('rejects callback redirect mismatch with OAUTH_CALLBACK_MISMATCH', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();

    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    await expect(
      env.manager.handleCallback({
        code: 'auth-code-1',
        state: state!,
        provider: 'google',
        redirectUri: 'https://evil.example/callback',
      })
    ).rejects.toMatchObject({
      code: 'OAUTH_CALLBACK_MISMATCH',
    });
  });

  it('keeps existing token material when refresh fails', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient({
      refreshError: new Error('refresh failed'),
    });

    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const { connection } = await env.manager.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const beforeRefresh = await readTokenRecord(adapter, connection.id);
    expect(beforeRefresh).not.toBeNull();

    await expect(env.manager.refresh(connection.id)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });

    const afterRefresh = await readTokenRecord(adapter, connection.id);
    expect(afterRefresh?.encrypted_payload).toBe(beforeRefresh?.encrypted_payload);

    const credentials = await env.manager.getCredentials(connection.id);
    expect(credentials.type).toBe('oauth2');
    if (credentials.type === 'oauth2') {
      expect(credentials.accessToken).toBe('access-token-1');
      expect(credentials.refreshToken).toBe('refresh-token-1');
    }
  });

  it('rotates token key and preserves token semantics', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();

    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const { connection } = await env.manager.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const tokenBefore = await readTokenRecord(adapter, connection.id);
    expect(tokenBefore?.key_ref).toBe('plugfn-key-v1');

    await env.oauthDependencies.encryptedTokenVault.rotateKey(tokenBefore!.token_id, 'plugfn-key-v2');

    const tokenAfter = await readTokenRecord(adapter, connection.id);
    expect(tokenAfter?.key_ref).toBe('plugfn-key-v2');
    expect(tokenAfter?.encrypted_payload).not.toBe(tokenBefore?.encrypted_payload);

    const credentials = await env.manager.getCredentials(connection.id);
    expect(credentials.type).toBe('oauth2');
    if (credentials.type === 'oauth2') {
      expect(credentials.accessToken).toBe('access-token-1');
      expect(credentials.refreshToken).toBe('refresh-token-1');
    }
  });

  it('fails safely when token key reference is unavailable', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();

    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const { connection } = await env.manager.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const tokenEntry = await readTokenEntryByConnection(adapter, connection.id);
    expect(tokenEntry?.record).toBeTruthy();
    await adapter.update({
      model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
      where: [{ field: 'token_id', operator: 'eq', value: tokenEntry!.id }],
      data: {
        key_ref: '',
      },
    });

    await expect(env.manager.getCredentials(connection.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('purges expired OAuth state records through shared state store cleanup', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();

    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const deleted = await env.oauthDependencies.oauthStateStore.deleteExpired(
      new Date(Date.now() + 20 * 60 * 1000).toISOString()
    );
    expect(deleted).toBe(1);

    await expect(
      env.manager.handleCallback({
        code: 'auth-code-1',
        state: state!,
        provider: 'google',
        redirectUri: REDIRECT_URI,
      })
    ).rejects.toThrow('OAuth state is invalid or expired');
  });

  it('selects connection deterministically by id when priority timestamps are tied', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();
    const env = createManagerEnvironment(adapter, tokenClient);
    const tiedAt = new Date('2026-03-11T00:00:00.000Z');

    await adapter.createConnection({
      id: 'conn_b',
      userId: 'user-1',
      provider: 'google',
      name: 'Google B',
      status: ConnectionStatus.Active,
      credentials: {
        encrypted: 'encrypted',
        algorithm: 'aes-256-gcm',
      },
      connectedAt: tiedAt,
      createdAt: tiedAt,
      updatedAt: tiedAt,
      lastUsedAt: tiedAt,
    });
    await adapter.createConnection({
      id: 'conn_a',
      userId: 'user-1',
      provider: 'google',
      name: 'Google A',
      status: ConnectionStatus.Active,
      credentials: {
        encrypted: 'encrypted',
        algorithm: 'aes-256-gcm',
      },
      connectedAt: tiedAt,
      createdAt: tiedAt,
      updatedAt: tiedAt,
      lastUsedAt: tiedAt,
    });

    const selected = await env.manager.resolveConnectionForAction({
      userId: 'user-1',
      provider: 'google',
    });

    expect(selected?.id).toBe('conn_a');
  });

  it('passes OAuth prompt and loginHint into authorization URLs', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient();
    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
      prompt: 'select_account',
      loginHint: 'user@example.com',
    });

    const url = new URL(authUrl);
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(url.searchParams.get('login_hint')).toBe('user@example.com');
  });

  it('completes disconnect locally when remote revoke fails after cleanup', async () => {
    const adapter = new MemoryAdapter();
    const tokenClient = createTokenHttpClient({
      revokeError: new Error('upstream revoke failed'),
    });
    const env = createManagerEnvironment(adapter, tokenClient);

    const authUrl = await env.manager.getAuthUrl({
      userId: 'user-1',
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });
    const state = new URL(authUrl).searchParams.get('state');
    expect(state).toBeTruthy();

    const { connection } = await env.manager.handleCallback({
      code: 'auth-code-1',
      state: state!,
      provider: 'google',
      redirectUri: REDIRECT_URI,
    });

    const result = await env.manager.disconnect({
        userId: 'user-1',
        provider: 'google',
        connectionId: connection.id,
      });

    expect(result.disconnected).toBe(true);
    expect(result.remoteRevokeAttempted).toBe(true);
    expect(result.remoteRevokeSucceeded).toBe(false);
    expect(result.localDeleted).toBe(true);
    expect(result.revokeError).toBeDefined();

    await expect(env.manager.get(connection.id)).rejects.toThrow();
    expect(await readTokenRecord(adapter, connection.id)).toBeNull();
  });
});

function createManagerEnvironment(adapter: MemoryAdapter, tokenClient: OAuthTokenHttpClient) {
  const providers = new Map<string, Provider>([['google', createGoogleProvider()]]);
  const integrationConfigs = new Map<string, any>([
    [
      'google',
      {
        type: 'oauth2',
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
        redirectUris: [REDIRECT_URI],
      },
    ],
  ]);

  const oauthDependencies = createConnectionManagerOAuthDependencies({
    database: adapter,
    providers,
    integrationConfigs,
    baseUrl: BASE_URL,
    encryptionKey: ENCRYPTION_KEY,
    tokenHttpClient: tokenClient,
  });

  const manager = new ConnectionManager(
    new AdapterConnectionStorage(adapter),
    providers,
    integrationConfigs,
    BASE_URL,
    ENCRYPTION_KEY,
    new NoopLogger(),
    oauthDependencies
  );

  return {
    manager,
    oauthDependencies,
  };
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

function createTokenHttpClient(options?: { refreshError?: Error; revokeError?: Error }): OAuthTokenHttpClient {
  return {
    exchangeToken: vi.fn(async (input: OAuthTokenEndpointRequest) => {
      if (input.grantType === 'authorization_code') {
        return {
          accessToken: 'access-token-1',
          refreshToken: 'refresh-token-1',
          expiresIn: 3600,
          tokenType: 'Bearer',
          scope: 'openid email profile',
        };
      }

      if (input.grantType === 'refresh_token') {
        if (options?.refreshError) {
          throw options.refreshError;
        }

        return {
          accessToken: 'access-token-2',
          refreshToken: 'refresh-token-2',
          expiresIn: 3600,
          tokenType: 'Bearer',
          scope: 'openid email profile',
        };
      }

      throw new Error(`Unsupported grant type: ${input.grantType}`);
    }),
    revokeToken: vi.fn(async () => {
      if (options?.revokeError) {
        throw options.revokeError;
      }
    }),
  };
}

async function readTokenRecord(adapter: MemoryAdapter, connectionId: string): Promise<any | null> {
  const tokenEntry = await readTokenEntryByConnection(adapter, connectionId);
  return tokenEntry?.record ?? null;
}

async function readTokenEntryByConnection(
  adapter: MemoryAdapter,
  connectionId: string
): Promise<{ id: string; record: any } | null> {
  const record = await adapter.findOne<any>({
    model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
    where: [{ field: 'connection_id', operator: 'eq', value: connectionId }],
  });
  if (!record) {
    return null;
  }

  return {
    id: record.token_id,
    record,
  };
}
