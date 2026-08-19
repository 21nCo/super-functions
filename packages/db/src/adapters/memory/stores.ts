import type {
  AtomicKVStoreAdapter,
  IndexedDirectoryRecord,
  IndexedDirectoryStoreAdapter,
  RuntimeStores,
} from '../../adapter/types.js';

type MemoryValue = {
  value: string;
  expiresAt?: number;
};

export function createMemoryAtomicKVStore(now: () => number = Date.now): AtomicKVStoreAdapter {
  const values = new Map<string, MemoryValue>();

  const read = (key: string): string | null => {
    const entry = values.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= now()) {
      values.delete(key);
      return null;
    }
    return entry.value;
  };

  const write = (key: string, value: string, ttlSeconds?: number): void => {
    values.set(key, {
      value,
      ...(typeof ttlSeconds === 'number' && ttlSeconds > 0
        ? { expiresAt: now() + ttlSeconds * 1000 }
        : {}),
    });
  };

  return {
    async get(key) {
      return read(key);
    },
    async set(input) {
      write(input.key, input.value, input.ttlSeconds);
    },
    async setIfAbsent(input) {
      const existing = read(input.key);
      if (existing !== null) {
        return { inserted: false, existing };
      }
      write(input.key, input.value, input.ttlSeconds);
      return { inserted: true };
    },
    async compareAndSet(input) {
      const existing = read(input.key);
      if (existing !== input.expected) {
        return { updated: false, ...(existing === null ? {} : { existing }) };
      }
      write(input.key, input.value, input.ttlSeconds);
      return { updated: true };
    },
    async delete(key) {
      values.delete(key);
    },
    async incr(input) {
      const current = Number(read(input.key) ?? '0');
      const value = current + (input.by ?? 1);
      write(input.key, String(value), input.ttlSeconds);
      return { value };
    },
    async isHealthy() {
      return true;
    },
    async close() {
      values.clear();
    },
  };
}

export function createMemoryIndexedDirectoryStore(now: () => number = Date.now): IndexedDirectoryStoreAdapter {
  const records = new Map<string, IndexedDirectoryRecord & { expiresAt?: number }>();

  const normalize = (record: IndexedDirectoryRecord): IndexedDirectoryRecord & { expiresAt?: number } => ({
    key: record.key,
    value: record.value,
    ...(record.indexes ? { indexes: { ...record.indexes } } : {}),
    ...(record.ttlSeconds ? { ttlSeconds: record.ttlSeconds, expiresAt: now() + record.ttlSeconds * 1000 } : {}),
  });

  const read = (key: string): IndexedDirectoryRecord | null => {
    const record = records.get(key);
    if (!record) return null;
    if (record.expiresAt !== undefined && record.expiresAt <= now()) {
      records.delete(key);
      return null;
    }
    return stripRuntimeFields(record);
  };

  return {
    async get(key) {
      return read(key);
    },
    async put(record) {
      records.set(record.key, normalize(record));
    },
    async putIfAbsent(record) {
      const existing = read(record.key);
      if (existing) {
        return { inserted: false, existing };
      }
      records.set(record.key, normalize(record));
      return { inserted: true };
    },
    async update(record) {
      const normalized = normalize(record);
      records.set(record.key, normalized);
      return stripRuntimeFields(normalized);
    },
    async delete(key) {
      records.delete(key);
    },
    async query(input) {
      const matched = Array.from(records.keys())
        .map((key) => read(key))
        .filter((record): record is IndexedDirectoryRecord => Boolean(record))
        .filter((record) => indexMatches(record, input.index, input.value));
      const start = input.cursor ? Number(input.cursor) : 0;
      const limit = input.limit ?? matched.length;
      const page = matched.slice(start, start + limit);
      const next = start + limit < matched.length ? String(start + limit) : undefined;
      return { records: page, ...(next ? { cursor: next } : {}) };
    },
  };
}

export function createMemoryRuntimeStores(now: () => number = Date.now): RuntimeStores {
  return {
    kv: createMemoryAtomicKVStore(now),
    atomicKv: createMemoryAtomicKVStore(now),
    directory: createMemoryIndexedDirectoryStore(now),
  };
}

function stripRuntimeFields(record: IndexedDirectoryRecord & { expiresAt?: number }): IndexedDirectoryRecord {
  return {
    key: record.key,
    value: record.value,
    ...(record.indexes ? { indexes: { ...record.indexes } } : {}),
    ...(record.ttlSeconds ? { ttlSeconds: record.ttlSeconds } : {}),
  };
}

function indexMatches(record: IndexedDirectoryRecord, index: string, value: string): boolean {
  const current = record.indexes?.[index];
  if (Array.isArray(current)) {
    return current.includes(value);
  }
  return current === value;
}
