import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Attachment,
  AwsSesAdapter,
  EmailProviderError,
  SendEmailParams,
  SendfnDatabaseAdapter,
  ValidationError,
} from '../src';
import { EmailService } from '../src/email/service';
import { TemplateEngine, TemplateRegistry } from '../src/templates/engine';
import { StrongMockAdapter } from './mock-adapter';
import { v5 as uuidv5 } from 'uuid';

const IDEMPOTENCY_NAMESPACE = 'f6ff2eac-697c-4df6-8d11-e5c37f652f53';

class MockProvider {
  readonly name = 'mock-email';
  readonly capabilities = {
    supportsIdempotency: true,
    supportsTemplates: true,
    supportsAttachments: true,
    supportsBulkSend: true,
    supportsScheduling: false,
    maxRecipientsPerEmail: 50,
    maxAttachmentSize: 10 * 1024 * 1024,
  };

  sendCalls = 0;
  responses: any[] = [];
  requests: any[] = [];
  handler?: (request: any) => Promise<any>;

  async initialize(): Promise<void> {}
  async isHealthy(): Promise<boolean> { return true; }
  async close(): Promise<void> {}
  validateEmail(): boolean { return true; }
  async sendBulkEmail(): Promise<any[]> { return []; }

  async sendEmail(request: any): Promise<any> {
    this.sendCalls += 1;
    this.requests.push(request);
    if (this.handler) return this.handler(request);
    return (
      this.responses.shift() || {
        success: true,
        providerMessageId: 'msg-1',
        timestamp: new Date('2026-01-01T00:00:00Z'),
      }
    );
  }
}

