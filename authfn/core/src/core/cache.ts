import { createHash } from 'node:crypto';
import type { KVStoreAdapter } from '@superfunctions/db';
import type { AuthFnConfig } from '../types.js';

export const AUTHFN_CACHE_TTL_SECONDS = {
  regionHit: 60 * 15,
  regionMiss: 60,
  runtimeHost: 60 * 5
} as const;

export type AuthFnCacheScope = 'region' | 'runtime' | 'ratelimit';

export function createAuthFnCacheKey(
  config: Pick<AuthFnConfig, 'namespace'>,
  scope: AuthFnCacheScope,
  identifier: string
): string {
  return `authfn:${config.namespace ?? 'authfn'}:${scope}:${sha256(identifier)}`;
}

export async function getCachedJson<T>(
  cacheStore: KVStoreAdapter | undefined,
  key: string
): Promise<T | null> {
  if (!cacheStore) {
    return null;
  }

  try {
    const value = await cacheStore.get(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

export async function setCachedJson(
  cacheStore: KVStoreAdapter | undefined,
  input: {
    key: string;
    value: unknown;
    ttlSeconds?: number;
  }
): Promise<void> {
  if (!cacheStore) {
    return;
  }

  try {
    await cacheStore.set({
      key: input.key,
      value: JSON.stringify(input.value),
      ttlSeconds: input.ttlSeconds
    });
  } catch {
    // Cache writes are best-effort. The database/lookup store remains authoritative.
  }
}

export async function deleteCachedValue(
  cacheStore: KVStoreAdapter | undefined,
  key: string
): Promise<void> {
  if (!cacheStore) {
    return;
  }

  try {
    await cacheStore.delete(key);
  } catch {
    // Cache deletes are best-effort. Short TTLs bound stale hints.
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
