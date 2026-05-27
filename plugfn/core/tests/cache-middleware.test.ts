import { describe, expect, it } from 'vitest';
import type { KVStoreAdapter } from '@superfunctions/db';
import {
  CacheClearUnsupportedError,
  CacheMiddleware,
} from '../src/middleware/caching.js';

describe('CacheMiddleware', () => {
  it('throws when clearing a KV-backed cache without prefix invalidation', async () => {
    const store: KVStoreAdapter = {
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
    };
    const cache = new CacheMiddleware(300000, undefined, { store });

    await expect(cache.clear()).rejects.toBeInstanceOf(CacheClearUnsupportedError);
    await expect(cache.clear()).rejects.toMatchObject({
      code: 'PLUGFN_CACHE_CLEAR_UNSUPPORTED',
    });

    cache.destroy();
  });
});