describe('EmailService', () => {
  let provider: MockProvider;
  let rawAdapter: StrongMockAdapter;
  let db: SendfnDatabaseAdapter;
  let registry: TemplateRegistry;
  let service: EmailService;

  beforeEach(() => {
    provider = new MockProvider();
    rawAdapter = new StrongMockAdapter();
    db = new SendfnDatabaseAdapter(rawAdapter as any);
    registry = new TemplateRegistry();
    service = new EmailService(
      provider as any,
      db,
      new TemplateEngine(),
      registry,
      { fromEmail: 'noreply@example.com' },
      { suppressionEnabled: true, retryAttempts: 3, retryDelay: 0 }
    );
  });

  it('short-circuits suppressed recipients before provider invocation', async () => {
    await db.addToSuppressionList({
      email: 'user@example.com',
      reason: 'manual',
      source: 'manual',
      bounceType: null,
      metadata: {},
      suppressedAt: new Date(),
    });

    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })
    ).rejects.toMatchObject({
      code: 'SENDFN_SUPPRESSED',
      message: 'Recipient is suppressed',
    });

    expect(provider.sendCalls).toBe(0);
  });

  it('checks copied and blind-copied recipients against suppressions', async () => {
    for (const email of ['cc@example.com', 'bcc@example.com']) {
      await db.addToSuppressionList({
        email,
        reason: 'manual',
        source: 'manual',
        bounceType: null,
        metadata: {},
        suppressedAt: new Date(),
      });
    }

    await expect(service.sendEmail({
      userId: 'user-1',
      to: 'to@example.com',
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    })).rejects.toMatchObject({ code: 'SENDFN_SUPPRESSED' });
    expect(provider.sendCalls).toBe(0);
  });

  it('forwards tags and honors disabled event tracking', async () => {
    service = new EmailService(
      provider as any,
      db,
      new TemplateEngine(),
      registry,
      { fromEmail: 'noreply@example.com' },
      { eventTracking: false, retryAttempts: 1, retryDelay: 0 }
    );
    await service.sendEmail({
      userId: 'user-1',
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      tags: ['transactional'],
    });
    expect(provider.requests[0].tags).toEqual({ transactional: 'transactional' });
    expect(rawAdapter.records('communication_events')).toHaveLength(0);
  });

  it('does not rewrite an accepted email as failed when event persistence fails', async () => {
    vi.spyOn(db, 'recordEvent').mockRejectedValueOnce(new Error('event store unavailable'));
    await expect(service.sendEmail({
      userId: 'user-1',
      to: 'user@example.com',
      subject: 'Hello',
      text: 'body',
    })).rejects.toThrow('event store unavailable');
    expect(rawAdapter.records('email_transactions')).toEqual([
      expect.objectContaining({ status: 'sent', providerMessageId: 'msg-1' }),
    ]);
    expect(rawAdapter.records('communication_events')).toHaveLength(0);
  });

  it('fails with stable template and validation errors before provider invocation', async () => {
    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: 'user@example.com',
        templateId: 'missing-template',
      } as SendEmailParams)
    ).rejects.toMatchObject({
      code: 'SENDFN_TEMPLATE_NOT_FOUND',
      message: 'Template `missing-template` was not found',
    });

    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: 'user@example.com',
      } as SendEmailParams)
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
    });

    expect(provider.sendCalls).toBe(0);
  });

  it('rejects sender injection and reserved custom headers before provider invocation', async () => {
    await expect(service.sendEmail({
      userId: 'user-1', from: 'agent@example.com\r\nBcc: attacker@example.com',
      to: 'user@example.com', subject: 'Hello', text: 'body',
    })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.sendEmail({
      userId: 'user-1', from: 'agent@example.com', to: 'user@example.com',
      subject: 'Hello', text: 'body', headers: { To: 'attacker@example.com' },
    })).rejects.toBeInstanceOf(ValidationError);
    expect(provider.sendCalls).toBe(0);
  });

  it('uses unambiguous idempotency tuples and replays before mutable suppression checks', async () => {
    const first = await service.sendEmail({
      idempotencyKey: 'c', userId: 'a:b', to: 'user@example.com', subject: 'One', text: 'body',
    });
    const second = await service.sendEmail({
      idempotencyKey: 'b:c', userId: 'a', to: 'user@example.com', subject: 'Two', text: 'body',
    });
    expect(first.id).not.toBe(second.id);
    expect(provider.sendCalls).toBe(2);

    await db.addToSuppressionList({
      email: 'user@example.com', reason: 'manual', source: 'manual', bounceType: null,
      metadata: {}, suppressedAt: new Date(),
    });
    await expect(service.sendEmail({
      idempotencyKey: 'c', userId: 'a:b', to: 'user@example.com', subject: '', text: '',
    })).resolves.toMatchObject({ id: first.id, status: 'sent' });
    expect(provider.sendCalls).toBe(2);
  });

  it('namespaces provider idempotency keys by user', async () => {
    await service.sendEmail({
      idempotencyKey: 'shared-key', userId: 'user-a', to: 'user@example.com', subject: 'One', text: 'body',
    });
    await service.sendEmail({
      idempotencyKey: 'shared-key', userId: 'user-b', to: 'user@example.com', subject: 'Two', text: 'body',
    });

    expect(provider.requests.map((request) => request.idempotencyKey)).toEqual([
      uuidv5(JSON.stringify(['user-a', 'shared-key']), IDEMPOTENCY_NAMESPACE),
      uuidv5(JSON.stringify(['user-b', 'shared-key']), IDEMPOTENCY_NAMESPACE),
    ]);
  });

  it('enforces provider limits before sending', async () => {
    const recipients = Array.from({ length: 51 }, (_, index) => `user${index}@example.com`);
    const oversized: Attachment = {
      filename: 'big.bin',
      content: Buffer.alloc(11 * 1024 * 1024),
    };

    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: recipients,
        subject: 'Hello',
        html: '<p>Hello</p>',
      })
    ).rejects.toMatchObject({
      code: 'SENDFN_PROVIDER_LIMIT',
      message: 'Email request exceeds provider limits',
    });

    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
        attachments: [oversized],
      })
    ).rejects.toBeInstanceOf(EmailProviderError);

    expect(provider.sendCalls).toBe(0);
  });

  it('uses bounded retry behavior for retryable failures and does not retry non-retryable ones', async () => {
    provider.responses = [
      { success: false, timestamp: new Date(), error: { code: 'Throttling', message: 'slow down', retryable: true } },
      { success: false, timestamp: new Date(), error: { code: 'Throttling', message: 'slow down', retryable: true } },
      { success: true, providerMessageId: 'ses-123', timestamp: new Date('2026-01-01T00:00:00Z') },
    ];

    const sent = await service.sendEmail({
      userId: 'user-1',
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    });

    expect(provider.sendCalls).toBe(3);
    expect(sent.status).toBe('sent');
    expect(sent.providerMessageId).toBe('ses-123');

    provider.sendCalls = 0;
    provider.responses = [
      { success: false, timestamp: new Date(), error: { code: 'BadRequest', message: 'nope', retryable: false } },
    ];

    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })
    ).rejects.toMatchObject({
      code: 'BadRequest',
    });
    expect(provider.sendCalls).toBe(1);
  });

  it('preserves BCC as an SES raw-send envelope destination without exposing a Bcc header', async () => {
    const adapter = new AwsSesAdapter({ accessKeyId: 'key', secretAccessKey: 'secret', region: 'us-east-1' });
    const inputs: any[] = [];
    (adapter as any).sesClient = {
      async send(command: { input: unknown }) {
        inputs.push(command.input);
        return { MessageId: 'ses-raw' };
      },
    };
    await expect(adapter.sendEmail({
      idempotencyKey: 'mailfn:draft:1', from: 'agent@example.com', to: ['to@example.com'],
      cc: ['cc@example.com'], bcc: ['hidden@example.com'], subject: 'Raw', text: 'body',
      tags: { transactional: 'transactional' },
      attachments: [{ filename: 'proof"\r\nX-Injected: yes;.txt', content: Buffer.from('proof') }],
    })).resolves.toMatchObject({ success: true, providerMessageId: 'ses-raw' });
    expect(inputs[0].Destinations).toEqual(['to@example.com', 'cc@example.com', 'hidden@example.com']);
    expect(inputs[0].Tags).toEqual([{ Name: 'transactional', Value: 'transactional' }]);
    const raw = Buffer.from(inputs[0].RawMessage.Data).toString('utf8');
    expect(raw).not.toContain('\nBcc:');
    expect(raw).not.toContain('\nX-Injected:');
    expect(raw).toContain('filename="proof___X-Injected: yes_.txt"');
  });

  it('forwards tags through the SES simple-send path', async () => {
    const adapter = new AwsSesAdapter({ accessKeyId: 'key', secretAccessKey: 'secret', region: 'us-east-1' });
    const inputs: any[] = [];
    (adapter as any).sesClient = {
      async send(command: { input: unknown }) {
        inputs.push(command.input);
        return { MessageId: 'ses-simple' };
      },
    };
    await adapter.sendEmail({
      from: 'agent@example.com', to: ['to@example.com'], subject: 'Simple', text: 'body',
      tags: { campaign: 'spring' },
    });
    expect(inputs[0].Tags).toEqual([{ Name: 'campaign', Value: 'spring' }]);
  });

  it('surfaces retry exhaustion with a stable code', async () => {
    provider.responses = [
      { success: false, timestamp: new Date(), error: { code: 'Throttling', message: 'slow down', retryable: true } },
      { success: false, timestamp: new Date(), error: { code: 'Throttling', message: 'slow down', retryable: true } },
      { success: false, timestamp: new Date(), error: { code: 'Throttling', message: 'slow down', retryable: true } },
    ];

    await expect(
      service.sendEmail({
        userId: 'user-1',
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
      })
    ).rejects.toMatchObject({
      code: 'SENDFN_PROVIDER_RETRY_EXHAUSTED',
      message: 'Email provider retry limit exhausted',
    });

    expect(provider.sendCalls).toBe(3);
  });

  it('preserves sender, reply, headers, attachments, and durable idempotency', async () => {
    let release!: () => void;
    provider.handler = async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { success: true, providerMessageId: 'provider-idempotent', timestamp: new Date('2026-01-01T00:00:00Z') };
    };
    const input: SendEmailParams = {
      idempotencyKey: 'mailfn:draft:1', userId: 'project-1', from: 'agent@example.com', replyTo: 'agent@example.com',
      to: 'recipient@example.com', subject: 'Re: Test', text: 'Reply',
      headers: { 'In-Reply-To': '<source@example.com>', References: '<source@example.com>' },
      attachments: [{ filename: 'proof.txt', content: Buffer.from('proof'), contentType: 'text/plain' }],
    };
    const first = service.sendEmail(input);
    while (provider.sendCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const concurrent = await service.sendEmail(input);
    expect(concurrent.status).toBe('pending');
    expect(provider.sendCalls).toBe(1);
    release();
    const sent = await first;
    const replay = await service.sendEmail(input);
    expect(replay.id).toBe(sent.id);
    expect(replay.providerMessageId).toBe('provider-idempotent');
    expect(provider.requests[0]).toMatchObject({
      idempotencyKey: sent.id, from: input.from, replyTo: input.replyTo,
      headers: input.headers, attachments: [expect.objectContaining({ filename: 'proof.txt' })],
    });
    expect(provider.sendCalls).toBe(1);
  });

  it('claims one stale pending transaction when the provider guarantees idempotency', async () => {
    const idempotencyKey = 'mailfn:draft:stale';
    const transactionId = uuidv5(JSON.stringify(['project-1', idempotencyKey]), IDEMPOTENCY_NAMESPACE);
    await db.createEmailTransaction({
      userId: 'project-1', to: 'recipient@example.com', from: 'agent@example.com', subject: 'Recover',
      templateId: null, templateData: null, provider: provider.name, providerMessageId: null, status: 'pending',
      sentAt: null, deliveredAt: null, bouncedAt: null, complainedAt: null, metadata: { idempotencyKey },
    }, transactionId);
    const [record] = rawAdapter.records<any>('email_transactions');
    record.updatedAt = new Date(Date.now() - 10 * 60 * 1000);

    const input: SendEmailParams = {
      idempotencyKey, userId: 'project-1', from: 'agent@example.com', to: 'recipient@example.com',
      subject: 'Recover', text: 'body',
    };
    const [claimed, concurrent] = await Promise.all([service.sendEmail(input), service.sendEmail(input)]);
    expect([claimed.status, concurrent.status]).toContain('sent');
    expect(provider.sendCalls).toBe(1);
    await expect(db.getEmailTransaction(transactionId)).resolves.toMatchObject({ status: 'sent', providerMessageId: 'msg-1' });
  });

  it('rechecks suppression before reclaiming a stale pending transaction', async () => {
    const idempotencyKey = 'mailfn:draft:suppressed-reclaim';
    const transactionId = uuidv5(JSON.stringify(['project-1', idempotencyKey]), IDEMPOTENCY_NAMESPACE);
    await db.createEmailTransaction({
      userId: 'project-1', to: 'recipient@example.com', from: 'agent@example.com', subject: 'Recover',
      templateId: null, templateData: null, provider: provider.name, providerMessageId: null, status: 'pending',
      sentAt: null, deliveredAt: null, bouncedAt: null, complainedAt: null, metadata: { idempotencyKey },
    }, transactionId);
    const [record] = rawAdapter.records<any>('email_transactions');
    record.updatedAt = new Date(Date.now() - 10 * 60 * 1000);
    await db.addToSuppressionList({
      email: 'recipient@example.com', reason: 'manual', source: 'test', bounceType: null,
      metadata: {}, suppressedAt: new Date(),
    });

    await expect(service.sendEmail({
      idempotencyKey, userId: 'project-1', from: 'agent@example.com', to: 'recipient@example.com',
      subject: 'Recover', text: 'body',
    })).rejects.toMatchObject({ code: 'SENDFN_SUPPRESSED' });
    expect(provider.sendCalls).toBe(0);
  });

  it('closes an ambiguous stale pending transaction without duplicating through a non-idempotent provider', async () => {
    provider.capabilities.supportsIdempotency = false;
    const idempotencyKey = 'mailfn:draft:ambiguous';
    const transactionId = uuidv5(JSON.stringify(['project-1', idempotencyKey]), IDEMPOTENCY_NAMESPACE);
    await db.createEmailTransaction({
      userId: 'project-1', to: 'recipient@example.com', from: 'agent@example.com', subject: 'Ambiguous',
      templateId: null, templateData: null, provider: provider.name, providerMessageId: null, status: 'pending',
      sentAt: null, deliveredAt: null, bouncedAt: null, complainedAt: null, metadata: { idempotencyKey },
    }, transactionId);
    const [record] = rawAdapter.records<any>('email_transactions');
    record.updatedAt = new Date(Date.now() - 10 * 60 * 1000);

    await expect(service.sendEmail({
      idempotencyKey, userId: 'project-1', from: 'agent@example.com', to: 'recipient@example.com',
      subject: 'Ambiguous', text: 'body',
    })).resolves.toMatchObject({
      status: 'failed', metadata: { idempotencyState: 'ambiguous', failureCode: 'SENDFN_AMBIGUOUS_PENDING' },
    });
    expect(provider.sendCalls).toBe(0);
  });
});
