import type { CacheOptions } from '../types/action.js';
import type { Logger } from '../types/action.js';
import { hash } from '../utils/crypto.js';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

/**
 * Simple in-memory cache middleware
 */
export class CacheMiddleware {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private defaultTTL: number = 300000, // 5 minutes
    private logger?: Logger
  ) {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    this.logger?.debug(`Cache hit: ${key}`);
    return entry.data;
  }

  /**
   * Set cached value
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    
    this.cache.set(key, {
      data: value,
      expiresAt,
    });
    
    this.logger?.debug(`Cache set: ${key} (TTL: ${ttl || this.defaultTTL}ms)`);
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.logger?.debug(`Cache delete: ${key}`);
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
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
    
    if (cached !== null) {
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
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

