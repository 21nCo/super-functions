import { describe, expect, it } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { authFnPasswordPlugin } from '@authfn/password';
import type { AuthFnEvent, AuthFnRuntimeConfig } from '../index.js';
import { issueSession } from '../core/sessions.js';
import { createUser } from '../core/users.js';
import {
  getPasswordCredentialByUserId,
  signInWithPassword,
  updatePasswordCredential
} from '../core/passwords.js';

function createConfig(): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [authFnPasswordPlugin()]
  };
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.slice(0, cookie.indexOf(';')))
    .join('; ');
}

describe('authfn password plugin', () => {
  it('signs up with password, stores a hash, and issues a session cookie pair', async () => {
    const config = createConfig();
    const auth = createTestServer(config);

    const response = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'Ada@Example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.session.type).toBe('session');
    expect(body.data.session.actorType).toBe('user');
    expect(body.data.session.primaryEmail).toBe('ada@example.com');
    expect(body.data.session.methods).toEqual(['password']);

    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((value) => value.startsWith('__Secure-authfn.session='))).toBe(true);
    expect(setCookies.some((value) => value.startsWith('authfn.csrf='))).toBe(true);

    const credential = await getPasswordCredentialByUserId(config, body.data.session.actorId);
    expect(credential?.passwordHash).toContain('scrypt$');
    expect(credential?.passwordHash).not.toContain('Sup3rSecurePassphrase!');

    const currentSession = await auth.router.handle(
      new Request('https://account.example.com/auth/session', {
        headers: {
          cookie: cookieHeaderFromSetCookies(setCookies)
        }
      })
    );
    expect(currentSession.status).toBe(200);
    expect((await currentSession.json()).data.session.primaryEmail).toBe('ada@example.com');
  });

  it('rejects wrong passwords with the canonical credentials error and no session cookie', async () => {
    const config = createConfig();
    const auth = createTestServer(config);

    await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
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

    const wrongPassword = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'wrong-password'
        })
      })
    );

    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.headers.getSetCookie()).toHaveLength(0);
    expect(await wrongPassword.json()).toEqual({
      ok: false,
      error: {
        code: 'AUTHFN_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        retryable: false,
        details: undefined
      },
      requestId: expect.any(String)
    });
  });

  it('supports email-verification gating and compromised-password screening when configured', async () => {
    const auth = createTestServer({
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnPasswordPlugin({
          compromisedPasswordChecker: async ({ password }) => password === 'Sup3rSecurePassphrase!',
          requireEmailVerifiedForSignIn: true
        })
      ]
    });

    const rejected = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
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
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error.code).toBe('AUTHFN_VALIDATION_ERROR');

    const accepted = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'bea@example.com',
          password: 'An0therSecurePassphrase!'
        })
      })
    );
    expect(accepted.status).toBe(200);

    const signIn = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-in/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          email: 'bea@example.com',
          password: 'An0therSecurePassphrase!'
        })
      })
    );
    expect(signIn.status).toBe(403);
    expect((await signIn.json()).error.code).toBe('AUTHFN_EMAIL_NOT_VERIFIED');
  });

  it('updates stored passwords for later reset-otp completion compatibility', async () => {
    const config = createConfig();
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com'
    });

    await updatePasswordCredential(config, {
      userId: user.id,
      password: 'Sup3rSecurePassphrase!'
    });

    await expect(
      signInWithPassword(config, {
        email: 'ada@example.com',
        password: 'Sup3rSecurePassphrase!'
      })
    ).resolves.toMatchObject({
      user: {
        id: user.id
      }
    });

    await updatePasswordCredential(config, {
      userId: user.id,
      password: 'An0therSecurePassphrase!'
    });

    await expect(
      signInWithPassword(config, {
        email: 'ada@example.com',
        password: 'Sup3rSecurePassphrase!'
      })
    ).rejects.toMatchObject({
      code: 'AUTHFN_INVALID_CREDENTIALS'
    });

    await expect(
      signInWithPassword(config, {
        email: 'ada@example.com',
        password: 'An0therSecurePassphrase!'
      })
    ).resolves.toMatchObject({
      user: {
        id: user.id
      }
    });
  });

  it('links a password credential only for the authenticated same verified user', async () => {
    const events: AuthFnEvent[] = [];
    const config: AuthFnRuntimeConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      accountLinking: {
        passwordForAuthenticatedUser: true
      },
      observability: {
        events: {
          emit: (event) => events.push(event)
        }
      },
      plugins: [authFnPasswordPlugin()]
    };
    const auth = createTestServer(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com',
      emailVerifiedAt: new Date('2026-03-22T00:00:00.000Z')
    });

    const unauthenticated = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );
    expect(unauthenticated.status).toBe(409);
    expect((await unauthenticated.json()).error.details.linking.required).toBe('authenticated-session');

    const issued = await issueSession(config, {}, {
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['email-otp']
    });
    const linked = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-up/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${issued.sessionToken}`
        },
        body: JSON.stringify({
          email: 'ada@example.com',
          password: 'Sup3rSecurePassphrase!'
        })
      })
    );

    expect(linked.status).toBe(200);
    const body = await linked.json();
    expect(body.data.session.actorId).toBe(user.id);
    expect(body.data.session.methods).toEqual(['password']);
    await expect(
      signInWithPassword(config, {
        email: 'ada@example.com',
        password: 'Sup3rSecurePassphrase!'
      })
    ).resolves.toMatchObject({
      user: {
        id: user.id
      }
    });
    expect(events.some((event) => event.type === 'authfn.account_linked')).toBe(true);
    expect(events.some((event) => event.type === 'authfn.account_linking.conflict')).toBe(true);
  });
});
