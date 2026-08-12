import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  createAuthFn,
  createUser,
  authFnSocialOAuthPlugin,
  markUserEmailVerified,
  type AuthFnEvent,
  type AuthFnConfig
} from '../index.js';

function createIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature`;
}

function createFetcher() {
  return async (url: string) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return createResponse({
        status: 200,
        body: JSON.stringify({
          access_token: 'google-access-token',
          refresh_token: 'google-refresh-token',
          token_type: 'Bearer',
          scope: 'openid email profile',
          id_token: createIdToken({
            sub: 'google-user-01',
            email: 'ada@example.com',
            email_verified: true,
            name: 'Ada Lovelace'
          })
        })
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };
}

function createConfig(overrides: Partial<AuthFnConfig> = {}): AuthFnConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [
      authFnSocialOAuthPlugin({
        fetcher: createFetcher(),
        providers: {
          google: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
            allowlistedReturnTo: [
              'https://app.example.com/post-auth',
              'https://app.example.com/post-auth#tab=settings',
              'https://app.example.com/alternate-post-auth'
            ]
          }
        }
      })
    ],
    ...overrides
  };
}

describe('@authfn/core google social oauth', () => {
  it('completes start/callback redirect flow and rejects replayed state and disallowed returns', async () => {
    const config = createConfig();
    const auth = createAuthFn(config);

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          returnTo: 'https://app.example.com/post-auth'
        })
      })
    );
    expect(start.status).toBe(200);
    const startBody = await start.json();
    expect(startBody).toEqual({
      ok: true,
      data: {
        provider: 'google',
        redirectTo: expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth'),
        stateId: expect.any(String),
        expiresAt: expect.any(String)
      },
      requestId: expect.any(String)
    });

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('https://app.example.com/post-auth');
    expect(callback.headers.getSetCookie()).toHaveLength(2);

    const linkedAccount = await config.database.findOne?.({
      model: 'oauth_accounts',
      where: [
        { field: 'provider', operator: 'eq', value: 'google' },
        { field: 'providerAccountId', operator: 'eq', value: 'google-user-01' }
      ],
      namespace: 'authfn'
    });
    expect(linkedAccount?.email).toBe('ada@example.com');

    const replay = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(replay.status).toBe(303);
    const replayRedirect = new URL(replay.headers.get('location')!);
    expect(replayRedirect.origin + replayRedirect.pathname).toBe('https://app.example.com/post-auth');
    expect(replayRedirect.searchParams.get('auth_error')).toBe('oauth_callback_failed');
    expect(replayRedirect.searchParams.get('auth_error_code')).toBe('AUTHFN_OAUTH_STATE_REPLAYED');
    expect(replayRedirect.searchParams.get('auth_provider')).toBe('google');
    expect(replayRedirect.searchParams.get('auth_request_id')).toEqual(expect.any(String));

    const invalidReturnTo = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          returnTo: 'https://evil.example.com/callback'
        })
      })
    );
    expect(invalidReturnTo.status).toBe(400);
    expect((await invalidReturnTo.json()).error.code).toBe('AUTHFN_REDIRECT_URI_DISALLOWED');
  });

  it('allows afterOAuthCallback hooks to transform an allowlisted redirect target', async () => {
    const auth = createAuthFn(createConfig({
      hooks: {
        afterOAuthCallback: async (_ctx, payload) => {
          payload.redirectTo = 'https://app.example.com/alternate-post-auth';
        }
      }
    }));

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          returnTo: 'https://app.example.com/post-auth'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('https://app.example.com/alternate-post-auth');
  });

  it('links verified Google OAuth to an existing verified same-email user through account linking policy', async () => {
    const events: AuthFnEvent[] = [];
    const config = createConfig({
      accountLinking: {
        oauthByVerifiedEmail: {
          providers: ['google']
        }
      },
      observability: {
        emit: (event) => events.push(event)
      }
    });
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com'
    });
    await markUserEmailVerified(config, user.id, new Date('2026-03-22T00:00:00.000Z'));

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackMode: 'json'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );

    expect(callback.status).toBe(200);
    const body = await callback.json();
    expect(body.data.session.actorId).toBe(user.id);
    expect(body.data.session.methods).toEqual(['oauth-google']);
    const linkedAccount = await config.database.findOne?.({
      model: 'oauth_accounts',
      where: [
        { field: 'provider', operator: 'eq', value: 'google' },
        { field: 'providerAccountId', operator: 'eq', value: 'google-user-01' }
      ],
      namespace: 'authfn'
    });
    expect(linkedAccount?.userId).toBe(user.id);
    expect(events.some((event) => event.type === 'authfn.account_linked')).toBe(true);
  });

  it('emits account-linking conflict when same-email OAuth is not verified enough to link', async () => {
    const events: AuthFnEvent[] = [];
    const config = createConfig({
      accountLinking: {
        oauthByVerifiedEmail: {
          providers: ['google']
        }
      },
      observability: {
        emit: (event) => events.push(event)
      }
    });
    const auth = createAuthFn(config);
    await createUser(config, {
      primaryEmail: 'ada@example.com'
    });

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          callbackMode: 'json'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );

    const body = await callback.json();
    expect(body.error.code).toBe('AUTHFN_CONFLICT');
    expect(callback.status).toBe(409);
    expect(events.some((event) => event.type === 'authfn.account_linking.conflict')).toBe(true);
  });

  it('preserves existing fragment params when appending session handoff details', async () => {
    const auth = createAuthFn(createConfig());

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          returnTo: 'https://app.example.com/post-auth#tab=settings',
          handoffMode: 'session-token'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );

    expect(callback.status).toBe(303);
    const location = callback.headers.get('location');
    expect(location).toBeTruthy();
    const redirectTarget = new URL(location!);
    const fragment = new URLSearchParams(redirectTarget.hash.slice(1));
    expect(fragment.get('tab')).toBe('settings');
    expect(fragment.get('token')).toBeTruthy();
    expect(fragment.get('sessionId')).toBeTruthy();
  });
});

function createResponse(input: { status: number; body: string; contentType?: string }) {
  return {
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === 'content-type') {
          return input.contentType ?? 'application/json';
        }
        return null;
      }
    },
    async text() {
      return input.body;
    }
  };
}
