import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnMultiRegionPlugin,
  authFnPasswordPlugin,
  createAuthFn,
  findUserByPrimaryEmail,
  type AuthFnConfig,
  type AuthFnPlugin
} from '../index.js';

function createRuntimeResolver() {
  return {
    resolve(request: Request) {
      const url = new URL(request.url);
      return {
        issuer: url.origin,
        baseUrl: url.origin,
        cookie: {
          prefix: 'authfn-base',
          sameSite: 'lax'
        },
        oauth: {
          google: {
            clientId: 'base-google-client',
            scopes: ['openid', 'email']
          }
        }
      };
    }
  };
}

describe('@authfn/core multi-region plugin', () => {
  it('returns deterministic lookup guidance, exposes runtime overrides, and rejects cross-region sign-in completion', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: createRuntimeResolver(),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin({
          regions: [
            {
              regionId: 'us-east-1',
              authority: 'https://us.account.example.com',
              hosts: ['us.account.example.com'],
              cookie: {
                prefix: 'authfn-us'
              },
              oauth: {
                google: {
                  clientId: 'us-google-client',
                  scopes: ['openid', 'email', 'profile']
                }
              }
            },
            {
              regionId: 'eu-west-1',
              authority: 'https://eu.account.example.com',
              hosts: ['eu.account.example.com'],
              domain: '.example.com',
              cookie: {
                prefix: 'authfn-eu',
                sameSite: 'none'
              },
              oauth: {
                google: {
                  clientId: 'eu-google-client',
                  scopes: ['openid', 'email', 'profile']
                }
              }
            }
          ]
        })
      ]
    };
    const auth = createAuthFn(config);

    const signUp = await auth.router.handle(
      new Request('https://eu.account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(signUp.status).toBe(200);
    const signUpBody = await signUp.json();
    expect(signUpBody.data.session.regionId).toBe('eu-west-1');
    expect(signUp.headers.getSetCookie().some((cookie) => cookie.startsWith('__Secure-authfn-eu.session='))).toBe(true);

    const runtime = await auth.router.handle(
      new Request('https://eu.account.example.com/auth/runtime')
    );
    expect(runtime.status).toBe(200);
    expect(await runtime.json()).toEqual({
      ok: true,
      data: {
        issuer: 'https://eu.account.example.com',
        baseUrl: 'https://eu.account.example.com',
        regionId: 'eu-west-1',
        cookie: {
          prefix: 'authfn-eu',
          domain: '.example.com',
          secure: true,
          sameSite: 'none',
          path: '/',
          sessionCookieName: '__Secure-authfn-eu.session',
          csrfCookieName: 'authfn-eu.csrf'
        },
        oauth: {
          google: {
            clientId: 'eu-google-client',
            hasClientSecret: false,
            hasClientSecretResolver: false,
            allowlistedRedirectUris: [],
            allowlistedReturnTo: [],
            scopes: ['openid', 'email', 'profile']
          }
        }
      },
      requestId: expect.any(String)
    });

    const lookup = await auth.router.handle(
      new Request('https://us.account.example.com/auth/regions/lookup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          identifier: 'ada@example.com'
        })
      })
    );
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toEqual({
      ok: true,
      data: {
        identifier: 'ada@example.com',
        userId: expect.any(String),
        regionId: 'eu-west-1',
        authority: 'https://eu.account.example.com',
        domain: '.example.com',
        continueLocally: false,
        redirectTo: 'https://eu.account.example.com'
      },
      requestId: expect.any(String)
    });

    const crossRegionSignUp = await auth.router.handle(
      new Request('https://us.account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(crossRegionSignUp.status).toBe(409);
    expect(await crossRegionSignUp.json()).toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_REGION_MISMATCH',
        message: 'Request must continue on a different region authority',
        retryable: false,
        details: {
          identifier: 'ada@example.com',
          userId: expect.any(String),
          regionId: 'eu-west-1',
          authority: 'https://eu.account.example.com',
          redirectTo: 'https://eu.account.example.com',
          continueLocally: false
        }
      },
      requestId: expect.any(String)
    });

    const mismatch = await auth.router.handle(
      new Request('https://us.account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_REGION_MISMATCH',
        message: 'Request must continue on a different region authority',
        retryable: false,
        details: {
          userId: expect.any(String),
          regionId: 'eu-west-1',
          authority: 'https://eu.account.example.com',
          redirectTo: 'https://eu.account.example.com',
          continueLocally: false
        }
      },
      requestId: expect.any(String)
    });
  });

  it('keeps built-in plugins on the normal hook contract with before* fail-closed, after* fail-open, and deterministic ordering', async () => {
    const hookOrder: string[] = [];
    const customBeforePlugin: AuthFnPlugin = {
      name: 'customBefore',
      hooks: {
        beforeUserCreate: async (_ctx, input) => {
          hookOrder.push('customBefore:beforeUserCreate');
          return {
            ...input,
            metadata: {
              stage: 'transformed'
            }
          };
        }
      }
    };
    const abortingPlugin: AuthFnPlugin = {
      name: 'abortingPlugin',
      hooks: {
        beforeUserCreate: async () => {
          hookOrder.push('abortingPlugin:beforeUserCreate');
          throw new Error('stop sign-up');
        }
      }
    };

    const failingBeforeConfig: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: createRuntimeResolver(),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin(),
        customBeforePlugin,
        abortingPlugin
      ]
    };
    const failingBeforeAuth = createAuthFn(failingBeforeConfig);
    const aborted = await failingBeforeAuth.router.handle(
      new Request('https://us.account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'bea@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(aborted.status).toBe(500);
    expect((await aborted.json()).error.code).toBe('AUTHFN_PLUGIN_ABORTED');
    expect(hookOrder).toEqual([
      'customBefore:beforeUserCreate',
      'abortingPlugin:beforeUserCreate'
    ]);
    await expect(findUserByPrimaryEmail(failingBeforeConfig, 'bea@example.com')).resolves.toBeNull();

    hookOrder.length = 0;
    const afterAuditPlugin: AuthFnPlugin = {
      name: 'afterAudit',
      hooks: {
        afterUserCreate: async () => {
          hookOrder.push('afterAudit:afterUserCreate');
          throw new Error('observe only');
        }
      }
    };

    const successConfig: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: createRuntimeResolver(),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin({
          regions: [
            {
              regionId: 'us-east-1',
              authority: 'https://us.account.example.com',
              hosts: ['us.account.example.com']
            }
          ],
          directory: {
            registerUser: async () => {
              hookOrder.push('multiRegion:afterUserCreate');
            },
            lookupByIdentifier: async () => null
          }
        }),
        afterAuditPlugin
      ]
    };
    const successAuth = createAuthFn(successConfig);
    const success = await successAuth.router.handle(
      new Request('https://us.account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'cy@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(success.status).toBe(200);
    expect(hookOrder).toEqual([
      'multiRegion:afterUserCreate',
      'afterAudit:afterUserCreate'
    ]);
    await expect(findUserByPrimaryEmail(successConfig, 'cy@example.com')).resolves.toMatchObject({
      primaryEmail: 'cy@example.com'
    });
    const regionProfile = await successConfig.database.findOne({
      model: 'region_profiles',
      where: [{ field: 'userId', operator: 'eq', value: (await findUserByPrimaryEmail(successConfig, 'cy@example.com'))!.id }],
      namespace: 'authfn'
    });
    expect(regionProfile?.regionId).toBe('us-east-1');
  });
});
