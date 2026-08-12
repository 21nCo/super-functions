import { describe, expect, it } from 'vitest';
import { NoopLogger, ProviderRegistry, WebhookHandler } from 'plugfn';
import { outlookProvider } from '../src/outlook/index.js';

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
});

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
