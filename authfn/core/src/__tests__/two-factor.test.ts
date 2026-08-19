import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import type { Adapter } from '@superfunctions/db';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnTwoFactorPlugin } from '@authfn/two-factor';
import type { AuthFnRuntimeConfig } from '../index.js';
import { issueSessionCookies } from '../core/cookies.js';
import { issueSession } from '../core/sessions.js';
import {
  confirmTwoFactorEnrollment,
  createTwoFactorEnrollment,
  verifyTwoFactorCode
} from '../core/two-factor.js';
import { createUser } from '../core/users.js';

const TEST_NOW = new Date('2026-03-22T00:00:00.000Z');
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TEST_2FA_KEY = Buffer.alloc(32, 7);

function createClock(start: Date = TEST_NOW) {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceSeconds: (seconds: number) => {
      current = new Date(current.getTime() + (seconds * 1000));
    }
  };
}

function createConfig(clock = createClock()): AuthFnRuntimeConfig {
  const twoFactorConfig = createTwoFactorPluginConfig(clock);
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [
      authFnPasswordPlugin(),
      authFnTwoFactorPlugin()
    ],
    pluginRuntime: {
      twoFactor: twoFactorConfig
    }
  };
}

function createTwoFactorPluginConfig(clock: ReturnType<typeof createClock>) {
  return {
    issuer: 'authfn-tests',
    now: clock.now,
    recoveryCodeCount: 3,
    encryptionKeyResolver: () => TEST_2FA_KEY
  };
}

