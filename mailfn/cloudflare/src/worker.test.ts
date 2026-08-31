import { describe, expect, it, vi } from 'vitest';

import { MailFnError, type MailFnJob, type Message, type ParseJob, type WebhookDeliveryJob } from '@mailfn/core';

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  ForwardableEmailMessage,
  MailFnCloudflareEnv,
  QueueMessage,
  R2Bucket,
} from './index.js';
import {
  createMailFnCloudflareHandlers,
  deriveCloudflareDeliveryId,
  parseCloudflareAuthenticationResults,
  permanentInboundFailure,
  processMailFnQueueBatch,
} from './worker.js';
import { CloudflareMailFnQueue } from './queue.js';

class FakeStatement implements D1PreparedStatement {
  public constructor(private readonly query: string, private readonly row: { data_json: string } | null) {}
  bind(): D1PreparedStatement { return this; }
  async first<T>(): Promise<T | null> {
    return this.query.includes('mailfn_messages WHERE id') ? this.row as T | null : null;
  }
  async all<T>(): Promise<D1Result<T>> { return { success: true, results: [] }; }
  async run<T>(): Promise<D1Result<T>> {
    return { success: true, results: [], meta: { changes: this.query.includes('UPDATE mailfn_messages') ? 1 : 0 } };
  }
}

class FakeDatabase implements D1Database {
  public constructor(private readonly message?: Message) {}
  prepare(query: string): D1PreparedStatement {
    return new FakeStatement(query, this.message ? { data_json: JSON.stringify(this.message) } : null);
  }
  async batch<T>(): Promise<Array<D1Result<T>>> { return []; }
  async exec(): Promise<{ count: number; duration: number }> { return { count: 0, duration: 0 }; }
}

function env(database: D1Database): MailFnCloudflareEnv {
  return {
    MAILFN_DB: database,
    MAILFN_OBJECTS: {
      async put() { return undefined; },
      async get() { return null; },
      async delete() { return undefined; },
    } satisfies R2Bucket,
    MAILFN_PARSE_QUEUE: { async send() { return undefined; } },
    MAILFN_WEBHOOK_QUEUE: { async send() { return undefined; } },
    MAILFN_DOMAIN: 'inbound.example.com',
    MAILFN_SECRET_KEY: '00'.repeat(32),
  };
}

