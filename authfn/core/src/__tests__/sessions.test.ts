import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnEmailOtpPlugin,
  authFnApiKeyPlugin,
  authFnMultiRegionPlugin,
  authFnNativeHandoffPlugin,
  authFnPasswordPlugin,
  authFnSocialOAuthPlugin,
  authFnTwoFactorPlugin,
  createAuthFn,
  createPasswordCredential,
  createUser,
  hashSecret,
  hashPassword,
  issueSession,
  issueSessionCookies,
  revokeSessionById,
  type AuthFnConfig
} from '../index.js';
import type { AuthFnRegionLookupRecord, AuthFnRegionLookupStore } from '../plugin-types.js';

function createConfig(): AuthFnConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [authFnApiKeyPlugin()]
  };
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.slice(0, cookie.indexOf(';')))
    .join('; ');
}

describe('@authfn/core sessions', () => {
  it('authenticates cookie sessions and invalidates them immediately after revocation', async () => {
    const config = createConfig();
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com'
    });
    const issued = await issueSession(config, {}, {
      request: new Request('https://account.example.com/auth/session'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const cookies = issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken);
    const request = new Request('https://account.example.com/auth/session', {
      headers: {
        cookie: cookieHeaderFromSetCookies(Object.values(cookies))
      }
    });

    const authenticated = await auth.provider.authenticate(request);

    expect(authenticated?.type).toBe('session');
    expect(authenticated?.actorId).toBe(user.id);
    expect(authenticated?.primaryEmail).toBe('ada@example.com');

    await revokeSessionById(config, issued.session.id, { userId: user.id });
    const revoked = await auth.provider.authenticate(request);
    expect(revoked).toBeNull();
  });

  it('authenticates api keys through the shared auth provider contract', async () => {
    const config = createConfig();
    const auth = createAuthFn(config);

    await config.database.create({
      model: 'api_keys',
      namespace: 'authfn',
      data: {
        id: 'key_01',
        userId: 'user_owner',
        name: 'server',
        secretHash: hashSecret('secret_123'),
        scopes: ['read'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    const authenticated = await auth.provider.authenticate(
      new Request('https://account.example.com/auth/session', {
        headers: {
          authorization: 'Bearer secret_123'
        }
      })
    );

    expect(authenticated?.type).toBe('api-key');
    expect(authenticated?.actorType).toBe('api-key');
    expect(authenticated?.actorId).toBe('key_01');
  });

  it('authenticates bearer-backed user sessions through the shared auth provider contract', async () => {
    const config = createConfig();
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com'
    });
    const issued = await issueSession(config, {}, {
      request: new Request('https://account.example.com/auth/session'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });

    const authenticated = await auth.provider.authenticate(
      new Request('https://account.example.com/auth/session', {
        headers: {
          authorization: `Bearer ${issued.sessionToken}`
        }
      })
    );

    expect(authenticated?.type).toBe('session');
    expect(authenticated?.actorType).toBe('user');
    expect(authenticated?.actorId).toBe(user.id);
    expect(authenticated?.primaryEmail).toBe('ada@example.com');
  });

  it('returns current session, lists active sessions deterministically, and signs out with csrf enforcement', async () => {
    const config = createConfig();
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com'
    });
    const request = new Request('https://account.example.com/auth/sign-in/password');
    const first = await issueSession(config, {}, {
      request,
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const second = await issueSession(config, {}, {
      request,
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(first.cookiePolicy!, first.sessionToken, first.csrfToken))
    );

    const currentSessionResponse = await auth.router.handle(
      new Request('https://account.example.com/auth/session', {
        headers: {
          cookie: cookieHeader
        }
      })
    );
    expect(currentSessionResponse.status).toBe(200);
    const currentSessionBody = await currentSessionResponse.json();
    expect(currentSessionBody.data.session.id).toBe(first.session.id);

    const bearerCurrentSessionResponse = await auth.router.handle(
      new Request('https://account.example.com/auth/session', {
        headers: {
          authorization: `Bearer ${first.sessionToken}`
        }
      })
    );
    expect(bearerCurrentSessionResponse.status).toBe(200);
    const bearerCurrentSessionBody = await bearerCurrentSessionResponse.json();
    expect(bearerCurrentSessionBody.data.session.id).toBe(first.session.id);

    const sessionsResponse = await auth.router.handle(
      new Request('https://account.example.com/auth/sessions', {
        headers: {
          cookie: cookieHeader
        }
      })
    );
    expect(sessionsResponse.status).toBe(200);
    const sessionsBody = await sessionsResponse.json();
    expect(sessionsBody.data.sessions.map((session: { id: string }) => session.id)).toEqual([
      first.session.id,
      second.session.id
    ]);

    const csrfFailure = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-out', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json'
        },
        body: JSON.stringify({})
      })
    );
    expect(csrfFailure.status).toBe(403);
    expect((await csrfFailure.json()).error.code).toBe('AUTHFN_CSRF_INVALID');

    const signOutResponse = await auth.router.handle(
      new Request('https://account.example.com/auth/sign-out', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': first.csrfToken
        },
        body: JSON.stringify({})
      })
    );
    expect(signOutResponse.status).toBe(200);
    const signOutBody = await signOutResponse.json();
    expect(signOutBody.data.revoked).toBe(true);
    expect(signOutResponse.headers.getSetCookie().length).toBe(2);

    const postSignOutSessions = await auth.router.handle(
      new Request('https://account.example.com/auth/sessions', {
        headers: {
          cookie: cookieHeaderFromSetCookies(
            Object.values(issueSessionCookies(second.cookiePolicy!, second.sessionToken, second.csrfToken))
          )
        }
      })
    );
    const postSignOutBody = await postSignOutSessions.json();
    expect(postSignOutBody.data.sessions.map((session: { id: string }) => session.id)).toEqual([
      second.session.id
    ]);
  });

  it('returns account details with configured sign-in methods for bearer sessions', async () => {
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      plugins: [
        authFnPasswordPlugin(),
        authFnEmailOtpPlugin(),
        authFnSocialOAuthPlugin()
      ]
    };
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    await createPasswordCredential(config, {
      userId: user.id,
      passwordHash: await hashPassword('Sup3rSecurePassphrase!')
    });
    await config.database.create({
      model: 'oauth_accounts',
      namespace: 'authfn',
      data: {
        id: 'oauth_google',
        userId: user.id,
        provider: 'google',
        providerAccountId: 'google-ada',
        connectionId: 'connection_google',
        email: 'ada@example.com',
        profile: { name: 'Ada Lovelace' },
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z')
      }
    });
    const issued = await issueSession(config, {}, {
      request: new Request('https://account.example.com/auth/session'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      regionId: 'insouth',
      methods: ['password']
    });

    const response = await auth.router.handle(
      new Request('https://account.example.com/auth/account', {
        headers: {
          authorization: `Bearer ${issued.sessionToken}`
        }
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        user: {
          id: user.id,
          primaryEmail: 'ada@example.com',
          emailVerifiedAt: expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        },
        hasPassword: true,
        twoFactorEnabled: false,
        oauthAccounts: [
          {
            id: 'oauth_google',
            provider: 'google',
            email: 'ada@example.com',
            profile: { name: 'Ada Lovelace' },
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          }
        ],
        methods: {
          password: true,
          emailOtp: true,
          oauth: ['google'],
          twoFactor: false
        }
      },
      requestId: expect.any(String)
    });
  });

  it('deletes the current account and owned bundled-plugin records', async () => {
    const lookupRecords = new Map<string, AuthFnRegionLookupRecord>();
    const lookupStore: AuthFnRegionLookupStore = {
      async getByIdentifier(identifier) {
        return lookupRecords.get(identifier) ?? null;
      },
      async putIfAbsent(record) {
        const existing = lookupRecords.get(record.identifier);
        if (existing) {
          return { inserted: false, existing };
        }
        lookupRecords.set(record.identifier, record);
        return { inserted: true };
      },
      async update(record) {
        lookupRecords.set(record.identifier, record);
        return record;
      },
      async deleteByIdentifier(identifier) {
        lookupRecords.delete(identifier);
      }
    };
    const config: AuthFnConfig = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn',
      runtime: {
        resolve: () => ({
          issuer: 'https://account.example.com',
          baseUrl: 'https://account.example.com',
          regionId: 'insouth'
        })
      },
      plugins: [
        authFnPasswordPlugin(),
        authFnEmailOtpPlugin(),
        authFnSocialOAuthPlugin(),
        authFnApiKeyPlugin(),
        authFnTwoFactorPlugin(),
        authFnMultiRegionPlugin({
          defaultRegionId: 'insouth',
          regions: [
            {
              regionId: 'insouth',
              authority: 'https://account.example.com'
            }
          ],
          lookupStore
        }),
        authFnNativeHandoffPlugin()
      ]
    };
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z')
    });
    await createPasswordCredential(config, {
      userId: user.id,
      passwordHash: await hashPassword('Sup3rSecurePassphrase!')
    });
    await config.database.create({
      model: 'oauth_accounts',
      namespace: 'authfn',
      data: {
        id: 'oauth_google',
        userId: user.id,
        provider: 'google',
        providerAccountId: 'google-ada',
        connectionId: 'connection_google',
        email: 'ada@example.com',
        profile: { name: 'Ada Lovelace' },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    await config.database.create({
      model: 'api_keys',
      namespace: 'authfn',
      data: {
        id: 'key_01',
        userId: user.id,
        name: 'server',
        secretHash: hashSecret('secret_123'),
        scopes: ['read'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    await config.database.create({
      model: 'otp_challenges',
      namespace: 'authfn',
      data: {
        id: 'otp_01',
        purpose: 'sign-in',
        email: 'ada@example.com',
        codeHash: hashSecret('123456'),
        attemptCount: 0,
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    await config.database.create({
      model: 'two_factor_enrollments',
      namespace: 'authfn',
      data: {
        id: 'tfa_01',
        userId: user.id,
        secretEncrypted: 'encrypted',
        lastUsedCounter: null,
        confirmedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    await config.database.create({
      model: 'two_factor_recovery_codes',
      namespace: 'authfn',
      data: {
        id: 'recovery_01',
        enrollmentId: 'tfa_01',
        codeHash: hashSecret('recovery'),
        usedAt: null,
        createdAt: new Date()
      }
    });
    await config.database.create({
      model: 'two_factor_challenges',
      namespace: 'authfn',
      data: {
        id: 'signin_2fa_01',
        userId: user.id,
        primaryMethod: 'password',
        expiresAt: new Date(Date.now() + 300_000),
        consumedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    await config.database.create({
      model: 'region_profiles',
      namespace: 'authfn',
      data: {
        id: 'region_01',
        userId: user.id,
        regionId: 'insouth',
        authority: 'https://account.example.com',
        domain: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    await lookupStore.putIfAbsent({
      identifier: 'ada@example.com',
      userId: user.id,
      regionId: 'insouth',
      authority: 'https://account.example.com',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const issued = await issueSession(config, {}, {
      request: new Request('https://account.example.com/auth/session'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      regionId: 'insouth',
      methods: ['password']
    });
    await config.database.create({
      model: 'native_handoff_codes',
      namespace: 'authfn',
      data: {
        id: 'handoff_01',
        codeHash: hashSecret('handoff'),
        sourceSessionId: issued.session.id,
        target: 'native',
        regionId: 'insouth',
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        createdAt: new Date()
      }
    });
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken))
    );

    const response = await auth.router.handle(
      new Request('https://account.example.com/auth/account', {
        method: 'DELETE',
        headers: {
          cookie: cookieHeader,
          'x-authfn-csrf': issued.csrfToken
        }
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({
      deleted: true,
      userId: user.id,
      primaryEmail: 'ada@example.com'
    });
    expect(body.data.counts).toMatchObject({
      users: 1,
      sessions: 1,
      passwordCredentials: 1,
      oauthAccounts: 1,
      apiKeys: 1,
      otpChallenges: 1,
      regionProfiles: 1,
      nativeHandoffCodes: 1,
      twoFactorEnrollments: 1,
      twoFactorRecoveryCodes: 1,
      twoFactorChallenges: 1
    });
    expect(response.headers.getSetCookie().length).toBe(2);
    expect(await lookupStore.getByIdentifier('ada@example.com')).toBeNull();
    await expect(config.database.count({ model: 'users', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'sessions', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'password_credentials', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'oauth_accounts', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'api_keys', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'otp_challenges', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'region_profiles', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'native_handoff_codes', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'two_factor_enrollments', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'two_factor_recovery_codes', namespace: 'authfn' })).resolves.toBe(0);
    await expect(config.database.count({ model: 'two_factor_challenges', namespace: 'authfn' })).resolves.toBe(0);
  });

  it('revokes a sibling session through the route surface', async () => {
    const config = createConfig();
    const auth = createAuthFn(config);
    const user = await createUser(config, {
      primaryEmail: 'ada@example.com'
    });
    const request = new Request('https://account.example.com/auth/sign-in/password');
    const current = await issueSession(config, {}, {
      request,
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const sibling = await issueSession(config, {}, {
      request,
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const currentCookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(current.cookiePolicy!, current.sessionToken, current.csrfToken))
    );

    const revokeResponse = await auth.router.handle(
      new Request(`https://account.example.com/auth/sessions/${sibling.session.id}/revoke`, {
        method: 'POST',
        headers: {
          cookie: currentCookieHeader,
          'x-authfn-csrf': current.csrfToken
        }
      })
    );
    expect(revokeResponse.status).toBe(200);

    const sessionsResponse = await auth.router.handle(
      new Request('https://account.example.com/auth/sessions', {
        headers: {
          cookie: currentCookieHeader
        }
      })
    );
    const sessionsBody = await sessionsResponse.json();
    expect(sessionsBody.data.sessions.map((session: { id: string }) => session.id)).toEqual([
      current.session.id
    ]);
  });
});
