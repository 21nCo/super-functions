import type { Adapter, KVStoreAdapter } from '@superfunctions/db';

export { KVStoreAdapter };

export type LegacyWindowAlgorithm = 'sliding-window'|'fixed-window';
export type RateLimitAlgorithm = LegacyWindowAlgorithm | 'token-bucket';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  persistence?: Adapter | KVStoreAdapter;
  algorithm?: RateLimitAlgorithm;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string; // ISO8601
  total: number;
}

export interface CheckLimitInput {
  key: string;
  windowSeconds?: number;
  limit?: number;
}

export interface CheckManyLimitsInput {
  keys: string[];
  windowSeconds?: number;
  limit?: number;
}

export interface RateLimitManyResult {
  allowed: boolean;
  remainingByKey: Map<string, number>;
  resetAtByKey: Map<string, string>;
  resetAt: string;
  total: number;
}

export interface RateLimiter {
  check(input: CheckLimitInput): Promise<RateLimitResult>;
  checkMany(input: CheckManyLimitsInput): Promise<RateLimitManyResult>;
  reset(key: string): Promise<void>;
}

interface KVSetInput {
  key: string;
  value: string;
  ttlSeconds?: number;
}

interface FixedWindowState {
  count: number;
  windowStart: number;
  expiresAt?: number;
}

interface SlidingWindowState {
  timestamps: number[];
  expiresAt?: number;
}

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
  expiresAt?: number;
}

