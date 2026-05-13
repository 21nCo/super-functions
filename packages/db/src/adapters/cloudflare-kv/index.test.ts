import { describe, expect, it } from 'vitest';
import { cloudflareKVStore, type CloudflareKVNamespace } from './index.js';

class FakeKVNamespace implements CloudflareKVNamespace {
  readonly values = new Map<string, string>();
  readonly puts: Array<{
    key: string;
    value: string;
    options?: { expirationTtl?: number };
  }> = [];

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void> {
    this.puts.push({ key, value, options });
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('cloudflareKVStore', () => {
  it('reads and writes string values through Cloudflare KV', async () => {
    const namespace = new FakeKVNamespace();
    const store = cloudflareKVStore(namespace);

    await store.set({ key: 'authfn:test', value: 'value' });

    expect(await store.get('authfn:test')).toBe('value');
  });

  it('prefixes keys without changing caller-visible keys', async () => {
    const namespace = new FakeKVNamespace();
    const store = cloudflareKVStore(namespace, { prefix: 'nucleus:' });

    await store.set({ key: 'region:abc', value: 'insouth' });
    await store.delete('region:abc');

    expect(namespace.puts[0]?.key).toBe('nucleus:region:abc');
    expect(await namespace.get('nucleus:region:abc')).toBeNull();
  });

  it('passes request ttl ahead of default ttl and respects Cloudflare ttl minimum', async () => {
    const namespace = new FakeKVNamespace();
    const store = cloudflareKVStore(namespace, { defaultTtlSeconds: 300 });

    await store.set({ key: 'a', value: '1' });
    await store.set({ key: 'b', value: '2', ttlSeconds: 60.8 });
    await store.set({ key: 'c', value: '3', ttlSeconds: 3 });

    expect(namespace.puts[0]?.options).toEqual({ expirationTtl: 300 });
    expect(namespace.puts[1]?.options).toEqual({ expirationTtl: 60 });
    expect(namespace.puts[2]?.options).toEqual({ expirationTtl: 60 });
  });
});
