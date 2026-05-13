import type { KVStoreAdapter } from '../../adapter/types.js';

export interface CloudflareKVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CloudflareKVStoreOptions {
  prefix?: string;
  defaultTtlSeconds?: number;
  minimumTtlSeconds?: number;
}

export function cloudflareKVStore(
  namespace: CloudflareKVNamespace,
  options: CloudflareKVStoreOptions = {},
): KVStoreAdapter {
  const prefix = options.prefix ?? '';
  const minimumTtlSeconds = options.minimumTtlSeconds ?? 60;

  return {
    get(key) {
      return namespace.get(toKey(prefix, key));
    },

    async set(input) {
      const ttlSeconds = input.ttlSeconds ?? options.defaultTtlSeconds;
      await namespace.put(
        toKey(prefix, input.key),
        input.value,
        isFinitePositiveTtl(ttlSeconds)
          ? { expirationTtl: Math.max(minimumTtlSeconds, Math.floor(ttlSeconds)) }
          : undefined,
      );
    },

    delete(key) {
      return namespace.delete(toKey(prefix, key));
    },
  };
}

export const createCloudflareKVStore = cloudflareKVStore;

function toKey(prefix: string, key: string): string {
  return `${prefix}${key}`;
}

function isFinitePositiveTtl(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
