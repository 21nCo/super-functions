export interface KVStoreAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  persistence?: KVStoreAdapter;
  algorithm?: 'sliding-window' | 'fixed-window';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

interface RateLimitState {
  count: number;
  windowStart: number;
}

function createInMemoryKVStore(): KVStoreAdapter {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key: string, value: string, ttlMs?: number): Promise<void> {
      store.set(key, {
        value,
        expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
      });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const {
    windowMs,
    maxRequests,
    keyPrefix = 'ratelimit:',
    persistence = createInMemoryKVStore(),
    algorithm = 'fixed-window',
  } = config;

  async function getState(key: string): Promise<RateLimitState | null> {
    const data = await persistence.get(keyPrefix + key);
    if (!data) return null;
    try {
      return JSON.parse(data) as RateLimitState;
    } catch {
      return null;
    }
  }

  async function setState(key: string, state: RateLimitState): Promise<void> {
    const ttl = state.windowStart + windowMs - Date.now();
    if (ttl > 0) {
      await persistence.set(keyPrefix + key, JSON.stringify(state), ttl);
    }
  }

  return {
    async check(key: string): Promise<RateLimitResult> {
      const now = Date.now();
      let state = await getState(key);

      if (algorithm === 'fixed-window') {
        // Fixed window: reset count when window expires
        if (!state || now >= state.windowStart + windowMs) {
          state = { count: 0, windowStart: now };
        }

        const allowed = state.count < maxRequests;
        if (allowed) {
          state.count++;
          await setState(key, state);
        }

        return {
          allowed,
          remaining: Math.max(0, maxRequests - state.count),
          resetAt: state.windowStart + windowMs,
          total: maxRequests,
        };
      } else {
        // Sliding window (simplified): use fixed window as fallback
        if (!state || now >= state.windowStart + windowMs) {
          state = { count: 0, windowStart: now };
        }

        const allowed = state.count < maxRequests;
        if (allowed) {
          state.count++;
          await setState(key, state);
        }

        return {
          allowed,
          remaining: Math.max(0, maxRequests - state.count),
          resetAt: state.windowStart + windowMs,
          total: maxRequests,
        };
      }
    },

    async reset(key: string): Promise<void> {
      await persistence.delete(keyPrefix + key);
    },
  };
}

export { createInMemoryKVStore };
