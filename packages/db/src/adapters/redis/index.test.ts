import { describe, expect, it, vi } from 'vitest';

import {
  redisAtomicKVStore,
  redisIndexedDirectoryStore,
  type RedisCommandClient,
} from './index.js';

describe('redisAtomicKVStore', () => {
  it('keeps a literal legacy sentinel value distinct from the null CAS state', async () => {
    const sendCommand = vi.fn().mockResolvedValue([1, '__NULL__']);
    const store = redisAtomicKVStore({ sendCommand } satisfies RedisCommandClient);

    await expect(store.compareAndSet!({
      key: 'lease',
      expected: '__NULL__',
      value: 'claimed',
    })).resolves.toEqual({ updated: true, existing: '__NULL__' });

    const command = sendCommand.mock.calls[0]?.[0] as string[];
    expect(command.slice(2)).toEqual([
      '1',
      'lease',
      '0',
      '__NULL__',
      'claimed',
      '',
    ]);
    expect(command[1]).not.toContain('expected == "__NULL__"');
  });

  it('passes null expectation as an independent flag', async () => {
    const sendCommand = vi.fn().mockResolvedValue([1, null]);
    const store = redisAtomicKVStore({ sendCommand } satisfies RedisCommandClient);

    await expect(store.compareAndSet!({
      key: 'lease',
      expected: null,
      value: 'claimed',
      ttlSeconds: 30,
    })).resolves.toEqual({ updated: true });

    expect(sendCommand.mock.calls[0]?.[0].slice(2)).toEqual([
      '1',
      'lease',
      '1',
      '',
      'claimed',
      '30',
    ]);
  });
});

describe('redisIndexedDirectoryStore', () => {
  it('removes stale memberships before applying query pagination', async () => {
    const records = new Map<string, string>([
      ['p:dir:record:live-1', JSON.stringify({
        key: 'live-1',
        value: 'one',
        indexes: { email: 'ada@example.com' },
      })],
      ['p:dir:record:moved', JSON.stringify({
        key: 'moved',
        value: 'other',
        indexes: { email: 'grace@example.com' },
      })],
      ['p:dir:record:live-2', JSON.stringify({
        key: 'live-2',
        value: 'two',
        indexes: { email: 'ada@example.com' },
      })],
    ]);
    const sendCommand = vi.fn(async (args: string[]) => {
      if (args[0] === 'SMEMBERS') return ['expired', 'live-1', 'moved', 'live-2'];
      if (args[0] === 'GET') return records.get(args[1]!) ?? null;
      if (args[0] === 'SREM') return args.length - 2;
      return null;
    });
    const store = redisIndexedDirectoryStore(
      { sendCommand } satisfies RedisCommandClient,
      { prefix: 'p:' },
    );

    await expect(store.query({
      index: 'email',
      value: 'ada@example.com',
      limit: 2,
    })).resolves.toEqual({
      records: [
        { key: 'live-1', value: 'one', indexes: { email: 'ada@example.com' } },
        { key: 'live-2', value: 'two', indexes: { email: 'ada@example.com' } },
      ],
    });
    expect(sendCommand).toHaveBeenCalledWith([
      'SREM',
      'p:dir:index:email:ada@example.com',
      'expired',
      'moved',
    ]);
  });
});
