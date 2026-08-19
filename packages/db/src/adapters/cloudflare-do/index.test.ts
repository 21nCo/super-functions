import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SuperfunctionsStoresDurableObject,
  type DurableObjectStateLike,
} from './index.js';

describe('SuperfunctionsStoresDurableObject directory TTL', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires directory records and removes their index membership', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00.000Z'));
    const object = new SuperfunctionsStoresDurableObject(createState());
    const record = {
      key: 'user:1',
      value: 'region:eu',
      indexes: { email: 'ada@example.com' },
      ttlSeconds: 10,
    };

    expect(await post(object, { operation: 'directory.put', record })).toEqual({
      ok: true,
      data: null,
    });
    expect(await post(object, {
      operation: 'directory.query',
      index: 'email',
      value: 'ada@example.com',
    })).toMatchObject({ ok: true, data: { records: [record] } });

    vi.setSystemTime(new Date('2026-08-19T00:00:11.000Z'));

    expect(await post(object, { operation: 'directory.get', key: 'user:1' })).toEqual({
      ok: true,
      data: null,
    });
    expect(await post(object, {
      operation: 'directory.query',
      index: 'email',
      value: 'ada@example.com',
    })).toMatchObject({ ok: true, data: { records: [] } });
  });

  it('lets put-if-absent reclaim an expired directory key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00.000Z'));
    const object = new SuperfunctionsStoresDurableObject(createState());

    await post(object, {
      operation: 'directory.put',
      record: { key: 'lease', value: 'first', ttlSeconds: 1 },
    });
    vi.setSystemTime(new Date('2026-08-19T00:00:02.000Z'));

    expect(await post(object, {
      operation: 'directory.putIfAbsent',
      record: { key: 'lease', value: 'second' },
    })).toEqual({ ok: true, data: { inserted: true } });
    expect(await post(object, { operation: 'directory.get', key: 'lease' })).toEqual({
      ok: true,
      data: { key: 'lease', value: 'second' },
    });
  });

  it('migrates legacy TTL records into an expiring envelope', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00.000Z'));
    const values = new Map<string, unknown>([
      ['directory:record:legacy', { key: 'legacy', value: 'old', ttlSeconds: 5 }],
    ]);
    const object = new SuperfunctionsStoresDurableObject(createState(values));

    expect(await post(object, { operation: 'directory.get', key: 'legacy' })).toEqual({
      ok: true,
      data: { key: 'legacy', value: 'old', ttlSeconds: 5 },
    });
    expect(values.get('directory:record:legacy')).toMatchObject({
      record: { key: 'legacy', value: 'old' },
      expiresAt: Date.parse('2026-08-19T00:00:05.000Z'),
    });

    vi.setSystemTime(new Date('2026-08-19T00:00:06.000Z'));
    expect(await post(object, { operation: 'directory.get', key: 'legacy' })).toEqual({
      ok: true,
      data: null,
    });
  });

  it('does not return a reclaimed record through a stale index membership', async () => {
    const values = new Map<string, unknown>([
      ['directory:index:email:old@example.com', ['user:1']],
      ['directory:record:user:1', {
        record: {
          key: 'user:1',
          value: 'region:us',
          indexes: { email: 'new@example.com' },
        },
      }],
    ]);
    const object = new SuperfunctionsStoresDurableObject(createState(values));

    expect(await post(object, {
      operation: 'directory.query',
      index: 'email',
      value: 'old@example.com',
    })).toMatchObject({ ok: true, data: { records: [] } });
  });
});

function createState(values = new Map<string, unknown>()): DurableObjectStateLike {
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

async function post(
  object: SuperfunctionsStoresDurableObject,
  body: unknown,
): Promise<unknown> {
  const response = await object.fetch(new Request('https://stores.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return response.json();
}
