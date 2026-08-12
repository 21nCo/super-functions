import { describe, expect, it } from 'vitest';
import { createAuthFnRegionalClient, type AuthFnCachedRegion, type AuthFnRegionStorage } from '../index.js';

function memoryRegionStorage(): AuthFnRegionStorage & { values: Map<string, AuthFnCachedRegion> } {
  const values = new Map<string, AuthFnCachedRegion>();
  return {
    values,
    async get(identifier) {
      return values.get(identifier) ?? null;
    },
    async set(identifier, value) {
      values.set(identifier, value);
    },
    async delete(identifier) {
      values.delete(identifier);
    }
  };
}

describe('@authfn/client regional client', () => {
  it('caches mismatch metadata and retries password sign-in once on the target region', async () => {
    const storage = memoryRegionStorage();
    const urls: string[] = [];
    const client = createAuthFnRegionalClient({
      defaultRegionId: 'us-east-1',
      resolveBaseUrl: (regionId) => `https://${regionId}.account.example.com/auth`,
      storage,
      clientOptions: {
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          urls.push(url);
          if (url.includes('/regions/lookup')) {
            return Response.json({
              ok: false,
              error: {
                code: 'AUTHFN_REGION_NOT_FOUND',
                message: 'not found',
                retryable: false
              },
              requestId: 'req_lookup'
            }, {
              status: 404
            });
          }
          if (new URL(url).origin === 'https://us-east-1.account.example.com') {
            return Response.json({
              ok: false,
              error: {
                code: 'AUTHFN_REGION_MISMATCH',
                message: 'wrong region',
                retryable: false,
                details: {
                  regionId: 'eu-west-1',
                  authority: 'https://eu-west-1.account.example.com/auth',
                  redirectTo: 'https://eu-west-1.account.example.com/auth'
                }
              },
              requestId: 'req_mismatch'
            }, {
              status: 409
            });
          }
          return Response.json({
            ok: true,
            data: {
              session: {
                id: 'sess_1',
                type: 'session',
                subject: {
                  actorId: 'user_1',
                  actorType: 'user',
                  regionId: 'eu-west-1'
                },
                actorType: 'user',
                actorId: 'user_1',
                regionId: 'eu-west-1',
                resourceIds: [],
                methods: ['password']
              }
            },
            requestId: 'req_success'
          });
        }
      }
    });

    const result = await client.signInWithPassword({
      email: 'ADA@example.com',
      password: 'Sup3rSecurePassphrase!'
    });

    expect(result.ok).toBe(true);
    expect(client.getCurrentRegionId()).toBe('eu-west-1');
    expect(storage.values.get('ada@example.com')).toMatchObject({
      regionId: 'eu-west-1'
    });
    expect(urls).toEqual([
      'https://us-east-1.account.example.com/auth/regions/lookup',
      'https://us-east-1.account.example.com/auth/sign-in/password',
      'https://eu-west-1.account.example.com/auth/sign-in/password'
    ]);
  });

  it('blocks sign-up methods when lookup finds an existing account in any region', async () => {
    const storage = memoryRegionStorage();
    const urls: string[] = [];
    const client = createAuthFnRegionalClient({
      defaultRegionId: 'us-east-1',
      resolveBaseUrl: (regionId) => `https://${regionId}.account.example.com/auth`,
      storage,
      clientOptions: {
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          urls.push(url);
          return Response.json({
            ok: true,
            data: {
              identifier: 'ada@example.com',
              userId: 'user_1',
              regionId: 'eu-west-1',
              authority: 'https://eu-west-1.account.example.com/auth',
              continueLocally: false,
              redirectTo: 'https://eu-west-1.account.example.com/auth'
            },
            requestId: 'req_lookup'
          });
        }
      }
    });

    const sent = await client.sendOtp({
      purpose: 'sign-up',
      email: 'ADA@example.com'
    });
    expect(sent.ok).toBe(false);
    if (sent.ok) {
      throw new Error('sendOtp sign-up should be blocked');
    }
    expect(sent.error).toMatchObject({
      code: 'AUTHFN_ACCOUNT_ALREADY_EXISTS',
      details: {
        identifier: 'ada@example.com',
        userId: 'user_1',
        regionId: 'eu-west-1'
      }
    });

    const passwordSignUp = await client.signUpWithPassword({
      email: 'ADA@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    expect(passwordSignUp.ok).toBe(false);
    if (passwordSignUp.ok) {
      throw new Error('password sign-up should be blocked');
    }
    expect(passwordSignUp.error.code).toBe('AUTHFN_ACCOUNT_ALREADY_EXISTS');

    expect(client.getCurrentRegionId()).toBe('us-east-1');
    expect(storage.values.get('ada@example.com')).toMatchObject({
      regionId: 'eu-west-1'
    });
    expect(urls).toEqual([
      'https://us-east-1.account.example.com/auth/regions/lookup',
      'https://us-east-1.account.example.com/auth/regions/lookup'
    ]);
  });

  it('keeps new sign-up OTP in the selected region after lookup preflight', async () => {
    const storage = memoryRegionStorage();
    const urls: string[] = [];
    const client = createAuthFnRegionalClient({
      defaultRegionId: 'us-east-1',
      resolveBaseUrl: (regionId) => `https://${regionId}.account.example.com/auth`,
      storage,
      clientOptions: {
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          urls.push(url);
          if (url.endsWith('/regions/lookup')) {
            return Response.json({
              ok: true,
              data: {
                identifier: 'new@example.com',
                regionId: 'eu-west-1',
                authority: 'https://eu-west-1.account.example.com/auth',
                continueLocally: true
              },
              requestId: 'req_lookup'
            });
          }
          return Response.json({
            ok: true,
            data: {
              challengeId: 'otp_1',
              sent: true
            },
            requestId: 'req_send'
          });
        }
      }
    });
    client.setCurrentRegionId('eu-west-1');

    const sent = await client.sendOtp({
      purpose: 'sign-up',
      email: 'new@example.com'
    });

    expect(sent.ok).toBe(true);
    expect(client.getCurrentRegionId()).toBe('eu-west-1');
    expect(storage.values.get('new@example.com')).toMatchObject({
      regionId: 'eu-west-1'
    });
    expect(urls).toEqual([
      'https://eu-west-1.account.example.com/auth/regions/lookup',
      'https://eu-west-1.account.example.com/auth/otp/send'
    ]);
  });

  it('looks up uncached identifiers through the currently selected region', async () => {
    const storage = memoryRegionStorage();
    const urls: string[] = [];
    const client = createAuthFnRegionalClient({
      defaultRegionId: 'us-east-1',
      resolveBaseUrl: (regionId) => `https://${regionId}.account.example.com/auth`,
      storage,
      clientOptions: {
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          urls.push(url);
          return Response.json({
            ok: true,
            data: {
              identifier: 'new@example.com',
              regionId: 'eu-west-1',
              authority: 'https://eu-west-1.account.example.com/auth',
              continueLocally: true
            },
            requestId: 'req_lookup'
          });
        }
      }
    });
    client.setCurrentRegionId('eu-west-1');

    const region = await client.resolveRegion({
      identifier: 'new@example.com',
      forceRefresh: true
    });

    expect(region).toMatchObject({
      regionId: 'eu-west-1'
    });
    expect(urls).toEqual([
      'https://eu-west-1.account.example.com/auth/regions/lookup'
    ]);
  });

  it('preserves server lookup metadata for signup conflict checks', async () => {
    const storage = memoryRegionStorage();
    const client = createAuthFnRegionalClient({
      defaultRegionId: 'us-east-1',
      resolveBaseUrl: (regionId) => `https://${regionId}.account.example.com/auth`,
      storage,
      clientOptions: {
        fetch: async () => Response.json({
          ok: true,
          data: {
            identifier: 'ada@example.com',
            userId: 'user_1',
            regionId: 'us-east-1',
            authority: 'https://us-east-1.account.example.com/auth',
            continueLocally: false,
            redirectTo: 'https://us-east-1.account.example.com/auth'
          },
          requestId: 'req_lookup'
        })
      }
    });
    client.setCurrentRegionId('eu-west-1');

    const lookup = await client.lookupRegion({
      identifier: 'ADA@example.com'
    });

    expect(lookup.ok).toBe(true);
    if (!lookup.ok) {
      throw new Error('lookup should succeed');
    }
    expect(lookup.data).toMatchObject({
      identifier: 'ada@example.com',
      userId: 'user_1',
      regionId: 'us-east-1',
      continueLocally: false
    });
    expect(storage.values.get('ada@example.com')).toMatchObject({
      regionId: 'us-east-1'
    });
  });
});
