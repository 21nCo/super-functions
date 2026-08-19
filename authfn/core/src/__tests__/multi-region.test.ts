import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';
import {
  authFnMultiRegionEnvironment,
  authFnMultiRegionPlugin,
  type AuthFnRegionLookupRecord
} from '@authfn/multi-region';
import { authFnPasswordPlugin } from '@authfn/password';
import type { ConditionalKVStoreAdapter } from '@superfunctions/db';
import type { AuthFnDeliveryRequest, AuthFnPlugin, AuthFnRuntimeConfig } from '../index.js';
import { findUserByPrimaryEmail } from '../core/users.js';
import { getLatestOtpChallenge } from '../core/verifications.js';

function createLookupStore(
  records: Map<string, AuthFnRegionLookupRecord>,
  lookupCalls?: string[]
): ConditionalKVStoreAdapter {
  return {
    async get(key) {
      const identifier = identifierFromLookupKey(key);
      lookupCalls?.push(identifier);
      const record = records.get(identifier);
      return record ? JSON.stringify(record) : null;
    },
    async set(input) {
      const record = JSON.parse(input.value) as AuthFnRegionLookupRecord;
      records.set(identifierFromLookupKey(input.key), record);
    },
    async setIfAbsent(input) {
      const identifier = identifierFromLookupKey(input.key);
      const existing = records.get(identifier);
      if (existing) {
        return { inserted: false, existing: JSON.stringify(existing) };
      }
      records.set(identifier, JSON.parse(input.value) as AuthFnRegionLookupRecord);
      return { inserted: true };
    },
    async delete(key) {
      records.delete(identifierFromLookupKey(key));
    }
  };
}

function identifierFromLookupKey(key: string): string {
  return key.replace(/^authfn:region:/, '');
}

