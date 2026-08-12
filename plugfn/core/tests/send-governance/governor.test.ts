import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/middleware/rate-limiter.js';
import { RetryMiddleware } from '../../src/middleware/retry.js';
import { SendGovernor } from '../../src/send-governance/governor.js';

describe('send governance governor', () => {
  it('queues compliant send requests with policyPassed=true', async () => {
    const governor = new SendGovernor();

    const result = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_send_1',
    });

    expect(result.queued).toBe(true);
    expect(result.policyPassed).toBe(true);
    expect(result.jobId).toMatch(/^send_/);
  });

  it('blocks over-limit sends and persists canonical blocked decision', async () => {
    const governor = new SendGovernor();

    await expect(
      governor.scheduleSend({
        providerId: 'gmail',
        tenantId: 't1',
        userId: 'u1',
        recipientCount: 5000,
        idempotencyKey: 'ik_send_2',
      })
    ).rejects.toMatchObject({
      code: 'MAIL_SEND_BLOCKED',
      message: 'send policy limit exceeded',
      retryable: false,
    });

    const blocked = governor.listBlockedDecisions({ tenantId: 't1', userId: 'u1' });
    expect(blocked.length).toBe(1);
    expect(blocked[0]).toMatchObject({
      code: 'MAIL_SEND_BLOCKED',
      message: 'send policy limit exceeded',
      retryable: false,
    });
  });

  it('honors Retry-After during provider throttling and retries send execution', async () => {
    const delays: number[] = [];
    const retryMiddleware = new RetryMiddleware(
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
    const limiter = new RateLimiter({
      setIntervalFn: () => 0 as unknown as NodeJS.Timeout,
      clearIntervalFn: () => {},
    });
    const governor = new SendGovernor({
      retryMiddleware,
      rateLimiter: limiter,
    });

    const queued = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_retry_after',
    });

    let attempts = 0;
    const processed = await governor.processQueuedSend({
      jobId: queued.jobId,
      scope: { tenantId: 't1', userId: 'u1' },
      transport: {
        send: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw {
              status: 429,
              headers: {
                'retry-after': '7',
              },
            };
          }
          return { providerMessageId: 'pm-1' };
        },
      },
    });

    expect(processed.sent).toBe(true);
    expect(processed.retries).toBe(1);
    expect(delays).toEqual([7000]);
    expect(governor.wouldExceedRateLimit('gmail', 't1')).toEqual({
      provider: true,
      tenant: true,
    });

    limiter.destroy();
  });

  it('terminates retry loop at max attempts with PROVIDER_RATE_LIMITED', async () => {
    const retryMiddleware = new RetryMiddleware(
      {
        maxAttempts: 3,
        delay: 100,
      },
      undefined,
      {
        sleep: async () => {},
      }
    );
    const governor = new SendGovernor({ retryMiddleware });

    const queued = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_retry_max',
    });

    await expect(
      governor.processQueuedSend({
        jobId: queued.jobId,
        scope: { tenantId: 't1', userId: 'u1' },
        transport: {
          send: async () => {
            throw {
              status: 429,
              retryAfterSeconds: 1,
            };
          },
        },
      })
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
      message: 'max retry attempts exceeded',
    });
  });

  it('rejects reprocessing a send job after it reaches a terminal state', async () => {
    const governor = new SendGovernor();
    const queued = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_terminal_send',
    });
    let sendCalls = 0;
    const transport = {
      send: async () => {
        sendCalls += 1;
        return { providerMessageId: 'pm-terminal' };
      },
    };

    await expect(
      governor.processQueuedSend({
        jobId: queued.jobId,
        scope: { tenantId: 't1', userId: 'u1' },
        transport,
      })
    ).resolves.toMatchObject({ sent: true, jobId: queued.jobId });

    await expect(
      governor.processQueuedSend({
        jobId: queued.jobId,
        scope: { tenantId: 't1', userId: 'u1' },
        transport,
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: `send job is not queued: ${queued.jobId} (sent)`,
    });
    expect(sendCalls).toBe(1);
  });

  it('reserves a queued job before awaiting the rate limiter', async () => {
    let releaseLimiter!: () => void;
    const limiter = new RateLimiter({
      setIntervalFn: () => 0 as unknown as NodeJS.Timeout,
      clearIntervalFn: () => {},
    });
    let limiterCalls = 0;
    limiter.acquireMany = async () => {
      limiterCalls += 1;
      await new Promise<void>((resolve) => {
        releaseLimiter = resolve;
      });
      return {
        allowed: true,
        remaining: 0,
        resetAt: new Date().toISOString(),
        remainingByKey: new Map(),
        resetAtByKey: new Map(),
      };
    };
    const governor = new SendGovernor({ rateLimiter: limiter });
    const queued = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_concurrent',
    });
    const input = {
      jobId: queued.jobId,
      scope: { tenantId: 't1', userId: 'u1' },
      transport: { send: async () => ({ providerMessageId: 'pm-concurrent' }) },
    };

    const first = governor.processQueuedSend(input);
    await Promise.resolve();
    await expect(governor.processQueuedSend(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(limiterCalls).toBe(1);
    releaseLimiter();
    await expect(first).resolves.toMatchObject({ sent: true });
    limiter.destroy();
  });
});
