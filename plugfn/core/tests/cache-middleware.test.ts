import { describe, expect, it } from 'vitest';
import type { KVStoreAdapter } from '@superfunctions/db';
import {
  CacheClearUnsupportedError,
  CacheMiddleware,
} from '../src/middleware/caching.js';

describe('CacheMiddleware', () => {
  it('caches undefined results distinctly from misses', async () => {
    const cache = new CacheMiddleware();
    let executions = 0;

    const first = await cache.wrap('undefined-result', async () => {
      executions += 1;
      return undefined;
    });
    const second = await cache.wrap('undefined-result', async () => {
      executions += 1;
      return 'unexpected';
    });

    expect(first).toEqual({ data: undefined, cached: false });
    expect(second).toEqual({ data: undefined, cached: true });
    expect(executions).toBe(1);

    cache.destroy();
  });

  it('treats ttl=0 as immediate expiration instead of falling back to default ttl', async () => {
    const cache = new CacheMiddleware();

    await cache.set('zero-ttl', 'value', 0);

    await expect(cache.getEntry('zero-ttl')).resolves.toEqual({ hit: false });

    cache.destroy();
  });

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
