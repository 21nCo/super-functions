import { describe, it, expect } from 'vitest';
import { createMemoryAtomicKVStore } from '@superfunctions/db/adapters/memory';
import { RateLimiter } from '../src/middleware/rate-limiter.js';
describe('shared atomic quotas', () => {
  it('shares quota across independently created limiter instances', async () => {
    const store = createMemoryAtomicKVStore();
    const a = new RateLimiter({ atomicStore: store });
    const b = new RateLimiter({ atomicStore: store });
    const config = { requests: 1, window: 80 };
    await a.acquire('provider:shared', config);
    let secondFinished = false;
    const second = b.acquire('provider:shared', config).then(() => { secondFinished = true; });
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(secondFinished).toBe(false);
    await second;
    expect(secondFinished).toBe(true);
    a.destroy(); b.destroy();
  });
  it('fails closed when an injected store lacks atomic CAS', () => {
    expect(() => new RateLimiter({ atomicStore: { get: async () => null } as any })).toThrow('ATOMIC_CAS');
  });
});

it('rejects queued work on shutdown instead of leaving a promise pending', async () => {
  const limiter = new RateLimiter();
  await limiter.acquire('key', { requests: 1, window: 1000 });
  const blocked = limiter.acquire('key', { requests: 1, window: 1000 });
  const check = expect(blocked).rejects.toThrow('destroyed');
  await new Promise(resolve => setTimeout(resolve, 5));
  limiter.destroy();
  await check;
});
