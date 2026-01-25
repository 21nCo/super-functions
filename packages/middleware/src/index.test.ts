import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('middleware', () => {
  it('should create rate limiter', async () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });
    const result = await limiter.check('test');
    expect(result.allowed).toBe(true);
  });

  it('should export RateLimiter interface', async () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 100 });
    expect(typeof limiter.check).toBe('function');
    expect(typeof limiter.reset).toBe('function');
  });
});
