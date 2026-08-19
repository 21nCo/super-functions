import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnSocialOAuthPlugin } from '@authfn/social-oauth';
import type { AuthFnRuntimeConfig } from '../index.js';
import { createAuthFnOpenApiDocument } from '../openapi.js';

function createIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature`;
}

function createConfig(): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    openApi: {
      title: 'AuthFn API',
      version: '2026.03.22'
    },
    plugins: [
      authFnPasswordPlugin(),
      authFnEmailOtpPlugin(),
      authFnSocialOAuthPlugin()
    ],
    pluginRuntime: {
      emailOtp: {
        delivery: {
          async send() {
            return { sent: true };
          }
        },
        codeGenerator: () => '731942'
      },
      socialOAuth: {
        fetcher: async (url) => {
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
                  email: 'grace@example.com',
                  email_verified: true,
                  name: 'Grace Hopper'
                })
              })
            });
          }

          throw new Error(`unexpected fetch: ${url}`);
        },
        providers: {
          google: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
            allowlistedReturnTo: ['https://app.example.com/post-auth']
          }
        }
      }
    }
  };
}

describe('authfn openapi', () => {
  it('uses the shared generator and emits a stable auth-prefixed document', () => {
    const auth = createTestServer(createConfig());

    const first = auth.openApi?.();
    const second = auth.openApi?.();

    expect(first).toEqual(second);
    expect(first).toEqual({
      openapi: '3.1.0',
      info: {
        title: 'AuthFn API',
        version: '2026.03.22'
      },
      paths: expect.objectContaining({
        '/auth/session': expect.objectContaining({
          get: expect.objectContaining({
            operationId: 'getSession'
          })
        }),
        '/auth/sign-up/password': expect.objectContaining({
          post: expect.objectContaining({
            operationId: 'signUpWithPassword'
          })
        }),
        '/auth/sign-in/password': expect.objectContaining({
          post: expect.objectContaining({
            operationId: 'signInWithPassword'
          })
        }),
        '/auth/otp/send': expect.objectContaining({
          post: expect.objectContaining({
            operationId: 'sendOtp'
          })
        }),
        '/auth/social/start': expect.objectContaining({
          post: expect.objectContaining({
            operationId: 'startSocialSignIn'
          })
        })
      })
    });
  });

  it('wraps missing route metadata with AUTHFN_INTERNAL_ERROR', () => {
    try {
      createAuthFnOpenApiDocument(
        { openApi: { title: 'Broken', version: '1.0.0' }, basePath: '/auth' },
        {
          getRoutes() {
            return [
              {
                method: 'GET',
                path: '/broken',
                meta: {
                  openapi: {
                    include: true
                  }
                },
                handler: async () => new Response('{}')
              }
            ];
          }
        }
      );
      throw new Error('expected OpenAPI generation to fail');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'AUTHFN_INTERNAL_ERROR'
      });
    }
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
