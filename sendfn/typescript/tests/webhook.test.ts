import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AwsSnsVerifier, type SnsMessage } from '../src/events/aws-sns-verifier';
import { AwsSesWebhookHandler } from '../src/events/webhook-handler';
import { SendfnDb } from '../src/database/sendfn-db';
import { SendfnError } from '../src/errors';
import { SuppressionManager } from '../src/suppression/manager';
import { sendfn, type SendfnConfig } from '../src/sendfn';
import { StrongMockAdapter } from './mock-adapter';

function createVerifier(now = new Date('2026-04-02T00:00:00Z')): AwsSnsVerifier {
  return new AwsSnsVerifier({
    now: () => now,
    fetchCertificate: async () => 'certificate',
    verifySignature: async (_canonicalMessage, signature) => signature === 'valid',
    topicArns: ['arn:aws:sns:us-east-1:123456789012:sendfn'],
    maxAgeMs: 5 * 60 * 1000,
  });
}

function createEnvelope(
  message: Record<string, unknown>,
  overrides: Partial<SnsMessage> = {}
): SnsMessage {
  return {
    Type: 'Notification',
    MessageId: 'sns-1',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:sendfn',
    Timestamp: '2026-04-02T00:00:00Z',
    SignatureVersion: '1',
    Signature: 'valid',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
    Message: JSON.stringify(message),
    ...overrides,
  };
}

async function seedEmailTransaction(adapter: StrongMockAdapter, overrides: Record<string, unknown> = {}) {
  await adapter.create({
    model: 'email_transactions',
    data: {
      id: 'tx-1',
      userId: 'user-1',
      to: 'user@example.com',
      from: 'noreply@example.com',
      subject: 'Hello',
      templateId: null,
      templateData: null,
      provider: 'aws-ses',
      providerMessageId: 'ses-123',
      status: 'sent',
      sentAt: new Date('2026-04-02T00:00:00Z'),
      deliveredAt: null,
      bouncedAt: null,
      complainedAt: null,
      metadata: {},
      createdAt: new Date('2026-04-02T00:00:00Z'),
      updatedAt: new Date('2026-04-02T00:00:00Z'),
      ...overrides,
    },
  });
}

