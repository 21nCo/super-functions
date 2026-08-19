/**
 * Rate Limiting Middleware
 * Implements RATE-001 through RATE-005: configurable per-endpoint rate limiting
 * with atomic-store, cache-store, and in-memory implementations.
 */

import type { AtomicStoreAdapter, KVStoreAdapter } from "@superfunctions/db";

/**
 * Rate limiter interface for checking request allowance.
 */
export interface RateLimiter {
  check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>;
}

/**
 * Atomic-store-backed rate limiter using atomic INCR with TTL (RATE-002).
 * Key format: ratelimit:{endpoint}:{clientKey}:{windowId}
 */
export class AtomicRateLimiter implements RateLimiter {
  constructor(private atomicStore: AtomicStoreAdapter) {}

  async check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
    const storeKey = `ratelimit:${key}:${windowId}`;
    const count = (await this.atomicStore.incr({
      key: storeKey,
      by: 1,
      ttlSeconds: windowSeconds,
    })).value;
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
    };
  }
}

export class CacheRateLimiter implements RateLimiter {
  private locks = new Map<string, Promise<void>>();

  constructor(private cacheStore: KVStoreAdapter) {}

  async check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
    const storeKey = `ratelimit:${key}:${windowId}`;
    return this.withLock(storeKey, async () => {
      const current = Number(await this.cacheStore.get(storeKey) ?? "0");
      const next = current + 1;
      await this.cacheStore.set({
        key: storeKey,
        value: String(next),
        ttlSeconds: windowSeconds,
      });
      return {
        allowed: next <= maxRequests,
        remaining: Math.max(0, maxRequests - next),
      };
    });
  }

  private async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.locks.get(key) === queued) {
        this.locks.delete(key);
      }
    }
  }
}

/**
 * In-memory sliding window rate limiter (RATE-003).
 * Uses a Map<string, { count, resetAt }> structure with lazy cleanup.
 * Single-process only — does NOT work across multiple processes.
 */
export class MemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sweepIntervalMs = 60_000) {
    // Periodic sweep to remove expired entries and prevent unbounded memory growth
    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    // SRV-011: unref() so this timer doesn't keep the Node.js process alive
    if (this.sweepTimer && typeof this.sweepTimer === "object" && "unref" in this.sweepTimer) {
      (this.sweepTimer as NodeJS.Timeout).unref();
    }
  }

  async check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const entry = this.windows.get(key);

    if (!entry || now >= entry.resetAt) {
      // Window expired or first request — start new window
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    entry.count++;
    return {
      allowed: entry.count <= maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
    };
  }

  /** Remove all expired window entries */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now >= entry.resetAt) {
        this.windows.delete(key);
      }
    }
  }

  /**
   * Stop the periodic sweep timer.
   *
   * LOW-034: **Must be called** when the limiter is no longer needed (e.g. on server
   * shutdown) to allow the Node.js event loop to exit cleanly. Failing to call
   * `destroy()` will keep the process alive indefinitely if the sweep timer was
   * created without `.unref()` (older environments).
   */
  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}

/**
 * Rate limit middleware configuration.
 */
export interface RateLimitMiddlewareConfig {
  limiter: RateLimiter;
  maxRequests: number;
  windowSeconds: number;
  endpoints?: Partial<Record<string, { maxRequests: number; windowSeconds: number }>>;
  keyExtractor: (ctx: any) => string | Promise<string>;
}

/**
 * Creates a rate limit middleware function (RATE-001).
 * Returns null if the request is allowed, or a 429 Response if rate-limited.
 * Applied BEFORE JSON body parsing and authorization per spec.
 */
export function createRateLimitMiddleware(config: RateLimitMiddlewareConfig) {
  return async (endpoint: string, ctx: any): Promise<Response | null> => {
    const key = await config.keyExtractor(ctx);
    const endpointConfig = config.endpoints?.[endpoint];
    const max = endpointConfig?.maxRequests ?? config.maxRequests;
    const windowSec = endpointConfig?.windowSeconds ?? config.windowSeconds;

    const result = await config.limiter.check(`${endpoint}:${key}`, max, windowSec);

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            details: { path: "$" },
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            // SRV-009: Retry-After tells clients how long to wait before retrying
            "Retry-After": String(windowSec),
          },
        },
      );
    }

    return null; // Allowed
  };
}
