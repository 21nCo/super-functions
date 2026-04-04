import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import {
  authFnApiKeyPlugin,
  createAuthFn,
  createUser,
  issueSession,
  issueSessionCookies,
  type AuthFnConfig
} from '../index.js';

function createConfig(): AuthFnConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [
      authFnApiKeyPlugin({
        now: () => new Date('2026-03-22T00:00:00.000Z')
      })
    ]
  };
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.slice(0, cookie.indexOf(';')))
    .join('; ');
}

describe('@authfn/core api key plugin', () => {
  it('creates, lists, authenticates, and revokes api keys with hashed secrets at rest', async () => {
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
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken))
    );

    const created = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': issued.csrfToken
        },
        body: JSON.stringify({
          name: 'server-to-server',
          scopes: ['read']
        })
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data.secretReturnedOnce).toBe(true);
    expect(createdBody.data.keyId).toEqual(expect.any(String));
    expect(createdBody.data.secret).toEqual(expect.stringMatching(/^ak_/));

    const stored = await config.database.findOne({
      model: 'api_keys',
      where: [{ field: 'id', operator: 'eq', value: createdBody.data.keyId }],
      namespace: 'authfn'
    });
    expect(stored?.secretHash).toBeDefined();
    expect(stored?.secretHash).not.toBe(createdBody.data.secret);

    const listed = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        headers: {
          cookie: cookieHeader
        }
      })
    );
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody.data.keys).toEqual([
      expect.objectContaining({
        id: createdBody.data.keyId,
        scopes: ['read']
      })
    ]);
    expect(JSON.stringify(listedBody)).not.toContain(createdBody.data.secret);

    const authenticated = await auth.provider.authenticate(
      new Request('https://account.example.com/auth/session', {
        headers: {
          authorization: `Bearer ${createdBody.data.secret}`
        }
      })
    );
    expect(authenticated?.type).toBe('api-key');
    expect(authenticated?.methods).toEqual(['api-key']);

    const revoked = await auth.router.handle(
      new Request(`https://account.example.com/auth/api-keys/${createdBody.data.keyId}`, {
        method: 'DELETE',
        headers: {
          cookie: cookieHeader,
          'x-authfn-csrf': issued.csrfToken
        }
      })
    );
    expect(revoked.status).toBe(200);
    expect((await revoked.json()).data).toEqual({
      revoked: true,
      keyId: createdBody.data.keyId
    });

    await expect(
      auth.provider.authenticate(
        new Request('https://account.example.com/auth/session', {
          headers: {
            authorization: `Bearer ${createdBody.data.secret}`
          }
        })
      )
    ).rejects.toMatchObject({
      code: 'AUTHFN_API_KEY_REVOKED'
    });
  });

  it('rejects api key names that exceed the canonical UTF-8 byte limit', async () => {
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
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken))
    );

    const rejected = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': issued.csrfToken
        },
        body: JSON.stringify({
          name: 'x'.repeat(129)
        })
      })
    );

    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error.code).toBe('AUTHFN_VALIDATION_ERROR');
  });

  it('preserves authoritative metadata fields and rejects invalid expiry timestamps', async () => {
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
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken))
    );

    const invalidExpiry = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': issued.csrfToken
        },
        body: JSON.stringify({
          name: 'bad-expiry',
          expiresAt: 'not-a-date'
        })
      })
    );
    expect(invalidExpiry.status).toBe(400);
    expect((await invalidExpiry.json()).error.code).toBe('AUTHFN_VALIDATION_ERROR');

    const created = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        method: 'POST',
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
          'x-authfn-csrf': issued.csrfToken
        },
        body: JSON.stringify({
          name: 'authoritative',
          scopes: ['read'],
          metadata: {
            ownerUserId: 'override-attempt',
            scopes: ['override']
          }
        })
      })
    );
    const createdBody = await created.json();
    const authenticated = await auth.provider.authenticate(
      new Request('https://account.example.com/auth/session', {
        headers: {
          authorization: `Bearer ${createdBody.data.secret}`
        }
      })
    );

    expect(authenticated?.metadata).toMatchObject({
      ownerUserId: user.id,
      scopes: ['read']
    });
  });
});
