import { describe, expect, it } from 'vitest';
import type { AuthFnRuntimeConfig } from 'authfn';
import { deleteAccountForUser } from 'authfn/core/account';
import { composePluginHooks } from 'authfn/plugin-runner';
import {
  authFnMultiRegionEnvironment,
  authFnMultiRegionPlugin,
  createAuthFnCanonicalGateway,
  createAuthFnCellPlacementMiddleware,
  createInMemoryAuthFnPlacementDirectory,
  fenceAuthFnIdentityDeletion,
  finalizeAuthFnIdentityDeletion,
  restoreAuthFnIdentityDeletion
} from '../index.js';

function gatewayRuntime(
  directory = createInMemoryAuthFnPlacementDirectory(),
  database: AuthFnRuntimeConfig['database'] = { deleteMany: async () => 1 } as never,
  identityKeyForIdentifier: (identifier: string) => string | Promise<string> =
    (identifier) => `email:${identifier}`
) {
  const plugin = authFnMultiRegionPlugin();
  const environment = authFnMultiRegionEnvironment({
    routing: {
      mode: 'gateway',
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      identityKeyForIdentifier,
      identityKeyForUserId: (userId) => `user:${userId}`
    }
  });
  const config = {
    plugins: [plugin],
    environment,
    database,
    namespace: 'authfn',
    basePath: '/auth'
  } as unknown as AuthFnRuntimeConfig;
  return { config, directory, environment, plugin };
}

