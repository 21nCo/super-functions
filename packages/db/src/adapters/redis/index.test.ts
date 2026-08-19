import { describe, expect, it, vi } from 'vitest';

import { redisAtomicKVStore, type RedisCommandClient } from './index.js';

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
