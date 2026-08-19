import { describe, expect, it, vi } from 'vitest';
import { ProviderPolicyError } from '@superfunctions/oauth-providers';
import {
  MemoryGmailWatchStore,
  ensureGmailWatch,
  handleGmailPushNotification,
  parseGmailPushPayload,
} from '../src/gmail/gmail.watch.js';

describe('gmail watch lifecycle', () => {
  it('creates watch and skips renewal when subscription is still healthy', async () => {
    const now = new Date('2026-03-12T00:00:00.000Z');
    const watchStore = new MemoryGmailWatchStore();
    const createWatch = vi.fn(async () => ({
      historyId: 'h-1',
      expiration: new Date('2026-03-12T02:00:00.000Z').toISOString(),
    }));

    const first = await ensureGmailWatch(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        topicName: 'projects/demo/topics/gmail',
      },
      {
        watchStore,
        watchClient: { createWatch },
        now: () => now,
      }
    );

    const second = await ensureGmailWatch(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        topicName: 'projects/demo/topics/gmail',
      },
      {
        watchStore,
        watchClient: { createWatch },
        now: () => now,
      }
    );

    expect(first.renewed).toBe(false);
    expect(first.watch.historyId).toBe('h-1');
    expect(first.watch.policyVersion).toBe('2026-03-11');
    expect(second.renewed).toBe(false);
    expect(createWatch).toHaveBeenCalledTimes(1);
  });

  it('renews watch when expiration falls within renewal threshold', async () => {
    const now = new Date('2026-03-12T00:00:00.000Z');
    const watchStore = new MemoryGmailWatchStore();
    await watchStore.set('conn-1', {
      connectionId: 'conn-1',
      topicName: 'projects/demo/topics/gmail',
      historyId: 'h-1',
      expiration: new Date('2026-03-12T00:03:00.000Z').toISOString(),
      policyVersion: '2026-03-11',
      createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-12T00:00:00.000Z').toISOString(),
    });

    const createWatch = vi.fn(async () => ({
      historyId: 'h-2',
      expiration: new Date('2026-03-12T03:00:00.000Z').toISOString(),
    }));

    const result = await ensureGmailWatch(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        topicName: 'projects/demo/topics/gmail',
      },
      {
        watchStore,
        watchClient: { createWatch },
        now: () => now,
      }
    );

    expect(result.renewed).toBe(true);
    expect(result.watch.historyId).toBe('h-2');
    expect(createWatch).toHaveBeenCalledTimes(1);
  });

  it('parses gmail push payload and triggers incremental sync callback', async () => {
    const watchStore = new MemoryGmailWatchStore();
    await watchStore.set('conn-1', {
      connectionId: 'conn-1',
      topicName: 'projects/demo/topics/gmail',
      historyId: 'h-1',
      expiration: new Date('2026-03-12T03:00:00.000Z').toISOString(),
      policyVersion: '2026-03-11',
      createdAt: new Date('2026-03-12T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-12T00:00:00.000Z').toISOString(),
    });

    const triggerIncrementalSync = vi.fn(async () => {});
    const payload = {
      message: {
        data: Buffer.from(
          JSON.stringify({
            historyId: 'h-9',
            emailAddress: 'user@example.com',
          })
        ).toString('base64url'),
      },
    };

    const result = await handleGmailPushNotification(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        payload,
      },
      {
        watchStore,
        triggerIncrementalSync,
        now: () => new Date('2026-03-12T01:00:00.000Z'),
      }
    );

    expect(result).toEqual({
      triggered: true,
      historyId: 'h-9',
    });
    expect(triggerIncrementalSync).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      historyId: 'h-9',
    });
  });

  it('rejects malformed push payloads with deterministic validation error', () => {
    expect(() => parseGmailPushPayload({})).toThrowError(
      'gmail push payload historyId is required'
    );
  });

  it('blocks watch creation when policy disallows operation', async () => {
    const watchStore = new MemoryGmailWatchStore();
    const createWatch = vi.fn(async () => ({
      historyId: 'h-1',
      expiration: new Date('2026-03-12T03:00:00.000Z').toISOString(),
    }));

    await expect(
      ensureGmailWatch(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          connectionId: 'conn-1',
          topicName: 'projects/demo/topics/gmail',
        },
        {
          watchStore,
          watchClient: { createWatch },
          policyRegistry: {
            assertOperationAllowed: () => {
              throw new ProviderPolicyError(
                'PROVIDER_POLICY_BLOCKED',
                'operation not allowed by policy'
              );
            },
          } as any,
        }
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'operation not allowed by policy',
    });
  });
});