describe('authFnMultiRegionPlugin gateway mode', () => {
  it('rejects a cell region that is absent from an explicit configured-region catalog', () => {
    const directory = createInMemoryAuthFnPlacementDirectory();
    const environment = authFnMultiRegionEnvironment({
      regions: [{ regionId: 'us-east-1', authority: 'https://us.internal.example.com' }],
      routing: {
        mode: 'gateway',
        publicAuthority: 'https://account.example.com',
        placementDirectory: directory,
        identityKeyForIdentifier: (identifier) => `email:${identifier}`,
        identityKeyForUserId: (userId) => `user:${userId}`,
        cell: {
          regionId: 'eu-west-1',
          audience: 'cell:eu-west-1',
          keyring: {
            active: { keyId: 'routing-2026-08', secret: 'routing-test-secret-with-enough-entropy' }
          },
          replayStore: { claim: async () => true }
        }
      }
    });

    expect(() => environment.resolve(new Request(
      'https://eu.internal.example.com/auth/environment'
    ))).toThrow('Gateway cell region must be present in configured regions');
  });

  it('uses the explicit gateway cell region when no configured-region catalog is supplied', () => {
    const directory = createInMemoryAuthFnPlacementDirectory();
    const environment = authFnMultiRegionEnvironment({
      routing: {
        mode: 'gateway',
        publicAuthority: 'https://account.example.com',
        placementDirectory: directory,
        identityKeyForIdentifier: (identifier) => `email:${identifier}`,
        identityKeyForUserId: (userId) => `user:${userId}`,
        cell: {
          regionId: 'eu-west-1',
          audience: 'cell:eu-west-1',
          keyring: {
            active: { keyId: 'routing-2026-08', secret: 'routing-test-secret-with-enough-entropy' }
          },
          replayStore: { claim: async () => true }
        }
      }
    });

    expect(environment.resolve(new Request(
      'https://eu.internal.example.com/auth/environment'
    )).regionId).toBe('eu-west-1');
  });

  it('fences before deletion, tombstones after success, and restores after failure', async () => {
    const observedStates: string[] = [];
    const directory = createInMemoryAuthFnPlacementDirectory();
    const database = {
      async deleteMany() {
        observedStates.push((await directory.get('email:ada@example.com'))?.state ?? 'missing');
        return 1;
      }
    } as never;
    const { config } = gatewayRuntime(directory, database);
    await directory.putIfAbsent({
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 3,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    });

    await deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: ' ADA@example.com ' } as never
    });

    expect(observedStates).toEqual(['deleting', 'deleting', 'deleting']);
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 5
    });

    const failingDirectory = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 7,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    const failing = gatewayRuntime(failingDirectory, {
      deleteMany: async () => { throw new Error('database unavailable'); }
    } as never);

    await expect(deleteAccountForUser(failing.config, composePluginHooks(failing.config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    })).rejects.toThrow('database unavailable');
    await expect(failingDirectory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'active',
      epoch: 9
    });
  });

  it('restores the deletion fence when a later before-delete hook aborts', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 3,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    let databaseDeletes = 0;
    const { config } = gatewayRuntime(directory, {
      deleteMany: async () => {
        databaseDeletes += 1;
        return 1;
      }
    } as never);
    config.plugins = [
      ...config.plugins,
      {
        name: 'laterDeleteGuard',
        hooks: {
          beforeAccountDelete: async () => {
            throw new Error('later guard unavailable');
          }
        }
      } as never
    ];

    await expect(deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    })).rejects.toThrow('laterDeleteGuard.beforeAccountDelete aborted');
    expect(databaseDeletes).toBe(0);
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'active',
      epoch: 5
    });
  });

  it('does not restore a deletion fence owned by another in-progress attempt', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 4,
      state: 'deleting',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    const { config } = gatewayRuntime(directory, {
      deleteMany: async () => 1
    } as never);

    await expect(deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    })).rejects.toThrow('already fenced for account deletion');
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'deleting',
      epoch: 4
    });
  });

  it('does not retry key resolution or restore an unowned concurrent fence', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 4,
      state: 'deleting',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    let resolverCalls = 0;
    const { config } = gatewayRuntime(
      directory,
      { deleteMany: async () => 1 } as never,
      (identifier) => {
        resolverCalls += 1;
        if (resolverCalls === 1) throw new Error('placement resolver unavailable');
        return `email:${identifier}`;
      }
    );

    await expect(deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    })).rejects.toThrow('multiRegion.beforeAccountDelete aborted');
    expect(resolverCalls).toBe(1);
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'deleting',
      epoch: 4
    });
  });

  it('does not restore a newer deletion fence after losing its owned generation', async () => {
    const directory = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 3,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    let replacedFence = false;
    const { config } = gatewayRuntime(directory, {
      deleteMany: async () => {
        if (!replacedFence) {
          replacedFence = true;
          await restoreAuthFnIdentityDeletion(directory, 'email:ada@example.com');
          await fenceAuthFnIdentityDeletion(directory, 'email:ada@example.com');
        }
        throw new Error('database unavailable');
      }
    } as never);

    await expect(deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    })).rejects.toThrow('Owned deletion fence changed before rollback');
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'deleting',
      epoch: 6
    });
  });

  it('surfaces deletion-fence restoration failures for durable repair', async () => {
    const backing = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 3,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    const directory = {
      get: (identityKey: string) => backing.get(identityKey),
      putIfAbsent: (placement: Parameters<typeof backing.putIfAbsent>[0]) =>
        backing.putIfAbsent(placement),
      compareAndSet: (input: Parameters<typeof backing.compareAndSet>[0]) => {
        if (input.expectedState === 'deleting') {
          throw new Error('placement directory unavailable');
        }
        return backing.compareAndSet(input);
      }
    };
    const { config } = gatewayRuntime(directory, {
      deleteMany: async () => { throw new Error('database unavailable'); }
    } as never);

    const failure = await deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('multiRegion.afterAccountDeleteFailure aborted');
    expect((failure as Error).cause).toMatchObject({ message: 'database unavailable' });
    await expect(backing.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'deleting',
      epoch: 4
    });
  });

  it('fences a gateway-verified account identity even without a primary email', async () => {
    const { directory, response } = await deleteThroughGateway();

    expect(response.status).toBe(200);
    await expect(directory.get('person:session-handle')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 3
    });
  });

  it('prefers the gateway-verified identity over an email-derived placement key', async () => {
    const { directory, response } = await deleteThroughGateway('ada@example.com');

    expect(response.status).toBe(200);
    await expect(directory.get('person:session-handle')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 3
    });
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'active',
      epoch: 7
    });
  });

  it('uses the target user placement key for delegated deletion without an email', async () => {
    const { directory, response } = await deleteThroughGateway(undefined, 'admin_1');

    expect(response.status).toBe(200);
    await expect(directory.get('person:target-handle')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 9
    });
    await expect(directory.get('person:session-handle')).resolves.toMatchObject({
      state: 'active',
      epoch: 1
    });
  });

  it('uses the target user placement key when delegated deletion omits an actor id', async () => {
    const { directory, response } = await deleteThroughGateway(
      'ada@example.com',
      undefined,
      true
    );

    expect(response.status).toBe(200);
    await expect(directory.get('person:target-handle')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 9
    });
    await expect(directory.get('person:session-handle')).resolves.toMatchObject({
      state: 'active',
      epoch: 1
    });
    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'active',
      epoch: 7
    });
  });

  it('leaves a durable deletion fence when finalization fails and supports repair', async () => {
    const backing = createInMemoryAuthFnPlacementDirectory([{
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 3,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    }]);
    let failFinalization = true;
    const directory = {
      get: (identityKey: string) => backing.get(identityKey),
      putIfAbsent: (placement: Parameters<typeof backing.putIfAbsent>[0]) =>
        backing.putIfAbsent(placement),
      compareAndSet: (input: Parameters<typeof backing.compareAndSet>[0]) => {
        if (failFinalization && input.expectedState === 'deleting') {
          throw new Error('placement directory unavailable');
        }
        return backing.compareAndSet(input);
      }
    };
    const { config } = gatewayRuntime(directory, { deleteMany: async () => 1 } as never);

    await expect(deleteAccountForUser(config, composePluginHooks(config), {
      user: { id: 'user_1', primaryEmail: 'ada@example.com' } as never
    })).rejects.toThrow();
    await expect(backing.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'deleting',
      epoch: 4
    });

    failFinalization = false;
    await finalizeAuthFnIdentityDeletion(directory, 'email:ada@example.com');
    await expect(backing.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 5
    });
  });

  it('returns the canonical authority without exposing placement or accepting malformed identifiers', async () => {
    const { config, environment, plugin } = gatewayRuntime();
    const lookup = plugin.routes?.({
      config,
      namespace: 'authfn',
      basePath: '/auth',
      hooks: {},
      environment
    }).find((route) => route.path === '/regions/lookup');
    expect(lookup).toBeDefined();

    const response = await lookup!.handler(new Request(
      'https://account.example.com/auth/regions/lookup',
      {
        method: 'POST',
        body: JSON.stringify({ identifier: ' ADA@example.com ' }),
        headers: { 'content-type': 'application/json' }
      }
    ), {} as never);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        identifier: 'ada@example.com',
        authority: 'https://account.example.com',
        continueLocally: true
      },
      requestId: expect.any(String)
    });

    await expect(lookup!.handler(new Request(
      'https://account.example.com/auth/regions/lookup',
      {
        method: 'POST',
        body: JSON.stringify({ identifier: 42 }),
        headers: { 'content-type': 'application/json' }
      }
    ), {} as never)).rejects.toMatchObject({ code: 'AUTHFN_VALIDATION_ERROR' });
  });
});

