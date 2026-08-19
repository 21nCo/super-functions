import type {
  AtomicKVStoreAdapter,
  IndexedDirectoryRecord,
  IndexedDirectoryStoreAdapter,
  ProvisionableStoreAdapter,
  StoreProvisioningPlan,
} from '../../adapter/types.js';

export interface CloudflareDurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): CloudflareDurableObjectStub;
}

export interface CloudflareDurableObjectStub {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectStateLike {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
  };
}

export interface CloudflareDurableObjectStoreOptions {
  bindingName?: string;
  objectName?: string;
  objectNamePrefix?: string;
  path?: string;
}

type StoreRequest =
  | { operation: 'kv.get'; key: string }
  | { operation: 'kv.set'; key: string; value: string; ttlSeconds?: number }
  | { operation: 'kv.setIfAbsent'; key: string; value: string; ttlSeconds?: number }
  | { operation: 'kv.compareAndSet'; key: string; expected: string | null; value: string; ttlSeconds?: number }
  | { operation: 'kv.delete'; key: string }
  | { operation: 'kv.incr'; key: string; by?: number; ttlSeconds?: number }
  | { operation: 'directory.get'; key: string }
  | { operation: 'directory.put'; record: IndexedDirectoryRecord }
  | { operation: 'directory.putIfAbsent'; record: IndexedDirectoryRecord }
  | { operation: 'directory.update'; record: IndexedDirectoryRecord }
  | { operation: 'directory.delete'; key: string }
  | { operation: 'directory.query'; index: string; value: string; limit?: number; cursor?: string };

type StoreResponse<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

export function cloudflareDurableObjectStoreProvisioningPlan(
  options: CloudflareDurableObjectStoreOptions = {},
): StoreProvisioningPlan {
  const bindingName = options.bindingName ?? 'SUPERFUNCTIONS_STORES';
  return {
    id: `cloudflare-do:${bindingName}`,
    provider: 'cloudflare-do',
    resources: [
      {
        type: 'durable-object-class',
        name: 'SuperfunctionsStoresDurableObject',
        className: 'SuperfunctionsStoresDurableObject',
      },
      {
        type: 'durable-object-binding',
        name: bindingName,
        binding: bindingName,
        className: 'SuperfunctionsStoresDurableObject',
      },
    ],
    notes: [
      'Export SuperfunctionsStoresDurableObject from the Worker entrypoint.',
      'Bind the class as a Durable Object namespace and pass that binding to the adapter.',
      `Object name: ${options.objectName ?? `${options.objectNamePrefix ?? ''}superfunctions-stores`}`,
      `Request path: ${options.path ?? '/stores'}`,
    ],
  };
}

export function cloudflareDurableObjectAtomicKVStore(
  namespace: CloudflareDurableObjectNamespace,
  options: CloudflareDurableObjectStoreOptions = {},
): AtomicKVStoreAdapter & ProvisionableStoreAdapter {
  return {
    getProvisioningPlan() {
      return cloudflareDurableObjectStoreProvisioningPlan(options);
    },
    get(key) {
      return call(namespace, options, { operation: 'kv.get', key });
    },
    set(input) {
      return call(namespace, options, { operation: 'kv.set', ...input });
    },
    setIfAbsent(input) {
      return call(namespace, options, { operation: 'kv.setIfAbsent', ...input });
    },
    compareAndSet(input) {
      return call(namespace, options, { operation: 'kv.compareAndSet', ...input });
    },
    delete(key) {
      return call(namespace, options, { operation: 'kv.delete', key });
    },
    incr(input) {
      return call(namespace, options, { operation: 'kv.incr', ...input });
    },
    async isHealthy() {
      return true;
    },
  };
}

export function cloudflareDurableObjectIndexedDirectoryStore(
  namespace: CloudflareDurableObjectNamespace,
  options: CloudflareDurableObjectStoreOptions = {},
): IndexedDirectoryStoreAdapter & ProvisionableStoreAdapter {
  return {
    getProvisioningPlan() {
      return cloudflareDurableObjectStoreProvisioningPlan(options);
    },
    get(key) {
      return call(namespace, options, { operation: 'directory.get', key });
    },
    put(record) {
      return call(namespace, options, { operation: 'directory.put', record });
    },
    putIfAbsent(record) {
      return call(namespace, options, { operation: 'directory.putIfAbsent', record });
    },
    update(record) {
      return call(namespace, options, { operation: 'directory.update', record });
    },
    delete(key) {
      return call(namespace, options, { operation: 'directory.delete', key });
    },
    query(input) {
      return call(namespace, options, { operation: 'directory.query', ...input });
    },
  };
}

export const createCloudflareDurableObjectAtomicKVStore = cloudflareDurableObjectAtomicKVStore;
export const createCloudflareDurableObjectIndexedDirectoryStore = cloudflareDurableObjectIndexedDirectoryStore;

