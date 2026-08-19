import { describe, expect, it } from 'vitest';
import {
  AuthFnCloudflareDoLookupStoreError,
  AuthFnRegionLookupDurableObject,
  createCloudflareRegionLookupStore,
  type CloudflareDurableObjectNamespace,
  type DurableObjectStateLike,
} from '../index.js';

const key = 'authfn:region:person@example.com';
const value = '{"regionId":"insouth"}';

describe('AuthFnRegionLookupDurableObject', () => {
  it('stores raw values with put-if-absent semantics', async () => {
    const object = new AuthFnRegionLookupDurableObject(createState());

    const first = await post(object, { operation: 'setIfAbsent', key, value });
    const second = await post(object, { operation: 'setIfAbsent', key, value: 'other' });
    const get = await post(object, { operation: 'get', key });

    expect(first).toEqual({ ok: true, data: { inserted: true } });
    expect(second).toEqual({ ok: true, data: { inserted: false, existing: value } });
    expect(get).toEqual({ ok: true, data: value });
  });

  it('compares, updates, and deletes raw values', async () => {
    const object = new AuthFnRegionLookupDurableObject(createState());

    await post(object, { operation: 'set', key, value });
    expect(await post(object, {
      operation: 'compareAndSet',
      key,
      expected: 'wrong',
      value: 'updated',
    })).toEqual({ ok: true, data: { updated: false, existing: value } });
    expect(await post(object, {
      operation: 'compareAndSet',
      key,
      expected: value,
      value: 'updated',
    })).toEqual({ ok: true, data: { updated: true } });
    await post(object, { operation: 'delete', key });

    expect(await post(object, { operation: 'get', key }))
      .toEqual({ ok: true, data: null });
  });
});

describe('createCloudflareRegionLookupStore', () => {
  it('routes conditional KV calls through key-named durable objects', async () => {
    const namespace = createNamespace();
    const store = createCloudflareRegionLookupStore(namespace, {
      objectNamePrefix: 'authfn:',
    });

    await expect(store.get(key)).resolves.toBeNull();
    await expect(store.setIfAbsent({ key, value })).resolves.toEqual({ inserted: true });
    await expect(store.get(key)).resolves.toBe(value);
    expect(namespace.names[0]?.startsWith('authfn:')).toBe(true);
  });

  it('throws typed retryable errors for failed durable object requests', async () => {
    const namespace: CloudflareDurableObjectNamespace = {
      idFromName: () => 'id',
      get: () => ({
        fetch: async () => new Response('oops', { status: 503 }),
      }),
    };
    const store = createCloudflareRegionLookupStore(namespace);

    await expect(store.get(key)).rejects.toMatchObject({
      name: 'AuthFnCloudflareDoLookupStoreError',
      operation: 'get',
      retryable: true,
    } satisfies Partial<AuthFnCloudflareDoLookupStoreError>);
  });
});

function createState(): DurableObjectStateLike {
  const values = new Map<string, unknown>();
  return {
    storage: {
      async get<T>(entryKey: string) {
        return values.get(entryKey) as T | undefined;
      },
      async put<T>(entryKey: string, entryValue: T) {
        values.set(entryKey, entryValue);
      },
      async delete(entryKey: string) {
        return values.delete(entryKey);
      },
    },
  };
}

function createNamespace(): CloudflareDurableObjectNamespace & { names: string[] } {
  const objects = new Map<unknown, AuthFnRegionLookupDurableObject>();
  const names: string[] = [];
  return {
    names,
    idFromName(name: string) {
      names.push(name);
      return name;
    },
    get(id: unknown) {
      if (!objects.has(id)) {
        objects.set(id, new AuthFnRegionLookupDurableObject(createState()));
      }
      const object = objects.get(id);
      if (!object) {
        throw new Error('object missing');
      }
      return {
        fetch: (input, init) => object.fetch(new Request(input, init)),
      };
    },
  };
}

async function post(object: AuthFnRegionLookupDurableObject, body: unknown): Promise<unknown> {
  const response = await object.fetch(new Request('https://lookup.test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }));
  return response.json();
}
