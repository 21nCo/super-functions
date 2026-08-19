import { instrumentKVStore, type Adapter, type AtomicKVStoreAdapter, type KVStoreAdapter } from '@superfunctions/db';
import { normalizeObservability, type ObservabilityInput } from '@superfunctions/observability';

export { KVStoreAdapter };

export type LegacyWindowAlgorithm = 'sliding-window'|'fixed-window';
export type RateLimitAlgorithm = LegacyWindowAlgorithm | 'token-bucket';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  persistence?: Adapter | KVStoreAdapter;
  atomicStore?: AtomicKVStoreAdapter;
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

function parseState<T>(data: string | null): T | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
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
  if (atomicStore && typeof atomicStore.compareAndSet !== 'function') {
    throw new Error('RATE_LIMIT_ATOMIC_CAS_REQUIRED');
  }
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

  function evaluateState(
    rawState: string | null,
    currentTime: number,
    effectiveWindowMs: number,
    effectiveLimit: number,
    commit: boolean
  ): {
    result: RateLimitResult;
    nextState?: unknown;
    ttlMs?: number;
  } {
    if (!Number.isFinite(effectiveWindowMs) || effectiveWindowMs <= 0) {
      throw new Error('RATE_LIMIT_WINDOW_INVALID');
    }
    if (!Number.isFinite(effectiveLimit) || effectiveLimit < 0) {
      throw new Error('RATE_LIMIT_LIMIT_INVALID');
    }

    if (algorithm === 'sliding-window') {
      const state = parseState<SlidingWindowState>(rawState) ?? { timestamps: [] };
      const floor = currentTime - effectiveWindowMs;
      const timestamps = state.timestamps.filter((timestamp) => timestamp > floor);
      const allowed = timestamps.length < effectiveLimit;
      if (allowed && commit) {
        timestamps.push(currentTime);
      }
      const oldest = timestamps[0] ?? currentTime;
      const resetAt = oldest + effectiveWindowMs;
      return {
        result: {
          allowed,
          remaining: Math.max(0, effectiveLimit - timestamps.length),
          resetAt: new Date(resetAt).toISOString(),
          total: effectiveLimit,
        },
        ...(commit
          ? {
              nextState: { timestamps, expiresAt: resetAt },
              ttlMs: Math.max(1, resetAt - currentTime),
            }
          : {}),
      };
    }

    if (algorithm === 'token-bucket') {
      if (effectiveLimit <= 0) {
        const resetAt = currentTime + Math.max(0, effectiveWindowMs);
        return {
          result: {
            allowed: false,
            remaining: 0,
            resetAt: new Date(resetAt).toISOString(),
            total: effectiveLimit,
          },
        };
      }

      const refillRatePerMs = effectiveLimit / effectiveWindowMs;
      const state = parseState<TokenBucketState>(rawState) ?? {
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

      return {
        result: {
          allowed,
          remaining: Math.max(0, Math.floor(nextTokens)),
          resetAt: new Date(resetAt).toISOString(),
          total: effectiveLimit,
        },
        ...(commit
          ? {
              nextState: {
                tokens: nextTokens,
                lastRefill: currentTime,
                expiresAt: currentTime + Math.max(1, msUntilFull),
              },
              ttlMs: Math.max(1, msUntilFull),
            }
          : {}),
      };
    }

    const state = parseState<FixedWindowState>(rawState) ?? {
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
    return {
      result: {
        allowed,
        remaining: Math.max(0, effectiveLimit - windowState.count),
        resetAt: new Date(resetAt).toISOString(),
        total: effectiveLimit,
      },
      ...(commit
        ? {
            nextState: { ...windowState, expiresAt: resetAt },
            ttlMs: Math.max(1, resetAt - currentTime),
          }
        : {}),
    };
  }

  async function evaluateKey(
    key: string,
    currentTime: number,
    effectiveWindowMs: number,
    effectiveLimit: number,
    commit: boolean
  ): Promise<RateLimitResult> {
    const evaluation = evaluateState(
      await kv.get(key),
      currentTime,
      effectiveWindowMs,
      effectiveLimit,
      commit,
    );
    if (commit && evaluation.nextState !== undefined && evaluation.ttlMs !== undefined) {
      await kv.set({
        key,
        value: JSON.stringify(evaluation.nextState),
        ttlSeconds: Math.ceil(evaluation.ttlMs / 1000),
      });
    }
    return evaluation.result;
  }

  async function evaluateAtomicKey(
    key: string,
    currentTime: number,
    effectiveWindowMs: number,
    effectiveLimit: number,
    commit: boolean,
  ): Promise<RateLimitResult> {
    if (!atomic?.compareAndSet) {
      throw new Error('RATE_LIMIT_ATOMIC_CAS_REQUIRED');
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const expected = await atomic.get(key);
      const evaluation = evaluateState(
        expected,
        currentTime,
        effectiveWindowMs,
        effectiveLimit,
        commit,
      );
      if (!commit || evaluation.nextState === undefined || evaluation.ttlMs === undefined) {
        return evaluation.result;
      }
      const result = await atomic.compareAndSet({
        key,
        expected,
        value: JSON.stringify(evaluation.nextState),
        ttlSeconds: Math.ceil(evaluation.ttlMs / 1000),
      });
      if (result.updated) {
        return evaluation.result;
      }
    }

    throw new Error('RATE_LIMIT_ATOMIC_CONTENTION');
  }

  const evaluateConfiguredKey = atomic ? evaluateAtomicKey : evaluateKey;

  return {
    async check(input: CheckLimitInput): Promise<RateLimitResult> {
      const key = `${keyPrefix}${input.key}`;
      return withKeyLock(key, async () => {
        const effectiveWindowMs =
          (input.windowSeconds !== undefined ? input.windowSeconds * 1000 : undefined) ?? windowMs;
        const effectiveLimit = input.limit ?? maxRequests;
        return evaluateConfiguredKey(key, now(), effectiveWindowMs, effectiveLimit, true);
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
            evaluateConfiguredKey(key, currentTime, effectiveWindowMs, effectiveLimit, false)
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

        const committed: RateLimitResult[] = [];
        for (let index = 0; index < namespacedKeys.length; index += 1) {
          const key = namespacedKeys[index];
          // Commit each key through the configured store. If a later commit
          // becomes blocked or fails, retain earlier quota charges (fail
          // closed) instead of restoring stale snapshots over concurrent work.
          const result = await evaluateConfiguredKey(
            key,
            currentTime,
            effectiveWindowMs,
            effectiveLimit,
            true,
          );
          committed.push(result);
          if (!result.allowed) {
            const actual = preflight.map((entry, entryIndex) => committed[entryIndex] ?? entry);
            const blockedActual = actual.filter((entry) => !entry.allowed);
            return {
              allowed: false,
              remainingByKey: new Map(
                uniqueKeys.map((entry, entryIndex) => [entry, actual[entryIndex].remaining])
              ),
              resetAtByKey: new Map(
                uniqueKeys.map((entry, entryIndex) => [entry, actual[entryIndex].resetAt])
              ),
              resetAt: new Date(
                Math.max(...blockedActual.map((entry) => Date.parse(entry.resetAt)))
              ).toISOString(),
              total: effectiveLimit,
            };
          }
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
        await (atomic ?? kv).delete(namespacedKey);
      });
    },
  };
}

export { createInMemoryKVStore };