function createPrismaStyleUpdateWrapper(base: Adapter): Adapter {
  return {
    ...base,
    async update(params) {
      if (
        params.model === 'two_factor_enrollments'
        && 'lastUsedCounter' in params.data
      ) {
        throw new Error('two-factor replay protection must not rely on adapter.update re-read semantics');
      }

      return base.update(params);
    }
  };
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
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

describe('authfn two factor plugin', () => {
  it('enrolls, confirms, gates password sign-in, satisfies challenges, and supports disable', async () => {
    const clock = createClock();
    const config = createConfig(clock);
    const auth = createTestServer(config);

    const signUp = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(signUp.status).toBe(200);
    const signUpCookies = signUp.headers.getSetCookie();
    const signUpCookieHeader = cookieHeaderFromSetCookies(signUpCookies);
    const csrfToken = signUpCookies
      .find((cookie) => cookie.startsWith('authfn.csrf='))
      ?.slice('authfn.csrf='.length, signUpCookies.find((cookie) => cookie.startsWith('authfn.csrf='))?.indexOf(';') ?? -1);
    expect(csrfToken).toBeDefined();

    const enroll = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/enroll', {
        method: 'POST',
        headers: {
          cookie: signUpCookieHeader,
          'x-authfn-csrf': csrfToken!
        }
      })
    );
    expect(enroll.status).toBe(200);
    const enrollBody = await enroll.json();
    expect(enrollBody.data.secret).toEqual(expect.any(String));
    expect(enrollBody.data.recoveryCodes).toHaveLength(3);

    const confirm = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/confirm', {
        method: 'POST',
        headers: {
          cookie: signUpCookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': csrfToken!
        },
        body: JSON.stringify({
          code: generateTotp(enrollBody.data.secret, clock.now())
        })
      })
    );
    expect(confirm.status).toBe(200);
    const confirmBody = await confirm.json();
    expect(confirmBody.data.enabled).toBe(true);
    expect(confirmBody.data.sessionMethods).toContain('two-factor');

    const gated = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(gated.status).toBe(401);
    const gatedBody = await gated.json();
    expect(gatedBody.error.code).toBe('AUTHFN_2FA_REQUIRED');
    expect(gated.headers.getSetCookie()).toHaveLength(0);

    clock.advanceSeconds(30);
    const challenge = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: gatedBody.error.details.challengeId,
          code: generateTotp(enrollBody.data.secret, clock.now())
        })
      })
    );
    expect(challenge.status).toBe(200);
    expect(challenge.headers.getSetCookie()).toHaveLength(2);
    const challengeBody = await challenge.json();
    expect(challengeBody.data.twoFactorSatisfied).toBe(true);
    expect(challengeBody.data.session.methods).toEqual(['password', 'two-factor']);

    const replayedChallenge = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: gatedBody.error.details.challengeId,
          code: generateTotp(enrollBody.data.secret, clock.now())
        })
      })
    );
    expect(replayedChallenge.status).toBe(400);
    expect((await replayedChallenge.json()).error.code).toBe('AUTHFN_2FA_INVALID_CODE');

    const gatedForRecovery = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    const gatedForRecoveryBody = await gatedForRecovery.json();
    const recoveryCode = enrollBody.data.recoveryCodes[0];
    const recoverySuccess = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: gatedForRecoveryBody.error.details.challengeId,
          code: recoveryCode
        })
      })
    );
    expect(recoverySuccess.status).toBe(200);

    const gatedForReuse = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    const gatedForReuseBody = await gatedForReuse.json();
    const recoveryReuse = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          challengeId: gatedForReuseBody.error.details.challengeId,
          code: recoveryCode
        })
      })
    );
    expect(recoveryReuse.status).toBe(400);
    expect((await recoveryReuse.json()).error.code).toBe('AUTHFN_2FA_INVALID_CODE');

    clock.advanceSeconds(30);
    const currentCookieHeader = cookieHeaderFromSetCookies(challenge.headers.getSetCookie());
    const currentCsrf = challenge.headers.getSetCookie()
      .find((cookie) => cookie.startsWith('authfn.csrf='))
      ?.slice('authfn.csrf='.length, challenge.headers.getSetCookie().find((cookie) => cookie.startsWith('authfn.csrf='))?.indexOf(';') ?? -1);
    const disable = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/disable', {
        method: 'POST',
        headers: {
          cookie: currentCookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': currentCsrf!
        },
        body: JSON.stringify({
          code: generateTotp(enrollBody.data.secret, clock.now())
        })
      })
    );
    expect(disable.status).toBe(200);
    expect((await disable.json()).data).toEqual({ disabled: true });

    const postDisable = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(postDisable.status).toBe(200);
    expect((await postDisable.json()).data.session.methods).toEqual(['password']);
  });

  it('accepts valid TOTP codes without relying on adapter update re-read semantics', async () => {
    const clock = createClock();
    const twoFactorConfig = createTwoFactorPluginConfig(clock);
    const config: AuthFnRuntimeConfig = {
      database: createPrismaStyleUpdateWrapper(memoryAdapter({ debug: false })),
      namespace: 'authfn',
      plugins: [
        authFnPasswordPlugin(),
        authFnTwoFactorPlugin()
      ],
      pluginRuntime: {
        twoFactor: twoFactorConfig
      }
    };

    const user = await createUser(config, {
      primaryEmail: 'adapter-compat@example.com'
    });
    const created = await createTwoFactorEnrollment(config, user, twoFactorConfig);

    await expect(
      confirmTwoFactorEnrollment(
        config,
        user.id,
        generateTotp(created.secret, clock.now()),
        twoFactorConfig
      )
    ).resolves.toMatchObject({
      userId: user.id
    });

    clock.advanceSeconds(30);
    await expect(
      verifyTwoFactorCode(
        config,
        user.id,
        generateTotp(created.secret, clock.now()),
        twoFactorConfig
      )
    ).resolves.toEqual({
      usedRecoveryCode: false
    });
  });

  it('supports confirming and satisfying 2fa with deterministic recovery/session helpers', async () => {
    const clock = createClock();
    const config = createConfig(clock);
    const auth = createTestServer(config);
    const user = await createUser(config, {
      primaryEmail: 'bea@example.com'
    });
    const issued = await issueSession(config, {}, {
      request: new Request('https://account.example.com/auth/session'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken))
    );

    const enroll = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/enroll', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'x-authfn-csrf': issued.csrfToken
        }
      })
    );
    const enrollBody = await enroll.json();

    const confirm = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/confirm', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': issued.csrfToken
        },
        body: JSON.stringify({
          code: generateTotp(enrollBody.data.secret, clock.now())
        })
      })
    );
    expect(confirm.status).toBe(200);
  });

  it('defaults to ten recovery codes when no override is provided', async () => {
    const auth = createTestServer({
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnPasswordPlugin(),
        authFnTwoFactorPlugin()
      ],
      pluginRuntime: {
        twoFactor: {
          issuer: 'authfn-tests',
          now: createClock().now,
          encryptionKeyResolver: () => TEST_2FA_KEY
        }
      }
    });

    const signUp = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ten@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    const signUpCookies = signUp.headers.getSetCookie();
    const cookieHeader = cookieHeaderFromSetCookies(signUpCookies);
    const csrfCookie = signUpCookies.find((cookie) => cookie.startsWith('authfn.csrf='));
    const csrfToken = csrfCookie?.slice('authfn.csrf='.length, csrfCookie.indexOf(';'));

    const enroll = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/enroll', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'x-authfn-csrf': csrfToken!
        }
      })
    );
    expect(enroll.status).toBe(200);
    expect((await enroll.json()).data.recoveryCodes).toHaveLength(10);
  });

  it('requires an explicit two-factor encryption key resolver', async () => {
    const auth = createTestServer({
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnPasswordPlugin(),
        authFnTwoFactorPlugin()
      ],
      pluginRuntime: {
        twoFactor: {
          issuer: 'authfn-tests',
          now: () => TEST_NOW
        }
      }
    });

    const signUp = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    const signUpCookies = signUp.headers.getSetCookie();
    const cookieHeader = cookieHeaderFromSetCookies(signUpCookies);
    const csrfToken = signUpCookies
      .find((cookie) => cookie.startsWith('authfn.csrf='))
      ?.slice('authfn.csrf='.length, signUpCookies.find((cookie) => cookie.startsWith('authfn.csrf='))?.indexOf(';') ?? -1);

    const enroll = await auth.router.handle(
      new Request('https://account.example.com/auth/2fa/enroll', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'x-authfn-csrf': csrfToken!
        }
      })
    );

    expect(enroll.status).toBe(400);
    expect(await enroll.json()).toMatchObject({
      error: {
        code: 'AUTHFN_CONFIG_INVALID'
      }
    });
  });
});
