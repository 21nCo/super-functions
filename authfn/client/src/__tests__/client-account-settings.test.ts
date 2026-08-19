import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import type { AuthFnRuntimeConfig } from 'authfn';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import { authFnMultiRegionEnvironment, authFnMultiRegionPlugin } from '@authfn/multi-region';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnTwoFactorPlugin } from '@authfn/two-factor';
import { createAuthFnClient } from '../index.js';

const TEST_NOW = new Date('2026-03-25T00:00:00.000Z');
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TEST_2FA_KEY = Buffer.alloc(32, 7);
const ACCOUNT_EMAIL = 'bea@example.com';
const ACCOUNT_PASSWORD = 'Sup3rSecurePassphrase!';

function createClock(start: Date = TEST_NOW) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceSeconds: (seconds: number) => {
      current = new Date(current.getTime() + (seconds * 1000));
    }
  };
}

function createAccountSettingsConfig(now: () => Date = () => TEST_NOW): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [
      authFnPasswordPlugin(),
      authFnApiKeyPlugin(),
      authFnTwoFactorPlugin()
    ],
    pluginRuntime: {
      apiKey: {
        now
      },
      twoFactor: {
        issuer: 'authfn-client-tests',
        now,
        recoveryCodeCount: 3,
        encryptionKeyResolver: () => TEST_2FA_KEY
      }
    }
  };
}

function createMultiRegionConfig(): AuthFnRuntimeConfig {
  return {
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
      ],
      directory: {
        lookupByIdentifier({ identifier }) {
          if (identifier === 'ada@example.com') {
            return {
              userId: 'user_ada',
              regionId: 'eu-west-1',
              authority: 'https://eu.account.example.com',
              domain: '.example.com'
            };
          }
          return null;
        }
      }
    }),
    plugins: [
      authFnPasswordPlugin(),
      authFnMultiRegionPlugin()
    ],
    pluginRuntime: {}
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

