import type {
  IndexedDirectoryRecord,
  IndexedDirectoryStoreAdapter,
} from '@superfunctions/db';
import { describe, expect, it, vi } from 'vitest';

import {
  datafnMultiRegionPlugin,
  deleteDatafnPermissionGrant,
  getDatafnMultiRegionRuntimeConfig,
  indexDatafnPermissionGrant,
  queryDatafnPermissionGrants,
} from './multi-region.js';

function directoryStore(): IndexedDirectoryStoreAdapter {
  const records = new Map<string, IndexedDirectoryRecord>();
  return {
    get: vi.fn(async (key) => records.get(key) ?? null),
    put: vi.fn(async (record) => {
      records.set(record.key, record);
    }),
    putIfAbsent: vi.fn(async (record) => {
      const existing = records.get(record.key);
      if (existing) return { inserted: false, existing };
      records.set(record.key, record);
      return { inserted: true };
    }),
    update: vi.fn(async (record) => {
      records.set(record.key, record);
      return record;
    }),
    delete: vi.fn(async (key) => {
      records.delete(key);
    }),
    query: vi.fn(async () => ({ records: [] })),
  };
}

describe('DataFn multi-region runtime', () => {
  it('keeps directory and region configuration isolated per plugin set', async () => {
    const euDirectory = directoryStore();
    const usDirectory = directoryStore();
    const euPlugin = datafnMultiRegionPlugin({
      regionId: 'eu-west',
      directory: euDirectory,
    });
    const usPlugin = datafnMultiRegionPlugin({
      regionId: 'us-east',
      directory: usDirectory,
    });

    const euRuntime = getDatafnMultiRegionRuntimeConfig([euPlugin]);
    const usRuntime = getDatafnMultiRegionRuntimeConfig([usPlugin]);
    expect(euRuntime).toEqual({ regionId: 'eu-west', directory: euDirectory });
    expect(usRuntime).toEqual({ regionId: 'us-east', directory: usDirectory });

    const grant = {
      id: 'grant:1',
      resourceType: 'document',
      resourceNs: 'tenant:1',
      resourceId: 'document:1',
      principalId: 'user:1',
    };
    await indexDatafnPermissionGrant(grant, euRuntime);
    await indexDatafnPermissionGrant(grant, usRuntime);

    const euRecord = await euDirectory.get('datafn:permission:eu-west:grant:1');
    const usRecord = await usDirectory.get('datafn:permission:us-east:grant:1');
    expect(JSON.parse(euRecord?.value ?? '{}')).toMatchObject({ resourceRegion: 'eu-west' });
    expect(JSON.parse(usRecord?.value ?? '{}')).toMatchObject({ resourceRegion: 'us-east' });

    await deleteDatafnPermissionGrant({
      id: 'grant:1',
      resourceType: 'document',
      resourceNs: 'tenant:1',
      resourceId: 'document:1',
      principalId: 'user:1',
    }, euRuntime);
    await expect(euDirectory.get('datafn:permission:eu-west:grant:1')).resolves.toBeNull();
    await expect(usDirectory.get('datafn:permission:us-east:grant:1')).resolves.not.toBeNull();
  });

  it('reads every permission-directory cursor page', async () => {
    const first = {
      key: 'datafn:permission:eu-west:grant:1',
      value: JSON.stringify({
        id: 'grant:1',
        resourceType: 'document',
        resourceNs: 'tenant:1',
        resourceId: 'document:1',
        principalId: 'user:1',
        resourceRegion: 'eu-west',
      }),
      indexes: {},
    };
    const second = {
      ...first,
      key: 'datafn:permission:eu-west:grant:2',
      value: JSON.stringify({
        ...JSON.parse(first.value),
        id: 'grant:2',
        resourceId: 'document:2',
      }),
    };
    const query = vi.fn(async (input: { cursor?: string }) =>
      input.cursor === 'page-2'
        ? { records: [second] }
        : { records: [first], cursor: 'page-2' });
    const directory = { ...directoryStore(), query };

    const grants = await queryDatafnPermissionGrants(
      { principalId: 'user:1', resourceType: 'document' },
      { regionId: 'eu-west', directory },
    );

    expect(grants.map((grant) => grant.id)).toEqual(['grant:1', 'grant:2']);
    expect(query).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 'page-2' }));
  });

  it('removes only matching-region legacy keys during migration and revocation', async () => {
    const directory = directoryStore();
    const legacyKey = 'datafn:permission:grant:legacy';
    const legacyRecord = (resourceRegion: string): IndexedDirectoryRecord => ({
      key: legacyKey,
      value: JSON.stringify({
        id: 'grant:legacy',
        resourceType: 'document',
        resourceNs: 'tenant:1',
        resourceId: 'document:1',
        principalId: 'user:1',
        resourceRegion,
      }),
      indexes: {},
    });
    await directory.put(legacyRecord('eu-west'));

    await deleteDatafnPermissionGrant({
      id: 'grant:legacy',
      resourceType: 'document',
      resourceNs: 'tenant:1',
      resourceId: 'document:1',
      principalId: 'user:1',
    }, { regionId: 'eu-west', directory });
    await expect(directory.get(legacyKey)).resolves.toBeNull();

    await directory.put(legacyRecord('us-east'));
    await deleteDatafnPermissionGrant({
      id: 'grant:legacy',
      resourceType: 'document',
      resourceNs: 'tenant:1',
      resourceId: 'document:1',
      principalId: 'user:1',
    }, { regionId: 'eu-west', directory });
    await expect(directory.get(legacyKey)).resolves.not.toBeNull();
  });

  it('encodes region boundaries and removes the prior raw qualified key', async () => {
    const directory = directoryStore();
    const rawKey = 'datafn:permission:region:west:grant:encoded';
    await directory.put({
      key: rawKey,
      value: JSON.stringify({
        id: 'grant:encoded',
        resourceType: 'document',
        resourceNs: 'tenant:1',
        resourceId: 'document:1',
        principalId: 'user:1',
        resourceRegion: 'region:west',
      }),
      indexes: {},
    });

    await indexDatafnPermissionGrant({
      id: 'grant:encoded',
      resourceType: 'document',
      resourceNs: 'tenant:1',
      resourceId: 'document:1',
      principalId: 'user:1',
    }, { regionId: 'region:west', directory });

    await expect(directory.get(rawKey)).resolves.toBeNull();
    await expect(
      directory.get('datafn:permission:region%3Awest:grant:encoded'),
    ).resolves.not.toBeNull();

    await indexDatafnPermissionGrant({
      id: 'west:grant:encoded',
      resourceType: 'document',
      resourceNs: 'tenant:1',
      resourceId: 'document:2',
      principalId: 'user:2',
    }, { regionId: 'region', directory });
    await expect(
      directory.get('datafn:permission:region:west:grant:encoded'),
    ).resolves.not.toBeNull();
    await expect(
      directory.get('datafn:permission:region%3Awest:grant:encoded'),
    ).resolves.not.toBeNull();
  });
});
