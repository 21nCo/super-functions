import { describe, expect, it } from 'vitest';
import { RetryMiddleware } from '../src/middleware/retry.js';
import { RateLimiter } from '../src/middleware/rate-limiter.js';

describe('retry and rate limit hardening', () => {
  it('uses Retry-After seconds from provider response when retrying', async () => {
    const delays: number[] = [];
    let attempts = 0;
    const middleware = new RetryMiddleware(
      {
        maxAttempts: 3,
        delay: 100,
        backoff: 'linear',
      },
      undefined,
      {
        sleep: async (ms) => {
          delays.push(ms);
        },
      }
    );

    const result = await middleware.execute(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw {
          status: 429,
          headers: {
            'retry-after': '7',
          },
        };
      }
      return 'ok';
    });

    expect(result.data).toBe('ok');
    expect(result.retries).toBe(1);
    expect(delays).toEqual([7000]);
  });

  it('parses Retry-After HTTP date values when computing retry delays', async () => {
    const delays: number[] = [];
    const baseTimeMs = Date.parse('2026-03-12T00:00:00.000Z');
    let attempts = 0;
    const middleware = new RetryMiddleware(
      {
        maxAttempts: 2,
        delay: 100,
        backoff: 'exponential',
      },
      undefined,
      {
        now: () => baseTimeMs,
        sleep: async (ms) => {
          delays.push(ms);
        },
      }
    );

    await middleware.execute(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw {
          status: 429,
          headers: {
            'retry-after': new Date(baseTimeMs + 5000).toUTCString(),
          },
        };
      }
      return 'ok';
    });

    expect(delays).toEqual([5000]);
  });

  it('fails with PROVIDER_RATE_LIMITED after max retry attempts', async () => {
    const middleware = new RetryMiddleware(
      {
        maxAttempts: 3,
        delay: 10,
      },
      undefined,
      {
        sleep: async () => {},
      }
    );

    await expect(
      middleware.execute(async () => {
        throw {
          status: 429,
          retryAfterSeconds: 1,
        };
      })
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      message: 'max retry attempts exceeded',
      status: 429,
    });
  });

  it('uses default maxAttempts=5 when no override is provided', async () => {
    let attempts = 0;
    const middleware = new RetryMiddleware(
      {},
      undefined,
      {
        sleep: async () => {},
      }
    );

    await expect(
      middleware.execute(async () => {
        attempts += 1;
        throw {
          status: 429,
        };
      })
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      status: 429,
    });

    expect(attempts).toBe(5);
  });

  it('tracks provider and tenant buckets independently', async () => {
    const limiter = new RateLimiter({
      setIntervalFn: () => 0 as unknown as NodeJS.Timeout,
      clearIntervalFn: () => {},
    });

    const config = {
      requests: 1,
      window: 1000,
    };

    await limiter.acquire('provider:gmail', config);

    expect(limiter.wouldExceed('provider:gmail', config)).toBe(true);
    expect(limiter.wouldExceed('provider:gmail:tenant:user-1', config)).toBe(false);

    await limiter.acquire('provider:gmail:tenant:user-1', config);
    expect(limiter.wouldExceed('provider:gmail:tenant:user-1', config)).toBe(true);

    limiter.destroy();
  });

  it('keeps per-key reset times after a blocked multi-key acquire', async () => {
    let now = 0;
    let wake!: () => void;
    let notifySleepScheduled!: () => void;
    const sleepScheduled = new Promise<void>((resolve) => {
      notifySleepScheduled = resolve;
    });
    const limiter = new RateLimiter({
      now: () => now,
      setTimeoutFn: (callback) => {
        wake = callback;
        notifySleepScheduled();
        return 1 as unknown as NodeJS.Timeout;
      },
      clearTimeoutFn: () => {},
    });
    const config = { requests: 1, window: 1000 };

    await limiter.acquire('provider:gmail', config);
    now = 500;
    await limiter.acquire('provider:gmail:tenant:user-1', config);
    now = 600;
    const pending = limiter.acquireMany(
      ['provider:gmail', 'provider:gmail:tenant:user-1'],
      config
    );
    await sleepScheduled;

    now = 1100;
    expect(limiter.wouldExceed('provider:gmail', config)).toBe(false);
    expect(limiter.wouldExceed('provider:gmail:tenant:user-1', config)).toBe(true);

    now = 1500;
    wake();
    await pending;
    limiter.destroy();
  });
});