async function deleteThroughGateway(
  primaryEmail?: string,
  actorId?: string,
  delegated = actorId !== undefined
) {
  const directory = createInMemoryAuthFnPlacementDirectory([{
    identityKey: 'person:session-handle',
    regionId: 'us-east-1',
    epoch: 1,
    state: 'active',
    updatedAt: '2026-08-24T00:00:00.000Z'
  }, {
    identityKey: 'person:target-handle',
    regionId: 'us-east-1',
    epoch: 7,
    state: 'active',
    updatedAt: '2026-08-24T00:00:00.000Z'
  }, {
    identityKey: 'email:ada@example.com',
    regionId: 'us-east-1',
    epoch: 7,
    state: 'active',
    updatedAt: '2026-08-24T00:00:00.000Z'
  }]);
  const keyring = {
    active: {
      keyId: 'routing-2026-08',
      secret: 'routing-test-secret-with-enough-entropy'
    }
  };
  const routing = {
    mode: 'gateway' as const,
    publicAuthority: 'https://account.example.com',
    placementDirectory: directory,
    identityKeyForIdentifier: (identifier: string) => `email:${identifier}`,
    identityKeyForUserId: async (userId: string) => userId === 'user_1'
      ? 'person:target-handle'
      : `user:${userId}`,
    cell: {
      regionId: 'us-east-1',
      audience: 'cell:us-east-1',
      keyring,
      replayStore: { claim: async () => true }
    }
  };
  const plugin = authFnMultiRegionPlugin();
  const config = {
    plugins: [plugin],
    environment: authFnMultiRegionEnvironment({ routing }),
    database: { deleteMany: async () => 1 },
    namespace: 'authfn',
    basePath: '/auth'
  } as unknown as AuthFnRuntimeConfig;
  const middleware = createAuthFnCellPlacementMiddleware(
    { basePath: '/auth' },
    { routing }
  );
  if (!middleware) throw new Error('cell middleware missing');
  const gateway = createAuthFnCanonicalGateway<null>({
    publicAuthority: 'https://account.example.com',
    placementDirectory: directory,
    keyring,
    resolveIdentity: () => ({ identityKey: 'person:session-handle' }),
    selectInitialRegion: () => 'us-east-1',
    resolveCell: () => ({
      regionId: 'us-east-1',
      audience: 'cell:us-east-1',
      target: null
    }),
    dispatch: (_target, request) => middleware(request, {} as never, async () => {
      await deleteAccountForUser(config, composePluginHooks(config), {
        user: { id: 'user_1', primaryEmail } as never,
        request,
        actorId,
        delegated
      });
      return Response.json({ deleted: true });
    })
  });
  const response = await gateway.handle(new Request(
    'https://account.example.com/auth/account',
    { method: 'DELETE' }
  ));
  return { directory, response };
}
