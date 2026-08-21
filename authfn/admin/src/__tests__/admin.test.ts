import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import type { AuthFnConfig, AuthFnRuntimeConfig, AuthFnUserRecord } from 'authfn';
import {
  authFnMultiRegionEnvironment,
  authFnMultiRegionPlugin,
} from '@authfn/multi-region';
import type { ConditionalKVStoreAdapter } from '@superfunctions/db';
import type { AdminClient } from '@superfunctions/admin';
import { authFnPasswordPlugin } from '@authfn/password';
import {
  authFnAdminCapability,
  createAuthFnAdmin,
  createAuthFnAdminClient,
  createStaticAdminKeyAuthorizer
} from '../index.js';

function createConfig(
  plugins: AuthFnConfig['plugins'] = [],
  server?: Pick<AuthFnRuntimeConfig, 'environment' | 'pluginRuntime'>
): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace: 'authfn',
    plugins,
    ...(server ?? {})
  };
}

async function seedUser(
  config: AuthFnRuntimeConfig,
  input: Partial<AuthFnUserRecord> & { id: string; primaryEmail: string; createdAt: Date }
): Promise<AuthFnUserRecord> {
  const user: AuthFnUserRecord = {
    id: input.id,
    primaryEmail: input.primaryEmail,
    emailVerifiedAt: input.emailVerifiedAt ?? null,
    metadata: input.metadata,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt
  };

  return config.database.create<AuthFnUserRecord>({
    model: 'users',
    data: user as unknown as Record<string, unknown>,
    namespace: config.namespace
  });
}

function authHeaders(token = 'top-secret'): Record<string, string> {
  return {
    authorization: `Bearer ${token}`
  };
}

