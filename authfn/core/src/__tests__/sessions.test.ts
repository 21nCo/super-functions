import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnApiKeyPlugin,
  createAuthFn,
  createUser,
  hashSecret,
  issueSession,
  issueSessionCookies,
  revokeSessionById,
  type AuthFnConfig
} from '../index.js';

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
