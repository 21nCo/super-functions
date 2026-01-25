import { describe, it, expect, beforeEach } from 'vitest';
import { createRateLimiter, createInMemoryKVStore, type KVStoreAdapter } from './rate-limit.js';

describe('rate-limit', () => {
  describe('createRateLimiter', () => {
    it('should allow requests within limit', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 3,
      });

      const r1 = await limiter.check('user1');
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);
      expect(r1.total).toBe(3);

      const r2 = await limiter.check('user1');
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await limiter.check('user1');
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it('should deny requests over limit (TV-RATE-NEG-001)', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      await limiter.check('user1');
      await limiter.check('user1');

      const r3 = await limiter.check('user1');
      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
    });

    it('should track different keys separately', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      const r1 = await limiter.check('user1');
      expect(r1.allowed).toBe(true);

      const r2 = await limiter.check('user2');
      expect(r2.allowed).toBe(true);

      const r3 = await limiter.check('user1');
      expect(r3.allowed).toBe(false);
    });

    it('should reset key state', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      await limiter.check('user1');
      const r1 = await limiter.check('user1');
      expect(r1.allowed).toBe(false);

      await limiter.reset('user1');

      const r2 = await limiter.check('user1');
      expect(r2.allowed).toBe(true);
    });

    it('should include reset time in result (TV-RATE-001)', async () => {
      const now = Date.now();
      const windowMs = 60000;

      const limiter = createRateLimiter({
        windowMs,
        maxRequests: 10,
      });

      const result = await limiter.check('user1');
      expect(result.resetAt).toBeGreaterThanOrEqual(now);
      expect(result.resetAt).toBeLessThanOrEqual(now + windowMs + 100);
    });

    it('should use custom key prefix', async () => {
      const store = createInMemoryKVStore();
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'custom:',
        persistence: store,
      });

      await limiter.check('test');
      const value = await store.get('custom:test');
      expect(value).not.toBeNull();
    });

    it('should accept external persistence (PKG-006)', async () => {
      const internalStore = new Map<string, string>();
      const customStore: KVStoreAdapter = {
        async get(key: string) {
          return internalStore.get(key) ?? null;
        },
        async set(key: string, value: string) {
          internalStore.set(key, value);
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

      await limiter.check('user1');
      expect(internalStore.size).toBe(1);
    });
  });

  describe('createInMemoryKVStore', () => {
    let store: KVStoreAdapter;

    beforeEach(() => {
      store = createInMemoryKVStore();
    });

    it('should get and set values', async () => {
      await store.set('key1', 'value1');
      const result = await store.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for missing keys', async () => {
      const result = await store.get('missing');
      expect(result).toBeNull();
    });

    it('should delete keys', async () => {
      await store.set('key1', 'value1');
      await store.delete('key1');
      const result = await store.get('key1');
      expect(result).toBeNull();
    });

    it('should expire keys after TTL', async () => {
      await store.set('key1', 'value1', 10); // 10ms TTL
      
      const immediate = await store.get('key1');
      expect(immediate).toBe('value1');

      await new Promise((r) => setTimeout(r, 20));

      const expired = await store.get('key1');
      expect(expired).toBeNull();
    });
  });
});
