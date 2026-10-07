import { describe, expect, it, vi } from 'vitest';
import { createTestServer } from './test-server.js';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import { authFnApiKeyPlugin } from '@authfn/api-keys';
import type { AuthFnRuntimeConfig } from '../index.js';
import { issueSessionCookies } from '../core/cookies.js';
import { issueSession } from '../core/sessions.js';
import { createUser } from '../core/users.js';
import {
  authenticateApiKey,
  createApiKey,
  findApiKeyById,
  revokeApiKeyById
} from '../core/api-keys.js';

function createConfig(): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins: [
      authFnApiKeyPlugin()
    ],
    pluginRuntime: {
      apiKey: {
        now: () => new Date('2026-03-22T00:00:00.000Z')
      }
    }
  };
}

function cookieHeaderFromSetCookies(setCookies: string[]): string {
  return setCookies
    .map((cookie) => cookie.slice(0, cookie.indexOf(';')))
    .join('; ');
}

describe('authfn api key plugin', () => {
  it('issues, authenticates, and revokes an unowned service key without a user identity', async () => {
    const config = createConfig();
    const auth = createTestServer(config);
    const now = new Date('2026-03-22T00:00:00.000Z');
    const findOne = vi.spyOn(config.database, 'findOne');
    const created = await createApiKey(config, {
      userId: null,
      name: 'service-worker',
      scopes: ['skills:read'],
      metadata: {
        servicePrincipalId: 'service:worker',
        ownerUserId: 'forged-user',
        scopes: ['admin']
      }
    }, { now: () => now, secretPrefix: 'sp' });

    expect(findOne).not.toHaveBeenCalled();
    expect(created.secret).toMatch(/^sp_/);
    expect(created.record.userId).toBeNull();
    expect(created.record.createdAt).toEqual(now);
    const stored = await findApiKeyById(config, created.keyId);
    expect(stored?.userId).toBeNull();
    expect(stored?.secretHash).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(created.secret);

    const request = () => new Request('https://account.example.com/auth/session', {
      headers: { authorization: `Bearer ${created.secret}` }
    });
    const authenticated = await auth.provider.authenticate(request());
    expect(authenticated).toMatchObject({
      type: 'api-key',
      actorType: 'api-key',
      actorId: created.keyId,
      subject: { actorType: 'api-key', actorId: created.keyId },
      resourceIds: [],
      methods: ['api-key'],
      metadata: { servicePrincipalId: 'service:worker', scopes: ['skills:read'] }
    });
    expect(authenticated?.metadata?.ownerUserId).toBeUndefined();
    expect((await findApiKeyById(config, created.keyId))?.lastUsedAt).toEqual(
      expect.any(Date)
    );

    await expect(
      revokeApiKeyById(config, created.keyId, { now: () => now })
    ).resolves.toMatchObject({ userId: null, revokedAt: now });
    await expect(auth.provider.authenticate(request())).rejects.toMatchObject({
      code: 'AUTHFN_API_KEY_REVOKED'
    });
  });

  it('expires an unowned key at the exact expiry boundary', async () => {
    const config = createConfig();
    let now = new Date('2026-03-22T00:00:00.000Z');
    const expiresAt = new Date('2026-03-22T00:01:00.000Z');
    const created = await createApiKey(config, {
      userId: null,
      name: 'short-lived-service',
      expiresAt
    }, { now: () => now });
    const authenticate = () => authenticateApiKey(config, created.secret, { now: () => now });

    await expect(authenticate()).resolves.toMatchObject({
      expiresAt,
      metadata: { scopes: [] }
    });
    now = expiresAt;
    await expect(authenticate()).resolves.toBeNull();
    now = new Date(expiresAt.getTime() + 1);
    await expect(authenticate()).resolves.toBeNull();
    expect((await findApiKeyById(config, created.keyId))?.lastUsedAt).toEqual(
      new Date('2026-03-22T00:00:00.000Z')
    );
  });

  it('keeps cookie-session creation user-owned and excludes unowned keys from user management', async () => {
    const config = createConfig();
    const auth = createTestServer(config);
    const unowned = await createApiKey(config, { userId: null, name: 'service-only' });
    const user = await createUser(config, { primaryEmail: 'service-admin@example.com' });
    const issued = await issueSession(config, {}, {
      request: new Request('https://account.example.com/auth/session'),
      userId: user.id,
      primaryEmail: user.primaryEmail,
      methods: ['password']
    });
    const cookieHeader = cookieHeaderFromSetCookies(
      Object.values(issueSessionCookies(issued.cookiePolicy!, issued.sessionToken, issued.csrfToken))
    );
    const headers = {
      cookie: cookieHeader,
      'content-type': 'application/json',
      'x-authfn-csrf': issued.csrfToken
    };
    const response = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: null, name: 'user-key' })
      })
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    expect((await findApiKeyById(config, created.data.keyId))?.userId).toBe(user.id);

    const listed = await auth.router.handle(
      new Request('https://account.example.com/auth/api-keys', {
        headers: { cookie: cookieHeader }
      })
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).data.keys).toEqual([
      expect.objectContaining({ id: created.data.keyId, userId: user.id })
    ]);
    const denied = await auth.router.handle(
      new Request(`https://account.example.com/auth/api-keys/${unowned.keyId}`, {
        method: 'DELETE',
        headers
      })
    );
    expect(denied.status).toBe(404);
    expect((await findApiKeyById(config, unowned.keyId))?.revokedAt).toBeNull();
  });

  it.each([
    { name: '' },
    { name: 'x'.repeat(129) },
    { name: 'invalid-expiry', expiresAt: new Date('invalid') }
  ])('retains name and expiry validation for unowned keys: %j', async (input) => {
    const config = createConfig();
    await expect(
      createApiKey(config, { userId: null, ...input })
    ).rejects.toMatchObject({ code: 'AUTHFN_VALIDATION_ERROR' });
    await expect(config.database.count({
      model: 'api_keys', namespace: 'authfn'
    })).resolves.toBe(0);
  });

  it('rejects oversized user IDs in the exported persistence helper', async () => {
    const config = createConfig();

    await expect(createApiKey(config, {
      userId: 'u'.repeat(256),
      name: 'direct-helper'
    })).rejects.toMatchObject({
      code: 'AUTHFN_VALIDATION_ERROR',
      details: {
        fieldName: 'userId',
        maxLength: 255
      }
    });

    await expect(config.database.count({
      model: 'api_keys',
      namespace: 'authfn'
    })).resolves.toBe(0);
  });

  it('creates an API key for a persisted legacy oversized user ID', async () => {
    const config = createConfig();
    const userId = 'legacy-user-'.padEnd(300, 'x');
    await config.database.create({
      model: 'users',
      namespace: 'authfn',
      data: {
        id: userId,
        primaryEmail: 'legacy-api@example.com',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    const created = await createApiKey(config, {
      userId,
      name: 'legacy-key'
    });

    expect(created.record.userId).toBe(userId);
    await expect(config.database.count({
      model: 'api_keys',
      namespace: 'authfn'
    })).resolves.toBe(1);
  });

  it('rejects persisted legacy user IDs wider than the compatible reference column', async () => {
    const config = createConfig();
    const userId = 'legacy-user-'.padEnd(768, 'x');
    await config.database.create({
      model: 'users',
      namespace: 'authfn',
      data: {
        id: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    const findOne = vi.spyOn(config.database, 'findOne');

    await expect(createApiKey(config, {
      userId,
      name: 'too-wide-legacy-key'
    })).rejects.toMatchObject({
      code: 'AUTHFN_VALIDATION_ERROR',
      details: { fieldName: 'userId', maxLength: 767 }
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('creates, lists, authenticates, and revokes api keys with hashed secrets at rest', async () => {
    const config = createConfig();
    const auth = createTestServer(config);
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
    const auth = createTestServer(config);
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
    const auth = createTestServer(config);
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
