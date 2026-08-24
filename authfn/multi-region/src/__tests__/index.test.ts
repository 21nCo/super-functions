import { describe, expect, it } from 'vitest';
import type { AuthFnRuntimeConfig } from 'authfn';
import { deleteAccountForUser } from 'authfn/core/account';
import { composePluginHooks } from 'authfn/plugin-runner';
import {
  authFnMultiRegionEnvironment,
  authFnMultiRegionPlugin,
  createInMemoryAuthFnPlacementDirectory,
  finalizeAuthFnIdentityDeletion
} from '../index.js';

function gatewayRuntime(
  directory = createInMemoryAuthFnPlacementDirectory(),
  database: AuthFnRuntimeConfig['database'] = { deleteMany: async () => 1 } as never
) {
  const plugin = authFnMultiRegionPlugin();
  const environment = authFnMultiRegionEnvironment({
    routing: {
      mode: 'gateway',
      publicAuthority: 'https://account.example.com',
      placementDirectory: directory,
      identityKeyForIdentifier: (identifier) => `email:${identifier}`
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
