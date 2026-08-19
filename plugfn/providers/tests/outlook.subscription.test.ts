import { describe, expect, it, vi } from 'vitest';
import { ProviderPolicyError } from '@superfunctions/oauth-providers';
import {
  MemoryOutlookSubscriptionStore,
  ensureOutlookSubscription,
  handleOutlookSubscriptionNotification,
  parseOutlookSubscriptionNotifications,
} from '../src/outlook/outlook.subscriptions.js';

describe('outlook subscription lifecycle', () => {
  it('creates subscription and skips renewal when still healthy', async () => {
    const now = new Date('2026-03-12T00:00:00.000Z');
    const store = new MemoryOutlookSubscriptionStore();
    const createOrRenew = vi.fn(async () => ({
      subscriptionId: 'sub-1',
      expirationDateTime: '2026-03-12T03:00:00.000Z',
    }));

    const first = await ensureOutlookSubscription(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        resource: "/me/mailFolders('Inbox')/messages",
        notificationUrl: 'https://app.example.com/webhooks/outlook',
      },
      {
        subscriptionStore: store,
        subscriptionClient: { createOrRenew },
        now: () => now,
      }
    );

    const second = await ensureOutlookSubscription(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        resource: "/me/mailFolders('Inbox')/messages",
        notificationUrl: 'https://app.example.com/webhooks/outlook',
      },
      {
        subscriptionStore: store,
        subscriptionClient: { createOrRenew },
        now: () => now,
      }
    );

    expect(first.renewed).toBe(false);
    expect(first.subscription.subscriptionId).toBe('sub-1');
    expect(second.renewed).toBe(false);
    expect(createOrRenew).toHaveBeenCalledTimes(1);
  });

  it('renews subscription when expiration is near and recovers from expired id', async () => {
    const now = new Date('2026-03-12T00:00:00.000Z');
    const store = new MemoryOutlookSubscriptionStore();
    await store.set('conn-1', {
      connectionId: 'conn-1',
      subscriptionId: 'sub-old',
      resource: "/me/mailFolders('Inbox')/messages",
      notificationUrl: 'https://app.example.com/webhooks/outlook',
      expirationDateTime: '2026-03-11T23:00:00.000Z',
      policyVersion: '2026-03-11',
      createdAt: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-03-11T00:00:00.000Z',
    });

    const createOrRenew = vi.fn(async (input: { subscriptionId?: string }) => {
      if (input.subscriptionId === 'sub-old') {
        throw {
          status: 404,
          message: 'subscription not found',
        };
      }

      return {
        subscriptionId: 'sub-new',
        expirationDateTime: '2026-03-12T04:00:00.000Z',
      };
    });

    const result = await ensureOutlookSubscription(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        resource: "/me/mailFolders('Inbox')/messages",
        notificationUrl: 'https://app.example.com/webhooks/outlook',
      },
      {
        subscriptionStore: store,
        subscriptionClient: { createOrRenew },
        now: () => now,
      }
    );

    expect(result.renewed).toBe(true);
    expect(result.subscription.subscriptionId).toBe('sub-new');
    expect(createOrRenew).toHaveBeenCalledTimes(2);
  });

  it('parses notifications and triggers delta sync callback', async () => {
    const store = new MemoryOutlookSubscriptionStore();
    await store.set('conn-1', {
      connectionId: 'conn-1',
      subscriptionId: 'sub-1',
      resource: "/me/mailFolders('Inbox')/messages",
      notificationUrl: 'https://app.example.com/webhooks/outlook',
      expirationDateTime: '2026-03-12T04:00:00.000Z',
      policyVersion: '2026-03-11',
      createdAt: '2026-03-12T00:00:00.000Z',
      updatedAt: '2026-03-12T00:00:00.000Z',
    });

    const triggerDeltaSync = vi.fn(async () => {});
    const result = await handleOutlookSubscriptionNotification(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        connectionId: 'conn-1',
        payload: {
          value: [
            {
              subscriptionId: 'sub-1',
              resource: "/me/mailFolders('Inbox')/messages",
            },
          ],
        },
      },
      {
        subscriptionStore: store,
        triggerDeltaSync,
      }
    );

    expect(result).toEqual({
      triggered: true,
      count: 1,
    });
    expect(triggerDeltaSync).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      connectionId: 'conn-1',
    });
  });

  it('returns deterministic validation error for malformed payload', () => {
    expect(() => parseOutlookSubscriptionNotifications({})).toThrowError(
      'outlook subscription payload value[] required'
    );
  });

  it('blocks ensure flow when provider policy denies watch operation', async () => {
    const store = new MemoryOutlookSubscriptionStore();

    await expect(
      ensureOutlookSubscription(
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          connectionId: 'conn-1',
          resource: "/me/mailFolders('Inbox')/messages",
          notificationUrl: 'https://app.example.com/webhooks/outlook',
        },
        {
          subscriptionStore: store,
          subscriptionClient: {
            createOrRenew: async () => ({
              subscriptionId: 'sub-1',
              expirationDateTime: '2026-03-12T04:00:00.000Z',
            }),
          },
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