describe('@authfn/admin', () => {
  it('preserves the uniform capability client alongside named methods', () => {
    const client = createAuthFnAdminClient({} as AdminClient);
    expect(Object.keys(client.operations)).toHaveLength(authFnAdminCapability.operations.length);
    expect(typeof client.users.list).toBe('function');
    expect(typeof client.sessions.revoke).toBe('function');
  });

  it('requires an authorize hook before creating admin routes', () => {
    const config = createConfig();
    expect(() => createAuthFnAdmin({
      authFnConfig: config,
      authorize: undefined as never
    })).toThrow('AuthFn admin routes require an authorize hook');
  });

  it('rejects unauthorized admin requests with canonical AuthFn envelopes', async () => {
    const admin = createAuthFnAdmin({
      authFnConfig: createConfig(),
      authorize: () => false
    });

    const response = await admin.router.handle(
      new Request('https://account.example.com/admin/users', {
        headers: {
          'x-request-id': 'req_admin_denied'
        }
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'AUTHFN_ADMIN_UNAUTHORIZED',
        message: 'Admin authorization required',
        retryable: false
      },
      requestId: 'req_admin_denied'
    });
  });

  it('lists users with stable cursor pagination', async () => {
    const config = createConfig();
    await seedUser(config, {
      id: 'user_ada',
      primaryEmail: 'ada@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    });
    await seedUser(config, {
      id: 'user_grace',
      primaryEmail: 'grace@example.com',
      createdAt: new Date('2026-01-02T00:00:00.000Z')
    });
    await seedUser(config, {
      id: 'user_katherine',
      primaryEmail: 'katherine@example.com',
      createdAt: new Date('2026-01-03T00:00:00.000Z')
    });

    const admin = createAuthFnAdmin({
      authFnConfig: config,
      authorize: createStaticAdminKeyAuthorizer({ token: 'top-secret' })
    });

    const firstResponse = await admin.router.handle(
      new Request('https://account.example.com/admin/users?limit=2&direction=asc', {
        headers: authHeaders()
      })
    );
    expect(firstResponse.status).toBe(200);
    const firstBody = await firstResponse.json();
    expect(firstBody.data.users.map((user: AuthFnUserRecord) => user.id)).toEqual([
      'user_ada',
      'user_grace'
    ]);
    expect(firstBody.data.pageInfo.hasMore).toBe(true);
    expect(firstBody.data.pageInfo.nextCursor).toEqual(expect.any(String));

    const secondResponse = await admin.router.handle(
      new Request(`https://account.example.com/admin/users?limit=2&direction=asc&cursor=${firstBody.data.pageInfo.nextCursor}`, {
        headers: authHeaders()
      })
    );
    expect(secondResponse.status).toBe(200);
    const secondBody = await secondResponse.json();
    expect(secondBody.data.users.map((user: AuthFnUserRecord) => user.id)).toEqual([
      'user_katherine'
    ]);
    expect(secondBody.data.pageInfo.hasMore).toBe(false);
  });

  it('hard-deletes a user by id and runs multi-region lookup cleanup hooks', async () => {
    const lookupDeletes: string[] = [];
    const lookupStore: ConditionalKVStoreAdapter = {
      async get() {
        return null;
      },
      async set() {
      },
      async setIfAbsent() {
        return { inserted: true };
      },
      async delete(key) {
        lookupDeletes.push(key.replace(/^authfn:region:/, ''));
      }
    };
    const config = createConfig([
      authFnPasswordPlugin(),
      authFnMultiRegionPlugin()
    ], {
      environment: authFnMultiRegionEnvironment({
        lookupStore
      })
    });
    await seedUser(config, {
      id: 'user_delete_me',
      primaryEmail: 'DeleteMe@Example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    });
    await config.database.create({
      model: 'password_credentials',
      data: {
        id: 'pwd_1',
        userId: 'user_delete_me',
        passwordHash: 'scrypt$hash',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      },
      namespace: config.namespace
    });
    await config.database.create({
      model: 'sessions',
      data: {
        id: 'session_1',
        userId: 'user_delete_me',
        tokenHash: 'token_hash',
        methods: ['password'],
        expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      },
      namespace: config.namespace
    });
    await config.database.create({
      model: 'region_profiles',
      data: {
        id: 'region_profile_1',
        userId: 'user_delete_me',
        regionId: 'insouth',
        authority: 'https://account-insouth.example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z')
      },
      namespace: config.namespace
    });

    const admin = createAuthFnAdmin({
      authFnConfig: config,
      authorize: () => ({ allowed: true, actorId: 'admin_1' })
    });

    const response = await admin.router.handle(
      new Request('https://account.example.com/admin/users/user_delete_me', {
        method: 'DELETE'
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        deleted: true,
        userId: 'user_delete_me',
        primaryEmail: 'DeleteMe@Example.com',
        counts: {
          users: 1,
          sessions: 1,
          passwordCredentials: 1,
          regionProfiles: 1
        }
      }
    });
    await expect(config.database.findOne({
      model: 'users',
      where: [{ field: 'id', operator: 'eq', value: 'user_delete_me' }],
      namespace: config.namespace
    })).resolves.toBeNull();
    await expect(config.database.findMany({
      model: 'sessions',
      where: [{ field: 'userId', operator: 'eq', value: 'user_delete_me' }],
      namespace: config.namespace
    })).resolves.toHaveLength(0);
    await expect(config.database.findMany({
      model: 'password_credentials',
      where: [{ field: 'userId', operator: 'eq', value: 'user_delete_me' }],
      namespace: config.namespace
    })).resolves.toHaveLength(0);
    await expect(config.database.findMany({
      model: 'region_profiles',
      where: [{ field: 'userId', operator: 'eq', value: 'user_delete_me' }],
      namespace: config.namespace
    })).resolves.toHaveLength(0);
    expect(new Set(lookupDeletes)).toEqual(new Set(['deleteme@example.com']));
  });

  it('fails delete-by-email for duplicate matches unless deleteAllMatches is explicit', async () => {
    const config = createConfig();
    await seedUser(config, {
      id: 'user_duplicate_1',
      primaryEmail: 'duplicate@example.com',
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    });
    await seedUser(config, {
      id: 'user_duplicate_2',
      primaryEmail: 'duplicate@example.com',
      createdAt: new Date('2026-01-02T00:00:00.000Z')
    });
    const admin = createAuthFnAdmin({
      authFnConfig: config,
      authorize: createStaticAdminKeyAuthorizer({ token: 'top-secret' })
    });

    const ambiguousResponse = await admin.router.handle(
      new Request('https://account.example.com/admin/users/by-email/duplicate%40example.com', {
        method: 'DELETE',
        headers: authHeaders()
      })
    );
    expect(ambiguousResponse.status).toBe(409);
    await expect(ambiguousResponse.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'AUTHFN_ADMIN_AMBIGUOUS_USER',
        details: {
          count: 2,
          primaryEmail: 'duplicate@example.com',
          userIds: ['user_duplicate_1', 'user_duplicate_2']
        }
      }
    });

    const deleteAllResponse = await admin.router.handle(
      new Request('https://account.example.com/admin/users/by-email/duplicate%40example.com', {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ deleteAllMatches: true })
      })
    );
    expect(deleteAllResponse.status).toBe(200);
    await expect(deleteAllResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        deleted: true,
        primaryEmail: 'duplicate@example.com',
        deletedCount: 2
      }
    });
    await expect(config.database.findMany({
      model: 'users',
      where: [{ field: 'primaryEmail', operator: 'eq', value: 'duplicate@example.com' }],
      namespace: config.namespace
    })).resolves.toHaveLength(0);
  });
});
