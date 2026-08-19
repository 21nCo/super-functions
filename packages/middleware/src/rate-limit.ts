import { instrumentKVStore, type Adapter, type AtomicStoreAdapter, type KVStoreAdapter } from '@superfunctions/db';
import { normalizeObservability, type ObservabilityInput } from '@superfunctions/observability';

export { KVStoreAdapter };

export type LegacyWindowAlgorithm = 'sliding-window'|'fixed-window';
export type RateLimitAlgorithm = LegacyWindowAlgorithm | 'token-bucket';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  persistence?: Adapter | KVStoreAdapter;
  atomicStore?: AtomicStoreAdapter;
  algorithm?: RateLimitAlgorithm;
  now?: () => number;
  observability?: ObservabilityInput;
  component?: string;
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

export interface RateLimiter {
  check(input: CheckLimitInput): Promise<RateLimitResult>;
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
}

interface SlidingWindowState {
  timestamps: number[];
}

interface TokenBucketState {
  tokens: number;
  lastRefill: number;
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

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const now = config.now ?? Date.now;
  const {
    windowMs,
    maxRequests,
    keyPrefix = 'ratelimit:',
    persistence = createInMemoryKVStore(now),
    atomicStore,
    algorithm = 'fixed-window',
    observability: observabilityInput,
    component = 'rate-limit',
  } = config;

  const observability = normalizeObservability(observabilityInput)?.child({ component });
  const atomic = atomicStore
    ? instrumentKVStore(atomicStore, {
        observability,
        kind: 'cache',
        component: `${component}.atomic`,
      })
    : undefined;
  const kv = instrumentKVStore(ensureKV(persistence, now), {
    observability,
    kind: 'cache',
    component: `${component}.cache`,
  });
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

  return {
    async check(input: CheckLimitInput): Promise<RateLimitResult> {
      const key = `${keyPrefix}${input.key}`;
      const effectiveWindowMs =
        (input.windowSeconds !== undefined ? input.windowSeconds * 1000 : undefined) ?? windowMs;
      const effectiveLimit = input.limit ?? maxRequests;
      const currentTime = now();

      if (!Number.isFinite(effectiveWindowMs) || effectiveWindowMs <= 0) {
        throw new Error('RATE_LIMIT_WINDOW_INVALID');
      }
      if (!Number.isFinite(effectiveLimit) || effectiveLimit < 0) {
        throw new Error('RATE_LIMIT_LIMIT_INVALID');
      }

      if (atomic && algorithm === 'fixed-window') {
        const windowStart = Math.floor(currentTime / effectiveWindowMs) * effectiveWindowMs;
        const resetAt = windowStart + effectiveWindowMs;
        const count = (await atomic.incr({
          key: `${key}:${windowStart}`,
          by: 1,
          ttlSeconds: Math.ceil(effectiveWindowMs / 1000),
        })).value;
        return {
          allowed: count <= effectiveLimit,
          remaining: Math.max(0, effectiveLimit - count),
          resetAt: new Date(resetAt).toISOString(),
          total: effectiveLimit,
        };
      }

      return withKeyLock(key, async () => {
        if (algorithm === 'sliding-window') {
          const state = (await getState<SlidingWindowState>(kv, key)) ?? { timestamps: [] };
          const floor = currentTime - effectiveWindowMs;
          state.timestamps = state.timestamps.filter((timestamp) => timestamp > floor);

          const allowed = state.timestamps.length < effectiveLimit;
          if (allowed) {
            state.timestamps.push(currentTime);
          }

          const oldest = state.timestamps[0] ?? currentTime;
          const resetAt = oldest + effectiveWindowMs;
          const ttlMs = Math.max(1, resetAt - currentTime);
          await setState(kv, key, state, ttlMs);

          return {
            allowed,
            remaining: Math.max(0, effectiveLimit - state.timestamps.length),
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
          state.tokens = Math.min(effectiveLimit, state.tokens + elapsed * refillRatePerMs);
          state.lastRefill = currentTime;

          const allowed = state.tokens >= 1;
          if (allowed) {
            state.tokens -= 1;
          }

          const msUntilNextToken = state.tokens >= 1 ? 0 : Math.ceil((1 - state.tokens) / refillRatePerMs);
          const msUntilFull = Math.ceil((effectiveLimit - state.tokens) / refillRatePerMs);
          const resetAt = currentTime + msUntilNextToken;

          await setState(kv, key, state, Math.max(1, msUntilFull));

          return {
            allowed,
            remaining: Math.max(0, Math.floor(state.tokens)),
            resetAt: new Date(resetAt).toISOString(),
            total: effectiveLimit,
          };
        }

        const state = (await getState<FixedWindowState>(kv, key)) ?? {
          count: 0,
          windowStart: currentTime,
        };

        if (currentTime >= state.windowStart + effectiveWindowMs) {
          state.count = 0;
          state.windowStart = currentTime;
        }

        const allowed = state.count < effectiveLimit;
        if (allowed) {
          state.count += 1;
        }

        const resetAt = state.windowStart + effectiveWindowMs;
        await setState(kv, key, state, Math.max(1, resetAt - currentTime));

        return {
          allowed,
          remaining: Math.max(0, effectiveLimit - state.count),
          resetAt: new Date(resetAt).toISOString(),
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
