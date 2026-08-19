import type {
  IndexedDirectoryRecord,
  IndexedDirectoryStoreAdapter,
} from '@superfunctions/db';
import { describe, expect, it, vi } from 'vitest';

import {
  datafnMultiRegionPlugin,
  getDatafnMultiRegionRuntimeConfig,
  indexDatafnPermissionGrant,
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

    const euRecord = await euDirectory.get('datafn:permission:grant:1');
    const usRecord = await usDirectory.get('datafn:permission:grant:1');
    expect(JSON.parse(euRecord?.value ?? '{}')).toMatchObject({ resourceRegion: 'eu-west' });
    expect(JSON.parse(usRecord?.value ?? '{}')).toMatchObject({ resourceRegion: 'us-east' });
  });
});