export class SuperfunctionsStoresDurableObject {
  private readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ ok: false, error: { message: 'Method not allowed' } }, 405);
    }
    const body = await request.json().catch(() => null) as StoreRequest | null;
    if (!body) {
      return json({ ok: false, error: { message: 'Invalid JSON body' } }, 400);
    }
    try {
      return json({ ok: true, data: await this.handle(body) });
    } catch (error) {
      return json({
        ok: false,
        error: { message: error instanceof Error ? error.message : 'Durable Object store failed' },
      }, 500);
    }
  }

  private async handle(body: StoreRequest): Promise<unknown> {
    switch (body.operation) {
      case 'kv.get':
        return this.readKV(body.key);
      case 'kv.set':
        await this.writeKV(body.key, body.value, body.ttlSeconds);
        return null;
      case 'kv.setIfAbsent': {
        const existing = await this.readKV(body.key);
        if (existing !== null) return { inserted: false, existing };
        await this.writeKV(body.key, body.value, body.ttlSeconds);
        return { inserted: true };
      }
      case 'kv.compareAndSet': {
        const existing = await this.readKV(body.key);
        if (existing !== body.expected) {
          return { updated: false, ...(existing === null ? {} : { existing }) };
        }
        await this.writeKV(body.key, body.value, body.ttlSeconds);
        return { updated: true };
      }
      case 'kv.delete':
        await this.state.storage.delete(kvKey(body.key));
        return null;
      case 'kv.incr': {
        const current = Number(await this.readKV(body.key) ?? '0');
        const value = current + (body.by ?? 1);
        await this.writeKV(body.key, String(value), body.ttlSeconds);
        return { value };
      }
      case 'directory.get':
        return this.readDirectoryRecord(body.key);
      case 'directory.put':
        await this.writeDirectoryRecord(body.record);
        return null;
      case 'directory.putIfAbsent': {
        const existing = await this.readDirectoryRecord(body.record.key);
        if (existing) return { inserted: false, existing };
        await this.writeDirectoryRecord(body.record);
        return { inserted: true };
      }
      case 'directory.update':
        await this.writeDirectoryRecord(body.record);
        return body.record;
      case 'directory.delete':
        await this.deleteDirectoryRecord(body.key);
        return null;
      case 'directory.query':
        return this.queryDirectory(body.index, body.value, body.limit, body.cursor);
    }
  }

  private async readKV(key: string): Promise<string | null> {
    const entry = await this.state.storage.get<{ value: string; expiresAt?: number }>(kvKey(key));
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      await this.state.storage.delete(kvKey(key));
      return null;
    }
    return entry.value;
  }

  private async writeKV(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.state.storage.put(kvKey(key), {
      value,
      ...(ttlSeconds && ttlSeconds > 0 ? { expiresAt: Date.now() + ttlSeconds * 1000 } : {}),
    });
  }

  private async readDirectoryRecord(key: string): Promise<IndexedDirectoryRecord | null> {
    const record = await this.state.storage.get<IndexedDirectoryRecord>(directoryKey(key));
    return record ?? null;
  }

  private async writeDirectoryRecord(record: IndexedDirectoryRecord): Promise<void> {
    const existing = await this.readDirectoryRecord(record.key);
    if (existing) await this.removeIndexes(existing);
    await this.state.storage.put(directoryKey(record.key), record);
    await this.addIndexes(record);
  }

  private async deleteDirectoryRecord(key: string): Promise<void> {
    const existing = await this.readDirectoryRecord(key);
    if (existing) await this.removeIndexes(existing);
    await this.state.storage.delete(directoryKey(key));
  }

  private async queryDirectory(
    index: string,
    value: string,
    limit?: number,
    cursor?: string,
  ): Promise<{ records: IndexedDirectoryRecord[]; cursor?: string }> {
    const keys = await this.state.storage.get<string[]>(indexKey(index, value)) ?? [];
    const start = cursor ? Number(cursor) : 0;
    const count = limit ?? keys.length;
    const page = keys.slice(start, start + count);
    const records = (
      await Promise.all(page.map((key) => this.readDirectoryRecord(key)))
    ).filter((record): record is IndexedDirectoryRecord => Boolean(record));
    const next = start + count < keys.length ? String(start + count) : undefined;
    return { records, ...(next ? { cursor: next } : {}) };
  }

  private async addIndexes(record: IndexedDirectoryRecord): Promise<void> {
    for (const [name, values] of Object.entries(record.indexes ?? {})) {
      for (const value of normalizeIndexValues(values)) {
        const key = indexKey(name, value);
        const existing = await this.state.storage.get<string[]>(key) ?? [];
        if (!existing.includes(record.key)) {
          await this.state.storage.put(key, [...existing, record.key]);
        }
      }
    }
  }

  private async removeIndexes(record: IndexedDirectoryRecord): Promise<void> {
    for (const [name, values] of Object.entries(record.indexes ?? {})) {
      for (const value of normalizeIndexValues(values)) {
        const key = indexKey(name, value);
        const existing = await this.state.storage.get<string[]>(key) ?? [];
        await this.state.storage.put(key, existing.filter((entry) => entry !== record.key));
      }
    }
  }
}

async function call<T>(
  namespace: CloudflareDurableObjectNamespace,
  options: CloudflareDurableObjectStoreOptions,
  body: StoreRequest,
): Promise<T> {
  const objectName = options.objectName ?? `${options.objectNamePrefix ?? ''}superfunctions-stores`;
  const stub = namespace.get(namespace.idFromName(objectName));
  const response = await stub.fetch(`https://superfunctions-stores.local${options.path ?? '/stores'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as StoreResponse<T> | null;
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error(payload && payload.ok === false ? payload.error.message : `Cloudflare Durable Object store returned ${response.status}`);
  }
  return payload.data;
}

function normalizeIndexValues(value: string | readonly string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((entry) => entry.length > 0);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function kvKey(key: string): string {
  return `kv:${key}`;
}

function directoryKey(key: string): string {
  return `directory:record:${key}`;
}

function indexKey(index: string, value: string): string {
  return `directory:index:${index}:${value}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
