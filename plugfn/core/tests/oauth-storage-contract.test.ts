import { describe, expect, it, vi } from 'vitest';
import { plugFn } from '../src/core/plug-fn.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import {
  DEFAULT_PLUGFN_STORAGE_MODELS,
  PLUGFN_REQUIRED_MODEL_NAMES,
} from '../src/storage/adapters/database.js';
import type { Provider } from '../src/types/provider.js';
import { AuthType } from '../src/types/provider.js';

const BASE_URL = 'https://app.21n.co';
const REDIRECT_URI = 'https://app.21n.co/oauth/callback';
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('PlugFn OAuth storage contract', () => {
  it('uses canonical shared-db models and separate OAuth state/token stores', async () => {
    const adapter = new MemoryAdapter();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
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
    }) as any;

    try {
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
          github: {
            type: 'oauth2',
            clientId: 'github-client-id',
            clientSecret: 'github-client-secret',
            redirectUris: [REDIRECT_URI],
          },
        },
      });

      plug.providers.register(createGitHubProvider());

      const authUrl = await plug.connections.getAuthUrl({
        userId: 'user-1',
        provider: 'github',
        redirectUri: REDIRECT_URI,
      });

      const state = new URL(authUrl).searchParams.get('state');
      expect(state).toBeTruthy();

      const storedState = await adapter.findOne({
        model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthStates,
        where: [{ field: 'state_id', operator: 'eq', value: state! }],
      });
      expect(storedState).not.toBeNull();

      const { connection } = await plug.connections.handleCallback({
        code: 'oauth-code',
        state: state!,
        provider: 'github',
        redirectUri: REDIRECT_URI,
      });

      const persistedConnection = await adapter.findOne({
        model: DEFAULT_PLUGFN_STORAGE_MODELS.connections,
        where: [{ field: 'id', operator: 'eq', value: connection.id }],
      });
      const persistedToken = await adapter.findOne({
        model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
        where: [{ field: 'connection_id', operator: 'eq', value: connection.id }],
      });

      expect(persistedConnection).not.toBeNull();
      expect(persistedToken).not.toBeNull();
      expect(connection.credentials.tokenId).toBe((persistedToken as { token_id: string }).token_id);
      expect(connection.credentials.encrypted).toBe(
        (persistedToken as { encrypted_payload: string }).encrypted_payload
      );

      const consumedState = await adapter.findOne({
        model: DEFAULT_PLUGFN_STORAGE_MODELS.oauthStates,
        where: [{ field: 'state_id', operator: 'eq', value: state! }],
      });
      expect((consumedState as { consumed_at?: string | null }).consumed_at).toBeTruthy();

      for (const modelName of PLUGFN_REQUIRED_MODEL_NAMES) {
        expect(modelName).toBeTruthy();
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function createGitHubProvider(): Provider {
  return {
    name: 'github',
    displayName: 'GitHub',
    version: '1.0.0',
    description: 'GitHub OAuth provider',
    baseUrl: 'https://api.github.com',
    auth: {
      type: AuthType.OAuth2,
      config: {
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'user'],
        scopeSeparator: ' ',
      },
    },
    actions: {},
  };
}
