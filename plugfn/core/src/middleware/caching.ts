import type { CacheOptions } from '../types/action.js';
import type { Logger } from '../types/action.js';
import type { KVStoreAdapter } from '@superfunctions/db';
import { hash } from '../utils/crypto.js';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

interface SerializedCacheEntry {
  data: any;
}

interface CacheMiddlewareOptions {
  store?: KVStoreAdapter;
  keyPrefix?: string;
}

/**
 * Action cache middleware. Uses an injected KV store when available and falls
 * back to an in-memory cache for local development/testing.
 */
export class CacheMiddleware {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout;
  private readonly store?: KVStoreAdapter;
  private readonly keyPrefix: string;

  constructor(
    private defaultTTL: number = 300000, // 5 minutes
    private logger?: Logger,
    options: CacheMiddlewareOptions = {}
  ) {
    this.store = options.store;
    this.keyPrefix = options.keyPrefix ?? 'plugfn:action-cache:';
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | undefined> {
    if (this.store) {
      const raw = await this.store.get(this.cacheKey(key));
      if (raw === null) {
        return undefined;
      }

      try {
        const entry = JSON.parse(raw) as SerializedCacheEntry;
        this.logger?.debug(`Cache hit: ${key}`);
        return entry.data as T;
      } catch {
        await this.store.delete(this.cacheKey(key));
        return undefined;
      }
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    this.logger?.debug(`Cache hit: ${key}`);
    return entry.data;
  }

  /**
   * Set cached value
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const ttlMs = ttl || this.defaultTTL;
    if (this.store) {
      await this.store.set({
        key: this.cacheKey(key),
        value: JSON.stringify({ data: value } satisfies SerializedCacheEntry),
        ttlSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      });
      this.logger?.debug(`Cache set: ${key} (TTL: ${ttlMs}ms)`);
      return;
    }

    const expiresAt = Date.now() + ttlMs;
    
    this.cache.set(key, {
      data: value,
      expiresAt,
    });
    
    this.logger?.debug(`Cache set: ${key} (TTL: ${ttlMs}ms)`);
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    if (this.store) {
      await this.store.delete(this.cacheKey(key));
      this.logger?.debug(`Cache delete: ${key}`);
      return;
    }

    this.cache.delete(key);
    this.logger?.debug(`Cache delete: ${key}`);
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    if (this.store) {
      this.logger?.warn('Cache clear requested, but KV-backed caches require prefix-level invalidation by the store');
      return;
    }

    this.cache.clear();
    this.logger?.debug('Cache cleared');
  }

  /**
   * Generate cache key for action
   */
  generateKey(provider: string, action: string, params: any, userId?: string): string {
    const paramsHash = hash(JSON.stringify(params));
    return `${provider}:${action}:${userId || 'anonymous'}:${paramsHash}`;
  }

  /**
   * Execute function with caching
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<{ data: T; cached: boolean }> {
    // Check cache
    const cached = await this.get<T>(key);
    
    if (cached !== undefined) {
      return { data: cached, cached: true };
    }
    
    // Execute function
    const data = await fn();
    
    // Store in cache
    await this.set(key, data, options?.ttl);
    
    return { data, cached: false };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger?.debug(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  /**
   * Destroy cache and cleanup
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    if (this.store) {
      return {
        size: -1,
        keys: [],
      };
    }

    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  private cacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}
