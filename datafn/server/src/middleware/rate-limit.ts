/**
 * Rate Limiting Middleware
 * Implements RATE-001 through RATE-005: configurable per-endpoint rate limiting
 * with Redis-backed and in-memory implementations.
 */

import type { RedisAdapter } from "@superfunctions/db";

/**
 * Rate limiter interface for checking request allowance.
 */
export interface RateLimiter {
  check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }>;
}

/**
 * Redis-backed rate limiter using atomic INCR with TTL (RATE-002).
 * Key format: ratelimit:{endpoint}:{clientKey}:{windowId}
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private redis: RedisAdapter) {}

  async check(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
    const redisKey = `ratelimit:${key}:${windowId}`;

    let count: number;
    // REL-008: Use atomic Lua script to prevent TTL race (crash between incr and expire).
    // If the Redis client exposes eval(), use a single atomic command.
    // Use non-atomic incr+set when eval() is unavailable.
    const redisAny = this.redis as any;
    if (typeof redisAny.eval === "function") {
      // Lua: INCR key; if new key (count==1) set EXPIRE; return count
      count = await redisAny.eval(
        "local c = redis.call('incr', KEYS[1]); if c == 1 then redis.call('expire', KEYS[1], ARGV[1]) end; return c",
        1,
        redisKey,
        String(windowSeconds),
      );
    } else {
      // Non-atomic path: tiny race window only on first request of a new window
      count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.set(redisKey, String(count), windowSeconds);
      }
    }
    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
    };
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