describe('MailFn Cloudflare handlers', () => {
  it('does not permanently reject retryable hourly rate limits', () => {
    expect(permanentInboundFailure(new MailFnError({
      code: 'MAILFN_RATE_LIMITED', message: 'retry later', status: 429, retryable: true,
    }))).toBe(false);
    expect(permanentInboundFailure(new MailFnError({
      code: 'MAILFN_UNKNOWN_RECIPIENT', message: 'unknown', status: 404,
    }))).toBe(true);
  });

  it('permanently rejects unknown recipients without exposing the address', async () => {
    const reject = vi.fn();
    let rawAccessed = false;
    const raw = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close(); } });
    const message = {
      from: 'sender@example.com',
      to: 'unknown@inbound.example.com',
      headers: new Headers({ 'message-id': '<delivery@example.com>' }),
      get raw() { rawAccessed = true; return raw; },
      rawSize: 21,
      setReject: reject,
    } satisfies ForwardableEmailMessage;
    await createMailFnCloudflareHandlers({ migrate: false }).email(message, env(new FakeDatabase()), { waitUntil() {} });
    expect(reject).toHaveBeenCalledWith('Recipient unavailable');
    expect(reject.mock.calls[0]?.[0]).not.toContain(message.to);
    expect(rawAccessed).toBe(false);
  });

  it('derives retry-stable delivery identity from envelope and raw evidence instead of Message-ID', async () => {
    const first = new TextEncoder().encode('Message-ID: <shared@example.com>\r\nSubject: one\r\n\r\nfirst');
    const second = new TextEncoder().encode('Message-ID: <shared@example.com>\r\nSubject: two\r\n\r\nsecond');
    const firstId = await deriveCloudflareDeliveryId('SENDER@example.com', 'Inbox@example.com', first);
    await expect(deriveCloudflareDeliveryId('sender@example.com', 'inbox@example.com', first)).resolves.toBe(firstId);
    await expect(deriveCloudflareDeliveryId('sender@example.com', 'inbox@example.com', second)).resolves.not.toBe(firstId);
    await expect(deriveCloudflareDeliveryId('other@example.com', 'inbox@example.com', first)).resolves.not.toBe(firstId);
    expect(firstId).toMatch(/^cf_sha256_[a-f0-9]{64}$/);
  });

  it('prefers the MAIL FROM SPF result when Cloudflare also reports a HELO result', () => {
    const parsed = parseCloudflareAuthenticationResults(
      'mx.cloudflare.net; dkim=pass header.d=gmail.com; dmarc=pass header.from=gmail.com; '
      + 'spf=none smtp.helo=mail.example.com; spf=pass smtp.mailfrom=sender@example.com; arc=pass',
    );
    expect(parsed).toMatchObject({ spf: 'pass', dkim: 'pass', dmarc: 'pass', arc: 'pass' });
  });

  it('routes parse and webhook jobs to separate queue bindings', async () => {
    const parseJobs: ParseJob[] = [];
    const webhookJobs: WebhookDeliveryJob[] = [];
    const queue = new CloudflareMailFnQueue(
      { async send(job) { parseJobs.push(job); } },
      { async send(job) { webhookJobs.push(job); } },
    );
    const parseJob = {
      id: 'parse-job', version: 1, type: 'mailfn.parse', projectId: 'project', inboxId: 'inbox',
      messageId: 'message', rawObjectKey: 'raw', attempt: 1, createdAt: '2026-08-31T00:00:00.000Z',
    } satisfies ParseJob;
    const webhookJob = {
      id: 'webhook-job', version: 1, type: 'mailfn.webhook-delivery', projectId: 'project', eventId: 'event',
      webhookId: 'webhook', deliveryId: 'delivery', expectedUpdatedAt: '2026-08-31T00:00:00.000Z',
      createdAt: '2026-08-31T00:00:00.000Z',
    } satisfies WebhookDeliveryJob;

    await queue.enqueue(parseJob);
    await queue.enqueueWebhook(webhookJob);

    expect(parseJobs).toEqual([parseJob]);
    expect(webhookJobs).toEqual([webhookJob]);
  });

  it('processes parse work without waiting for a blocked webhook in a mixed batch', async () => {
    let releaseWebhook!: () => void;
    let webhookStarted!: () => void;
    const webhookGate = new Promise<void>((resolve) => { releaseWebhook = resolve; });
    const started = new Promise<void>((resolve) => { webhookStarted = resolve; });
    const parseMessage = vi.fn(async () => ({} as Message));
    const processWebhookDelivery = vi.fn(async () => {
      webhookStarted();
      await webhookGate;
      return true;
    });
    const webhook = {
      id: 'webhook-message', attempts: 1, ack: vi.fn(), retry: vi.fn(),
      body: {
        id: 'webhook-job', version: 1, type: 'mailfn.webhook-delivery', projectId: 'project', eventId: 'event',
        webhookId: 'webhook', deliveryId: 'delivery', expectedUpdatedAt: '2026-08-31T00:00:00.000Z',
        createdAt: '2026-08-31T00:00:00.000Z',
      } satisfies WebhookDeliveryJob,
    } satisfies QueueMessage<WebhookDeliveryJob>;
    const parse = {
      id: 'parse-message', attempts: 1, ack: vi.fn(), retry: vi.fn(),
      body: {
        id: 'parse-job', version: 1, type: 'mailfn.parse', projectId: 'project', inboxId: 'inbox',
        messageId: 'message', rawObjectKey: 'raw', attempt: 1, createdAt: '2026-08-31T00:00:00.000Z',
      } satisfies ParseJob,
    } satisfies QueueMessage<ParseJob>;

    const processing = processMailFnQueueBatch(
      { parseMessage, processWebhookDelivery },
      { messages: [webhook, parse] as QueueMessage<MailFnJob>[] },
    );
    await started;
    await vi.waitFor(() => expect(parseMessage).toHaveBeenCalledOnce());
    expect(parse.ack).toHaveBeenCalledOnce();
    expect(webhook.ack).not.toHaveBeenCalled();

    releaseWebhook();
    await processing;
    expect(webhook.ack).toHaveBeenCalledOnce();
  });

  it('retries transient Queue parse failures with bounded exponential delay', async () => {
    const stored = {
      id: 'msg_1', projectId: 'prj_1', inboxId: 'inb_1', providerDeliveryId: 'delivery_1',
      envelopeFrom: 'sender@example.com', envelopeTo: 'target@inbound.example.com', from: [{ address: 'sender@example.com' }],
      to: [{ address: 'target@inbound.example.com' }], cc: [], bcc: [], replyTo: [], subject: 'Subject',
      receivedAt: '2026-08-10T00:00:00.000Z', headers: {}, rawObjectKey: 'missing',
      rawRetentionExpiresAt: '2026-08-11T00:00:00.000Z', attachmentRetentionExpiresAt: '2026-08-11T00:00:00.000Z',
      references: [], authenticationResults: {}, sizeBytes: 10, status: 'pending', labels: [],
      retentionExpiresAt: '2026-08-11T00:00:00.000Z', createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
    } satisfies Message;
    const retry = vi.fn();
    const ack = vi.fn();
    const queued = {
      id: 'queue_1', attempts: 3, ack, retry,
      body: {
        id: 'job_1', version: 1, type: 'mailfn.parse', projectId: stored.projectId, inboxId: stored.inboxId,
        messageId: stored.id, rawObjectKey: stored.rawObjectKey, attempt: 1, createdAt: stored.createdAt,
      } satisfies ParseJob,
    } satisfies QueueMessage<ParseJob>;
    await createMailFnCloudflareHandlers({ migrate: false }).queue({ messages: [queued] }, env(new FakeDatabase(stored)));
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 8 });
    expect(ack).not.toHaveBeenCalled();
  });

  it('schedules retention plus parse and webhook reconciliation', async () => {
    let work: Promise<unknown> | undefined;
    await createMailFnCloudflareHandlers({ migrate: false }).scheduled({}, env(new FakeDatabase()), {
      waitUntil(promise) { work = promise; },
    });
    await expect(work).resolves.toBeUndefined();
  });
});
