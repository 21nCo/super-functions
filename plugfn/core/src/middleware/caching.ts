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

export type CacheLookup<T> = { hit: true; data: T } | { hit: false };

interface CacheMiddlewareOptions {
  store?: KVStoreAdapter;
  keyPrefix?: string;
}

export class CacheClearUnsupportedError extends Error {
  readonly code = 'PLUGFN_CACHE_CLEAR_UNSUPPORTED';

  constructor() {
    super('Cache clear is not supported for KV-backed caches without prefix invalidation support');
    this.name = 'CacheClearUnsupportedError';
  }
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
    this.cleanupInterval.unref?.();
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | undefined> {
    const lookup = await this.getEntry<T>(key);
    return lookup.hit ? lookup.data : undefined;
  }

  async getEntry<T>(key: string): Promise<CacheLookup<T>> {
    if (this.store) {
      const raw = await this.store.get(this.cacheKey(key));
      if (raw === null) {
        return { hit: false };
      }

      try {
        const entry = JSON.parse(raw) as SerializedCacheEntry;
        this.logger?.debug(`Cache hit: ${key}`);
        return { hit: true, data: entry.data as T };
      } catch {
        await this.store.delete(this.cacheKey(key));
        return { hit: false };
      }
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      return { hit: false };
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return { hit: false };
    }
    
    this.logger?.debug(`Cache hit: ${key}`);
    return { hit: true, data: entry.data };
  }

  /**
   * Set cached value
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const ttlMs = ttl ?? this.defaultTTL;
    if (ttlMs <= 0) {
      await this.delete(key);
      return;
    }

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
      throw new CacheClearUnsupportedError();
    }

    this.cache.clear();
    this.logger?.debug('Cache cleared');
  }

  /**
   * Generate cache key for action
   */
  generateKey(
    provider: string,
    action: string,
    params: any,
    userId?: string,
    connectionId?: string
  ): string {
    const paramsHash = hash(JSON.stringify(params));
    return `${provider}:${action}:${userId || 'anonymous'}:${connectionId || 'default'}:${paramsHash}`;
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
    const cached = await this.getEntry<T>(key);
    
    if (cached.hit) {
      return { data: cached.data, cached: true };
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
