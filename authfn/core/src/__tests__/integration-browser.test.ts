import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { createAuthFnClient } from '@authfn/client';
import {
  authFnApiKeyPlugin,
  authFnEmailOtpPlugin,
  authFnMultiRegionPlugin,
  authFnPasswordPlugin,
  authFnSocialOAuthPlugin,
  authFnTwoFactorPlugin,
  createAuthFn,
  type AuthFnConfig,
  type AuthFnDeliveryRequest,
  type AuthFnEvent,
  type AuthFnPlugin
} from '../index.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TEST_NOW = new Date('2026-03-22T00:00:00.000Z');
const TEST_2FA_KEY = Buffer.alloc(32, 11);

function createClock(start: Date = TEST_NOW) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceSeconds: (seconds: number) => {
      current = new Date(current.getTime() + (seconds * 1000));
    }
  };
}

function createIdToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.signature`;
}

function createOAuthFetcher() {
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
            sub: 'google-user-02',
            email: 'grace@example.com',
            email_verified: true,
            name: 'Grace Hopper'
          })
        })
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };
}

function createCookieJar() {
  const values = new Map<string, string>();

  return {
    header(): string {
      return Array.from(values.entries())
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('; ');
    },
    applySetCookies(cookies: string[]): void {
      for (const cookie of cookies) {
        const [pair] = cookie.split(';');
        const separatorIndex = pair.indexOf('=');
        const name = pair.slice(0, separatorIndex);
        const value = decodeURIComponent(pair.slice(separatorIndex + 1));
        if (value === '') {
          values.delete(name);
        } else {
          values.set(name, value);
        }
      }
    }
  };
}

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
        }
      };
    }
  };
}

function decodeBase32(secret: string): Buffer {
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];

  for (const char of secret.replace(/=+$/g, '').toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) {
      continue;
    }

    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function generateTotp(secret: string, now: Date = TEST_NOW, digits = 6, periodSeconds = 30): string {
  const counter = Math.floor(now.getTime() / 1000 / periodSeconds);
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

describe('@authfn/core integration browser flows', () => {
  it('covers password, otp, social, 2fa, api keys, region lookup, sign-out, openapi, and observability in one deployment', async () => {
    const otpCodes = new Map<string, string>();
    const events: AuthFnEvent[] = [];
    const clock = createClock();
    const auditTrapPlugin: AuthFnPlugin = {
      name: 'auditTrap',
      hooks: {
        async beforeUserCreate(_ctx, input) {
          if (input.primaryEmail === 'blocked@example.com') {
            throw new Error('blocked sign-up');
          }
          return input;
        }
      }
    };

    const auth = createAuthFn({
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: createRuntimeResolver(),
      openApi: {
        title: 'AuthFn API',
        version: '2026.03.22'
      },
      observability: {
        async emit(event) {
          events.push(event);
        }
      },
      plugins: [
        authFnPasswordPlugin({
          otp: {
            delivery: {
              async send(input: AuthFnDeliveryRequest) {
                otpCodes.set(`${input.purpose}:${input.email}`, input.code);
                return { sent: true };
              }
            },
            codeGenerator: () => '731942'
          }
        }),
        authFnEmailOtpPlugin({
          delivery: {
            async send(input: AuthFnDeliveryRequest) {
              otpCodes.set(`${input.purpose}:${input.email}`, input.code);
              return { sent: true };
            }
          },
          codeGenerator: () => '731942'
        }),
        authFnSocialOAuthPlugin({
          fetcher: createOAuthFetcher(),
          providers: {
            google: {
              clientId: 'google-client-id',
              clientSecret: 'google-client-secret',
              allowlistedReturnTo: ['https://app.example.com/post-auth']
            }
          }
        }),
        authFnApiKeyPlugin({
          now: clock.now
        }),
        authFnTwoFactorPlugin({
          issuer: 'authfn-tests',
          now: clock.now,
          recoveryCodeCount: 3,
          encryptionKeyResolver: () => TEST_2FA_KEY
        }),
        authFnMultiRegionPlugin({
          regions: [
            {
              regionId: 'us-east-1',
              authority: 'https://us.account.example.com',
              hosts: ['us.account.example.com'],
              cookie: {
                prefix: 'authfn-us'
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
              }
            }
          ]
        }),
        auditTrapPlugin
      ]
    } satisfies AuthFnConfig);

    const cookieJar = createCookieJar();

    const dispatch = async (
      url: string,
      init: {
        method?: string;
        body?: Record<string, unknown>;
        headers?: HeadersInit;
      } = {}
    ) => {
      const headers = new Headers(init.headers);
      if (init.body !== undefined) {
        headers.set('content-type', 'application/json');
      }
      const cookieHeader = cookieJar.header();
      if (cookieHeader) {
        headers.set('cookie', cookieHeader);
      }

      const response = await auth.router.handle(
        new Request(url, {
          method: init.method,
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined
        })
      );
      cookieJar.applySetCookies(response.headers.getSetCookie());
      return response;
    };

    const client = createAuthFnClient({
      baseUrl: 'https://eu.account.example.com/auth',
      cookieAccessor: () => cookieJar.header(),
      fetch: async (input, init) => dispatch(typeof input === 'string' ? input : input.toString(), {
        method: init?.method,
        headers: init?.headers,
        body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined
      })
    });

    const signUp = await client.signUpWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    expect(signUp.ok).toBe(true);
    if (!signUp.ok) {
      throw new Error('sign-up should succeed');
    }
    expect(signUp.data.session.regionId).toBe('eu-west-1');
    expect(events.filter((event) =>
      event.requestId === signUp.requestId
      && (event.type === 'authfn.user.created' || event.type === 'authfn.session.issued')
    )).toHaveLength(2);

    const verifySend = await client.sendOtp({
      purpose: 'verify-email',
      email: 'ada@example.com'
    });
    expect(verifySend.ok).toBe(true);

    const verifyOtp = await client.verifyOtp({
      purpose: 'verify-email',
      email: 'ada@example.com',
      code: otpCodes.get('verify-email:ada@example.com')!
    });
    expect(verifyOtp.ok).toBe(true);

    const resetStart = await client.startPasswordReset({
      email: 'ada@example.com'
    });
    expect(resetStart.ok).toBe(true);

    const resetComplete = await client.completePasswordReset({
      email: 'ada@example.com',
      code: otpCodes.get('reset-password:ada@example.com')!,
      newPassword: 'An0therSecurePassphrase!'
    });
    expect(resetComplete.ok).toBe(true);

    const currentSession = await client.getSession();
    expect(currentSession.ok).toBe(true);
    if (!currentSession.ok) {
      throw new Error('current session should succeed');
    }
    expect(currentSession.data.session?.primaryEmail).toBe('ada@example.com');

    const enrollment = await dispatch('https://eu.account.example.com/auth/2fa/enroll', {
      method: 'POST',
      headers: {
        'x-authfn-csrf': readCookie(cookieJar.header(), 'authfn-eu.csrf')!
      }
    });
    expect(enrollment.status).toBe(200);
    const enrollmentBody = await enrollment.json();

    const confirm = await dispatch('https://eu.account.example.com/auth/2fa/confirm', {
      method: 'POST',
      headers: {
        'x-authfn-csrf': readCookie(cookieJar.header(), 'authfn-eu.csrf')!
      },
      body: {
        code: generateTotp(enrollmentBody.data.secret, clock.now())
      }
    });
    expect(confirm.status).toBe(200);

    const signOut = await dispatch('https://eu.account.example.com/auth/sign-out', {
      method: 'POST',
      headers: {
        'x-authfn-csrf': readCookie(cookieJar.header(), 'authfn-eu.csrf')!
      },
      body: {}
    });
    expect(signOut.status).toBe(200);

    const oldPassword = await client.signInWithPassword({
      email: 'ada@example.com',
      password: 'Sup3rSecurePassphrase!'
    });
    expect(oldPassword.ok).toBe(false);
    if (oldPassword.ok) {
      throw new Error('old password should fail after reset');
    }
    expect(oldPassword.error.code).toBe('AUTHFN_INVALID_CREDENTIALS');

    const gated = await client.signInWithPassword({
      email: 'ada@example.com',
      password: 'An0therSecurePassphrase!'
    });
    expect(gated.ok).toBe(false);
    if (gated.ok) {
      throw new Error('2fa-enabled password sign-in should be gated');
    }
    expect(gated.error.code).toBe('AUTHFN_2FA_REQUIRED');

    clock.advanceSeconds(30);
    const challengeComplete = await dispatch('https://eu.account.example.com/auth/2fa/challenge', {
        method: 'POST',
      body: {
        challengeId: gated.error.details?.challengeId,
        code: generateTotp(enrollmentBody.data.secret, clock.now())
      }
    });
    expect(challengeComplete.status).toBe(200);
    const challengeBody = await challengeComplete.json();
    expect(challengeBody.data.session.methods).toEqual(['password', 'two-factor']);

    const listedSessions = await client.listSessions();
    expect(listedSessions.ok).toBe(true);
    if (!listedSessions.ok) {
      throw new Error('listSessions should succeed after 2fa completion');
    }
    expect(listedSessions.data.sessions).toEqual([
      expect.objectContaining({
        id: challengeBody.data.session.id,
        methods: ['password', 'two-factor']
      })
    ]);

    const createdApiKey = await dispatch('https://eu.account.example.com/auth/api-keys', {
      method: 'POST',
      headers: {
        'x-authfn-csrf': readCookie(cookieJar.header(), 'authfn-eu.csrf')!
      },
      body: {
        name: 'server-to-server',
        scopes: ['read']
      }
    });
    expect(createdApiKey.status).toBe(201);
    const createdApiKeyBody = await createdApiKey.json();
    expect(createdApiKeyBody.data.secret).toMatch(/^ak_/);

    const listedApiKeys = await dispatch('https://eu.account.example.com/auth/api-keys');
    expect(listedApiKeys.status).toBe(200);
    const listedApiKeysBody = await listedApiKeys.json();
    expect(listedApiKeysBody.data.keys).toEqual([
      expect.objectContaining({
        id: createdApiKeyBody.data.keyId,
        scopes: ['read']
      })
    ]);

    const providerSession = await auth.provider.authenticate(
      new Request('https://eu.account.example.com/auth/session', {
        headers: {
          authorization: `Bearer ${createdApiKeyBody.data.secret}`
        }
      })
    );
    expect(providerSession?.type).toBe('api-key');

    const revokeApiKey = await dispatch(
      `https://eu.account.example.com/auth/api-keys/${createdApiKeyBody.data.keyId}`,
      {
        method: 'DELETE',
        headers: {
          'x-authfn-csrf': readCookie(cookieJar.header(), 'authfn-eu.csrf')!
        }
      }
    );
    expect(revokeApiKey.status).toBe(200);

    const regionLookup = await dispatch('https://us.account.example.com/auth/regions/lookup', {
      method: 'POST',
      body: {
        identifier: 'ada@example.com'
      }
    });
    expect(regionLookup.status).toBe(200);
    expect(await regionLookup.json()).toEqual({
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

    const socialStart = await dispatch('https://eu.account.example.com/auth/social/start', {
      method: 'POST',
      body: {
        provider: 'google',
        callbackMode: 'json',
        returnTo: 'https://app.example.com/post-auth'
      }
    });
    expect(socialStart.status).toBe(200);
    const socialStartBody = await socialStart.json();

    const socialCallback = await dispatch(
      `https://eu.account.example.com/auth/social/callback/google?code=abc123&state=${encodeURIComponent(socialStartBody.data.stateId)}`
    );
    expect(socialCallback.status).toBe(200);
    const socialCallbackBody = await socialCallback.json();
    expect(socialCallbackBody.data.provider).toBe('google');
    expect(socialCallbackBody.data.session.primaryEmail).toBe('grace@example.com');

    const finalSignOut = await dispatch('https://eu.account.example.com/auth/sign-out', {
      method: 'POST',
      headers: {
        'x-authfn-csrf': readCookie(cookieJar.header(), 'authfn-eu.csrf')!
      },
      body: {
        allSessions: true
      }
    });
    expect(finalSignOut.status).toBe(200);

    const blocked = await dispatch('https://eu.account.example.com/auth/sign-up/password', {
      method: 'POST',
      body: {
        email: 'blocked@example.com',
        password: 'Sup3rSecurePassphrase!'
      }
    });
    expect(blocked.status).toBe(500);
    const blockedBody = await blocked.json();
    expect(blockedBody.error.code).toBe('AUTHFN_PLUGIN_ABORTED');

    const openApi = auth.openApi?.();
    expect(openApi).toMatchObject({
      openapi: '3.1.0',
      paths: expect.objectContaining({
        '/auth/session': expect.any(Object),
        '/auth/sign-up/password': expect.any(Object),
        '/auth/api-keys': expect.any(Object),
        '/auth/regions/lookup': expect.any(Object)
      })
    });

    const eventTypes = events.map((event) => event.type);
    expect(eventTypes).toEqual(expect.arrayContaining([
      'authfn.user.created',
      'authfn.session.issued',
      'authfn.session.revoked',
      'authfn.otp.sent',
      'authfn.otp.verified',
      'authfn.oauth.started',
      'authfn.oauth.completed',
      'authfn.api_key.created',
      'authfn.api_key.revoked',
      'authfn.2fa.enabled',
      'authfn.2fa.challenged',
      'authfn.region.lookup',
      'authfn.plugin.failed'
    ]));
    expect(events.every((event) => event.requestId.startsWith('req_'))).toBe(true);

    const pluginFailure = events.find((event) => event.type === 'authfn.plugin.failed');
    expect(pluginFailure).toMatchObject({
      pluginName: 'auditTrap',
      hookName: 'beforeUserCreate'
    });

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain('Sup3rSecurePassphrase!');
    expect(serializedEvents).not.toContain('An0therSecurePassphrase!');
    expect(serializedEvents).not.toContain('731942');
    expect(serializedEvents).not.toContain('google-access-token');
    expect(serializedEvents).not.toContain('google-refresh-token');
    expect(serializedEvents).not.toContain(createdApiKeyBody.data.secret);
  });
});

function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return undefined;
}

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
