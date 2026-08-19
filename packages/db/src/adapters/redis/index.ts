import type {
  AtomicKVStoreAdapter,
  IndexedDirectoryRecord,
  IndexedDirectoryStoreAdapter,
  ProvisionableStoreAdapter,
  StoreProvisioningPlan,
} from '../../adapter/types.js';

export interface RedisCommandClient {
  sendCommand(command: string[]): Promise<unknown>;
}

export interface RedisStoreOptions {
  prefix?: string;
}

export function redisStoreProvisioningPlan(options: RedisStoreOptions = {}): StoreProvisioningPlan {
  return {
    id: `redis:${options.prefix ?? 'default'}`,
    provider: 'redis',
    resources: [],
    notes: [
      'Redis and Valkey do not require schema provisioning.',
      'Provision a Redis-compatible endpoint and pass a command client to the adapter.',
      `Key prefix: ${options.prefix ?? '(none)'}`,
    ],
  };
}

export function redisAtomicKVStore(
  client: RedisCommandClient,
  options: RedisStoreOptions = {},
): AtomicKVStoreAdapter & ProvisionableStoreAdapter {
  const prefix = options.prefix ?? '';

  return {
    getProvisioningPlan() {
      return redisStoreProvisioningPlan(options);
    },
    async get(key) {
      const value = await command(client, ['GET', toKey(prefix, key)]);
      return typeof value === 'string' ? value : value == null ? null : String(value);
    },
    async set(input) {
      const args = ['SET', toKey(prefix, input.key), input.value];
      if (input.ttlSeconds && input.ttlSeconds > 0) {
        args.push('EX', String(Math.floor(input.ttlSeconds)));
      }
      await command(client, args);
    },
    async setIfAbsent(input) {
      const args = ['SET', toKey(prefix, input.key), input.value, 'NX'];
      if (input.ttlSeconds && input.ttlSeconds > 0) {
        args.push('EX', String(Math.floor(input.ttlSeconds)));
      }
      const result = await command(client, args);
      if (result === 'OK') {
        return { inserted: true };
      }
      const existing = await this.get(input.key);
      return { inserted: false, ...(existing === null ? {} : { existing }) };
    },
    async compareAndSet(input) {
      const script = [
        'local current = redis.call("GET", KEYS[1])',
        'local expected = ARGV[1]',
        'if expected == "__NULL__" then expected = false end',
        'if current ~= expected then return {0, current} end',
        'redis.call("SET", KEYS[1], ARGV[2])',
        'if ARGV[3] ~= "" then redis.call("EXPIRE", KEYS[1], tonumber(ARGV[3])) end',
        'return {1, current}',
      ].join('\n');
      const expected = input.expected ?? '__NULL__';
      const ttl = input.ttlSeconds && input.ttlSeconds > 0 ? String(Math.floor(input.ttlSeconds)) : '';
      const result = await command(client, ['EVAL', script, '1', toKey(prefix, input.key), expected, input.value, ttl]);
      const values = Array.isArray(result) ? result : [];
      const updated = Number(values[0]) === 1;
      const existing = typeof values[1] === 'string' ? values[1] : null;
      return { updated, ...(existing === null ? {} : { existing }) };
    },
    async delete(key) {
      await command(client, ['DEL', toKey(prefix, key)]);
    },
    async incr(input) {
      const value = Number(await command(client, ['INCRBY', toKey(prefix, input.key), String(input.by ?? 1)]));
      if (input.ttlSeconds && input.ttlSeconds > 0) {
        await command(client, ['EXPIRE', toKey(prefix, input.key), String(Math.floor(input.ttlSeconds))]);
      }
      return { value };
    },
    async isHealthy() {
      const value = await command(client, ['PING']);
      return value === 'PONG' || value === 'pong' || value === true;
    },
  };
}

