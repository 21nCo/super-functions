import { describe, expect, it } from 'vitest';
import type { QueueAdapter } from '@superfunctions/queue';
import { SendGovernor } from '../../src/send-governance/governor.js';
import { SendQueue } from '../../src/send-governance/queue.js';
import type { SendJob } from '../../src/send-governance/types.js';

describe('send governance idempotency and isolation', () => {
  it('returns existing job for duplicate idempotency key within same tenant/user scope', async () => {
    const governor = new SendGovernor();

    const first = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_same',
    });
    const second = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_same',
    });

    expect(first.jobId).toBe(second.jobId);
    expect(second.duplicate).toBe(true);
    expect(governor.listQueuedSends({ tenantId: 't1', userId: 'u1' }).length).toBe(1);
  });

  it('allows same idempotency key across different tenants without collision', async () => {
    const governor = new SendGovernor();

    const t1 = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_shared',
    });
    const t2 = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't2',
      userId: 'u2',
      recipientCount: 1,
      idempotencyKey: 'ik_shared',
    });

    expect(t1.jobId).not.toBe(t2.jobId);
    expect(governor.listQueuedSends({ tenantId: 't1', userId: 'u1' }).length).toBe(1);
    expect(governor.listQueuedSends({ tenantId: 't2', userId: 'u2' }).length).toBe(1);
  });

  it('denies cross-tenant record reads with TENANT_ACCESS_DENIED', async () => {
    const governor = new SendGovernor();

    const queued = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't2',
      userId: 'u2',
      recipientCount: 1,
      idempotencyKey: 'ik_t2',
    });

    expect(() =>
      governor.getQueuedSend(queued.jobId, {
        tenantId: 't1',
        userId: 'u1',
      })
    ).toThrowError('cross-tenant access denied');
  });

  it('returns only tenant/user scoped records for list queries', async () => {
    const governor = new SendGovernor();
    await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_t1_a',
    });
    await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_t1_b',
    });
    await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't2',
      userId: 'u2',
      recipientCount: 1,
      idempotencyKey: 'ik_t2_a',
    });

    const scoped = governor.listQueuedSends({ tenantId: 't1', userId: 'u1' });
    expect(scoped.length).toBe(2);
    expect(scoped.every((job) => job.tenantId === 't1' && job.userId === 'u1')).toBe(true);
  });

  it('denies cross-tenant send processing attempts', async () => {
    const governor = new SendGovernor();

    const queued = await governor.scheduleSend({
      providerId: 'gmail',
      tenantId: 't2',
      userId: 'u2',
      recipientCount: 1,
      idempotencyKey: 'ik_processing_t2',
    });

    await expect(
      governor.processQueuedSend({
        jobId: queued.jobId,
        scope: {
          tenantId: 't1',
          userId: 'u1',
        },
        transport: {
          send: async () => ({ providerMessageId: 'pm-2' }),
        },
      })
    ).rejects.toMatchObject({
      code: 'TENANT_ACCESS_DENIED',
      message: 'cross-tenant access denied',
    });
  });

  it('rolls back local idempotency state when queue persistence fails', async () => {
    const failingQueue: QueueAdapter<SendJob> = {
      async enqueue() {
        throw new Error('queue unavailable');
      },
      async dequeue() {
        return null;
      },
      async dequeueMatching() {
        return null;
      },
      peek() {
        return [];
      },
      size() {
        return 0;
      },
    };
    const queue = new SendQueue({ queueAdapter: failingQueue });

    const request = {
      providerId: 'gmail',
      tenantId: 't1',
      userId: 'u1',
      recipientCount: 1,
      idempotencyKey: 'ik_failed_enqueue',
    };

    await expect(queue.enqueue(request)).rejects.toThrow('queue unavailable');

    expect(queue.list({ tenantId: 't1', userId: 'u1' })).toEqual([]);
    await expect(queue.enqueue(request)).rejects.toThrow('queue unavailable');
  });
});
