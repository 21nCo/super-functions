import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnEmailOtpPlugin,
  authFnMultiRegionPlugin,
  authFnPasswordPlugin,
  createAuthFn,
  findUserByPrimaryEmail,
  getLatestOtpChallenge,
  type AuthFnConfig,
  type AuthFnDeliveryRequest,
  type AuthFnRegionLookupRecord,
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
    const otpCodes = new Map<string, string>();
    const otpDelivery = {
      async send(input: AuthFnDeliveryRequest) {
        otpCodes.set(`${input.purpose}:${input.email}`, input.code);
        return {
          sent: true
        };
      }
    };
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: createRuntimeResolver(),
      plugins: [
        authFnPasswordPlugin(),
        authFnEmailOtpPlugin({
          delivery: otpDelivery,
          codeGenerator: () => '731942'
        }),
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

    const crossRegionOtpSend = await auth.router.handle(
      new Request('https://us.account.example.com/auth/otp/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          purpose: 'sign-up'
        })
      })
    );
    expect(crossRegionOtpSend.status).toBe(200);

    const crossRegionOtpSignUp = await auth.router.handle(
      new Request('https://us.account.example.com/auth/otp/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          purpose: 'sign-up',
          code: otpCodes.get('sign-up:ada@example.com'),
          sessionMode: 'hybrid'
        })
      })
    );
    expect(crossRegionOtpSignUp.status).toBe(409);
    expect(await crossRegionOtpSignUp.json()).toEqual({
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
    const crossRegionOtpChallenge = await getLatestOtpChallenge(config, 'sign-up', 'ada@example.com');
    expect(crossRegionOtpChallenge?.consumedAt).toBeNull();

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

  it('uses lookupStore with plugin-owned normalization and cacheStore acceleration', async () => {
    const records = new Map<string, AuthFnRegionLookupRecord>();
    const lookupCalls: string[] = [];
    const cacheWrites: string[] = [];
    const cache = new Map<string, string>();
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      cacheStore: {
        async get(key) {
          return cache.get(key) ?? null;
        },
        async set(input) {
          cacheWrites.push(input.key);
          cache.set(input.key, input.value);
        },
        async delete(key) {
          cache.delete(key);
        }
      },
      namespace: 'nucleus',
      runtime: createRuntimeResolver(),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin({
          regions: [
            {
              regionId: 'us-east-1',
              authority: 'https://us.account.example.com',
              hosts: ['us.account.example.com']
            },
            {
              regionId: 'eu-west-1',
              authority: 'https://eu.account.example.com',
              hosts: ['eu.account.example.com']
            }
          ],
          lookupStore: {
            async getByIdentifier(identifier) {
              lookupCalls.push(identifier);
              return records.get(identifier) ?? null;
            },
            async putIfAbsent(record) {
              const existing = records.get(record.identifier);
              if (existing) {
                return {
                  inserted: false,
                  existing
                };
              }
              records.set(record.identifier, record);
              return {
                inserted: true
              };
            },
            async update(record) {
              records.set(record.identifier, record);
              return record;
            },
            async deleteByIdentifier(identifier) {
              records.delete(identifier);
            }
          }
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
          email: 'Ada@Example.COM',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(signUp.status).toBe(200);
    expect(records.get('ada@example.com')).toMatchObject({
      identifier: 'ada@example.com',
      regionId: 'eu-west-1',
      authority: 'https://eu.account.example.com'
    });
    expect(lookupCalls).toEqual(['ada@example.com', 'ada@example.com']);
    expect(cacheWrites.some((key) => key.startsWith('authfn:nucleus:region:'))).toBe(true);

    const lookup = await auth.router.handle(
      new Request('https://us.account.example.com/auth/regions/lookup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          identifier: 'ADA@example.com'
        })
      })
    );
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject({
      ok: true,
      data: {
        identifier: 'ada@example.com',
        regionId: 'eu-west-1',
        continueLocally: false,
        redirectTo: 'https://eu.account.example.com'
      }
    });
    expect(lookupCalls).toEqual(['ada@example.com', 'ada@example.com']);

    const mismatch = await auth.router.handle(
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
    expect(mismatch.status).toBe(409);
    expect((await mismatch.json()).error.details).toMatchObject({
      identifier: 'ada@example.com',
      regionId: 'eu-west-1',
      authority: 'https://eu.account.example.com'
    });

    const miss = await auth.router.handle(
      new Request('https://us.account.example.com/auth/regions/lookup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          identifier: 'grace@example.com'
        })
      })
    );
    expect(miss.status).toBe(200);
    expect(await miss.json()).toMatchObject({
      ok: true,
      data: {
        identifier: 'grace@example.com',
        continueLocally: true
      }
    });
    records.set('grace@example.com', {
      identifier: 'grace@example.com',
      userId: 'user_external',
      regionId: 'eu-west-1',
      authority: 'https://eu.account.example.com',
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:00.000Z'
    });

    const staleMissMismatch = await auth.router.handle(
      new Request('https://us.account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'grace@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(staleMissMismatch.status).toBe(409);
    expect((await staleMissMismatch.json()).error.details).toMatchObject({
      identifier: 'grace@example.com',
      regionId: 'eu-west-1',
      authority: 'https://eu.account.example.com'
    });
    expect(lookupCalls.filter((identifier) => identifier === 'grace@example.com')).toHaveLength(2);
    await expect(findUserByPrimaryEmail(config, 'grace@example.com')).resolves.toBeNull();
  });

  it('fails password sign-up and rolls back local records when global lookup conflicts after user creation', async () => {
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
              hosts: ['us.account.example.com']
            },
            {
              regionId: 'eu-west-1',
              authority: 'https://eu.account.example.com',
              hosts: ['eu.account.example.com']
            }
          ],
          lookupStore: {
            async getByIdentifier() {
              return null;
            },
            async putIfAbsent(record) {
              return {
                inserted: false,
                existing: {
                  ...record,
                  userId: 'user_external',
                  regionId: 'eu-west-1',
                  authority: 'https://eu.account.example.com'
                }
              };
            },
            async update(record) {
              return record;
            },
            async deleteByIdentifier() {
              // no-op
            }
          }
        })
      ]
    };
    const auth = createAuthFn(config);

    const response = await auth.router.handle(
      new Request('https://us.account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'race@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: 'AUTHFN_REGION_MISMATCH',
      details: {
        identifier: 'race@example.com',
        userId: 'user_external',
        regionId: 'eu-west-1',
        authority: 'https://eu.account.example.com'
      }
    });
    await expect(findUserByPrimaryEmail(config, 'race@example.com')).resolves.toBeNull();
    await expect(config.database.findMany({
      model: 'password_credentials',
      where: [],
      namespace: 'authfn'
    })).resolves.toHaveLength(0);
    await expect(config.database.findMany({
      model: 'region_profiles',
      where: [],
      namespace: 'authfn'
    })).resolves.toHaveLength(0);
  });

  it('does not use shared cookie domains as routable region hosts', async () => {
    const sharedDomain = '.nucleum.app';
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: createRuntimeResolver(),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin({
          regions: [
            {
              regionId: 'insouth',
              authority: 'https://account-insouth-dev.nucleum.app',
              hosts: ['account-insouth-dev.nucleum.app'],
              domain: sharedDomain
            },
            {
              regionId: 'useast',
              authority: 'https://account-useast-dev.nucleum.app',
              hosts: ['account-useast-dev.nucleum.app'],
              domain: sharedDomain
            },
            {
              regionId: 'euwest',
              authority: 'https://account-euwest-dev.nucleum.app',
              hosts: ['account-euwest-dev.nucleum.app'],
              domain: sharedDomain
            }
          ]
        })
      ]
    };
    const auth = createAuthFn(config);

    const runtime = await auth.router.handle(
      new Request('https://account-euwest-dev.nucleum.app/auth/runtime')
    );

    expect(runtime.status).toBe(200);
    expect(await runtime.json()).toMatchObject({
      ok: true,
      data: {
        issuer: 'https://account-euwest-dev.nucleum.app',
        baseUrl: 'https://account-euwest-dev.nucleum.app',
        regionId: 'euwest',
        cookie: {
          domain: sharedDomain
        }
      }
    });

    const signUp = await auth.router.handle(
      new Request('https://account-euwest-dev.nucleum.app/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'euwest-user@nucleum.app',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(signUp.status).toBe(200);
    expect(await signUp.json()).toMatchObject({
      ok: true,
      data: {
        session: {
          regionId: 'euwest'
        }
      }
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