export function redisIndexedDirectoryStore(
  client: RedisCommandClient,
  options: RedisStoreOptions = {},
): IndexedDirectoryStoreAdapter & ProvisionableStoreAdapter {
  const prefix = options.prefix ?? '';

  return {
    getProvisioningPlan() {
      return redisStoreProvisioningPlan(options);
    },
    async get(key) {
      const value = await command(client, ['GET', recordKey(prefix, key)]);
      return typeof value === 'string' ? parseRecord(value) : null;
    },
    async put(record) {
      const existing = await this.get(record.key);
      if (existing) {
        await removeIndexEntries(client, prefix, existing);
      }
      await writeRecord(client, prefix, record);
    },
    async putIfAbsent(record) {
      const result = await command(client, ['SET', recordKey(prefix, record.key), JSON.stringify(record), 'NX']);
      if (result !== 'OK') {
        const existing = await this.get(record.key);
        return { inserted: false, ...(existing ? { existing } : {}) };
      }
      if (record.ttlSeconds && record.ttlSeconds > 0) {
        await command(client, ['EXPIRE', recordKey(prefix, record.key), String(Math.floor(record.ttlSeconds))]);
      }
      await addIndexEntries(client, prefix, record);
      return { inserted: true };
    },
    async update(record) {
      await this.put(record);
      return record;
    },
    async delete(key) {
      const existing = await this.get(key);
      if (existing) {
        await removeIndexEntries(client, prefix, existing);
      }
      await command(client, ['DEL', recordKey(prefix, key)]);
    },
    async query(input) {
      const keys = await command(client, ['SMEMBERS', indexKey(prefix, input.index, input.value)]);
      const allKeys = Array.isArray(keys) ? keys.map(String) : [];
      const start = input.cursor ? Number(input.cursor) : 0;
      const limit = input.limit ?? allKeys.length;
      const pageKeys = allKeys.slice(start, start + limit);
      const records = (
        await Promise.all(pageKeys.map((key) => this.get(key)))
      ).filter((record): record is IndexedDirectoryRecord => Boolean(record));
      const cursor = start + limit < allKeys.length ? String(start + limit) : undefined;
      return { records, ...(cursor ? { cursor } : {}) };
    },
  };
}

export const createRedisAtomicKVStore = redisAtomicKVStore;
export const createRedisIndexedDirectoryStore = redisIndexedDirectoryStore;

async function writeRecord(
  client: RedisCommandClient,
  prefix: string,
  record: IndexedDirectoryRecord,
): Promise<void> {
  await command(client, ['SET', recordKey(prefix, record.key), JSON.stringify(record)]);
  if (record.ttlSeconds && record.ttlSeconds > 0) {
    await command(client, ['EXPIRE', recordKey(prefix, record.key), String(Math.floor(record.ttlSeconds))]);
  }
  await addIndexEntries(client, prefix, record);
}

async function addIndexEntries(
  client: RedisCommandClient,
  prefix: string,
  record: IndexedDirectoryRecord,
): Promise<void> {
  for (const [name, values] of Object.entries(record.indexes ?? {})) {
    for (const value of normalizeIndexValues(values)) {
      await command(client, ['SADD', indexKey(prefix, name, value), record.key]);
    }
  }
}

async function removeIndexEntries(
  client: RedisCommandClient,
  prefix: string,
  record: IndexedDirectoryRecord,
): Promise<void> {
  for (const [name, values] of Object.entries(record.indexes ?? {})) {
    for (const value of normalizeIndexValues(values)) {
      await command(client, ['SREM', indexKey(prefix, name, value), record.key]);
    }
  }
}

async function command(client: RedisCommandClient, args: string[]): Promise<unknown> {
  return client.sendCommand(args);
}

function parseRecord(value: string): IndexedDirectoryRecord | null {
  const parsed = JSON.parse(value) as IndexedDirectoryRecord;
  return parsed && typeof parsed.key === 'string' && typeof parsed.value === 'string' ? parsed : null;
}

function normalizeIndexValues(value: string | readonly string[] | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((entry) => entry.length > 0);
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function toKey(prefix: string, key: string): string {
  return `${prefix}${key}`;
}

function recordKey(prefix: string, key: string): string {
  return `${prefix}dir:record:${key}`;
}

function indexKey(prefix: string, index: string, value: string): string {
  return `${prefix}dir:index:${index}:${value}`;
}
