import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter, createInMemoryKVStore, type KVStoreAdapter } from './rate-limit.js';

interface KVSetInput {
  key: string;
  value: string;
  ttlSeconds?: number;
}

describe('rate-limit', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('createRateLimiter', () => {
    it('allows requests within fixed-window limit', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        algorithm: 'fixed-window',
      });

      const r1 = await limiter.check({ key: 'user1' });
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await limiter.check({ key: 'user1' });
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await limiter.check({ key: 'user1' });
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);

      const r4 = await limiter.check({ key: 'user1' });
      expect(r4.allowed).toBe(false);
    });

    it('enforces sliding-window behavior based on timestamp eviction (TV-REUSE-011-P)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));

      const limiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 5,
        algorithm: 'sliding-window',
      });

      for (let i = 0; i < 5; i += 1) {
        const result = await limiter.check({ key: 'sliding-user' });
        expect(result.allowed).toBe(true);
        vi.setSystemTime(Date.now() + 100);
      }

      const blockedAt500 = await limiter.check({ key: 'sliding-user' });
      expect(blockedAt500.allowed).toBe(false);

      vi.setSystemTime(Date.now() + 500);
      const allowedAt1000 = await limiter.check({ key: 'sliding-user' });
      expect(allowedAt1000.allowed).toBe(true);
    });

    it('enforces token-bucket behavior distinctly from fixed-window (TV-REUSE-011-N)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));

      const tokenBucket = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        algorithm: 'token-bucket',
      });

      expect((await tokenBucket.check({ key: 'tb-user' })).allowed).toBe(true);
      expect((await tokenBucket.check({ key: 'tb-user' })).allowed).toBe(true);
      expect((await tokenBucket.check({ key: 'tb-user' })).allowed).toBe(false);

      // Token bucket refills continuously; fixed-window would still block at +500ms.
      vi.setSystemTime(Date.now() + 500);
      const tokenBucketAtHalfWindow = await tokenBucket.check({ key: 'tb-user' });
      expect(tokenBucketAtHalfWindow.allowed).toBe(true);

      const fixedWindow = createRateLimiter({
        windowMs: 1000,
        maxRequests: 2,
        algorithm: 'fixed-window',
      });

      expect((await fixedWindow.check({ key: 'fw-user' })).allowed).toBe(true);
      expect((await fixedWindow.check({ key: 'fw-user' })).allowed).toBe(true);
      expect((await fixedWindow.check({ key: 'fw-user' })).allowed).toBe(false);

      vi.setSystemTime(Date.now() + 500);
      const fixedAtHalfWindow = await fixedWindow.check({ key: 'fw-user' });
      expect(fixedAtHalfWindow.allowed).toBe(false);
    });

    it('returns a clean denial for zero-limit token buckets instead of crashing', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));

      const limiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 0,
        algorithm: 'token-bucket',
      });

      await expect(limiter.check({ key: 'tb-zero' })).resolves.toMatchObject({
        allowed: false,
        remaining: 0,
        total: 0,
      });
    });

    it('rejects non-positive effective windows before computing bucket math', async () => {
      const limiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        algorithm: 'token-bucket',
      });

      await expect(limiter.check({ key: 'tb-invalid-window', windowSeconds: 0 })).rejects.toThrow(
        'RATE_LIMIT_WINDOW_INVALID'
      );
    });

    it('rejects non-finite or negative effective limits before rate-limit calculations', async () => {
      const limiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        algorithm: 'token-bucket',
      });

      await expect(
        limiter.check({ key: 'tb-invalid-limit', limit: Number.NaN as number })
      ).rejects.toThrow('RATE_LIMIT_LIMIT_INVALID');
      await expect(limiter.check({ key: 'tb-negative-limit', limit: -1 })).rejects.toThrow(
        'RATE_LIMIT_LIMIT_INVALID'
      );
    });

    it('tracks different keys separately', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      expect((await limiter.check({ key: 'user1' })).allowed).toBe(true);
      expect((await limiter.check({ key: 'user2' })).allowed).toBe(true);
      expect((await limiter.check({ key: 'user1' })).allowed).toBe(false);
    });

    it('checks multiple keys without consuming partial capacity when one key is blocked', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        algorithm: 'token-bucket',
      });

      expect((await limiter.check({ key: 'provider' })).allowed).toBe(true);

      const multi = await limiter.checkMany({ keys: ['provider', 'tenant'] });
      expect(multi.allowed).toBe(false);
      expect(multi.remainingByKey.get('provider')).toBe(0);
      expect(multi.remainingByKey.get('tenant')).toBe(1);

      expect((await limiter.check({ key: 'tenant' })).allowed).toBe(true);
    });

    it('uses the latest blocked reset time for multi-key denials', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));
      const limiter = createRateLimiter({
        windowMs: 1000,
        maxRequests: 1,
        algorithm: 'token-bucket',
      });

      await limiter.check({ key: 'provider' });
      vi.setSystemTime(new Date('2026-03-12T00:00:00.500Z'));
      await limiter.check({ key: 'tenant' });
      vi.setSystemTime(new Date('2026-03-12T00:00:00.600Z'));

      const multi = await limiter.checkMany({ keys: ['provider', 'tenant'] });

      expect(multi.allowed).toBe(false);
      expect(multi.resetAt).toBe('2026-03-12T00:00:01.500Z');
      expect(multi.resetAtByKey.get('provider')).toBe('2026-03-12T00:00:01.000Z');
      expect(multi.resetAtByKey.get('tenant')).toBe('2026-03-12T00:00:01.500Z');
    });

    it('fails closed without overwriting concurrent quota when a later write fails', async () => {
      const internalStore = new Map<string, string>();
      let failTenantWrite = true;
      const customStore: KVStoreAdapter = {
        async get(key: string) {
          return internalStore.get(key) ?? null;
        },
        async set(input: KVSetInput) {
          if (input.key === 'ratelimit:tenant' && failTenantWrite) {
            failTenantWrite = false;
            internalStore.set(
              'ratelimit:provider',
              JSON.stringify({ count: 2, windowStart: 0, expiresAt: 60000 })
            );
            throw new Error('write failed');
          }
          internalStore.set(input.key, input.value);
        },
        async delete(key: string) {
          internalStore.delete(key);
        },
      };
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
        algorithm: 'fixed-window',
        persistence: customStore,
        now: () => 0,
      });

      await expect(limiter.checkMany({ keys: ['provider', 'tenant'] })).rejects.toThrow(
        'write failed'
      );

      expect(JSON.parse(internalStore.get('ratelimit:provider') ?? '{}')).toMatchObject({
        count: 2,
      });
      expect((await limiter.check({ key: 'provider' })).allowed).toBe(false);
    });

    it('retains prior quota charges after a partial commit failure', async () => {
      const internalStore = new Map<string, string>();
      const ttlByKey = new Map<string, number | undefined>();
      let currentTime = 0;
      const customStore: KVStoreAdapter = {
        async get(key: string) {
          return internalStore.get(key) ?? null;
        },
        async set(input: KVSetInput) {
          if (input.key === 'ratelimit:tenant') {
            throw new Error('write failed');
          }
          internalStore.set(input.key, input.value);
          ttlByKey.set(input.key, input.ttlSeconds);
        },
        async delete(key: string) {
          internalStore.delete(key);
          ttlByKey.delete(key);
        },
      };
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
        algorithm: 'fixed-window',
        persistence: customStore,
        now: () => currentTime,
      });

      await limiter.check({ key: 'provider' });
      currentTime = 30000;

      await expect(
        limiter.checkMany({ keys: ['provider', 'tenant'], windowSeconds: 10 })
      ).rejects.toThrow('write failed');

      expect(ttlByKey.get('ratelimit:provider')).toBe(10);
      expect(JSON.parse(internalStore.get('ratelimit:provider') ?? '{}')).toMatchObject({
        count: 1,
        windowStart: 30000,
        expiresAt: 40000,
      });
    });

    it('resets key state', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      await limiter.check({ key: 'user1' });
      expect((await limiter.check({ key: 'user1' })).allowed).toBe(false);

      await limiter.reset('user1');
      expect((await limiter.check({ key: 'user1' })).allowed).toBe(true);
    });

    it('includes reset time in result', async () => {
      const now = Date.now();
      const windowMs = 60000;
      const limiter = createRateLimiter({
        windowMs,
        maxRequests: 10,
      });

      const result = await limiter.check({ key: 'user1' });
      const resetAtTs = new Date(result.resetAt).getTime();
      expect(resetAtTs).toBeGreaterThanOrEqual(now);
      expect(resetAtTs).toBeLessThanOrEqual(now + windowMs + 100);
    });

    it('respects check overrides', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });

      expect((await limiter.check({ key: 'user_override', limit: 1 })).allowed).toBe(true);
      expect((await limiter.check({ key: 'user_override', limit: 1 })).allowed).toBe(false);
    });

    it('uses custom key prefix', async () => {
      const store = createInMemoryKVStore();
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'custom:',
        persistence: store,
      });

      await limiter.check({ key: 'test' });
      const value = await store.get('custom:test');
      expect(value).not.toBeNull();
    });

    it('accepts external persistence', async () => {
      const internalStore = new Map<string, string>();
      const customStore: KVStoreAdapter = {
        async get(key: string) {
          return internalStore.get(key) ?? null;
        },
        async set(input: KVSetInput) {
          internalStore.set(input.key, input.value);
        },
        async delete(key: string) {
          internalStore.delete(key);
        },
      };

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
        persistence: customStore,
      });

      await limiter.check({ key: 'user1' });
      expect(internalStore.size).toBe(1);
    });
  });

  describe('createInMemoryKVStore', () => {
    let store: KVStoreAdapter;

    beforeEach(() => {
      store = createInMemoryKVStore();
    });

    it('gets and sets values', async () => {
      await store.set({ key: 'key1', value: 'value1' });
      expect(await store.get('key1')).toBe('value1');
    });

    it('returns null for missing keys', async () => {
      expect(await store.get('missing')).toBeNull();
    });

    it('deletes keys', async () => {
      await store.set({ key: 'key1', value: 'value1' });
      await store.delete('key1');
      expect(await store.get('key1')).toBeNull();
    });

    it('expires keys after TTL', async () => {
      await store.set({ key: 'key1', value: 'value1', ttlSeconds: 0.01 });
      expect(await store.get('key1')).toBe('value1');

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(await store.get('key1')).toBeNull();
    });
  });
});