function createClient(config: AuthFnRuntimeConfig, baseUrl: string) {
  const auth = createTestServer(config);
  const cookieJar = createCookieJar();

  const client = createAuthFnClient({
    baseUrl,
    cookieAccessor: () => cookieJar.header(),
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      const cookieHeader = cookieJar.header();
      if (cookieHeader) {
        headers.set('cookie', cookieHeader);
      }

      const response = await auth.router.handle(
        new Request(typeof input === 'string' ? input : input.toString(), {
          method: init?.method,
          headers,
          body: init?.body
        })
      );
      cookieJar.applySetCookies(response.headers.getSetCookie());
      return response;
    }
  });

  return {
    auth,
    client
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

describe('@authfn/client account-settings flows', () => {
  it('covers 2fa challenge/disable and the api key lifecycle via typed methods', async () => {
    const clock = createClock();
    const { auth, client } = createClient(
      createAccountSettingsConfig(clock.now),
      'https://account.example.com/auth'
    );

    const signUp = await client.signUpWithPassword({
      email: ACCOUNT_EMAIL,
      password: ACCOUNT_PASSWORD
    });
    if (!signUp.ok) {
      throw new Error('sign-up should have succeeded');
    }

    const enrollment = await client.enableTwoFactor();
    if (!enrollment.ok) {
      throw new Error('2fa enrollment should have succeeded');
    }

    const confirm = await client.confirmTwoFactor({
      code: generateTotp(enrollment.data.secret)
    });
    expect(confirm.ok).toBe(true);

    const signOut = await client.signOut();
    expect(signOut.ok).toBe(true);

    const gated = await client.signInWithPassword({
      email: ACCOUNT_EMAIL,
      password: ACCOUNT_PASSWORD
    });
    expect(gated.ok).toBe(false);
    if (gated.ok) {
      throw new Error('2fa-enabled sign-in should be gated');
    }
    expect(gated.error.code).toBe('AUTHFN_2FA_REQUIRED');

    clock.advanceSeconds(30);
    const challenge = await client.completeTwoFactorChallenge({
      challengeId: String(gated.error.details?.challengeId),
      code: generateTotp(enrollment.data.secret, clock.now())
    });
    expect(challenge.ok).toBe(true);
    if (challenge.ok) {
      expect(challenge.data.session.methods).toEqual(['password', 'two-factor']);
    }

    const createdKey = await client.createApiKey({
      name: 'playwright',
      scopes: ['read']
    });
    expect(createdKey.ok).toBe(true);
    if (!createdKey.ok) {
      throw new Error('api key creation should have succeeded');
    }
    expect(createdKey.data.secret).toMatch(/^ak_/);

    const listedKeys = await client.listApiKeys();
    expect(listedKeys.ok).toBe(true);
    if (listedKeys.ok) {
      expect(listedKeys.data.keys).toEqual([
        expect.objectContaining({
          id: createdKey.data.keyId,
          scopes: ['read']
        })
      ]);
    }

    const authenticated = await auth.provider.authenticate(
      new Request('https://account.example.com/demo/protected', {
        headers: {
          authorization: `Bearer ${createdKey.data.secret}`
        }
      })
    );
    expect(authenticated?.type).toBe('api-key');

    const revokedKey = await client.revokeApiKey({
      keyId: createdKey.data.keyId
    });
    expect(revokedKey.ok).toBe(true);

    clock.advanceSeconds(30);
    const disabled = await client.disableTwoFactor({
      code: generateTotp(enrollment.data.secret, clock.now())
    });
    expect(disabled.ok).toBe(true);
    if (disabled.ok) {
      expect(disabled.data.disabled).toBe(true);
    }
  });

  it('returns typed runtime and region lookup envelopes for multi-region routes', async () => {
    const { client } = createClient(createMultiRegionConfig(), 'https://us.account.example.com/auth');

    const runtime = await client.getEnvironment();
    expect(runtime.ok).toBe(true);
    if (runtime.ok) {
      expect(runtime.data.regionId).toBe('us-east-1');
      expect(runtime.data.cookie.prefix).toBe('authfn-us');
      expect(runtime.data.oauth.google?.clientId).toBe('us-google-client');
    }

    const lookup = await client.lookupRegion({
      identifier: 'ada@example.com'
    });
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.data.regionId).toBe('eu-west-1');
      expect(lookup.data.redirectTo).toBe('https://eu.account.example.com');
      expect(lookup.data.continueLocally).toBe(false);
    }
  });

  it('returns canonical failure envelopes for 2fa disable and social disconnect', async () => {
    const { client } = createClient(createAccountSettingsConfig(), 'https://account.example.com/auth');

    const signUp = await client.signUpWithPassword({
      email: ACCOUNT_EMAIL,
      password: ACCOUNT_PASSWORD
    });
    if (!signUp.ok) {
      throw new Error('sign-up should have succeeded');
    }

    const enrollment = await client.enableTwoFactor();
    if (!enrollment.ok) {
      throw new Error('2fa enrollment should have succeeded');
    }

    const confirm = await client.confirmTwoFactor({
      code: generateTotp(enrollment.data.secret)
    });
    expect(confirm.ok).toBe(true);

    const disable = await client.disableTwoFactor({
      code: '000000'
    });
    expect(disable.ok).toBe(false);
    if (!disable.ok) {
      expect(disable.error.code).toBe('AUTHFN_2FA_INVALID_CODE');
    }

    const disconnectClient = createAuthFnClient({
      baseUrl: 'https://account.example.com/auth',
      fetch: async (input, init) => {
        expect(typeof input === 'string' ? input : input.toString()).toBe(
          'https://account.example.com/auth/social/disconnect/google'
        );
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'AUTHFN_NOT_FOUND',
              message: 'Linked social account not found',
              retryable: false
            },
            requestId: 'req_disconnect'
          }),
          {
            status: 404,
            headers: {
              'content-type': 'application/json'
            }
          }
        );
      }
    });

    const disconnect = await disconnectClient.disconnectSocialAccount({
      provider: 'google'
    });
    expect(disconnect.ok).toBe(false);
    if (!disconnect.ok) {
      expect(disconnect.error.code).toBe('AUTHFN_NOT_FOUND');
    }
  });

  it('deletes the signed-in account via the typed client method', async () => {
    const { client } = createClient(createAccountSettingsConfig(), 'https://account.example.com/auth');

    const signUp = await client.signUpWithPassword({
      email: ACCOUNT_EMAIL,
      password: ACCOUNT_PASSWORD
    });
    expect(signUp.ok).toBe(true);

    const deletion = await client.deleteAccount();
    expect(deletion.ok).toBe(true);
    if (deletion.ok) {
      expect(deletion.data.deleted).toBe(true);
      expect(deletion.data.primaryEmail).toBe(ACCOUNT_EMAIL);
      expect(deletion.data.counts.users).toBe(1);
    }

    const session = await client.getSession();
    expect(session.ok).toBe(true);
    if (session.ok) {
      expect(session.data.session).toBeNull();
    }
  });
});