function createInMemoryKVStore(now: () => number = Date.now): KVStoreAdapter {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(input: { key: string; value: string; ttlSeconds?: number }): Promise<void> {
      store.set(input.key, {
        value: input.value,
        expiresAt: input.ttlSeconds ? now() + input.ttlSeconds * 1000 : undefined,
      });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function isAdapter(p: unknown): p is Adapter {
  return !!p && typeof p === 'object' && 'findOne' in p && 'create' in p;
}

function ensureKV(p: Adapter | KVStoreAdapter, now: () => number): KVStoreAdapter {
  if (isAdapter(p)) {
    return {
      async get(key: string) {
        const res = await p.findOne<{ value: string; expiresAt?: string }>({
          model: 'rate_limits',
          where: [{ field: 'key', operator: 'eq', value: key }],
        });
        if (!res) return null;
        if (res.expiresAt && new Date(res.expiresAt).getTime() < now()) {
          await p.delete({ model: 'rate_limits', where: [{ field: 'key', operator: 'eq', value: key }] });
          return null;
        }
        return res.value;
      },
      async set(input: KVSetInput) {
        const expiresAt = input.ttlSeconds
          ? new Date(now() + input.ttlSeconds * 1000).toISOString()
          : undefined;
        await p.upsert({
          model: 'rate_limits',
          where: [{ field: 'key', operator: 'eq', value: input.key }],
          create: { key: input.key, value: input.value, expiresAt },
          update: { value: input.value, expiresAt },
        });
      },
      async delete(key: string) {
        await p.delete({ model: 'rate_limits', where: [{ field: 'key', operator: 'eq', value: key }] });
      },
    };
  }
  return p;
}

async function getState<T>(kv: KVStoreAdapter, key: string): Promise<T | null> {
  const data = await kv.get(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function setState(
  kv: KVStoreAdapter,
  key: string,
  state: unknown,
  ttlMs: number
): Promise<void> {
  if (ttlMs <= 0) {
    return;
  }
  await kv.set({
    key,
    value: JSON.stringify(state),
    ttlSeconds: Math.ceil(ttlMs / 1000),
  });
}

interface RateLimitStateSnapshot {
  value: string | null;
  ttlMs: number;
}

async function snapshotStates(
  kv: KVStoreAdapter,
  keys: string[],
  options: {
    algorithm: RateLimitAlgorithm;
    currentTime: number;
    windowMs: number;
    limit: number;
  }
): Promise<Map<string, RateLimitStateSnapshot>> {
  const snapshot = new Map<string, RateLimitStateSnapshot>();
  for (const key of keys) {
    const value = await kv.get(key);
    snapshot.set(key, {
      value,
      ttlMs: remainingStateTtl(value, options),
    });
  }
  return snapshot;
}

async function restoreStates(
  kv: KVStoreAdapter,
  snapshot: Map<string, RateLimitStateSnapshot>
): Promise<void> {
  for (const [key, { value, ttlMs }] of snapshot.entries()) {
    if (value === null) {
      await kv.delete(key);
      continue;
    }

    await kv.set({
      key,
      value,
      ttlSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
    });
  }
}

function remainingStateTtl(
  value: string | null,
  options: {
    algorithm: RateLimitAlgorithm;
    currentTime: number;
    windowMs: number;
    limit: number;
  }
): number {
  if (value === null) {
    return 1;
  }

  try {
    const state = JSON.parse(value) as FixedWindowState | SlidingWindowState | TokenBucketState;
    if (typeof state.expiresAt === 'number' && Number.isFinite(state.expiresAt)) {
      return Math.max(1, state.expiresAt - options.currentTime);
    }

    if (options.algorithm === 'fixed-window' && 'windowStart' in state) {
      return Math.max(1, state.windowStart + options.windowMs - options.currentTime);
    }

    if (options.algorithm === 'sliding-window' && 'timestamps' in state) {
      const oldest = state.timestamps.find(
        (timestamp) => timestamp > options.currentTime - options.windowMs
      );
      return Math.max(1, (oldest ?? options.currentTime) + options.windowMs - options.currentTime);
    }

    if (options.algorithm === 'token-bucket' && 'tokens' in state) {
      if (options.limit <= 0) {
        return Math.max(1, options.windowMs);
      }
      const refillRatePerMs = options.limit / options.windowMs;
      const elapsed = Math.max(0, options.currentTime - state.lastRefill);
      const tokens = Math.min(options.limit, state.tokens + elapsed * refillRatePerMs);
      return Math.max(1, Math.ceil((options.limit - tokens) / refillRatePerMs));
    }
  } catch {
    // State is owned by this limiter, but keep rollback bounded if storage was corrupted.
  }

  return Math.max(1, options.windowMs);
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const now = config.now ?? Date.now;
  const {
    windowMs,
    maxRequests,
    keyPrefix = 'ratelimit:',
    persistence = createInMemoryKVStore(now),
    algorithm = 'fixed-window',
  } = config;

  const kv = ensureKV(persistence, now);
  const keyLocks = new Map<string, Promise<void>>();

  async function withKeyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const prior = keyLocks.get(key) ?? Promise.resolve();
    let resolveLock!: () => void;
    const current = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    const queued = prior.then(() => current);
    keyLocks.set(key, queued);

    await prior;
    try {
      return await work();
    } finally {
      resolveLock();
      if (keyLocks.get(key) === queued) {
        keyLocks.delete(key);
      }
    }
  }

  async function withKeyLocks<T>(keys: string[], work: () => Promise<T>): Promise<T> {
    const uniqueKeys = [...new Set(keys)].sort();
    const releases: Array<() => void> = [];
    const queuedLocks: Array<{ key: string; queued: Promise<void> }> = [];

    try {
      for (const key of uniqueKeys) {
        const prior = keyLocks.get(key) ?? Promise.resolve();
        let resolveLock!: () => void;
        const current = new Promise<void>((resolve) => {
          resolveLock = resolve;
        });
        const queued = prior.then(() => current);
        keyLocks.set(key, queued);
        queuedLocks.push({ key, queued });
        releases.push(resolveLock);
        await prior;
      }

      return await work();
    } finally {
      for (let index = releases.length - 1; index >= 0; index -= 1) {
        releases[index]();
      }
      for (const { key, queued } of queuedLocks) {
        if (keyLocks.get(key) === queued) {
          keyLocks.delete(key);
        }
      }
    }
  }

  async function evaluateKey(
    key: string,
    currentTime: number,
    effectiveWindowMs: number,
    effectiveLimit: number,
    commit: boolean
  ): Promise<RateLimitResult> {
    if (!Number.isFinite(effectiveWindowMs) || effectiveWindowMs <= 0) {
      throw new Error('RATE_LIMIT_WINDOW_INVALID');
    }
    if (!Number.isFinite(effectiveLimit) || effectiveLimit < 0) {
      throw new Error('RATE_LIMIT_LIMIT_INVALID');
    }

    if (algorithm === 'sliding-window') {
      const state = (await getState<SlidingWindowState>(kv, key)) ?? { timestamps: [] };
      const floor = currentTime - effectiveWindowMs;
      const timestamps = state.timestamps.filter((timestamp) => timestamp > floor);
      const allowed = timestamps.length < effectiveLimit;
      if (allowed && commit) {
        timestamps.push(currentTime);
      }

      const oldest = timestamps[0] ?? currentTime;
      const resetAt = oldest + effectiveWindowMs;
      if (commit) {
        await setState(
          kv,
          key,
          { timestamps, expiresAt: resetAt },
          Math.max(1, resetAt - currentTime)
        );
      }

      return {
        allowed,
        remaining: Math.max(0, effectiveLimit - timestamps.length),
        resetAt: new Date(resetAt).toISOString(),
        total: effectiveLimit,
      };
    }

    if (algorithm === 'token-bucket') {
      if (effectiveLimit <= 0) {
        const resetAt = currentTime + Math.max(0, effectiveWindowMs);
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(resetAt).toISOString(),
          total: effectiveLimit,
        };
      }

      const refillRatePerMs = effectiveLimit / effectiveWindowMs;
      const state = (await getState<TokenBucketState>(kv, key)) ?? {
        tokens: effectiveLimit,
        lastRefill: currentTime,
      };

      const elapsed = Math.max(0, currentTime - state.lastRefill);
      const tokens = Math.min(effectiveLimit, state.tokens + elapsed * refillRatePerMs);
      const allowed = tokens >= 1;
      const nextTokens = allowed && commit ? tokens - 1 : tokens;
      const msUntilNextToken = nextTokens >= 1 ? 0 : Math.ceil((1 - nextTokens) / refillRatePerMs);
      const msUntilFull = Math.ceil((effectiveLimit - nextTokens) / refillRatePerMs);
      const resetAt = currentTime + msUntilNextToken;

      if (commit) {
        const expiresAt = currentTime + Math.max(1, msUntilFull);
        await setState(
          kv,
          key,
          {
            tokens: nextTokens,
            lastRefill: currentTime,
            expiresAt,
          },
          Math.max(1, msUntilFull)
        );
      }

      return {
        allowed,
        remaining: Math.max(0, Math.floor(nextTokens)),
        resetAt: new Date(resetAt).toISOString(),
        total: effectiveLimit,
      };
    }

    const state = (await getState<FixedWindowState>(kv, key)) ?? {
      count: 0,
      windowStart: currentTime,
    };
    const windowState =
      currentTime >= state.windowStart + effectiveWindowMs
        ? { count: 0, windowStart: currentTime }
        : { ...state };

    const allowed = windowState.count < effectiveLimit;
    if (allowed && commit) {
      windowState.count += 1;
    }

    const resetAt = windowState.windowStart + effectiveWindowMs;
    if (commit) {
      await setState(
        kv,
        key,
        { ...windowState, expiresAt: resetAt },
        Math.max(1, resetAt - currentTime)
      );
    }

    return {
      allowed,
      remaining: Math.max(0, effectiveLimit - windowState.count),
      resetAt: new Date(resetAt).toISOString(),
      total: effectiveLimit,
    };
  }

  return {
    async check(input: CheckLimitInput): Promise<RateLimitResult> {
      const key = `${keyPrefix}${input.key}`;
      return withKeyLock(key, async () => {
        const effectiveWindowMs =
          (input.windowSeconds !== undefined ? input.windowSeconds * 1000 : undefined) ?? windowMs;
        const effectiveLimit = input.limit ?? maxRequests;
        return evaluateKey(key, now(), effectiveWindowMs, effectiveLimit, true);
      });
    },

    async checkMany(input: CheckManyLimitsInput): Promise<RateLimitManyResult> {
      const uniqueKeys = [...new Set(input.keys)];
      const effectiveWindowMs =
        (input.windowSeconds !== undefined ? input.windowSeconds * 1000 : undefined) ?? windowMs;
      const effectiveLimit = input.limit ?? maxRequests;
      const namespacedKeys = uniqueKeys.map((key) => `${keyPrefix}${key}`);

      if (uniqueKeys.length === 0) {
        return {
          allowed: true,
          remainingByKey: new Map(),
          resetAtByKey: new Map(),
          resetAt: new Date(now()).toISOString(),
          total: effectiveLimit,
        };
      }

      return withKeyLocks(namespacedKeys, async () => {
        const currentTime = now();
        const preflight = await Promise.all(
          namespacedKeys.map((key) =>
            evaluateKey(key, currentTime, effectiveWindowMs, effectiveLimit, false)
          )
        );
        const blocked = preflight.filter((result) => !result.allowed);
        if (blocked.length > 0) {
          return {
            allowed: false,
            remainingByKey: new Map(
              uniqueKeys.map((key, index) => [key, preflight[index].remaining])
            ),
            resetAtByKey: new Map(
              uniqueKeys.map((key, index) => [key, preflight[index].resetAt])
            ),
            resetAt: new Date(
              Math.max(...blocked.map((result) => Date.parse(result.resetAt)))
            ).toISOString(),
            total: effectiveLimit,
          };
        }

        const previousStates = await snapshotStates(kv, namespacedKeys, {
          algorithm,
          currentTime,
          windowMs: effectiveWindowMs,
          limit: effectiveLimit,
        });
        const committed: RateLimitResult[] = [];
        try {
          for (const key of namespacedKeys) {
            committed.push(
              await evaluateKey(key, currentTime, effectiveWindowMs, effectiveLimit, true)
            );
          }
        } catch (error) {
          await restoreStates(kv, previousStates).catch(() => {});
          throw error;
        }

        return {
          allowed: true,
          remainingByKey: new Map(
            uniqueKeys.map((key, index) => [key, committed[index].remaining])
          ),
          resetAtByKey: new Map(
            uniqueKeys.map((key, index) => [key, committed[index].resetAt])
          ),
          resetAt: new Date(
            Math.min(...committed.map((result) => Date.parse(result.resetAt)))
          ).toISOString(),
          total: effectiveLimit,
        };
      });
    },

    async reset(key: string): Promise<void> {
      const namespacedKey = `${keyPrefix}${key}`;
      await withKeyLock(namespacedKey, async () => {
        await kv.delete(namespacedKey);
      });
    },
  };
}

export { createInMemoryKVStore };
