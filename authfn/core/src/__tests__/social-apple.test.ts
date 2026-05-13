import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  createAuthFn,
  authFnSocialOAuthPlugin,
  type AuthFnConfig
} from '../index.js';

function createIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature`;
}

describe('@authfn/core apple social oauth', () => {
  it('uses runtime client secret resolution and links the local account', async () => {
    let capturedBody = '';
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: {
        resolve() {
          return {
            issuer: 'https://account.example.com',
            baseUrl: 'https://account.example.com',
            oauth: {
              apple: {
                clientId: 'apple-client-id',
                clientSecretResolver: async () => ({
                  clientSecret: 'generated-apple-client-secret'
                }),
                allowlistedReturnTo: ['https://app.example.com/apple-post-auth']
              }
            }
          };
        }
      },
      plugins: [
        authFnSocialOAuthPlugin({
          fetcher: async (url, init) => {
            if (url !== 'https://appleid.apple.com/auth/token') {
              throw new Error(`unexpected fetch: ${url}`);
            }

            capturedBody = init.body ?? '';
            return createResponse({
              status: 200,
              body: JSON.stringify({
                access_token: 'apple-access-token',
                refresh_token: 'apple-refresh-token',
                token_type: 'Bearer',
                id_token: createIdToken({
                  sub: 'apple-user-01',
                  email: 'ada.apple@example.com',
                  name: 'Ada Apple'
                })
              })
            });
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
          provider: 'apple',
          returnTo: 'https://app.example.com/apple-post-auth'
        })
      })
    );
    const startBody = await start.json();
    const authorizeUrl = new URL(startBody.data.redirectTo);
    expect(authorizeUrl.searchParams.get('response_mode')).toBe('form_post');
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('code_challenge')).toBeNull();
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBeNull();

    const callback = await auth.router.handle(
      new Request('https://account.example.com/auth/social/callback/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: 'apple_code',
          state: startBody.data.stateId
        })
      })
    );
    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('https://app.example.com/apple-post-auth');
    expect(callback.headers.getSetCookie()).toHaveLength(2);

    const params = new URLSearchParams(capturedBody);
    expect(params.get('client_secret')).toBe('generated-apple-client-secret');

    const linked = await config.database.findOne({
      model: 'oauth_accounts',
      where: [
        { field: 'provider', operator: 'eq', value: 'apple' },
        { field: 'providerAccountId', operator: 'eq', value: 'apple-user-01' }
      ],
      namespace: 'authfn'
    });
    expect(linked?.email).toBe('ada.apple@example.com');
  });

  it('rejects callbacks that do not resolve required Apple claims', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          providers: {
            apple: {
              clientId: 'apple-client-id',
              nativeClientIds: ['io.nucleum'],
              clientSecretResolver: async () => ({
                clientSecret: 'generated-apple-client-secret'
              }),
              allowlistedReturnTo: ['https://app.example.com/apple-post-auth']
            }
          },
          fetcher: async () =>
            createResponse({
              status: 200,
              body: JSON.stringify({
                access_token: 'apple-access-token',
                token_type: 'Bearer',
                id_token: createIdToken({
                  sub: 'apple-user-02'
                })
              })
            })
        })
      ]
    };
    const auth = createAuthFn(config);

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'apple',
          returnTo: 'https://app.example.com/apple-post-auth'
        })
      })
    );
    const startBody = await start.json();

    const callback = await auth.router.handle(
      new Request(
        `https://account.example.com/auth/social/callback/apple?code=apple_code&state=${encodeURIComponent(startBody.data.stateId)}`,
        { method: 'GET' }
      )
    );
    expect(callback.status).toBe(303);
    const redirectTo = new URL(callback.headers.get('location')!);
    expect(redirectTo.origin + redirectTo.pathname).toBe('https://app.example.com/apple-post-auth');
    expect(redirectTo.searchParams.get('auth_error')).toBe('oauth_callback_failed');
    expect(redirectTo.searchParams.get('auth_error_code')).toBe('AUTHFN_OAUTH_CALLBACK_INVALID');
    expect(redirectTo.searchParams.get('auth_provider')).toBe('apple');
    expect(redirectTo.searchParams.get('auth_request_id')).toBeTruthy();
  });

  it('uses Apple form_post id_token and user payload without token exchange', async () => {
    let tokenExchangeAttempted = false;
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          providers: {
            apple: {
              clientId: 'apple-client-id',
              nativeClientIds: ['io.nucleum'],
              clientSecretResolver: async () => ({
                clientSecret: 'generated-apple-client-secret'
              }),
              allowlistedReturnTo: ['https://app.example.com/apple-post-auth']
            }
          },
          fetcher: async () => {
            tokenExchangeAttempted = true;
            throw new Error('token exchange should not be called for Apple form_post identity');
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
          provider: 'apple',
          returnTo: 'https://app.example.com/apple-post-auth'
        })
      })
    );
    const startBody = await start.json();
    const authorizeUrl = new URL(startBody.data.redirectTo);
    const nonce = authorizeUrl.searchParams.get('nonce');
    expect(nonce).toBeTruthy();

    const callback = await auth.router.handle(
      new Request('https://account.example.com/auth/social/callback/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: 'apple_code',
          state: startBody.data.stateId,
          id_token: createIdToken({
            iss: 'https://appleid.apple.com',
            aud: 'apple-client-id',
            sub: 'apple-user-03',
            email: 'formpost.apple@example.com',
            email_verified: 'true',
            nonce
          }),
          user: JSON.stringify({
            email: 'formpost.apple@example.com',
            name: {
              firstName: 'Form',
              lastName: 'Post'
            }
          })
        })
      })
    );

    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('https://app.example.com/apple-post-auth');
    expect(callback.headers.getSetCookie()).toHaveLength(2);
    expect(tokenExchangeAttempted).toBe(false);

    const linked = await config.database.findOne({
      model: 'oauth_accounts',
      where: [
        { field: 'provider', operator: 'eq', value: 'apple' },
        { field: 'providerAccountId', operator: 'eq', value: 'apple-user-03' }
      ],
      namespace: 'authfn'
    });
    expect(linked?.email).toBe('formpost.apple@example.com');
    expect(linked?.profile).toMatchObject({
      name: 'Form Post',
      firstName: 'Form',
      lastName: 'Post'
    });
  });

  it('supports native Apple sign-in with nonce-bound identity tokens', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnSocialOAuthPlugin({
          providers: {
            apple: {
              clientId: 'apple-client-id',
              nativeClientIds: ['io.nucleum'],
              clientSecretResolver: async () => ({
                clientSecret: 'generated-apple-client-secret'
              }),
              allowlistedReturnTo: ['nucleum://oauthsignin']
            }
          }
        })
      ]
    };
    const auth = createAuthFn(config);

    const start = await auth.router.handle(
      new Request('https://account.example.com/auth/social/native/apple/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          returnTo: 'nucleum://oauthsignin',
          handoffMode: 'session-token'
        })
      })
    );
    const startBody = await start.json();
    expect(startBody.ok).toBe(true);

    const complete = await auth.router.handle(
      new Request('https://account.example.com/auth/social/native/apple/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stateId: startBody.data.stateId,
          identityToken: createIdToken({
            iss: 'https://appleid.apple.com',
            aud: 'io.nucleum',
            sub: 'native-apple-user-01',
            email: 'native.apple@example.com',
            email_verified: 'true',
            nonce: startBody.data.nonce
          }),
          user: {
            email: 'native.apple@example.com',
            name: {
              firstName: 'Native',
              lastName: 'Apple'
            }
          }
        })
      })
    );
    const completeBody = await complete.json();
    expect(complete.status).toBe(200);
    expect(completeBody.ok).toBe(true);
    expect(completeBody.data.token).toMatch(/^st_/);
    expect(completeBody.data.isNewUser).toBe(true);
    expect(completeBody.data.regionId).toBeUndefined();

    const linked = await config.database.findOne({
      model: 'oauth_accounts',
      where: [
        { field: 'provider', operator: 'eq', value: 'apple' },
        { field: 'providerAccountId', operator: 'eq', value: 'native-apple-user-01' }
      ],
      namespace: 'authfn'
    });
    expect(linked?.email).toBe('native.apple@example.com');
    expect(linked?.profile).toMatchObject({
      name: 'Native Apple'
    });
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
