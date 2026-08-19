import { describe, expect, it } from 'vitest';
import { NoopLogger, ProviderRegistry, WebhookHandler } from 'plugfn';
import { outlookProvider, outlookSubscriptionStore } from '../src/outlook/index.js';

describe('Outlook webhook verification', () => {
  it('requires a client state when creating subscriptions', () => {
    expect(() =>
      outlookProvider.actions['mail.subscription.ensure'].parameters.parse({
        tenantId: 'tenant-1',
        notificationUrl: 'https://app.example.com/webhooks/outlook',
      })
    ).toThrow();
  });

  it('accepts subscription notifications with the configured client state', async () => {
    await storeSubscription('sub-1', 'expected-client-state');
    const handler = createHandler();

    await expect(
      handler.handleWebhook(
        'outlook',
        'mail.update',
        notification('expected-client-state'),
        {},
        'expected-client-state'
      )
    ).resolves.toMatchObject({ verified: true });
  });

  it.each([undefined, 'wrong-client-state'])(
    'rejects subscription notifications with client state %s',
    async (clientState) => {
      await storeSubscription('sub-1', 'expected-client-state');
      await expect(
        createHandler().handleWebhook(
          'outlook',
          'mail.update',
          notification(clientState),
          {},
          'expected-client-state'
        )
      ).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE_INVALID' });
    }
  );

  it('validates each notification against its own stored subscription state', async () => {
    await storeSubscription('sub-1', 'state-1');
    await storeSubscription('sub-2', 'state-2');
    await expect(
      createHandler().handleWebhook('outlook', 'mail.update', {
        value: [
          notification('state-1').value[0],
          { ...notification('state-2').value[0], subscriptionId: 'sub-2' },
        ],
      }, {}, 'unrelated-provider-secret')
    ).resolves.toMatchObject({ verified: true });
  });
});

async function storeSubscription(subscriptionId: string, clientState: string): Promise<void> {
  await outlookSubscriptionStore.set(`connection-${subscriptionId}`, {
    connectionId: `connection-${subscriptionId}`,
    subscriptionId,
    resource: "/me/mailFolders('Inbox')/messages",
    notificationUrl: 'https://app.example.com/webhooks/outlook',
    expirationDateTime: '2026-08-20T00:00:00.000Z',
    clientState,
    policyVersion: '2026-08-19',
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  });
}

function createHandler(): WebhookHandler {
  const logger = new NoopLogger();
  const registry = new ProviderRegistry(logger);
  registry.register(outlookProvider);
  return new WebhookHandler(registry, logger);
}

function notification(clientState: string | undefined) {
  return {
    value: [
      {
        subscriptionId: 'sub-1',
        resource: "/me/mailFolders('Inbox')/messages/m1",
        ...(clientState ? { clientState } : {}),
      },
    ],
  };
}