describe('AWS SES webhook processing', () => {
  let adapter: StrongMockAdapter;
  let db: SendfnDb;
  let suppressionManager: SuppressionManager;

  beforeEach(() => {
    adapter = new StrongMockAdapter();
    db = new SendfnDb(adapter as any);
    suppressionManager = new SuppressionManager(db, { enabled: true });
  });

  it('rejects invalid signatures before any mutation and emits redacted structured logs', async () => {
    await seedEmailTransaction(adapter);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const handler = new AwsSesWebhookHandler(db, suppressionManager, {
      verifier: createVerifier(),
      logger,
    });

    const envelope = createEnvelope(
      {
        notificationType: 'Delivery',
        mail: {
          messageId: 'ses-123',
          timestamp: '2026-04-02T00:00:00Z',
          destination: ['user@example.com'],
        },
        delivery: {
          timestamp: '2026-04-02T00:00:05Z',
          recipients: ['user@example.com'],
          processingTimeMillis: 100,
          smtpResponse: '250 ok',
        },
      },
      {
        MessageId: 'sns-invalid',
        Signature: 'invalid',
      }
    );

    await expect(
      handler.handleSnsNotification(envelope, { requestId: 'req_invalid' })
    ).rejects.toMatchObject({
      code: 'SENDFN_WEBHOOK_SIGNATURE_INVALID',
      message: 'SNS signature verification failed',
    });

    expect(adapter.records('email_transactions')[0].status).toBe('sent');
    expect(adapter.records('communication_events')).toHaveLength(0);
    expect(adapter.records('suppression_list')).toHaveLength(0);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toMatchObject({
      requestId: 'req_invalid',
      operation: 'webhook.process',
      provider: 'aws-ses',
      snsMessageId: 'sns-invalid',
      status: 'rejected',
      verificationResult: 'invalid-signature',
      matchedTransactions: 0,
      orphanEvents: 0,
      createdSuppressionEntries: 0,
      code: 'SENDFN_WEBHOOK_SIGNATURE_INVALID',
    });
    expect(logger.warn.mock.calls[0][0]).not.toHaveProperty('signature');
    expect(logger.warn.mock.calls[0][0]).not.toHaveProperty('message');
    expect(logger.warn.mock.calls[0][0]).not.toHaveProperty('deviceToken');
  });

  it('fails invalid certificate hosts, stale timestamps, and malformed envelopes with stable webhook codes', async () => {
    const verifier = createVerifier();
    const staleVerifier = createVerifier(new Date('2026-04-02T00:10:00Z'));

    await expect(
      verifier.verify(
        createEnvelope(
          {
            notificationType: 'Delivery',
            mail: {
              messageId: 'ses-123',
              timestamp: '2026-04-02T00:00:00Z',
            },
            delivery: {
              timestamp: '2026-04-02T00:00:05Z',
              recipients: ['user@example.com'],
            },
          },
          {
            SigningCertURL: 'https://example.com/cert.pem',
          }
        )
      )
    ).rejects.toMatchObject({
      code: 'SENDFN_WEBHOOK_SIGNATURE_INVALID',
    });

    await expect(
      staleVerifier.verify(
        createEnvelope(
          {
            notificationType: 'Delivery',
            mail: {
              messageId: 'ses-123',
              timestamp: '2026-04-02T00:00:00Z',
            },
            delivery: {
              timestamp: '2026-04-02T00:00:05Z',
              recipients: ['user@example.com'],
            },
          },
          {
            Timestamp: '2026-04-01T23:50:00Z',
          }
        )
      )
    ).rejects.toMatchObject({
      code: 'SENDFN_WEBHOOK_MESSAGE_INVALID',
    });

    const handler = new AwsSesWebhookHandler(db, suppressionManager, {
      verifier,
    });
    await expect(
      handler.handleSnsNotification(
        createEnvelope({ notificationType: 'Delivery' }, { MessageId: undefined as unknown as string })
      )
    ).rejects.toMatchObject({
      code: 'SENDFN_WEBHOOK_MESSAGE_INVALID',
    });
  });

  it('authorizes the SNS topic and signs the canonical message with a terminal newline', async () => {
    let canonicalMessage = '';
    const verifier = new AwsSnsVerifier({
      topicArns: ['arn:aws:sns:us-east-1:123456789012:sendfn'],
      fetchCertificate: async () => 'certificate',
      verifySignature: async (value) => {
        canonicalMessage = value;
        return true;
      },
    });
    await verifier.verify(createEnvelope({ notificationType: 'Delivery' }));
    expect(canonicalMessage).toMatch(/\nTopicArn\narn:aws:sns:us-east-1:123456789012:sendfn\nType\nNotification\n$/);
    await expect(verifier.verify(createEnvelope(
      { notificationType: 'Delivery' },
      { TopicArn: 'arn:aws:sns:us-east-1:123456789012:other' },
    ))).rejects.toMatchObject({ code: 'SENDFN_WEBHOOK_MESSAGE_INVALID' });
  });

  it('correlates delivery events and keeps duplicate deliveries idempotent', async () => {
    await seedEmailTransaction(adapter);
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    };
    const handler = new AwsSesWebhookHandler(db, suppressionManager, {
      verifier: createVerifier(),
      logger,
    });
    const envelope = createEnvelope({
      notificationType: 'Delivery',
      mail: {
        messageId: 'ses-123',
        timestamp: '2026-04-02T00:00:00Z',
        destination: ['user@example.com'],
      },
      delivery: {
        timestamp: '2026-04-02T00:00:05Z',
        recipients: ['user@example.com'],
        processingTimeMillis: 100,
        smtpResponse: '250 ok',
      },
    });

    const first = await handler.handleSnsNotification(envelope, { requestId: 'req_delivery' });
    const second = await handler.handleSnsNotification(envelope, { requestId: 'req_delivery_repeat' });

    expect(first).toMatchObject({
      accepted: true,
      verified: true,
      matchedTransactions: 1,
      createdSuppressionEntries: 0,
      orphanEvents: 0,
    });
    expect(second).toMatchObject({
      accepted: true,
      verified: true,
      matchedTransactions: 1,
      createdSuppressionEntries: 0,
      orphanEvents: 0,
    });
    expect(adapter.records('email_transactions')[0].status).toBe('delivered');
    expect(adapter.records('communication_events')).toHaveLength(1);
    expect(adapter.records('communication_events')[0]).toMatchObject({
      referenceId: 'tx-1',
      eventType: 'delivered',
      provider: 'aws-ses',
      recipientEmail: 'user@example.com',
      metadata: {
        providerMessageId: 'ses-123',
        orphaned: false,
        processingTimeMillis: 100,
        smtpResponse: '250 ok',
      },
    });
    expect(logger.info).toHaveBeenCalled();
    expect(logger.info.mock.calls[0][0]).toMatchObject({
      requestId: 'req_delivery',
      operation: 'webhook.process',
      provider: 'aws-ses',
      snsMessageId: 'sns-1',
      status: 'accepted',
      verificationResult: 'verified',
      matchedTransactions: 1,
      orphanEvents: 0,
      createdSuppressionEntries: 0,
    });
  });

  it('updates bounce and complaint lifecycle state, suppression state, and keeps duplicate complaints idempotent', async () => {
    await seedEmailTransaction(adapter);
    const handler = new AwsSesWebhookHandler(db, suppressionManager, {
      verifier: createVerifier(),
    });

    const bounceResult = await handler.handleSnsNotification(
      createEnvelope({
        notificationType: 'Bounce',
        mail: {
          messageId: 'ses-123',
          timestamp: '2026-04-02T00:00:00Z',
          destination: ['user@example.com'],
        },
        bounce: {
          timestamp: '2026-04-02T00:00:07Z',
          feedbackId: 'fb-1',
          bounceType: 'Permanent',
          bounceSubType: 'General',
          bouncedRecipients: [
            {
              emailAddress: 'user@example.com',
              diagnosticCode: '550 mailbox unavailable',
            },
          ],
        },
      })
    );

    expect(bounceResult).toMatchObject({
      matchedTransactions: 1,
      createdSuppressionEntries: 1,
      orphanEvents: 0,
    });
    expect(adapter.records('email_transactions')[0].status).toBe('bounced');
    expect(adapter.records('communication_events')[0]).toMatchObject({
      referenceId: 'tx-1',
      eventType: 'bounced',
      metadata: {
        providerMessageId: 'ses-123',
        orphaned: false,
        bounceType: 'Permanent',
      },
    });
    expect(adapter.records<any>('communication_events')[0].eventTimestamp.toISOString())
      .toBe('2026-04-02T00:00:07.000Z');
    expect(adapter.records('suppression_list')[0]).toMatchObject({
      email: 'user@example.com',
      reason: 'bounce',
      source: 'aws-ses',
    });

    const transaction = adapter.records<any>('email_transactions')[0];
    transaction.status = 'delivered';
    transaction.bouncedAt = null;
    transaction.complainedAt = null;
    adapter.replaceModel('email_transactions', [transaction]);
    adapter.clearModel('suppression_list');
    adapter.clearModel('communication_events');

    const complaintEnvelope = createEnvelope(
      {
        notificationType: 'Complaint',
        mail: {
          messageId: 'ses-123',
          timestamp: '2026-04-02T00:00:00Z',
          destination: ['user@example.com'],
        },
        complaint: {
          timestamp: '2026-04-02T00:00:09Z',
          feedbackId: 'cp-1',
          complaintFeedbackType: 'abuse',
          complaintSubType: 'OnAccountSuppressionList',
          userAgent: 'Amazon SES',
          complainedRecipients: [{ emailAddress: 'user@example.com' }],
        },
      },
      { MessageId: 'sns-complaint' }
    );

    const complaintFirst = await handler.handleSnsNotification(complaintEnvelope);
    const complaintSecond = await handler.handleSnsNotification(complaintEnvelope);

    expect(complaintFirst).toMatchObject({
      matchedTransactions: 1,
      createdSuppressionEntries: 1,
      orphanEvents: 0,
    });
    expect(complaintSecond).toMatchObject({
      matchedTransactions: 1,
      createdSuppressionEntries: 0,
      orphanEvents: 0,
    });
    expect(adapter.records('email_transactions')[0].status).toBe('complained');
    expect(adapter.records('communication_events')).toHaveLength(1);
    expect(adapter.records('communication_events')[0]).toMatchObject({
      referenceId: 'tx-1',
      eventType: 'complained',
      metadata: {
        providerMessageId: 'ses-123',
        orphaned: false,
        complaintFeedbackType: 'abuse',
      },
    });
    expect(adapter.records('suppression_list')).toHaveLength(1);
    expect(adapter.records('suppression_list')[0]).toMatchObject({
      email: 'user@example.com',
      reason: 'complaint',
      source: 'aws-ses',
    });
  });

  it('records unmatched complaints as deterministic orphan events instead of unknown references', async () => {
    const handler = new AwsSesWebhookHandler(db, suppressionManager, {
      verifier: createVerifier(),
    });

    const result = await handler.handleSnsNotification(
      createEnvelope(
        {
          notificationType: 'Complaint',
          mail: {
            messageId: 'ses-missing',
            timestamp: '2026-04-02T00:00:00Z',
            destination: ['user@example.com'],
          },
          complaint: {
            complainedRecipients: [{ emailAddress: 'user@example.com' }],
          },
        },
        { MessageId: 'sns-orphan' }
      )
    );

    expect(result).toMatchObject({
      matchedTransactions: 0,
      createdSuppressionEntries: 1,
      orphanEvents: 1,
    });
    expect(adapter.records('communication_events')).toHaveLength(1);
    expect(adapter.records('communication_events')[0]).toMatchObject({
      referenceId: 'provider:aws-ses:ses-missing',
      eventType: 'complained',
      metadata: {
        providerMessageId: 'ses-missing',
        orphaned: true,
      },
      recipientEmail: 'user@example.com',
    });
    expect(adapter.records('suppression_list')[0]).toMatchObject({
      email: 'user@example.com',
      reason: 'complaint',
      source: 'aws-ses',
    });
  });

  it('returns canonical webhook and admin envelopes from the router', async () => {
    const client = sendfn({
      database: adapter as any,
      enableApi: true,
      apiConfig: {
        adminKey: 'top-secret',
      },
    } satisfies SendfnConfig);
    const webhookHandler = client.getWebhookHandlers().awsSes as any;
    webhookHandler.verifier = createVerifier();

    const successResponse = await (client.router as any).handle(
      new Request('http://localhost/webhooks/aws-ses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_route_success',
        },
        body: JSON.stringify(
          createEnvelope({
            notificationType: 'Delivery',
            mail: {
              messageId: 'ses-route',
              timestamp: '2026-04-02T00:00:00Z',
              destination: ['user@example.com'],
            },
            delivery: {
              timestamp: '2026-04-02T00:00:05Z',
              recipients: ['user@example.com'],
            },
          })
        ),
      })
    );

    expect(successResponse.status).toBe(200);
    await expect(successResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        accepted: true,
        verified: true,
      },
      error: null,
      meta: {
        requestId: 'req_route_success',
        version: 'v0',
      },
    });

    const invalidResponse = await (client.router as any).handle(
      new Request('http://localhost/webhooks/aws-ses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_route_invalid',
        },
        body: JSON.stringify(
          createEnvelope(
            {
              notificationType: 'Delivery',
              mail: {
                messageId: 'ses-route-invalid',
                timestamp: '2026-04-02T00:00:00Z',
                destination: ['user@example.com'],
              },
              delivery: {
                timestamp: '2026-04-02T00:00:05Z',
                recipients: ['user@example.com'],
              },
            },
            {
              Signature: 'invalid',
            }
          )
        ),
      })
    );

    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      ok: false,
      data: null,
      error: {
        code: 'SENDFN_WEBHOOK_SIGNATURE_INVALID',
        message: 'SNS signature verification failed',
        retryable: false,
      },
      meta: {
        requestId: 'req_route_invalid',
        version: 'v0',
      },
    });

    const unauthorizedResponse = await (client.router as any).handle(
      new Request('http://localhost/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_admin_unauthorized',
        },
        body: JSON.stringify({
          userId: 'user-1',
          to: 'user@example.com',
          subject: 'Hello',
          html: '<p>Hello</p>',
        }),
      })
    );

    expect(unauthorizedResponse.status).toBe(401);
    await expect(unauthorizedResponse.json()).resolves.toMatchObject({
      ok: false,
      data: null,
      error: {
        code: 'SENDFN_UNAUTHORIZED',
        message: 'Unauthorized',
        retryable: false,
      },
      meta: {
        requestId: 'req_admin_unauthorized',
        version: 'v0',
      },
    });
  });
});
