import { describe, expect, it } from 'vitest';
import type { EmailTransaction, SendEmailParams } from '../src';
import { createSendFnDeliveryProvider } from '../src';

describe('createSendFnDeliveryProvider', () => {
  it('sends shared email delivery requests through a SendFn email client', async () => {
    const sent: SendEmailParams[] = [];
    const provider = createSendFnDeliveryProvider({
      async email(params) {
        sent.push(params);
        return {
          id: 'email_123',
          userId: params.userId,
          to: Array.isArray(params.to) ? params.to[0] ?? '' : params.to,
          from: 'sender@example.com',
          subject: params.subject ?? '',
          templateId: null,
          templateData: null,
          provider: 'test',
          providerMessageId: 'provider_123',
          status: 'sent',
          sentAt: new Date('2026-01-01T00:00:00.000Z'),
          deliveredAt: null,
          bouncedAt: null,
          complainedAt: null,
          metadata: params.metadata ?? {},
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z')
        } satisfies EmailTransaction;
      }
    });

    const result = await provider.send({
      channel: 'email',
      to: 'ada@example.com',
      userId: 'user_123',
      subject: 'Verify your email',
      text: 'Code 123456',
      html: '<p>Code 123456</p>',
      metadata: {
        purpose: 'verify-email'
      }
    });

    expect(sent).toEqual([
      {
        userId: 'user_123',
        to: 'ada@example.com',
        cc: undefined,
        bcc: undefined,
        subject: 'Verify your email',
        html: '<p>Code 123456</p>',
        text: 'Code 123456',
        attachments: undefined,
        metadata: {
          purpose: 'verify-email'
        },
        tags: undefined
      }
    ]);
    expect(result).toEqual({
      sent: true,
      metadata: {
        provider: 'test',
        transactionId: 'email_123',
        providerMessageId: 'provider_123'
      }
    });
  });

  it.each(['pending', 'failed'] as const)('does not report %s transactions as sent', async (status) => {
    const provider = createSendFnDeliveryProvider({
      async email(params) {
        return {
          id: `email_${status}`, userId: params.userId, to: String(params.to), from: 'sender@example.com',
          subject: params.subject ?? '', templateId: null, templateData: null, provider: 'test',
          providerMessageId: null, status, sentAt: null, deliveredAt: null, bouncedAt: null, complainedAt: null,
          metadata: {}, createdAt: new Date(), updatedAt: new Date(),
        } satisfies EmailTransaction;
      },
    });

    await expect(provider.send({ channel: 'email', to: 'ada@example.com', subject: 'Verify', text: 'Code' }))
      .resolves.toMatchObject({ sent: false });
  });
});
