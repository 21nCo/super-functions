import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnSocialOAuthPlugin,
  createAuthFn,
  createUser,
  markUserEmailVerified,
  type AuthFnConfig
} from '../index.js';

function createGithubFetcher(options?: { failTokenExchange?: boolean; rateLimited?: boolean }) {
  return async (url: string) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      if (options?.rateLimited) {
        return createResponse({
          status: 429,
          body: JSON.stringify({
            error: 'slow_down',
            error_description: 'provider is rate limited'
          })
        });
      }

      if (options?.failTokenExchange) {
        return createResponse({
          status: 500,
          body: JSON.stringify({
            error: 'server_error',
            error_description: 'github-client-secret should stay hidden'
          })
        });
      }

      return createResponse({
        status: 200,
        body: JSON.stringify({
          access_token: 'github-access-token',
          token_type: 'Bearer',
          scope: 'read:user user:email'
        })
      });
    }

    if (url === 'https://api.github.com/user') {
      return createResponse({
        status: 200,
        body: JSON.stringify({
          id: 4242,
          login: 'ada',
          name: 'Ada Lovelace'
        })
      });
    }

    if (url === 'https://api.github.com/user/emails') {
      return createResponse({
        status: 200,
        body: JSON.stringify([
          {
            email: 'ada@example.com',
            verified: true,
            primary: true
          }
        ])
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };
}

describe('@authfn/core github social oauth', () => {
  it('links to an existing verified local user by email and can return JSON completion', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          fetcher: createGithubFetcher(),
          providers: {
            github: {
              clientId: 'github-client-id',
              clientSecret: 'github-client-secret',
              linkByVerifiedEmail: true
            }
          }
        })
      ]
    };
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
          provider: 'github',
          callbackMode: 'json'
        })
      })
    );
    expect(start.status).toBe(200);
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/github?code=github_code&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(200);
    expect(callback.headers.getSetCookie()).toHaveLength(2);
    expect(await callback.json()).toEqual({
      ok: true,
      data: {
        linked: true,
        provider: 'github',
        session: expect.objectContaining({
          primaryEmail: 'ada@example.com',
          methods: ['oauth-github']
        })
      },
      requestId: expect.any(String)
    });

    const linked = await config.database.findOne({
      model: 'oauth_accounts',
      where: [
        { field: 'provider', operator: 'eq', value: 'github' },
        { field: 'providerAccountId', operator: 'eq', value: '4242' }
      ],
      namespace: 'authfn'
    });
    expect(linked?.userId).toBe(user.id);
  });

  it('maps token exchange failures to canonical authfn errors without leaking secrets', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          fetcher: createGithubFetcher({ failTokenExchange: true }),
          providers: {
            github: {
              clientId: 'github-client-id',
              clientSecret: 'github-client-secret'
            }
          }
        })
      ]
    };
    const auth = createAuthFn(config);

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'github',
          callbackMode: 'json'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/github?code=github_code&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(500);
    const body = await callback.json();
    expect(body.error.code).toBe('AUTHFN_INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('github-client-secret');
  });

  it('maps provider rate limits to the canonical authfn rate-limited error', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          fetcher: createGithubFetcher({ rateLimited: true }),
          providers: {
            github: {
              clientId: 'github-client-id',
              clientSecret: 'github-client-secret'
            }
          }
        })
      ]
    };
    const auth = createAuthFn(config);

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'github',
          callbackMode: 'json'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/github?code=github_code&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(429);
    expect((await callback.json()).error.code).toBe('AUTHFN_RATE_LIMITED');
  });

  it('supports first-class mobile handoff with a bearer-usable session token artifact', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          fetcher: createGithubFetcher(),
          providers: {
            github: {
              clientId: 'github-client-id',
              clientSecret: 'github-client-secret',
              allowlistedReturnTo: ['memotron://oauthsignembed']
            }
          }
        })
      ]
    };
    const auth = createAuthFn(config);

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'github',
          returnTo: 'memotron://oauthsignembed'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/github?code=github_code&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(303);
    const location = callback.headers.get('location');
    expect(location).toBeTruthy();
    const redirectTarget = new URL(location!);
    expect(redirectTarget.protocol).toBe('memotron:');
    const fragment = new URLSearchParams(redirectTarget.hash.replace(/^#/, ''));
    expect(fragment.get('token')).toMatch(/^st_/);
    expect(fragment.get('sessionId')).toMatch(/^sess_/);
    expect(redirectTarget.searchParams.get('token')).toBeNull();
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
