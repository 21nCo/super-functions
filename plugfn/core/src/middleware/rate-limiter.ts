import type { RateLimitConfig } from '../types/provider.js';

interface RateLimiterDependencies {
  now?: () => number;
  setTimeoutFn?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimeoutFn?: (timeoutId: NodeJS.Timeout) => void;
  setIntervalFn?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearIntervalFn?: (timeoutId: NodeJS.Timeout) => void;
  cleanupIntervalMs?: number;
}

interface RateLimiterSnapshot {
  remaining: number;
  resetAt: number;
}

/**
 * Compatibility wrapper around shared token-bucket rate limiting.
 */
export class RateLimiter {
  private readonly limiters = new Map<string, SharedRateLimiter>();
  private readonly snapshots = new Map<string, RateLimiterSnapshot>();
  private readonly pendingTimeouts = new Set<NodeJS.Timeout>();
  private readonly now: () => number;
  private readonly setTimeoutFn: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clearTimeoutFn: (timeoutId: NodeJS.Timeout) => void;
  private destroyed = false;

  constructor(dependencies: RateLimiterDependencies = {}) {
    this.now = dependencies.now ?? (() => Date.now());
    this.setTimeoutFn = dependencies.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimeoutFn = dependencies.clearTimeoutFn ?? ((timeoutId) => clearTimeout(timeoutId));
  }

  async acquire(key: string, config: RateLimitConfig): Promise<void> {
    const limiter = this.getSharedLimiter(config);
    const start = this.now();

    while (true) {
      if (this.destroyed) {
        throw new Error('Rate limiter destroyed');
      }

      const result = await limiter.check({ key });
      this.setSnapshot(key, config, result.remaining, Date.parse(result.resetAt));

      if (result.allowed) {
        return;
      }

      const waitMs = Math.max(1, Date.parse(result.resetAt) - this.now());
      if (this.now() - start + waitMs > config.window * 2) {
        throw new Error('Rate limit timeout');
      }

      await this.sleep(waitMs);
    }
  }

  async acquireMany(keys: string[], config: RateLimitConfig): Promise<void> {
    for (const key of keys) {
      await this.acquire(key, config);
    }
  }

  wouldExceed(key: string, config: RateLimitConfig): boolean {
    const snapshotKey = this.snapshotKey(key, config);
    const snapshot = this.snapshots.get(snapshotKey);

    if (!snapshot) {
      return false;
    }

    if (this.now() >= snapshot.resetAt) {
      this.snapshots.delete(snapshotKey);
      return false;
    }

    return snapshot.remaining < 1;
  }

  destroy(): void {
    this.destroyed = true;
    for (const timeoutId of this.pendingTimeouts) {
      this.clearTimeoutFn(timeoutId);
    }
    this.pendingTimeouts.clear();
    this.limiters.clear();
    this.snapshots.clear();
  }

  private getSharedLimiter(config: RateLimitConfig): SharedRateLimiter {
    const id = `${config.requests}:${config.window}`;
    const existing = this.limiters.get(id);
    if (existing) {
      return existing;
    }

    const limiter = createRateLimiter({
      algorithm: 'token-bucket',
      maxRequests: config.requests,
      windowMs: config.window,
      keyPrefix: `plugfn:ratelimit:${id}:`,
      now: this.now,
    });
    this.limiters.set(id, limiter);
    return limiter;
  }

  private snapshotKey(key: string, config: RateLimitConfig): string {
    return `${config.requests}:${config.window}:${key}`;
  }

  private setSnapshot(key: string, config: RateLimitConfig, remaining: number, resetAt: number): void {
    this.snapshots.set(this.snapshotKey(key, config), { remaining, resetAt });
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = this.setTimeoutFn(() => {
        this.pendingTimeouts.delete(timeout);
        resolve();
      }, delayMs);
      this.pendingTimeouts.add(timeout);
    });
  }
}

interface SharedRateLimiter {
  check(input: { key: string }): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: string;
  }>;
}

function createRateLimiter(input: {
  algorithm: 'token-bucket';
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
  now: () => number;
}): SharedRateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    async check({ key }) {
      const now = input.now();
      const namespacedKey = `${input.keyPrefix}${key}`;
      const current = entries.get(namespacedKey);

      if (!current || now >= current.resetAt) {
        const resetAt = now + input.windowMs;
        entries.set(namespacedKey, {
          count: 1,
          resetAt,
        });

        return {
          allowed: true,
          remaining: Math.max(0, input.maxRequests - 1),
          resetAt: new Date(resetAt).toISOString(),
        };
      }

      if (current.count >= input.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(current.resetAt).toISOString(),
        };
      }

      current.count += 1;
      entries.set(namespacedKey, current);

      return {
        allowed: true,
        remaining: Math.max(0, input.maxRequests - current.count),
        resetAt: new Date(current.resetAt).toISOString(),
      };
    },
  };
}
