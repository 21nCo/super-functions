import { describe, expect, it } from 'vitest';
import {
  AuthFnCloudflareDoLookupStoreError,
  AuthFnRegionLookupDurableObject,
  createCloudflareRegionLookupStore,
  type CloudflareDurableObjectNamespace,
  type DurableObjectStateLike,
} from '../index.js';

const record = {
  identifier: 'person@example.com',
  userId: 'user_1',
  regionId: 'insouth',
  authority: 'https://account-insouth-dev.nucleum.app',
  domain: 'nucleum.app',
  createdAt: '2026-04-27T00:00:00.000Z',
  updatedAt: '2026-04-27T00:00:00.000Z',
};

describe('AuthFnRegionLookupDurableObject', () => {
  it('stores records with put-if-absent semantics', async () => {
    const object = new AuthFnRegionLookupDurableObject(createState());

    const first = await post(object, { operation: 'putIfAbsent', identifier: record.identifier, record });
    const second = await post(object, {
      operation: 'putIfAbsent',
      identifier: record.identifier,
      record: {
        ...record,
        regionId: 'useast',
      },
    });
    const get = await post(object, { operation: 'getByIdentifier', identifier: record.identifier });

    expect(first).toEqual({ ok: true, data: { inserted: true } });
    expect(second).toEqual({ ok: true, data: { inserted: false, existing: record } });
    expect(get).toEqual({ ok: true, data: record });
  });

  it('updates and deletes lookup records', async () => {
    const object = new AuthFnRegionLookupDurableObject(createState());
    const updated = {
      ...record,
      regionId: 'useast',
      authority: 'https://account-useast-dev.nucleum.app',
    };

    await post(object, { operation: 'putIfAbsent', identifier: record.identifier, record });
    expect(await post(object, { operation: 'update', identifier: record.identifier, record: updated }))
      .toEqual({ ok: true, data: updated });
    await post(object, { operation: 'deleteByIdentifier', identifier: record.identifier });

    expect(await post(object, { operation: 'getByIdentifier', identifier: record.identifier }))
      .toEqual({ ok: true, data: null });
  });
});

describe('createCloudflareRegionLookupStore', () => {
  it('routes adapter calls through identifier-named durable objects', async () => {
    const namespace = createNamespace();
    const store = createCloudflareRegionLookupStore(namespace, {
      objectNamePrefix: 'authfn:',
    });

    await expect(store.getByIdentifier(record.identifier)).resolves.toBeNull();
    await expect(store.putIfAbsent(record)).resolves.toEqual({ inserted: true });
    await expect(store.getByIdentifier(record.identifier)).resolves.toEqual(record);
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

    await expect(store.getByIdentifier(record.identifier)).rejects.toMatchObject({
      name: 'AuthFnCloudflareDoLookupStoreError',
      operation: 'getByIdentifier',
      retryable: true,
    } satisfies Partial<AuthFnCloudflareDoLookupStoreError>);
  });
});

function createState(): DurableObjectStateLike {
  const values = new Map<string, unknown>();
  return {
    storage: {
      async get<T>(key: string) {
        return values.get(key) as T | undefined;
      },
      async put<T>(key: string, value: T) {
        values.set(key, value);
      },
      async delete(key: string) {
        return values.delete(key);
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
