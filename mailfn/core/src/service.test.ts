import { describe, expect, it, vi } from 'vitest';

import type {
  MailFnClock,
  MailFnDomainAdapter,
  MailFnMimeParser,
  MailFnQueue,
  MailFnSendAdapter,
  MailFnWebhookDispatcher,
  ParseJob,
  ParsedMessage,
  ProjectQuota,
  PublicPlatformPolicy,
  RetentionPolicy,
} from './index.js';
import {
  MailFn,
  MailFnError,
  MemoryMailFnObjectStore,
  MemoryMailFnStore,
  noOpSecretProtector,
} from './index.js';

class MutableClock implements MailFnClock {
  public constructor(public value = new Date('2026-08-10T00:00:00.000Z')) {}
  now(): Date { return new Date(this.value); }
  sleep(ms: number): Promise<void> { this.value = new Date(this.value.getTime() + ms); return Promise.resolve(); }
  advance(ms: number): void { this.value = new Date(this.value.getTime() + ms); }
}

class JsonMimeParser implements MailFnMimeParser {
  async parse(raw: Uint8Array): Promise<ParsedMessage> {
    const input = JSON.parse(new TextDecoder().decode(raw)) as Partial<ParsedMessage>;
    return {
      from: input.from ?? [{ address: 'sender@example.com' }],
      to: input.to ?? [{ address: 'target@inbound.example.com' }],
      cc: input.cc ?? [], bcc: input.bcc ?? [], replyTo: input.replyTo ?? [],
      subject: input.subject ?? 'Verification code 123456',
      text: input.text ?? 'Your verification code is 123456',
      html: input.html,
      headers: input.headers ?? {},
      internetMessageId: input.internetMessageId,
      inReplyTo: input.inReplyTo,
      references: input.references ?? [],
      authenticationResults: input.authenticationResults,
      attachments: (input.attachments ?? []).map((entry) => ({
        ...entry,
        content: typeof entry.content === 'string'
          ? new TextEncoder().encode(entry.content)
          : new Uint8Array(Object.values(entry.content as unknown as Record<string, number>)),
      })),
    };
  }
}

class FailingDeleteObjectStore extends MemoryMailFnObjectStore {
  public failDeletes = true;

  override async delete(key: string): Promise<void> {
    if (this.failDeletes) throw new Error('object store unavailable');
    await super.delete(key);
  }
}

class NoncriticalFailureStore extends MemoryMailFnStore {
  override async appendEvent(): Promise<void> { throw new Error('event store unavailable'); }
  override async appendUsage(): Promise<void> { throw new Error('usage store unavailable'); }
}

class FailingAttachmentStore extends MemoryMailFnStore {
  override async saveAttachment(): Promise<void> { throw new Error('attachment metadata unavailable'); }
}

class FailingAtomicInboxStore extends MemoryMailFnStore {
  public failInboxCreation = false;
  override async createInboxWithCredential(...args: Parameters<MemoryMailFnStore['createInboxWithCredential']>): Promise<void> {
    if (this.failInboxCreation) throw new Error('atomic inbox transaction failed');
    await super.createInboxWithCredential(...args);
  }
}

class FailingAtomicProjectStore extends MemoryMailFnStore {
  public failProjectCreation = true;
  override async createProjectWithCredential(...args: Parameters<MemoryMailFnStore['createProjectWithCredential']>): Promise<void> {
    if (this.failProjectCreation) throw new Error('atomic project transaction failed');
    await super.createProjectWithCredential(...args);
  }
}

class FailingActiveDomainStore extends MemoryMailFnStore {
  override async saveDomain(domain: Parameters<MemoryMailFnStore['saveDomain']>[0]): Promise<void> {
    if (domain.status === 'active') throw new Error('domain state unavailable');
    await super.saveDomain(domain);
  }
}

class FailingDisabledDomainStore extends MemoryMailFnStore {
  override async saveDomain(domain: Parameters<MemoryMailFnStore['saveDomain']>[0]): Promise<void> {
    if (domain.status === 'disabled') throw new Error('disabled state unavailable');
    await super.saveDomain(domain);
  }
}

class RetryableCancelStore extends MemoryMailFnStore {
  public releaseAttempts = 0;
  override async releaseStorage(reservationId: string): Promise<void> {
    this.releaseAttempts += 1;
    if (this.releaseAttempts === 1) throw new Error('transient release failure');
    await super.releaseStorage(reservationId);
  }
}

class ConcurrentRevokeStore extends MemoryMailFnStore {
  public revokeOnTouch = false;
  override async touchCredentialIfActive(id: string, lastUsedAt: string): Promise<boolean> {
    if (this.revokeOnTouch) {
      const credential = await this.getCredential(id);
      if (credential) await this.saveCredential({ ...credential, status: 'revoked', revokedAt: lastUsedAt });
    }
    return super.touchCredentialIfActive(id, lastUsedAt);
  }
}

class QuiescingInboundStore extends MemoryMailFnStore {
  override async createInboundMessageIfInboxActive(
    message: Parameters<MemoryMailFnStore['createInboundMessageIfInboxActive']>[0],
  ): Promise<boolean> {
    const inbox = await this.getInbox(message.inboxId);
    if (inbox) await this.saveInbox({ ...inbox, status: 'deleting' });
    return super.createInboundMessageIfInboxActive(message);
  }
}

class CompletingDraftResetStore extends MemoryMailFnStore {
  override async claimDraft(...args: Parameters<MemoryMailFnStore['claimDraft']>): Promise<boolean> {
    const [draftId, expectedStatus, value] = args;
    if (expectedStatus === 'sending' && value.status === 'draft') {
      const current = await this.getDraft(draftId);
      if (current) await this.saveDraft({ ...current, status: 'sent', providerMessageId: 'concurrent-send' });
    }
    return super.claimDraft(...args);
  }
}

class RecoveringAttachmentStore extends MemoryMailFnStore {
  public failNextAttachment = true;
  override async saveAttachment(attachment: Parameters<MemoryMailFnStore['saveAttachment']>[0]): Promise<void> {
    if (this.failNextAttachment) {
      this.failNextAttachment = false;
      throw new Error('attachment metadata unavailable');
    }
    await super.saveAttachment(attachment);
  }
}

async function setup(options: {
  clock?: MutableClock;
  queue?: MailFnQueue;
  sendAdapter?: MailFnSendAdapter;
  webhookDispatcher?: MailFnWebhookDispatcher;
  domainAdapter?: MailFnDomainAdapter;
  store?: MemoryMailFnStore;
  objects?: MemoryMailFnObjectStore;
  mimeParser?: MailFnMimeParser;
  retentionPolicy?: Partial<RetentionPolicy>;
  quota?: Partial<ProjectQuota>;
  publicPlatform?: Partial<PublicPlatformPolicy>;
} = {}) {
  const store = options.store ?? new MemoryMailFnStore();
  const objects = options.objects ?? new MemoryMailFnObjectStore();
  const mailfn = new MailFn({
    store,
    objects,
    defaultDomain: 'inbound.example.com',
    mimeParser: options.mimeParser ?? new JsonMimeParser(),
    secretProtector: noOpSecretProtector,
    clock: options.clock,
    queue: options.queue,
    sendAdapter: options.sendAdapter,
    webhookDispatcher: options.webhookDispatcher,
    domainAdapter: options.domainAdapter,
    publicPlatform: options.publicPlatform,
  });
  const bootstrap = await mailfn.bootstrapProject({
    slug: 'tests',
    displayName: 'Tests',
    retentionPolicy: options.retentionPolicy,
    quota: options.quota,
  });
  const admin = await mailfn.authenticate(bootstrap.credential.token);
  return { mailfn, store, objects, admin, project: bootstrap.project };
}

async function createInbox(context: Awaited<ReturnType<typeof setup>>, localPart = 'target') {
  return context.mailfn.createInbox(context.admin, {
    projectId: context.project.id,
    kind: 'expiring',
    requestedLocalPart: localPart,
    expirySeconds: 3_600,
    idempotencyKey: `create:${localPart}`,
  });
}

function raw(input: Partial<ParsedMessage> = {}): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(input));
}

