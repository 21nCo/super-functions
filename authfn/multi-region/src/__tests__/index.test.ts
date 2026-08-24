import { describe, expect, it, vi } from 'vitest';
import type { AuthFnRuntimeConfig } from 'authfn';
import {
  authFnMultiRegionEnvironment,
  authFnMultiRegionPlugin,
  createInMemoryAuthFnPlacementDirectory
} from '../index.js';

function gatewayRuntime(directory = createInMemoryAuthFnPlacementDirectory()) {
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
    database: {},
    namespace: 'authfn',
    basePath: '/auth'
  } as unknown as AuthFnRuntimeConfig;
  return { config, directory, environment, plugin };
}

describe('authFnMultiRegionPlugin gateway mode', () => {
  it('rejects a cell region that is absent from the configured regions', () => {
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

  it('tombstones placement before account deletion and fails closed on directory errors', async () => {
    const { config, directory, plugin } = gatewayRuntime();
    await directory.putIfAbsent({
      identityKey: 'email:ada@example.com',
      regionId: 'eu-west-1',
      epoch: 3,
      state: 'active',
      updatedAt: '2026-08-24T00:00:00.000Z'
    });

    await plugin.hooks?.beforeAccountDelete?.(
      { config },
      { userId: 'user_1', primaryEmail: ' ADA@example.com ' }
    );

    await expect(directory.get('email:ada@example.com')).resolves.toMatchObject({
      state: 'tombstoned',
      epoch: 4
    });

    const failing = gatewayRuntime({
      get: vi.fn(async () => ({
        identityKey: 'email:bea@example.com',
        regionId: 'us-east-1',
        epoch: 1,
        state: 'active' as const,
        updatedAt: '2026-08-24T00:00:00.000Z'
      })),
      putIfAbsent: vi.fn(),
      compareAndSet: vi.fn(async () => { throw new Error('directory unavailable'); })
    });
    await expect(failing.plugin.hooks?.beforeAccountDelete?.(
      { config: failing.config },
      { userId: 'user_2', primaryEmail: 'bea@example.com' }
    )).rejects.toThrow('directory unavailable');
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
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        identifier: 'ada@example.com',
        authority: 'https://account.example.com',
        continueLocally: true
      }
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