describe('authfn multi-region plugin', () => {
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
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      environment: authFnMultiRegionEnvironment({
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
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnEmailOtpPlugin(),
        authFnMultiRegionPlugin()
      ],
      pluginRuntime: {
        emailOtp: {
          delivery: otpDelivery,
          codeGenerator: () => '731942'
        }
      }
    };
    const auth = createTestServer(config);

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
      new Request('https://eu.account.example.com/auth/environment')
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

  it('uses lookupStore with plugin-owned normalization and cache acceleration', async () => {
    const records = new Map<string, AuthFnRegionLookupRecord>();
    const lookupCalls: string[] = [];
    const cacheWrites: string[] = [];
    const cache = new Map<string, string>();
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      stores: {
        kv: {
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
        }
      },
      namespace: 'nucleus',
      environment: authFnMultiRegionEnvironment({
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
        lookupStore: createLookupStore(records, lookupCalls)
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin()
      ],
      pluginRuntime: {}
    };
    const auth = createTestServer(config);

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
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      environment: authFnMultiRegionEnvironment({
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
          async get() {
            return null;
          },
          async set() {
          },
          async setIfAbsent(input) {
            const record = JSON.parse(input.value) as AuthFnRegionLookupRecord;
            return {
              inserted: false,
              existing: JSON.stringify({
                ...record,
                userId: 'user_external',
                regionId: 'eu-west-1',
                authority: 'https://eu.account.example.com'
              })
            };
          },
          async delete() {
          }
        }
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin()
      ],
      pluginRuntime: {}
    };
    const auth = createTestServer(config);

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
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      environment: authFnMultiRegionEnvironment({
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
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin()
      ],
      pluginRuntime: {}
    };
    const auth = createTestServer(config);

    const runtime = await auth.router.handle(
      new Request('https://account-euwest-dev.nucleum.app/auth/environment')
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

  it('treats product-specific account aliases for the same region as locally aligned', async () => {
    const records = new Map<string, AuthFnRegionLookupRecord>();
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      environment: authFnMultiRegionEnvironment({
        regions: [
          {
            regionId: 'insouth',
            authority: 'https://account-insouth-dev.nucleum.app',
            hosts: ['account-insouth-dev.nucleum.app'],
            domain: '.nucleum.app'
          },
          {
            regionId: 'useast',
            authority: 'https://account-useast-dev.nucleum.app',
            hosts: ['account-useast-dev.nucleum.app'],
            domain: '.nucleum.app'
          },
          {
            regionId: 'insouth',
            authority: 'https://account-insouth-dev.memotron.app',
            hosts: ['account-insouth-dev.memotron.app'],
            domain: '.memotron.app'
          },
          {
            regionId: 'useast',
            authority: 'https://account-useast-dev.memotron.app',
            hosts: ['account-useast-dev.memotron.app'],
            domain: '.memotron.app'
          }
        ],
        lookupStore: createLookupStore(records)
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin()
      ],
      pluginRuntime: {}
    };
    const auth = createTestServer(config);

    const signUp = await auth.router.handle(
      new Request('https://account-insouth-dev.nucleum.app/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'shared@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(signUp.status).toBe(200);
    expect(records.get('shared@example.com')).toMatchObject({
      regionId: 'insouth',
      authority: 'https://account-insouth-dev.nucleum.app'
    });

    const memotronSameRegionLookup = await auth.router.handle(
      new Request('https://account-insouth-dev.memotron.app/auth/regions/lookup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          identifier: 'shared@example.com'
        })
      })
    );
    expect(memotronSameRegionLookup.status).toBe(200);
    expect(await memotronSameRegionLookup.json()).toMatchObject({
      ok: true,
      data: {
        regionId: 'insouth',
        authority: 'https://account-insouth-dev.memotron.app',
        continueLocally: true
      }
    });

    const memotronCrossRegionLookup = await auth.router.handle(
      new Request('https://account-useast-dev.memotron.app/auth/regions/lookup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          identifier: 'shared@example.com'
        })
      })
    );
    expect(memotronCrossRegionLookup.status).toBe(200);
    expect(await memotronCrossRegionLookup.json()).toMatchObject({
      ok: true,
      data: {
        regionId: 'insouth',
        authority: 'https://account-insouth-dev.memotron.app',
        redirectTo: 'https://account-insouth-dev.memotron.app',
        continueLocally: false
      }
    });

    const memotronSignIn = await auth.router.handle(
      new Request('https://account-insouth-dev.memotron.app/auth/sign-in/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'shared@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(memotronSignIn.status).toBe(200);
    expect(memotronSignIn.headers.getSetCookie().some((cookie) => cookie.includes('Domain=.memotron.app'))).toBe(true);
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

    const failingBeforeConfig: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      environment: authFnMultiRegionEnvironment({
        regions: [
          {
            regionId: 'us-east-1',
            authority: 'https://us.account.example.com',
            hosts: ['us.account.example.com']
          }
        ],
        lookupStore: {
          async get() {
            return null;
          },
          async set() {
          },
          async setIfAbsent(input) {
            hookOrder.push('multiRegion:afterUserCreate');
            return { inserted: true };
          },
          async delete() {
          }
        }
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin(),
        customBeforePlugin,
        abortingPlugin
      ]
    };
    const failingBeforeAuth = createTestServer(failingBeforeConfig);
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

    const successConfig: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      environment: authFnMultiRegionEnvironment({
        regions: [
          {
            regionId: 'us-east-1',
            authority: 'https://us.account.example.com',
            hosts: ['us.account.example.com']
          }
        ],
        lookupStore: {
          async get() {
            return null;
          },
          async set() {
          },
          async setIfAbsent() {
            hookOrder.push('multiRegion:afterUserCreate');
            return { inserted: true };
          },
          async delete() {
          }
        }
      }),
      plugins: [
        authFnPasswordPlugin(),
        authFnMultiRegionPlugin(),
        afterAuditPlugin
      ],
      pluginRuntime: {}
    };
    const successAuth = createTestServer(successConfig);
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