describe('MailFn domain service', () => {
  it('creates the bootstrap audit atomically and permits a clean retry after transaction failure', async () => {
    const store = new FailingAtomicProjectStore();
    const mailfn = new MailFn({
      store,
      objects: new MemoryMailFnObjectStore(),
      defaultDomain: 'inbound.example.com',
    });
    const input = { slug: 'atomic-bootstrap', displayName: 'Atomic Bootstrap' };
    await expect(mailfn.bootstrapProject(input)).rejects.toMatchObject({
      code: 'MAILFN_STORAGE_FAILED', retryable: true,
    });
    await expect(store.getProjectBySlug(input.slug)).resolves.toBeNull();

    store.failProjectCreation = false;
    const bootstrap = await mailfn.bootstrapProject(input);
    await expect(store.listAudits(bootstrap.project.id)).resolves.toMatchObject([{
      action: 'project.created', resourceId: bootstrap.project.id,
    }]);
    await expect(mailfn.authenticate(bootstrap.credential.token)).resolves.toMatchObject({
      projectId: bootstrap.project.id,
    });
  });

  it('rejects non-boolean inbox-expiry retention flags', async () => {
    await expect(setup({
      retentionPolicy: { deleteOnInboxExpiry: 'false' as unknown as boolean },
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
  });

  it('rechecks the active-inbox quota before reactivation', async () => {
    const context = await setup({ quota: { maxActiveInboxes: 1 } });
    const first = await createInbox(context, 'reactivate-first');
    await context.mailfn.updateInbox(context.admin, first.inbox.id, { status: 'disabled' });
    const second = await createInbox(context, 'reactivate-second');

    await expect(context.mailfn.updateInbox(context.admin, first.inbox.id, { status: 'active' }))
      .rejects.toMatchObject({ code: 'MAILFN_QUOTA_EXCEEDED' });
    await expect(context.store.getInbox(first.inbox.id)).resolves.toMatchObject({ status: 'disabled' });

    await context.mailfn.updateInbox(context.admin, second.inbox.id, { status: 'disabled' });
    await expect(context.mailfn.updateInbox(context.admin, first.inbox.id, { status: 'active' }))
      .resolves.toMatchObject({ status: 'active' });
  });

  it('creates stable and expiring inboxes with replayable one-time scoped credentials', async () => {
    const context = await setup();
    const first = await createInbox(context);
    const replay = await createInbox(context);
    expect(replay.inbox.id).toBe(first.inbox.id);
    expect(replay.credential.token).toBe(first.credential.token);
    expect(first.inbox.expiresAt).toBeDefined();
    expect(first.credential.credential.tokenHash).not.toContain(first.credential.token);
    await context.mailfn.revokeCredential(context.admin, first.credential.credential.id);
    await expect(createInbox(context)).rejects.toMatchObject({ code: 'MAILFN_CONFLICT' });
  });

  it('replays credential rotations durably across service instances', async () => {
    const context = await setup();
    const issued = await context.mailfn.createCredential(context.admin, {
      projectId: context.project.id,
      permissions: ['inbox:read'],
    });
    const secondService = new MailFn({
      store: context.store,
      objects: context.objects,
      defaultDomain: 'inbound.example.com',
      secretProtector: noOpSecretProtector,
    });

    const rotations = await Promise.all([
      context.mailfn.rotateCredential(context.admin, issued.credential.id, 'rotation-1'),
      secondService.rotateCredential(context.admin, issued.credential.id, 'rotation-1'),
    ]);

    expect(rotations[1]).toEqual(rotations[0]);
    const credentials = await context.store.listCredentials(context.project.id);
    expect(credentials.filter((entry) => entry.id === rotations[0].credential.id)).toEqual([
      expect.objectContaining({ status: 'active' }),
    ]);
    expect(credentials).toHaveLength(3);
    await expect(context.store.getCredential(issued.credential.id)).resolves.toMatchObject({ status: 'revoked' });
  });

  it('compares message time filters by instant across timezone offsets', async () => {
    const context = await setup();
    const created = await createInbox(context, 'timezone-filter');
    const first = await context.mailfn.receiveInbound({
      providerDeliveryId: 'timezone-early', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: raw({ subject: 'Early' }), rawSize: raw({ subject: 'Early' }).byteLength,
    });
    const second = await context.mailfn.receiveInbound({
      providerDeliveryId: 'timezone-late', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: raw({ subject: 'Late' }), rawSize: raw({ subject: 'Late' }).byteLength,
    });
    await context.store.saveMessage({ ...first, receivedAt: '2026-01-01T00:30:00+01:00' });
    await context.store.saveMessage({ ...second, receivedAt: '2025-12-31T23:45:00.000Z' });

    await expect(context.store.listMessages(context.project.id, created.inbox.id, {
      receivedAfter: '2026-01-01T00:40:00+01:00',
    })).resolves.toMatchObject([{ id: second.id }]);
  });

  it('does not expose an inbox or credential when its atomic creation transaction fails', async () => {
    const store = new FailingAtomicInboxStore();
    const context = await setup({ store });
    store.failInboxCreation = true;
    await expect(createInbox(context, 'atomic-failure')).rejects.toMatchObject({ code: 'MAILFN_STORAGE_FAILED' });
    expect(await store.getInboxByAddress('atomic-failure@inbound.example.com')).toBeNull();
    expect(await store.listCredentials(context.project.id)).toHaveLength(1);
  });

  it('enforces the active-inbox quota atomically across concurrent creations', async () => {
    const context = await setup({ quota: { maxActiveInboxes: 1 } });
    const results = await Promise.allSettled([
      createInbox(context, 'quota-concurrent-a'),
      createInbox(context, 'quota-concurrent-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    expect(await context.store.listInboxes(context.project.id)).toHaveLength(1);
    expect(await context.store.listCredentials(context.project.id)).toHaveLength(2);
  });

  it('preflights ingress before raw receipt and compensates a mismatched reservation', async () => {
    const context = await setup({ quota: {
      maxMessagesPerHour: 1, maxMessagesPerInboxPerHour: 1, maxMessagesPerSenderPerHour: 1,
    } });
    const created = await createInbox(context, 'preflight');
    const value = raw({ subject: 'preflight' });
    const preflight = await context.mailfn.preflightInbound({
      envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, rawSize: value.byteLength,
    });
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'preflight-mismatch', envelopeFrom: 'different@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    }, preflight)).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'preflight-recovered', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).resolves.toMatchObject({ providerDeliveryId: 'preflight-recovered' });
  });

  it('enforces cross-inbox credential isolation and records authorization failures without secrets', async () => {
    const context = await setup();
    const first = await createInbox(context, 'first');
    const second = await createInbox(context, 'second');
    const actor = await context.mailfn.authenticate(first.credential.token);
    await expect(context.mailfn.listInboxes(actor)).resolves.toMatchObject([{ id: first.inbox.id }]);
    await expect(context.mailfn.getInbox(actor, second.inbox.id)).rejects.toMatchObject({ code: 'MAILFN_FORBIDDEN' });
    const audits = await context.mailfn.getAuditEvents(context.admin);
    expect(audits.some((entry) => entry.action === 'authorization.failed')).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(first.credential.token);
  });

  it('receives, parses, threads, waits, extracts, and stores attachment evidence deterministically', async () => {
    const context = await setup();
    const created = await createInbox(context);
    const firstRaw = raw({
      internetMessageId: '<first@example.com>',
      subject: 'Verify your account',
      text: 'Use verification code 654321 or https://app.example.com/verify?token=abc',
      html: '<script>steal()</script><style>body{background:url(https://tracker.example)}</style><svg onload="bad()"></svg><p onclick="bad()">Verify</p><a href="javascript:steal()">click</a><img src="https://tracker.example/pixel">',
      attachments: [{ filename: '../proof"\r\n;name.txt', contentType: 'text/plain', content: 'evidence' } as never],
    });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'delivery-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: firstRaw, rawSize: firstRaw.byteLength,
    });
    expect(message.status).toBe('ready');
    expect(message.htmlBody).not.toContain('<script');
    expect(message.htmlBody).not.toContain('<style');
    expect(message.htmlBody).not.toContain('<svg');
    expect(message.htmlBody).not.toContain('javascript:');
    expect(message.htmlBody).not.toContain('onclick');
    expect(message.htmlBody).toContain('data-mailfn-remote-image="blocked"');
    const actor = await context.mailfn.authenticate(created.credential.token);
    const waited = await context.mailfn.waitForMessages(actor, { inboxId: created.inbox.id, subject: 'Verify', after: '2026-01-01T00:00:00.000Z', timeoutMs: 5 });
    expect(waited.status).toBe('matched');
    await expect(context.mailfn.extractVerification(actor, created.inbox.id, message.id, 'otp')).resolves.toMatchObject({
      value: '654321', sourceMessageId: message.id,
    });
    await expect(context.mailfn.extractVerification(actor, created.inbox.id, message.id, 'verification_link')).resolves.toMatchObject({
      value: 'https://app.example.com/verify?token=abc', sourceMessageId: message.id,
    });
    const attachments = await context.store.listAttachments(message.id);
    expect(attachments).toMatchObject([{ filename: '.._proof____name.txt', contentType: 'text/plain', sizeBytes: 8 }]);
    const attachment = await context.mailfn.getAttachment(actor, created.inbox.id, message.id, attachments[0]!.id);
    expect(new TextDecoder().decode(attachment.data)).toBe('evidence');

    const replyRaw = raw({
      internetMessageId: '<reply@example.com>', inReplyTo: 'sender <missing@example.com> <first@example.com>', references: [],
      subject: 'Re: Verify your account', text: 'Follow up',
    });
    const reply = await context.mailfn.receiveInbound({
      providerDeliveryId: 'delivery-2', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: replyRaw, rawSize: replyRaw.byteLength,
    });
    expect(reply.threadId).toBe(message.threadId);
    expect((await context.mailfn.listThreads(actor, created.inbox.id))[0]?.messageIds).toEqual([message.id, reply.id]);
  });

  it('attributes concurrent verification messages using sender, subject, time, and count predicates', async () => {
    const context = await setup();
    const created = await createInbox(context);
    for (const [delivery, sender, subject, code] of [
      ['a', 'one@example.com', 'Run A', '111111'],
      ['b', 'two@example.net', 'Run B', '222222'],
    ]) {
      const value = raw({ from: [{ address: sender }], subject, text: `Authentication code is ${code}` });
      await context.mailfn.receiveInbound({ providerDeliveryId: delivery, envelopeFrom: sender, envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength });
    }
    const actor = await context.mailfn.authenticate(created.credential.token);
    const result = await context.mailfn.waitForMessages(actor, {
      inboxId: created.inbox.id, senderDomain: 'example.net', subject: 'Run B', expectedCount: 1, timeoutMs: 10,
    });
    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.messages).toHaveLength(1);
      expect((await context.mailfn.extractVerification(actor, created.inbox.id, result.messages[0]!.id, 'otp')).value).toBe('222222');
    }
  });

  it('preserves raw evidence and marks queue failure for reconciliation', async () => {
    let fail = true;
    const jobs: ParseJob[] = [];
    const queue: MailFnQueue = { async enqueue(job) { if (fail) throw new Error('queue down'); jobs.push(job); } };
    const context = await setup({ queue });
    const created = await createInbox(context);
    const value = raw();
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'queue-fail', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_QUEUE_FAILED', retryable: true });
    const [stored] = await context.store.listMessages(context.project.id, created.inbox.id);
    expect(stored?.status).toBe('queue_failed');
    expect(context.objects.size()).toBe(1);
    fail = false;
    expect(await context.mailfn.retryPendingMessages(context.project.id)).toBe(1);
    expect(jobs).toHaveLength(1);
    expect((await context.store.getMessage(stored!.id))?.status).toBe('pending');
  });

  it('does not requeue permanent MIME parse failures', async () => {
    const jobs: ParseJob[] = [];
    const context = await setup({
      quota: { maxAttachmentBytes: 4 },
      queue: { async enqueue(job) { jobs.push(job); } },
    });
    const created = await createInbox(context, 'permanent-parse-failure');
    const value = raw({
      attachments: [{ filename: 'oversized.txt', contentType: 'text/plain', content: '12345' } as never],
    });
    await context.mailfn.receiveInbound({
      providerDeliveryId: 'permanent-parse-failure', envelopeFrom: 'sender@example.com',
      envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength,
    });
    await expect(context.mailfn.parseMessage(jobs[0]!)).rejects.toMatchObject({
      code: 'MAILFN_ATTACHMENT_TOO_LARGE', retryable: false,
    });
    const [stored] = await context.store.listMessages(context.project.id, created.inbox.id);
    expect(stored).toMatchObject({
      status: 'parse_failed', parseErrorCode: 'MAILFN_ATTACHMENT_TOO_LARGE', parseRetryable: false,
    });
    await expect(context.mailfn.retryPendingMessages(context.project.id)).resolves.toBe(0);
    expect(jobs).toHaveLength(1);
  });

  it('queues accepted mail even when non-critical event and usage writes fail', async () => {
    const jobs: ParseJob[] = [];
    const context = await setup({
      store: new NoncriticalFailureStore(),
      queue: { async enqueue(job) { jobs.push(job); } },
    });
    const created = await createInbox(context);
    const value = raw();
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'noncritical-failures', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).resolves.toMatchObject({ status: 'pending' });
    expect(jobs).toHaveLength(1);
  });

  it('cleans attachment objects when attachment metadata cannot be committed', async () => {
    const context = await setup({ store: new FailingAttachmentStore() });
    const created = await createInbox(context);
    const value = raw({ attachments: [{ filename: 'orphan.txt', contentType: 'text/plain', content: 'orphan' } as never] });
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'attachment-store-failure', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_PARSE_FAILED', retryable: true });
    expect(context.objects.size()).toBe(1);
    expect((await context.store.listMessages(context.project.id, created.inbox.id))[0]).toMatchObject({ status: 'parse_failed' });
  });

  it('enforces the project stored-byte quota before writing raw evidence', async () => {
    const value = raw({ subject: 'Too large for tenant storage' });
    const context = await setup({ quota: { maxStoredBytes: value.byteLength - 1 } });
    const created = await createInbox(context);
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'quota-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_QUOTA_EXCEEDED' });
    expect(context.objects.size()).toBe(0);
    expect(await context.store.listMessages(context.project.id, created.inbox.id)).toHaveLength(0);
  });

  it('reserves stored bytes atomically across concurrent inbox deliveries', async () => {
    const value = raw({ subject: 'Atomic storage budget' });
    const context = await setup({ quota: { maxStoredBytes: value.byteLength } });
    const [first, second] = await Promise.all([
      createInbox(context, 'storage-a'),
      createInbox(context, 'storage-b'),
    ]);
    const results = await Promise.allSettled([
      context.mailfn.receiveInbound({
        providerDeliveryId: 'storage-a', envelopeFrom: 'one@example.com', envelopeTo: first.inbox.address,
        raw: value, rawSize: value.byteLength,
      }),
      context.mailfn.receiveInbound({
        providerDeliveryId: 'storage-b', envelopeFrom: 'two@example.com', envelopeTo: second.inbox.address,
        raw: value, rawSize: value.byteLength,
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    expect(context.objects.size()).toBe(1);
  });

  it('deduplicates at-least-once inbound delivery before parsing or events', async () => {
    const context = await setup();
    const created = await createInbox(context);
    const value = raw();
    const first = await context.mailfn.receiveInbound({ providerDeliveryId: 'same', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength });
    const second = await context.mailfn.receiveInbound({ providerDeliveryId: 'same', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength });
    expect(second.id).toBe(first.id);
    expect(await context.store.listMessages(context.project.id, created.inbox.id)).toHaveLength(1);
  });

  it('deduplicates truly concurrent inbound retries and compensates the losing reservation/object', async () => {
    const context = await setup();
    const created = await createInbox(context, 'concurrent-ingress');
    const value = raw({ subject: 'Concurrent duplicate' });
    const input = {
      providerDeliveryId: 'concurrent-same', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    };
    const [first, second] = await Promise.all([
      context.mailfn.receiveInbound(input),
      context.mailfn.receiveInbound(input),
    ]);
    expect(second.id).toBe(first.id);
    expect(await context.store.listMessages(context.project.id, created.inbox.id)).toHaveLength(1);
    expect(context.objects.size()).toBe(1);
  });

  it('enforces atomic project, inbox, and sender ingress quotas independently', async () => {
    const projectLimited = await setup({ quota: {
      maxMessagesPerHour: 1, maxMessagesPerInboxPerHour: 10, maxMessagesPerSenderPerHour: 10,
    } });
    const projectInboxA = await createInbox(projectLimited, 'quota-project-a');
    const projectInboxB = await createInbox(projectLimited, 'quota-project-b');
    const value = raw();
    await projectLimited.mailfn.receiveInbound({
      providerDeliveryId: 'project-1', envelopeFrom: 'one@example.com', envelopeTo: projectInboxA.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await expect(projectLimited.mailfn.receiveInbound({
      providerDeliveryId: 'project-2', envelopeFrom: 'two@example.com', envelopeTo: projectInboxB.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_RATE_LIMITED', details: { dimension: 'project' } });

    const inboxLimited = await setup({ quota: {
      maxMessagesPerHour: 10, maxMessagesPerInboxPerHour: 1, maxMessagesPerSenderPerHour: 10,
    } });
    const singleInbox = await createInbox(inboxLimited, 'quota-inbox');
    await inboxLimited.mailfn.receiveInbound({
      providerDeliveryId: 'inbox-1', envelopeFrom: 'one@example.com', envelopeTo: singleInbox.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await expect(inboxLimited.mailfn.receiveInbound({
      providerDeliveryId: 'inbox-2', envelopeFrom: 'two@example.com', envelopeTo: singleInbox.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_RATE_LIMITED', details: { dimension: 'inbox' } });

    const senderLimited = await setup({ quota: {
      maxMessagesPerHour: 10, maxMessagesPerInboxPerHour: 10, maxMessagesPerSenderPerHour: 1,
    } });
    const senderInboxA = await createInbox(senderLimited, 'quota-sender-a');
    const senderInboxB = await createInbox(senderLimited, 'quota-sender-b');
    await senderLimited.mailfn.receiveInbound({
      providerDeliveryId: 'sender-1', envelopeFrom: 'abuser@example.com', envelopeTo: senderInboxA.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await expect(senderLimited.mailfn.receiveInbound({
      providerDeliveryId: 'sender-2', envelopeFrom: 'abuser@example.com', envelopeTo: senderInboxB.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_RATE_LIMITED', details: { dimension: 'sender' } });
  });

  it('expires inboxes, revokes credentials, and removes message objects under expiring retention', async () => {
    const clock = new MutableClock();
    const context = await setup({ clock });
    const created = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'expiring', requestedLocalPart: 'expire', expirySeconds: 60,
    });
    const value = raw();
    await context.mailfn.receiveInbound({ providerDeliveryId: 'expire-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength });
    clock.advance(61_000);
    const result = await context.mailfn.runRetention(context.project.id);
    expect(result.expiredInboxes).toBe(1);
    expect(result.deletedMessages).toBe(1);
    expect(context.objects.size()).toBe(0);
    expect(await context.store.listThreads(context.project.id, created.inbox.id)).toHaveLength(0);
    await expect(context.mailfn.authenticate(created.credential.token)).rejects.toMatchObject({ code: 'MAILFN_UNAUTHORIZED' });
  });

  it('expires disabled inboxes at their deadline and applies expiry deletion', async () => {
    const clock = new MutableClock();
    const context = await setup({ clock });
    const created = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'expiring', requestedLocalPart: 'disabled-expiry', expirySeconds: 60,
    });
    const value = raw();
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'disabled-expiry-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await context.mailfn.updateInbox(context.admin, created.inbox.id, { status: 'disabled' });
    clock.advance(61_000);

    await expect(context.mailfn.runRetention(context.project.id)).resolves.toMatchObject({ expiredInboxes: 1, deletedMessages: 1 });
    await expect(context.store.getInbox(created.inbox.id)).resolves.toMatchObject({ status: 'expired' });
    await expect(context.store.getMessage(message.id)).resolves.toBeNull();
  });

  it('applies raw, attachment, and message retention independently', async () => {
    const clock = new MutableClock();
    const context = await setup({
      clock,
      retentionPolicy: {
        rawTtlSeconds: 1,
        attachmentTtlSeconds: 2,
        messageTtlSeconds: 10,
        auditTtlSeconds: 100,
      },
    });
    const created = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id,
      kind: 'stable',
      requestedLocalPart: 'retention',
    });
    const value = raw({ attachments: [{ filename: 'proof.txt', contentType: 'text/plain', content: 'proof' } as never] });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'retention-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    const actor = await context.mailfn.authenticate(created.credential.token);
    expect(context.objects.size()).toBe(2);

    clock.advance(1_100);
    expect(await context.mailfn.runRetention(context.project.id)).toMatchObject({ deletedMessages: 0, deletedObjects: 1 });
    expect((await context.store.getMessage(message.id))?.rawDeletedAt).toBeDefined();
    await expect(context.mailfn.getRawMessage(actor, created.inbox.id, message.id)).rejects.toMatchObject({ code: 'MAILFN_NOT_FOUND' });
    expect(await context.store.listAttachments(message.id)).toHaveLength(1);

    clock.advance(1_000);
    expect(await context.mailfn.runRetention(context.project.id)).toMatchObject({ deletedMessages: 0, deletedObjects: 1 });
    expect(await context.store.listAttachments(message.id)).toHaveLength(0);
    expect(await context.store.getMessage(message.id)).not.toBeNull();
  });

  it('prunes terminal webhook delivery history and events outside the audit retention window', async () => {
    const clock = new MutableClock();
    const context = await setup({ clock, retentionPolicy: { auditTtlSeconds: 1 } });
    await context.store.saveWebhook({
      id: 'whk_history', projectId: context.project.id, url: 'https://example.test/hook',
      eventTypes: ['message.received'], secretHash: 'hash', status: 'active', consecutiveFailures: 0,
      createdAt: clock.now().toISOString(), updatedAt: clock.now().toISOString(),
    });
    await context.store.appendEvent({
      id: 'evt_history', version: 1, type: 'message.received', projectId: context.project.id,
      occurredAt: clock.now().toISOString(), payload: {},
    });
    await context.store.saveWebhookDelivery({
      id: 'delivery_history', webhookId: 'whk_history', eventId: 'evt_history', attempt: 1,
      status: 'delivered', createdAt: clock.now().toISOString(), updatedAt: clock.now().toISOString(),
    });
    await context.store.saveWebhook({
      id: 'whk_quarantined', projectId: context.project.id, url: 'https://example.test/quarantined',
      eventTypes: ['message.received'], secretHash: 'hash', status: 'quarantined', consecutiveFailures: 10,
      createdAt: clock.now().toISOString(), updatedAt: clock.now().toISOString(),
    });
    await context.store.appendEvent({
      id: 'evt_quarantined', version: 1, type: 'message.received', projectId: context.project.id,
      occurredAt: clock.now().toISOString(), payload: {},
    });
    await context.store.saveWebhookDelivery({
      id: 'delivery_quarantined', webhookId: 'whk_quarantined', eventId: 'evt_quarantined', attempt: 4,
      status: 'failed', nextAttemptAt: clock.now().toISOString(),
      createdAt: clock.now().toISOString(), updatedAt: clock.now().toISOString(),
    });
    clock.advance(2_000);

    await expect(context.mailfn.runRetention(context.project.id)).resolves.toMatchObject({
      webhookDeliveriesDeleted: 2,
      eventRecordsDeleted: 2,
    });
    await expect(context.store.listWebhookDeliveries('whk_history')).resolves.toEqual([]);
    await expect(context.store.listWebhookDeliveries('whk_quarantined')).resolves.toEqual([]);
    await expect(context.store.listEvents(context.project.id)).resolves.toEqual([]);
  });

  it('persists the expiring inbox audit clock independently from stable project audits', async () => {
    const clock = new MutableClock();
    const context = await setup({ clock });
    const expiring = await createInbox(context, 'audit-expiring');
    await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'stable', requestedLocalPart: 'audit-stable',
    });
    const audits = await context.mailfn.getAuditEvents(context.admin);
    const expiringAudit = audits.find((event) => event.action === 'inbox.created' && event.resourceId === expiring.inbox.id)!;
    expect(Date.parse(expiringAudit.retentionExpiresAt) - Date.parse(expiringAudit.createdAt)).toBe(90 * 24 * 60 * 60 * 1000);
    const stableAudit = audits.find((event) => event.action === 'inbox.created' && event.resourceId !== expiring.inbox.id)!;
    expect(Date.parse(stableAudit.retentionExpiresAt) - Date.parse(stableAudit.createdAt)).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('preserves retryable deletion state when object storage is unavailable', async () => {
    const clock = new MutableClock();
    const objects = new FailingDeleteObjectStore();
    const context = await setup({ clock, objects });
    const created = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'expiring', requestedLocalPart: 'deletion', expirySeconds: 60,
    });
    const value = raw();
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'deletion-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    clock.advance(61_000);
    expect(await context.mailfn.runRetention(context.project.id)).toMatchObject({ deletedMessages: 0, deletedObjects: 0 });
    expect(await context.store.getMessage(message.id)).not.toBeNull();

    await expect(context.mailfn.deleteInbox(context.admin, created.inbox.id)).rejects.toThrow('object store unavailable');
    expect((await context.store.getInbox(created.inbox.id))?.status).toBe('deleting');
    await expect(context.mailfn.preflightInbound({
      envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_INBOX_INACTIVE' });
    objects.failDeletes = false;
    await expect(context.mailfn.deleteInbox(context.admin, created.inbox.id)).resolves.toMatchObject({ status: 'deleted' });
  });

  it('blocks draft writes while deleting and erases drafts with the inbox', async () => {
    const context = await setup();
    const created = await createInbox(context, 'draft-erasure');
    const draft = await context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject: 'Erase me', text: 'sensitive body',
    });
    await context.store.saveInbox({ ...created.inbox, status: 'deleting', updatedAt: new Date().toISOString() });

    await expect(context.mailfn.getDraft(context.admin, draft.id)).rejects.toMatchObject({ code: 'MAILFN_CONFLICT' });
    await expect(context.store.saveDraftIfInboxWritable({ ...draft, subject: 'Racing update' })).resolves.toBe(false);
    await expect(context.mailfn.deleteInbox(context.admin, created.inbox.id)).resolves.toMatchObject({ status: 'deleted' });
    await expect(context.store.listDrafts(context.project.id, created.inbox.id)).resolves.toHaveLength(0);
    await expect(context.mailfn.getDraft(context.admin, draft.id)).rejects.toMatchObject({ code: 'MAILFN_NOT_FOUND' });
  });

  it('disables inbox-scoped webhooks when deleting an inbox', async () => {
    const context = await setup({
      quota: { maxWebhooks: 1 },
      webhookDispatcher: { async deliver() { return { ok: true, status: 204, retryable: false }; } },
    });
    const created = await createInbox(context, 'webhook-erasure');
    const webhook = await context.mailfn.createWebhook(context.admin, {
      inboxId: created.inbox.id, url: 'https://consumer.example.test/hook', eventTypes: ['message.received'],
    });
    await context.mailfn.deleteInbox(context.admin, created.inbox.id);
    expect(await context.store.getWebhook(webhook.webhook.id)).toMatchObject({ status: 'disabled' });
    await expect(context.mailfn.createWebhook(context.admin, {
      url: 'https://consumer.example.test/project-hook', eventTypes: ['message.received'],
    })).resolves.toMatchObject({ webhook: { status: 'active' } });
  });

  it('finishes interrupted inbox deletion during retention reconciliation', async () => {
    const context = await setup();
    const created = await createInbox(context, 'deletion-recovery');
    const value = raw({ subject: 'Delete me' });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'deletion-recovery', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await context.store.saveInbox({ ...created.inbox, status: 'deleting', updatedAt: '2026-08-10T00:00:01.000Z' });

    await expect(context.mailfn.runRetention(context.project.id)).resolves.toMatchObject({
      deletedMessages: 1,
      deletedObjects: 1,
    });
    await expect(context.store.getInbox(created.inbox.id)).resolves.toMatchObject({ status: 'deleted' });
    await expect(context.store.getMessage(message.id)).resolves.toBeNull();
    expect(context.objects.size()).toBe(0);
    await expect(context.mailfn.authenticate(created.credential.token)).rejects.toMatchObject({ code: 'MAILFN_UNAUTHORIZED' });
  });

  it('enforces webhook quotas atomically across concurrent creations', async () => {
    const context = await setup({
      quota: { maxWebhooks: 1 },
      webhookDispatcher: {
        async validateUrl() { await Promise.resolve(); },
        async deliver() { return { ok: true, status: 204, retryable: false }; },
      },
    });
    const results = await Promise.allSettled([
      context.mailfn.createWebhook(context.admin, { url: 'https://one.example.test/hook', eventTypes: ['message.received'] }),
      context.mailfn.createWebhook(context.admin, { url: 'https://two.example.test/hook', eventTypes: ['message.received'] }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    await expect(context.store.listWebhooks(context.project.id)).resolves.toHaveLength(1);
  });

  it('accepts tagged senders and SMTP null reverse paths on inbound mail', async () => {
    const context = await setup();
    const created = await createInbox(context, 'external-senders');
    for (const [index, envelopeFrom] of ['sender+tag@example.com', '<>'].entries()) {
      const value = raw();
      await expect(context.mailfn.receiveInbound({
        providerDeliveryId: `external-${index}`, envelopeFrom, envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength,
      })).resolves.toMatchObject({ envelopeFrom: index === 0 ? 'sender+tag@example.com' : '' });
    }
  });

  it('atomically blocks inbound metadata writes after an inbox starts deleting', async () => {
    const store = new QuiescingInboundStore();
    const context = await setup({ store });
    const created = await createInbox(context, 'delete-race');
    const value = raw();
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'delete-race', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_INBOX_INACTIVE' });
    expect(await store.listMessages(context.project.id, created.inbox.id)).toHaveLength(0);
    expect(context.objects.size()).toBe(0);
  });

  it('searches message content and prevents privilege-expanding token delegation', async () => {
    const context = await setup();
    const first = await createInbox(context, 'search-one');
    const second = await createInbox(context, 'search-two');
    const value = raw({ subject: 'Invoice available', text: 'Unique needle alpha-4829' });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'search-1', envelopeFrom: 'billing@example.com', envelopeTo: first.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    const scopedActor = await context.mailfn.authenticate(first.credential.token);
    await expect(context.mailfn.searchMessages(scopedActor, { inboxId: first.inbox.id, query: 'alpha-4829' }))
      .resolves.toMatchObject({ items: [{ id: message.id }] });

    const manager = await context.mailfn.createCredential(context.admin, {
      projectId: context.project.id,
      inboxId: first.inbox.id,
      permissions: ['token:manage', 'message:read'],
    });
    const managerActor = await context.mailfn.authenticate(manager.token);
    await expect(context.mailfn.createCredential(managerActor, {
      projectId: context.project.id,
      inboxId: first.inbox.id,
      permissions: ['message:read', 'draft:write'],
    })).rejects.toMatchObject({ code: 'MAILFN_FORBIDDEN' });
    await expect(context.mailfn.createCredential(managerActor, {
      projectId: context.project.id,
      inboxId: second.inbox.id,
      permissions: ['message:read'],
    })).rejects.toMatchObject({ code: 'MAILFN_FORBIDDEN' });
  });

  it('rejects stale and cross-scope list/search cursors instead of restarting pagination', async () => {
    const context = await setup();
    const first = await createInbox(context, 'cursor-one');
    const second = await createInbox(context, 'cursor-two');
    for (const [delivery, subject] of [['cursor-a', 'Needle A'], ['cursor-b', 'Needle B']]) {
      const value = raw({ subject, text: 'cursor needle' });
      await context.mailfn.receiveInbound({
        providerDeliveryId: delivery, envelopeFrom: 'sender@example.com', envelopeTo: first.inbox.address,
        raw: value, rawSize: value.byteLength,
      });
    }
    const page = await context.mailfn.listMessages(context.admin, { inboxId: first.inbox.id, limit: 1 });
    expect(page.nextCursor).toBeDefined();
    await expect(context.mailfn.listMessages(context.admin, {
      inboxId: second.inbox.id, limit: 1, cursor: page.nextCursor,
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    await expect(context.mailfn.listMessages(context.admin, {
      inboxId: first.inbox.id, limit: 1, subject: 'other', cursor: page.nextCursor,
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });

    const search = await context.mailfn.searchMessages(context.admin, { inboxId: first.inbox.id, query: 'needle', limit: 1 });
    await expect(context.mailfn.searchMessages(context.admin, {
      inboxId: first.inbox.id, query: 'different', limit: 1, cursor: search.nextCursor,
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
  });

  it('contains draft thread and attachment references within the actor inbox', async () => {
    const context = await setup();
    const first = await createInbox(context, 'draft-one');
    const second = await createInbox(context, 'draft-two');
    const value = raw({
      internetMessageId: '<draft-source@example.com>',
      attachments: [{ filename: 'private.txt', contentType: 'text/plain', content: 'private' } as never],
    });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'draft-source', envelopeFrom: 'sender@example.com', envelopeTo: first.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    const [attachment] = await context.store.listAttachments(message.id);
    const actor = await context.mailfn.authenticate(second.credential.token);
    await expect(context.mailfn.createDraft(actor, {
      inboxId: second.inbox.id,
      threadId: message.threadId,
      to: ['recipient@example.com'],
      subject: 'Cross-inbox reference',
    })).rejects.toMatchObject({ code: 'MAILFN_NOT_FOUND' });
    await expect(context.mailfn.createDraft(actor, {
      inboxId: second.inbox.id,
      to: ['recipient@example.com'],
      subject: 'Cross-inbox attachment',
      attachmentIds: [attachment!.id],
    })).rejects.toMatchObject({ code: 'MAILFN_NOT_FOUND' });
  });

  it('records webhook outages without rejecting mail and retries from durable delivery state', async () => {
    const clock = new MutableClock();
    let available = false;
    const context = await setup({
      clock,
      webhookDispatcher: { async deliver() { if (!available) throw new Error('consumer unavailable'); return { ok: true, status: 204, retryable: false }; } },
    });
    const created = await createInbox(context, 'webhook');
    await expect(context.mailfn.createWebhook(context.admin, {
      inboxId: created.inbox.id,
      url: 'https://127.0.0.1/internal',
      eventTypes: ['message.received'],
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    const webhook = await context.mailfn.createWebhook(context.admin, {
      inboxId: created.inbox.id,
      url: 'https://consumer.example.test/mailfn',
      eventTypes: ['message.received'],
    });
    const value = raw();
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'webhook-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).resolves.toMatchObject({ status: 'ready' });
    expect(await context.store.listWebhookDeliveries(webhook.webhook.id)).toMatchObject([{
      status: 'failed', attempt: 1, nextAttemptAt: '2026-08-10T00:00:02.000Z',
    }]);
    available = true;
    clock.advance(2_100);
    expect(await context.mailfn.retryWebhookDeliveries(context.project.id)).toBe(1);
    expect(await context.store.listWebhookDeliveries(webhook.webhook.id)).toMatchObject([{
      status: 'delivered', attempt: 2, nextAttemptAt: undefined,
    }]);
  });

  it('reclaims one abandoned pending webhook delivery with a conditional lease', async () => {
    const clock = new MutableClock();
    let deliveries = 0;
    const context = await setup({
      clock,
      webhookDispatcher: { async deliver() { deliveries += 1; return { ok: true, status: 204, retryable: false }; } },
    });
    const created = await createInbox(context, 'abandoned-webhook');
    const webhook = await context.mailfn.createWebhook(context.admin, {
      inboxId: created.inbox.id,
      url: 'https://consumer.example.test/hook',
      eventTypes: ['message.received'],
    });
    await context.store.appendEvent({
      id: 'evt_abandoned', version: 1, type: 'message.received', projectId: context.project.id,
      inboxId: created.inbox.id, occurredAt: clock.now().toISOString(), payload: {},
    });
    await context.store.saveWebhookDelivery({
      id: 'delivery_abandoned', webhookId: webhook.webhook.id, eventId: 'evt_abandoned', attempt: 1,
      status: 'pending', createdAt: clock.now().toISOString(), updatedAt: clock.now().toISOString(),
    });
    clock.advance(5 * 60 * 1000 + 1);

    const processed = await Promise.all([
      context.mailfn.retryWebhookDeliveries(context.project.id),
      context.mailfn.retryWebhookDeliveries(context.project.id),
    ]);
    expect(processed.reduce((total, value) => total + value, 0)).toBe(1);
    expect(deliveries).toBe(1);
    await expect(context.store.listWebhookDeliveries(webhook.webhook.id)).resolves.toMatchObject([{
      status: 'delivered', attempt: 2, nextAttemptAt: undefined,
    }]);
  });

  it('rejects webhook URLs that the configured transport cannot deliver', async () => {
    const context = await setup({
      webhookDispatcher: {
        async validateUrl() { throw new Error('Cloudflare-proxied webhook hosts are unsupported'); },
        async deliver() { return { ok: true, status: 204, retryable: false }; },
      },
    });
    await expect(context.mailfn.createWebhook(context.admin, {
      url: 'https://proxied.example.test/hook', eventTypes: ['message.received'],
    })).rejects.toMatchObject({
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Cloudflare-proxied webhook hosts are unsupported',
      status: 400,
    });
    await expect(context.store.listWebhooks(context.project.id)).resolves.toHaveLength(0);
  });

  it('verifies, activates, uses, and reversibly disables custom domains', async () => {
    const getRequiredDnsRecords = vi.fn(async (domain: string) => [
      { type: 'MX' as const, name: domain, value: 'mx.provider.test', priority: 10 },
    ]);
    const verifyDns = vi.fn(async () => ({ verified: true, diagnostics: [] }));
    const createRouting = vi.fn(async () => ({ routingRuleId: 'routing-1' }));
    const disableRouting = vi.fn(async () => undefined);
    const context = await setup({ domainAdapter: { getRequiredDnsRecords, verifyDns, createRouting, disableRouting } });
    const pending = await context.mailfn.createDomain(context.admin, 'mail.example.com');
    expect(pending.expectedRecords.map((record) => record.value)).toEqual([
      expect.stringMatching(/^mailfn-verification=/),
      'mx.provider.test',
    ]);
    expect(getRequiredDnsRecords).toHaveBeenCalledWith('mail.example.com');
    const active = await context.mailfn.verifyDomain(context.admin, pending.id);
    expect(active).toMatchObject({ status: 'active', routingRuleId: 'routing-1' });
    expect((await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'stable', requestedLocalPart: 'custom', domain: 'mail.example.com',
    })).inbox.address).toBe('custom@mail.example.com');
    await expect(context.mailfn.disableDomain(context.admin, pending.id)).resolves.toMatchObject({ status: 'disabled' });
    await expect(context.mailfn.disableDomain(context.admin, pending.id)).resolves.toMatchObject({ status: 'disabled' });
    expect(disableRouting).toHaveBeenCalledOnce();
  });

  it('reconciles a durably disabled domain that still retains live routing state', async () => {
    const disableRouting = vi.fn(async () => undefined);
    const context = await setup({
      domainAdapter: {
        getRequiredDnsRecords: async () => [],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'routing-live' }),
        disableRouting,
      },
    });
    const pending = await context.mailfn.createDomain(context.admin, 'retry.example.com');
    await context.store.saveDomain({ ...pending, status: 'disabled', routingRuleId: 'routing-live' });

    await expect(context.mailfn.disableDomain(context.admin, pending.id)).resolves.toMatchObject({
      status: 'disabled', routingRuleId: undefined,
    });
    expect(disableRouting).toHaveBeenCalledOnce();
    expect((await context.store.getDomain(pending.id))?.routingRuleId).toBeUndefined();
  });

  it('enforces custom-domain ownership across projects', async () => {
    const context = await setup({
      domainAdapter: {
        getRequiredDnsRecords: async () => [],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'unused' }),
        disableRouting: async () => undefined,
      },
    });
    const other = await context.mailfn.bootstrapProject({ slug: 'other-project', displayName: 'Other project' });
    const otherAdmin = await context.mailfn.authenticate(other.credential.token);

    const results = await Promise.allSettled([
      context.mailfn.createDomain(context.admin, 'owned.example.com'),
      context.mailfn.createDomain(otherAdmin, 'owned.example.com'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_CONFLICT' },
    }]);
    await expect(context.store.getDomainByNameAcrossProjects('owned.example.com')).resolves.not.toBeNull();
  });

  it('retains retryable disabling state when final disabled persistence fails', async () => {
    const disableRouting = vi.fn(async () => undefined);
    const context = await setup({
      store: new FailingDisabledDomainStore(),
      domainAdapter: {
        getRequiredDnsRecords: async (domain) => [{ type: 'MX', name: domain, value: 'mx.provider.test' }],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'routing-safe-disable' }),
        disableRouting,
      },
    });
    const pending = await context.mailfn.createDomain(context.admin, 'safe-disable.example.com');
    await context.mailfn.verifyDomain(context.admin, pending.id);

    await expect(context.mailfn.disableDomain(context.admin, pending.id)).rejects.toMatchObject({
      code: 'MAILFN_STORAGE_FAILED', retryable: true,
    });
    expect(disableRouting).toHaveBeenCalledOnce();
    await expect(context.store.getDomain(pending.id)).resolves.toMatchObject({
      status: 'disabling', routingRuleId: 'routing-safe-disable',
    });
  });

  it('retains retryable disabling state when provider routing teardown fails', async () => {
    const context = await setup({
      domainAdapter: {
        getRequiredDnsRecords: async (domain) => [{ type: 'MX', name: domain, value: 'mx.provider.test' }],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'routing-still-live' }),
        disableRouting: async () => { throw new Error('provider teardown unavailable'); },
      },
    });
    const pending = await context.mailfn.createDomain(context.admin, 'rollback-disable.example.com');
    await context.mailfn.verifyDomain(context.admin, pending.id);

    await expect(context.mailfn.disableDomain(context.admin, pending.id)).rejects.toMatchObject({
      code: 'MAILFN_DOMAIN_ROUTING_FAILED', retryable: true,
    });
    await expect(context.store.getDomain(pending.id)).resolves.toMatchObject({
      status: 'disabling',
      routingRuleId: 'routing-still-live',
    });
  });

  it('preserves the routing handle when the provider adapter is unavailable during retry', async () => {
    const context = await setup({
      domainAdapter: {
        getRequiredDnsRecords: async () => [],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'routing-needs-adapter' }),
        disableRouting: async () => undefined,
      },
    });
    const pending = await context.mailfn.createDomain(context.admin, 'adapter-retry.example.com');
    await context.mailfn.verifyDomain(context.admin, pending.id);
    const withoutAdapter = new MailFn({
      store: context.store,
      objects: context.objects,
      defaultDomain: 'inbound.example.com',
      secretProtector: noOpSecretProtector,
    });

    await expect(withoutAdapter.disableDomain(context.admin, pending.id)).rejects.toMatchObject({
      code: 'MAILFN_DOMAIN_ROUTING_FAILED', retryable: true,
    });
    await expect(context.store.getDomain(pending.id)).resolves.toMatchObject({
      status: 'disabling', routingRuleId: 'routing-needs-adapter',
    });
    await expect(withoutAdapter.disableDomain(context.admin, pending.id)).rejects.toMatchObject({
      code: 'MAILFN_DOMAIN_ROUTING_FAILED', retryable: true,
    });
  });

  it('enforces the domain quota atomically across concurrent domain names', async () => {
    const context = await setup({
      quota: { maxDomains: 1 },
      domainAdapter: {
        getRequiredDnsRecords: async () => [],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'unused' }),
        disableRouting: async () => undefined,
      },
    });
    const results = await Promise.allSettled([
      context.mailfn.createDomain(context.admin, 'quota-a.example.com'),
      context.mailfn.createDomain(context.admin, 'quota-b.example.com'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    expect(await context.store.listDomains(context.project.id)).toHaveLength(1);
  });

  it('compensates provider routing when active custom-domain state cannot be persisted', async () => {
    const disableRouting = vi.fn(async () => undefined);
    const context = await setup({
      store: new FailingActiveDomainStore(),
      domainAdapter: {
        getRequiredDnsRecords: async (domain) => [{ type: 'MX', name: domain, value: 'mx.provider.test' }],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'orphan-candidate' }),
        disableRouting,
      },
    });
    const pending = await context.mailfn.createDomain(context.admin, 'mail.example.com');
    await expect(context.mailfn.verifyDomain(context.admin, pending.id)).rejects.toMatchObject({ code: 'MAILFN_STORAGE_FAILED' });
    expect(disableRouting).toHaveBeenCalledWith(expect.objectContaining({ routingRuleId: 'orphan-candidate' }));
    expect((await context.store.getDomain(pending.id))?.status).toBe('pending');
  });

  it('keeps billing and support disabled while preserving abuse and compliance controls', async () => {
    const context = await setup();
    await expect(context.mailfn.getUsage(context.admin)).rejects.toMatchObject({ code: 'MAILFN_PUBLIC_PLATFORM_DISABLED' });
    await expect(context.mailfn.createSupportCase(context.admin, {
      subject: 'Help', severity: 'normal', description: 'Need help',
    })).rejects.toMatchObject({ code: 'MAILFN_PUBLIC_PLATFORM_DISABLED' });
    await expect(context.mailfn.reportAbuse(context.admin, {
      kind: 'spam', resourceType: 'project', resourceId: context.project.id, reason: 'automated complaint',
    })).resolves.toMatchObject({ status: 'open' });
    await expect(context.mailfn.reportAbuse(context.admin, {
      kind: 'invented' as never, resourceType: 'project', resourceId: context.project.id, reason: 'invalid kind',
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    await expect(context.mailfn.configureCompliance(context.admin, {
      dataRegion: 'global', retentionLocked: 'false' as never, exportEnabled: false, deletionSlaHours: 24,
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    await expect(context.mailfn.configureCompliance(context.admin, {
      dataRegion: 'global', retentionLocked: false, exportEnabled: 'false' as never, deletionSlaHours: 24,
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    expect(await context.store.getComplianceProfile(context.project.id)).toBeNull();
    await expect(context.mailfn.configureCompliance(context.admin, {
      dataRegion: 'global', retentionLocked: true, exportEnabled: false, deletionSlaHours: 24,
    })).resolves.toMatchObject({ projectId: context.project.id, retentionLocked: true });
  });

  it('rejects unknown abuse resource types before persisting a case', async () => {
    const context = await setup({
      domainAdapter: {
        getRequiredDnsRecords: async () => [],
        verifyDns: async () => ({ verified: true, diagnostics: [] }),
        createRouting: async () => ({ routingRuleId: 'unused' }),
        disableRouting: async () => undefined,
      },
    });
    const domain = await context.mailfn.createDomain(context.admin, 'abuse.example.com');

    await expect(context.mailfn.reportAbuse(context.admin, {
      kind: 'spam', resourceType: 'unknown' as never, resourceId: domain.id, reason: 'invalid resource type',
    })).rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid abuse resource type' });
    await expect(context.mailfn.listAbuseCases(context.admin)).resolves.toHaveLength(0);
  });

  it('compares credential expirations by instant instead of ISO spelling', async () => {
    const context = await setup({ clock: new MutableClock(new Date('2026-08-10T00:00:00.000Z')) });
    await expect(context.mailfn.createCredential(context.admin, {
      projectId: context.project.id,
      permissions: ['inbox:read'],
      expiresAt: '2026-08-09T20:00:01-04:00',
    })).resolves.toMatchObject({ credential: { status: 'active' } });
  });

  it('enforces retention locks and supports gated compliance export and case-management workflows', async () => {
    const clock = new MutableClock();
    const context = await setup({ clock, publicPlatform: { supportEnabled: true, billingEnabled: true } });
    const created = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'expiring', requestedLocalPart: 'governed', expirySeconds: 60,
    });
    const value = raw();
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'governed-1', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await context.mailfn.configureCompliance(context.admin, {
      dataRegion: 'global', retentionLocked: true, exportEnabled: true, deletionSlaHours: 24,
    });
    await expect(context.mailfn.deleteInbox(context.admin, created.inbox.id)).rejects.toMatchObject({ code: 'MAILFN_CONFLICT' });
    clock.advance(61_000);
    await context.mailfn.runRetention(context.project.id);
    expect(await context.store.getMessage(message.id)).not.toBeNull();
    await expect(context.mailfn.exportCompliance(context.admin)).resolves.toMatchObject({
      project: { id: context.project.id },
      compliance: { retentionLocked: true, exportEnabled: true },
      messages: [{ id: message.id }],
    });

    const abuseCase = await context.mailfn.reportAbuse(context.admin, {
      kind: 'spam', resourceType: 'inbox', resourceId: created.inbox.id, reason: 'complaint threshold exceeded',
    });
    await expect(context.mailfn.updateAbuseCase(context.admin, abuseCase.id, {
      status: 'investigating', disableResource: true,
    })).resolves.toMatchObject({ status: 'investigating' });
    expect((await context.store.getInbox(created.inbox.id))?.status).toBe('disabled');
    const reputationInbox = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id, kind: 'stable', requestedLocalPart: 'reputation',
    });
    await context.mailfn.updateSenderReputation(context.admin, 'sender@example.com', {
      status: 'block', score: 0, reason: 'operator block',
    });
    expect(await context.mailfn.listSenderReputations(context.admin)).toMatchObject([{
      sender: 'sender@example.com', status: 'block', score: 0,
    }]);
    await expect(context.mailfn.receiveInbound({
      providerDeliveryId: 'blocked-sender', envelopeFrom: 'sender@example.com', envelopeTo: reputationInbox.inbox.address,
      raw: value, rawSize: value.byteLength,
    })).rejects.toMatchObject({ code: 'MAILFN_SENDER_BLOCKED' });
    const supportCase = await context.mailfn.createSupportCase(context.admin, {
      subject: 'Delivery review', severity: 'high', description: 'Please review the rejected delivery',
    });
    await expect(context.mailfn.updateSupportCase(context.admin, supportCase.id, { status: 'resolved' }))
      .resolves.toMatchObject({ status: 'resolved' });
  });

  it('composes reply and forward through the send adapter and preserves threading headers', async () => {
    const sent: Array<Parameters<MailFnSendAdapter['send']>[0]> = [];
    const sendAdapter: MailFnSendAdapter = {
      async send(request) { sent.push(request); return { providerMessageId: `sent-${sent.length}`, status: 'sent' }; },
    };
    const context = await setup({ sendAdapter });
    const created = await createInbox(context);
    const value = raw({
      internetMessageId: '<origin@example.com>', references: ['<root@example.com>'], subject: 'Question',
      attachments: [{ filename: 'proof.txt', contentType: 'text/plain', content: 'proof' } as never],
    });
    const message = await context.mailfn.receiveInbound({ providerDeliveryId: 'origin', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, raw: value, rawSize: value.byteLength });
    const reply = await context.mailfn.createReplyDraft(context.admin, created.inbox.id, message.id, { text: 'Answer' });
    await context.mailfn.sendDraft(context.admin, reply.id);
    expect(sent[0]?.headers).toEqual({ 'In-Reply-To': '<origin@example.com>', References: '<root@example.com> <origin@example.com>' });
    const forward = await context.mailfn.createForwardDraft(context.admin, created.inbox.id, message.id, { to: ['other@example.com'], includeOriginalAttachments: true });
    await context.mailfn.sendDraft(context.admin, forward.id);
    expect(sent[1]?.subject).toBe('Fwd: Question');
    expect(sent[1]?.attachments).toMatchObject([{ filename: 'proof.txt', contentType: 'text/plain', content: new TextEncoder().encode('proof') }]);
  });

  it('rejects sending drafts from disabled or elapsed expiring inboxes before dispatch', async () => {
    const send = vi.fn(async () => ({ providerMessageId: 'must-not-send', status: 'sent' as const }));
    const clock = new MutableClock();
    const context = await setup({ clock, sendAdapter: { send } });
    const disabled = await createInbox(context, 'disabled-draft');
    const disabledDraft = await context.mailfn.createDraft(context.admin, {
      inboxId: disabled.inbox.id, to: ['recipient@example.com'], subject: 'Disabled', text: 'body',
    });
    await context.store.saveInbox({ ...disabled.inbox, status: 'disabled', updatedAt: clock.now().toISOString() });
    await expect(context.mailfn.sendDraft(context.admin, disabledDraft.id)).rejects.toMatchObject({
      code: 'MAILFN_INBOX_INACTIVE',
    });

    const expiring = await context.mailfn.createInbox(context.admin, {
      projectId: context.project.id,
      kind: 'expiring',
      requestedLocalPart: 'expired-draft',
      expirySeconds: 60,
    });
    const expiredDraft = await context.mailfn.createDraft(context.admin, {
      inboxId: expiring.inbox.id, to: ['recipient@example.com'], subject: 'Expired', text: 'body',
    });
    clock.advance(61_000);
    await expect(context.mailfn.sendDraft(context.admin, expiredDraft.id)).rejects.toMatchObject({
      code: 'MAILFN_INBOX_INACTIVE',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('compares offset-bearing inbox expiration by instant before sending', async () => {
    const send = vi.fn(async () => ({ providerMessageId: 'offset-send', status: 'sent' as const }));
    const clock = new MutableClock(new Date('2026-08-10T00:00:00.000Z'));
    const context = await setup({ clock, sendAdapter: { send } });
    const created = await createInbox(context, 'offset-expiry');
    await context.store.saveInbox({
      ...created.inbox,
      expiresAt: '2026-08-09T23:30:00-01:00',
      updatedAt: clock.now().toISOString(),
    });
    const draft = await context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject: 'Offset', text: 'body',
    });

    await expect(context.mailfn.sendDraft(context.admin, draft.id)).resolves.toMatchObject({ status: 'sent' });
    expect(send).toHaveBeenCalledOnce();
  });

  it('provides complete draft and independent thread-label lifecycles', async () => {
    const context = await setup();
    const created = await createInbox(context, 'lifecycle');
    const value = raw({ internetMessageId: '<lifecycle@example.com>', subject: 'Lifecycle' });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'lifecycle', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    const thread = await context.mailfn.labelThread(context.admin, created.inbox.id, message.threadId!, ['important']);
    expect(thread.labels).toEqual(['important']);
    await context.mailfn.labelMessage(context.admin, created.inbox.id, message.id, ['Message-Only']);
    expect((await context.mailfn.listThreads(context.admin, created.inbox.id))[0]?.labels).toEqual(['important']);
    await expect(context.mailfn.listMessages(context.admin, {
      inboxId: created.inbox.id,
      labels: [' MESSAGE-ONLY '],
    })).resolves.toMatchObject({ items: [expect.objectContaining({ id: message.id })] });

    const draft = await context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['first@example.com'], subject: 'Draft', text: 'body',
    });
    expect(await context.mailfn.listDrafts(context.admin, created.inbox.id)).toMatchObject([{ id: draft.id }]);
    const updated = await context.mailfn.updateDraft(context.admin, draft.id, { to: ['second@example.com'], subject: 'Updated' });
    expect(updated).toMatchObject({ to: ['second@example.com'], subject: 'Updated' });
    await expect(context.mailfn.discardDraft(context.admin, draft.id)).resolves.toMatchObject({ status: 'discarded' });
    await expect(context.mailfn.updateDraft(context.admin, draft.id, { subject: 'Too late' })).rejects.toMatchObject({ code: 'MAILFN_CONFLICT' });
  });

  it('recovers concurrent draft sends through the stable adapter idempotency key', async () => {
    let release!: () => void;
    let providerCalls = 0;
    const inFlight = new Map<string, Promise<{ providerMessageId: string; status: 'sent' }>>();
    const sendAdapter: MailFnSendAdapter = {
      async send(request) {
        const existing = inFlight.get(request.idempotencyKey);
        if (existing) return { providerMessageId: 'tx-pending', status: 'queued' };
        providerCalls += 1;
        const operation = new Promise<{ providerMessageId: string; status: 'sent' }>((resolve) => {
          release = () => resolve({ providerMessageId: 'provider-once', status: 'sent' });
        });
        inFlight.set(request.idempotencyKey, operation);
        return operation;
      },
    };
    const context = await setup({ sendAdapter });
    const created = await createInbox(context, 'concurrent-send');
    const draft = await context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject: 'Once', text: 'body',
    });
    const first = context.mailfn.sendDraft(context.admin, draft.id);
    while (providerCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(context.mailfn.sendDraft(context.admin, draft.id)).resolves.toMatchObject({ status: 'sending' });
    release();
    await expect(first).resolves.toMatchObject({ status: 'sent', providerMessageId: 'provider-once' });
    await expect(context.mailfn.sendDraft(context.admin, draft.id)).resolves.toMatchObject({ status: 'sent' });
    expect(providerCalls).toBe(1);
  });

  it('does not overwrite a concurrently completed send while resetting a provider failure', async () => {
    const store = new CompletingDraftResetStore();
    const context = await setup({
      store,
      sendAdapter: { async send() { throw new Error('provider unavailable'); } },
    });
    const created = await createInbox(context, 'conditional-reset');
    const draft = await context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject: 'Conditional reset', text: 'body',
    });

    await expect(context.mailfn.sendDraft(context.admin, draft.id)).rejects.toThrow('provider unavailable');
    await expect(store.getDraft(draft.id)).resolves.toMatchObject({ status: 'sent', providerMessageId: 'concurrent-send' });
  });

  it('reserves the daily outbound quota atomically and compensates provider failures', async () => {
    let fail = false;
    const sent: string[] = [];
    const context = await setup({
      quota: { maxOutboundPerDay: 1 },
      sendAdapter: {
        async send(request) {
          if (fail) throw new Error('provider unavailable');
          sent.push(request.idempotencyKey);
          return { providerMessageId: request.idempotencyKey, status: 'sent' };
        },
      },
    });
    const created = await createInbox(context, 'outbound-quota');
    const [first, second] = await Promise.all(['First', 'Second'].map((subject) => context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject, text: 'body',
    })));
    const outcomes = await Promise.allSettled([
      context.mailfn.sendDraft(context.admin, first.id),
      context.mailfn.sendDraft(context.admin, second.id),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toMatchObject([{
      reason: { code: 'MAILFN_QUOTA_EXCEEDED' },
    }]);
    expect(sent).toHaveLength(1);
    expect((await context.store.listUsage(context.project.id)).filter((record) => record.metric === 'outbound_message')).toHaveLength(1);

    const retryContext = await setup({
      quota: { maxOutboundPerDay: 1 },
      sendAdapter: { async send() { if (fail) throw new Error('provider unavailable'); return { providerMessageId: 'sent', status: 'sent' }; } },
    });
    const retryInbox = await createInbox(retryContext, 'outbound-retry');
    const draft = await retryContext.mailfn.createDraft(retryContext.admin, {
      inboxId: retryInbox.inbox.id, to: ['recipient@example.com'], subject: 'Retry', text: 'body',
    });
    fail = true;
    await expect(retryContext.mailfn.sendDraft(retryContext.admin, draft.id)).rejects.toThrow('provider unavailable');
    expect(await retryContext.store.listUsage(retryContext.project.id)).not.toContainEqual(expect.objectContaining({ metric: 'outbound_message' }));
    fail = false;
    await expect(retryContext.mailfn.sendDraft(retryContext.admin, draft.id)).resolves.toMatchObject({ status: 'sent' });
  });

  it('keeps public outbound closed until the production-security gate is approved', async () => {
    const send = vi.fn(async () => ({ providerMessageId: 'never', status: 'queued' as const }));
    const context = await setup({ sendAdapter: { send }, publicPlatform: { enabled: true, productionSecurityApproved: false } });
    const created = await createInbox(context);
    const draft = await context.mailfn.createDraft(context.admin, {
      inboxId: created.inbox.id, to: ['recipient@example.com'], subject: 'Blocked', text: 'No open relay',
    });
    await expect(context.mailfn.sendDraft(context.admin, draft.id)).rejects.toMatchObject({ code: 'MAILFN_PRODUCTION_APPROVAL_REQUIRED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('returns a normal typed timeout result and cancellation error', async () => {
    const clock = new MutableClock();
    const context = await setup({ clock });
    const created = await createInbox(context);
    const actor = await context.mailfn.authenticate(created.credential.token);
    await expect(context.mailfn.waitForMessages(actor, { inboxId: created.inbox.id, timeoutMs: 100 })).resolves.toMatchObject({ status: 'timeout', retryable: true });
    const controller = new AbortController();
    controller.abort();
    await expect(context.mailfn.waitForMessages(actor, { inboxId: created.inbox.id, signal: controller.signal })).rejects.toBeInstanceOf(MailFnError);
  });

  it('keeps failed inbound reservation cleanup retryable', async () => {
    const store = new RetryableCancelStore();
    const context = await setup({ store });
    const created = await createInbox(context, 'cancel-retry');
    const preflight = await context.mailfn.preflightInbound({
      envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address, rawSize: 10,
    });
    await expect(context.mailfn.cancelInbound(preflight)).rejects.toThrow('transient release failure');
    await expect(context.mailfn.cancelInbound(preflight)).resolves.toBeUndefined();
    await context.mailfn.cancelInbound(preflight);
    expect(store.releaseAttempts).toBe(2);
  });

  it('does not resurrect a credential revoked during authentication', async () => {
    const store = new ConcurrentRevokeStore();
    const context = await setup({ store });
    const issued = await context.mailfn.createCredential(context.admin, {
      projectId: context.project.id, permissions: ['inbox:read'],
    });
    store.revokeOnTouch = true;
    await expect(context.mailfn.authenticate(issued.token)).rejects.toMatchObject({ code: 'MAILFN_UNAUTHORIZED' });
    await expect(store.getCredential(issued.credential.id)).resolves.toMatchObject({ status: 'revoked' });
  });

  it('claims concurrent parse deliveries and reuses deterministic attachment state on retry', async () => {
    const jobs: ParseJob[] = [];
    let parseCalls = 0;
    let releaseParse!: () => void;
    const gate = new Promise<void>((resolve) => { releaseParse = resolve; });
    const parser = new JsonMimeParser();
    const blockingParser: MailFnMimeParser = {
      async parse(value) {
        parseCalls += 1;
        await gate;
        return parser.parse(value);
      },
    };
    const context = await setup({ mimeParser: blockingParser, queue: { async enqueue(job) { jobs.push(job); } } });
    const created = await createInbox(context, 'parse-claim');
    const value = raw({ attachments: [{ filename: 'proof.txt', contentType: 'text/plain', content: 'proof' } as never] });
    await context.mailfn.receiveInbound({
      providerDeliveryId: 'parse-claim', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    const first = context.mailfn.parseMessage(jobs[0]!);
    await vi.waitFor(() => expect(parseCalls).toBe(1));
    await expect(context.mailfn.parseMessage(jobs[0]!)).resolves.toMatchObject({ status: 'pending' });
    releaseParse();
    await expect(first).resolves.toMatchObject({ status: 'ready' });
    expect(parseCalls).toBe(1);

    const recoveringStore = new RecoveringAttachmentStore();
    const recoveringObjects = new FailingDeleteObjectStore();
    const retryJobs: ParseJob[] = [];
    const retryContext = await setup({
      store: recoveringStore,
      objects: recoveringObjects,
      queue: { async enqueue(job) { retryJobs.push(job); } },
    });
    const retryInbox = await createInbox(retryContext, 'parse-cleanup');
    await retryContext.mailfn.receiveInbound({
      providerDeliveryId: 'parse-cleanup', envelopeFrom: 'sender@example.com', envelopeTo: retryInbox.inbox.address,
      raw: value, rawSize: value.byteLength,
    });
    await expect(retryContext.mailfn.parseMessage(retryJobs[0]!)).rejects.toMatchObject({ code: 'MAILFN_PARSE_FAILED' });
    recoveringObjects.failDeletes = false;
    await expect(retryContext.mailfn.parseMessage(retryJobs[0]!)).resolves.toMatchObject({ status: 'ready' });
    const stored = await recoveringStore.listMessages(retryContext.project.id, retryInbox.inbox.id);
    const attachments = await recoveringStore.listAttachments(stored[0]!.id);
    expect(attachments).toHaveLength(1);
    expect(recoveringObjects.size()).toBe(2);
  });

  it('preserves trusted authentication, Reply-To, lifecycle validation, and concurrent read labels', async () => {
    const context = await setup();
    const created = await createInbox(context, 'message-safety');
    await expect(context.mailfn.updateInbox(context.admin, created.inbox.id, { status: 'deleted' } as never))
      .rejects.toMatchObject({ code: 'MAILFN_VALIDATION_FAILED' });
    const value = raw({
      internetMessageId: '<safe@example.com>', replyTo: [{ address: 'reply@example.com' }],
      authenticationResults: { spf: 'fail', dkim: 'pass' },
    });
    const message = await context.mailfn.receiveInbound({
      providerDeliveryId: 'message-safety', envelopeFrom: 'bounce@example.com', envelopeTo: created.inbox.address,
      authenticationResults: { spf: 'pass' }, raw: value, rawSize: value.byteLength,
    });
    expect(message.authenticationResults).toMatchObject({ spf: 'pass', dkim: 'pass' });
    await expect(context.mailfn.createReplyDraft(context.admin, created.inbox.id, message.id, { text: 'reply' }))
      .resolves.toMatchObject({ to: ['reply@example.com'] });
    await Promise.all([
      context.mailfn.getMessage(context.admin, created.inbox.id, message.id),
      context.mailfn.labelMessage(context.admin, created.inbox.id, message.id, ['important']),
    ]);
    await expect(context.store.getMessage(message.id)).resolves.toMatchObject({
      labels: ['important'], readAt: expect.any(String),
    });
    const footer = raw({ subject: 'Newsletter', text: 'Read https://example.com/privacy for details.' });
    const footerMessage = await context.mailfn.receiveInbound({
      providerDeliveryId: 'ordinary-link', envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
      raw: footer, rawSize: footer.byteLength,
    });
    await expect(context.mailfn.extractVerification(
      context.admin, created.inbox.id, footerMessage.id, 'verification_link',
    )).rejects.toMatchObject({ code: 'MAILFN_NOT_FOUND' });
  });

  it('uses bounded store pagination, unique domain creation, and optimistic thread updates', async () => {
    const domainAdapter: MailFnDomainAdapter = {
      async getRequiredDnsRecords() { return []; },
      async createRouting() { return { routingRuleId: 'route' }; },
      async verifyDns() { return { verified: true, diagnostics: [] }; },
      async disableRouting() {},
    };
    const context = await setup({ domainAdapter });
    const created = await createInbox(context, 'paged');
    for (const id of ['one', 'two', 'three']) {
      const value = raw({ subject: `Paged common ${id}` });
      await context.mailfn.receiveInbound({
        providerDeliveryId: id, envelopeFrom: 'sender@example.com', envelopeTo: created.inbox.address,
        raw: value, rawSize: value.byteLength,
      });
    }
    const first = await context.mailfn.listMessages(context.admin, { inboxId: created.inbox.id, limit: 2 });
    const second = await context.mailfn.listMessages(context.admin, {
      inboxId: created.inbox.id, limit: 2, cursor: first.nextCursor,
    });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((message) => message.id)).size).toBe(3);
    const searchFirst = await context.mailfn.searchMessages(context.admin, {
      inboxId: created.inbox.id, query: 'common', limit: 2,
    });
    const searchSecond = await context.mailfn.searchMessages(context.admin, {
      inboxId: created.inbox.id, query: 'common', limit: 2, cursor: searchFirst.nextCursor,
    });
    expect(searchFirst.items).toHaveLength(2);
    expect(searchSecond.items).toHaveLength(1);

    const domains = await Promise.allSettled([
      context.mailfn.createDomain(context.admin, 'mail.example.com'),
      context.mailfn.createDomain(context.admin, 'mail.example.com'),
    ]);
    expect(domains.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(domains.filter((result) => result.status === 'rejected')).toMatchObject([{ reason: { code: 'MAILFN_CONFLICT' } }]);

    const thread = (await context.mailfn.listThreads(context.admin, created.inbox.id))[0]!;
    const firstUpdate = { ...thread, messageIds: [...thread.messageIds, 'extra-1'] };
    const staleUpdate = { ...thread, messageIds: [...thread.messageIds, 'extra-2'] };
    await expect(context.store.saveThreadIfUnchanged(firstUpdate, thread)).resolves.toBe(true);
    await expect(context.store.saveThreadIfUnchanged(staleUpdate, thread)).resolves.toBe(false);
    await expect(context.store.getThread(thread.id)).resolves.toMatchObject({ messageIds: expect.arrayContaining(['extra-1']) });
  });

  it('serializes concurrent subject-fallback thread creation', async () => {
    const context = await setup();
    const created = await createInbox(context, 'thread-race');
    const messages = await Promise.all(['race-1', 'race-2'].map((providerDeliveryId) => {
      const value = raw({ subject: 'Concurrent Subject' });
      return context.mailfn.receiveInbound({
        providerDeliveryId,
        envelopeFrom: 'sender@example.com',
        envelopeTo: created.inbox.address,
        raw: value,
        rawSize: value.byteLength,
      });
    }));

    expect(new Set(messages.map((message) => message.threadId)).size).toBe(1);
    await expect(context.mailfn.listThreads(context.admin, created.inbox.id)).resolves.toMatchObject([
      { normalizedSubject: 'concurrent subject', messageIds: expect.arrayContaining(messages.map((message) => message.id)) },
    ]);
  });
});
