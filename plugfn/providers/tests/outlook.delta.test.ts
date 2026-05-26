import { describe, expect, it } from 'vitest';
import { RetryMiddleware } from 'plugfn';
import { RateLimiter } from 'plugfn';
import {
  MemoryOutlookDeltaTokenStore,
  MemoryOutlookMessageStore,
  runOutlookDeltaSync,
} from '../src/outlook/outlook.delta.js';

describe('outlook delta sync', () => {
  it('persists baseline delta token during full sync', async () => {
    const checkpointStore = new MemoryOutlookDeltaTokenStore();
    const messageStore = new MemoryOutlookMessageStore();

    const result = await runOutlookDeltaSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'full',
      },
      {
        source: {
          listDelta: async () => ({
            messages: [createOutlookMessage('m-1', 'c-1')],
            nextDeltaToken: 'dt_1',
          }),
        },
        checkpointStore,
        messageStore,
      }
    );

    expect(result.checkpoint).toBe('dt_1');
    expect(result.fetched).toBe(1);
    expect(result.upserted).toBe(1);
    expect(result.skipped).toBe(0);

    const checkpoint = await checkpointStore.get('conn-1');
    expect(checkpoint).toMatchObject({
      deltaToken: 'dt_1',
    });
  });

  it('advances delta token only after successful page commit', async () => {
    const checkpointStore = new MemoryOutlookDeltaTokenStore();
    await checkpointStore.set('conn-1', {
      deltaToken: 'dt_1',
      updatedAt: new Date().toISOString(),
    });

    await expect(
      runOutlookDeltaSync(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          connectionId: 'conn-1',
          mode: 'incremental',
        },
        {
          source: {
            listDelta: async () => ({
              messages: [createOutlookMessage('m-2', 'c-2')],
              nextDeltaToken: 'dt_2',
            }),
          },
          checkpointStore,
          messageStore: {
            upsert: async () => {
              throw new Error('store write failed');
            },
          },
        }
      )
    ).rejects.toThrow('store write failed');

    const checkpoint = await checkpointStore.get('conn-1');
    expect(checkpoint).toMatchObject({
      deltaToken: 'dt_1',
    });
  });

  it('returns MAIL_SYNC_CHECKPOINT_INVALID for expired/invalid delta token', async () => {
    const checkpointStore = new MemoryOutlookDeltaTokenStore();
    await checkpointStore.set('conn-1', {
      deltaToken: 'expired',
      updatedAt: new Date().toISOString(),
    });

    await expect(
      runOutlookDeltaSync(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          connectionId: 'conn-1',
          mode: 'incremental',
        },
        {
          source: {
            listDelta: async () => {
              throw {
                status: 410,
                message: 'delta token expired',
              };
            },
          },
          checkpointStore,
          messageStore: new MemoryOutlookMessageStore(),
        }
      )
    ).rejects.toMatchObject({
      code: 'MAIL_SYNC_CHECKPOINT_INVALID',
      message: 'outlook delta token invalid',
    });
  });

  it('retries Graph 429 throttling using Retry-After hints', async () => {
    const checkpointStore = new MemoryOutlookDeltaTokenStore();
    await checkpointStore.set('conn-1', {
      deltaToken: 'dt_1',
      updatedAt: new Date().toISOString(),
    });
    const messageStore = new MemoryOutlookMessageStore();

    const delays: number[] = [];
    const retryMiddleware = new RetryMiddleware(
      {
        maxAttempts: 3,
        delay: 100,
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
    let attempts = 0;
    const rateLimitConfig = { requests: 2, window: 60000 };

    const result = await runOutlookDeltaSync(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        mode: 'incremental',
      },
      {
        source: {
          listDelta: async () => {
            attempts += 1;
            if (attempts === 1) {
              throw {
                status: 429,
                retryAfterSeconds: 7,
              };
            }

            return {
              messages: [createOutlookMessage('m-1', 'c-1')],
              nextDeltaToken: 'dt_2',
            };
          },
        },
        checkpointStore,
        messageStore,
        retryMiddleware,
        rateLimiter: limiter,
        rateLimitConfig,
      }
    );

    expect(result.checkpoint).toBe('dt_2');
    expect(attempts).toBe(2);
    expect(delays).toEqual([7000]);
    expect(limiter.wouldExceed('provider:outlook', rateLimitConfig)).toBe(true);
    expect(limiter.wouldExceed('provider:outlook:tenant:tenant-1', rateLimitConfig)).toBe(true);

    limiter.destroy();
  });
});

function createOutlookMessage(id: string, conversationId: string) {
  return {
    id,
    conversationId,
    from: {
      emailAddress: {
        address: 'sender@example.com',
      },
    },
    toRecipients: [
      {
        emailAddress: {
          address: 'user@example.com',
        },
      },
    ],
    receivedDateTime: '2026-03-12T00:00:00.000Z',
    hasAttachments: false,
  };
}
