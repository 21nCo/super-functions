import { addressDomain, normalizeAddress, normalizeDomain, normalizeEnvelopeSender, normalizeLocalPart } from './address.js';
import sanitizeMarkup from 'sanitize-html';
import type {
  MailFnClock,
  MailFnDomainAdapter,
  MailFnIdGenerator,
  MailFnMimeParser,
  MailFnObjectStore,
  MailFnQueue,
  MailFnSecretProtector,
  MailFnSendAdapter,
  MailFnStore,
  MailFnTokenCodec,
  MailFnWebhookDispatcher,
} from './contracts.js';
import {
  DEFAULT_EXPIRING_RETENTION,
  DEFAULT_PROJECT_QUOTA,
  DEFAULT_PUBLIC_PLATFORM_POLICY,
  DEFAULT_STABLE_RETENTION,
} from './defaults.js';
import { assertMailFn, MailFnError } from './errors.js';
import { extractOtp, extractVerificationLink } from './extraction.js';
import { defaultIdGenerator, sha256TokenCodec, systemClock } from './runtime.js';
import { resolveThread } from './threading.js';
import type {
  AbuseCase,
  Actor,
  Attachment,
  AttachmentDescriptor,
  AuditEvent,
  ComplianceExport,
  ComplianceProfile,
  CreateCredentialInput,
  CreatedCredential,
  CreateDraftInput,
  CreateInboxInput,
  CreateProjectInput,
  Credential,
  Draft,
  ExtractedVerification,
  Inbox,
  InboundEnvelope,
  InboundPreflight,
  IdempotencyRecord,
  ListMessagesInput,
  MailDomain,
  MailFnEvent,
  MailFnEventType,
  MailFnScope,
  Message,
  MessageFilter,
  OperationalAlert,
  OperationalSnapshot,
  Page,
  ParseJob,
  Project,
  PublicPlatformPolicy,
  RetentionPolicy,
  RetentionResult,
  SearchMessagesInput,
  SendRequest,
  SenderReputation,
  SupportCase,
  Thread,
  UpdateDraftInput,
  UpdateInboxInput,
  UsageRecord,
  WaitForMessageInput,
  WaitForMessageResult,
  Webhook,
  WebhookDelivery,
} from './types.js';
import { MAILFN_EVENT_TYPES, MAILFN_EVENT_VERSION, MAILFN_SCOPES } from './types.js';

export interface MailFnConfig {
  store: MailFnStore;
  objects: MailFnObjectStore;
  defaultDomain: string;
  queue?: MailFnQueue;
  mimeParser?: MailFnMimeParser;
  sendAdapter?: MailFnSendAdapter;
  domainAdapter?: MailFnDomainAdapter;
  webhookDispatcher?: MailFnWebhookDispatcher;
  secretProtector?: MailFnSecretProtector;
  clock?: MailFnClock;
  ids?: MailFnIdGenerator;
  tokens?: MailFnTokenCodec;
  publicPlatform?: Partial<PublicPlatformPolicy>;
}

export interface CreatedInbox {
  inbox: Inbox;
  credential: CreatedCredential;
}

export interface BootstrapResult {
  project: Project;
  credential: CreatedCredential;
}

export interface CreatedWebhook {
  webhook: Webhook;
  secret: string;
}

const PARSE_LEASE_MS = 15 * 60 * 1000;
const WEBHOOK_DELIVERY_LEASE_MS = 5 * 60 * 1000;
const STORAGE_RESERVATION_LEASE_MS = 15 * 60 * 1000;
const STORAGE_WRITE_LEASE_MS = 60 * 60 * 1000;

function isExpiredAt(expiresAt: string, now: string): boolean {
  return Date.parse(expiresAt) <= Date.parse(now);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string');
}

export class MailFn {
  private readonly store: MailFnStore;
  private readonly objects: MailFnObjectStore;
  private readonly defaultDomain: string;
  private readonly queue?: MailFnQueue;
  private readonly mimeParser?: MailFnMimeParser;
  private readonly sendAdapter?: MailFnSendAdapter;
  private readonly domainAdapter?: MailFnDomainAdapter;
  private readonly webhookDispatcher?: MailFnWebhookDispatcher;
  private readonly secretProtector?: MailFnSecretProtector;
  private readonly clock: MailFnClock;
  private readonly ids: MailFnIdGenerator;
  private readonly tokens: MailFnTokenCodec;
  private readonly publicPlatform: PublicPlatformPolicy;
  private readonly inboundPreflights = new Map<string, InboundPreflight>();

  public constructor(config: MailFnConfig) {
    this.store = config.store;
    this.objects = config.objects;
    this.defaultDomain = normalizeDomain(config.defaultDomain);
    this.queue = config.queue;
    this.mimeParser = config.mimeParser;
    this.sendAdapter = config.sendAdapter;
    this.domainAdapter = config.domainAdapter;
    this.webhookDispatcher = config.webhookDispatcher;
    this.secretProtector = config.secretProtector;
    this.clock = config.clock ?? systemClock;
    this.ids = config.ids ?? defaultIdGenerator;
    this.tokens = config.tokens ?? sha256TokenCodec;
    this.publicPlatform = {
      ...DEFAULT_PUBLIC_PLATFORM_POLICY,
      ...config.publicPlatform,
      allowedDataRegions:
        config.publicPlatform?.allowedDataRegions ?? DEFAULT_PUBLIC_PLATFORM_POLICY.allowedDataRegions,
    };
  }

  public async bootstrapProject(input: CreateProjectInput): Promise<BootstrapResult> {
    const existing = await this.store.getProjectBySlug(normalizeSlug(input.slug));
    if (existing) {
      throw new MailFnError({
        code: 'MAILFN_CONFLICT',
        message: 'Project slug already exists',
        status: 409,
      });
    }
    const now = this.now();
    const dataRegion = input.dataRegion ?? 'global';
    this.assertDataRegion(dataRegion);
    const project: Project = {
      id: this.ids.generate('prj'),
      slug: normalizeSlug(input.slug),
      displayName: requireText(input.displayName, 'displayName'),
      status: 'active',
      environment: input.environment?.trim() || 'production',
      dataRegion,
      defaultRetentionPolicy: mergeRetention(DEFAULT_STABLE_RETENTION, input.retentionPolicy),
      quota: { ...DEFAULT_PROJECT_QUOTA, ...input.quota },
      createdAt: now,
      updatedAt: now,
    };
    validateQuota(project.quota);
    const credential = await this.buildCredential({
      projectId: project.id,
      permissions: [...MAILFN_SCOPES],
    });
    const audit = await this.buildAuditEvent(
      {
        actorType: 'system',
        actorId: 'bootstrap',
        projectId: project.id,
        scopes: [...MAILFN_SCOPES],
      },
      'project.created',
      'project',
      project.id,
      { environment: project.environment, dataRegion: project.dataRegion },
      project,
    );
    try {
      await this.store.createProjectWithCredential(project, credential.credential, audit);
    } catch (cause) {
      if (await this.store.getProjectBySlug(project.slug)) {
        throw new MailFnError({ code: 'MAILFN_CONFLICT', message: 'Project slug already exists', status: 409, cause });
      }
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Project and bootstrap credential could not be created atomically',
        status: 503,
        retryable: true,
        cause,
      });
    }
    return { project, credential };
  }

  public async authenticate(token: string): Promise<Actor> {
    const match = /^mfn_(.+)_([a-f0-9]{64})$/.exec(token);
    if (!match?.[1]) throw unauthorized();
    const credential = await this.store.getCredential(match[1]);
    if (!credential || credential.status !== 'active') throw unauthorized();
    const now = this.now();
    if (credential.expiresAt && isExpiredAt(credential.expiresAt, now)) {
      await this.store.saveCredential({ ...credential, status: 'expired' });
      throw unauthorized();
    }
    const hash = await this.tokens.hash(token);
    if (!this.tokens.equals(hash, credential.tokenHash)) throw unauthorized();
    if (!(await this.store.touchCredentialIfActive(credential.id, now))) throw unauthorized();
    return {
      actorType: 'credential',
      actorId: credential.id,
      projectId: credential.projectId,
      inboxId: credential.inboxId,
      scopes: credential.permissions,
    };
  }

  public async createCredential(actor: Actor, input: CreateCredentialInput): Promise<CreatedCredential> {
    assertMailFn(Array.isArray(input.permissions), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Credential permissions must be an array', status: 400,
    });
    await this.authorize(actor, 'token:manage', input.projectId, input.inboxId);
    if (!actor.scopes.includes('project:admin')) {
      assertMailFn(input.permissions.every((scope) => actor.scopes.includes(scope)), {
        code: 'MAILFN_FORBIDDEN',
        message: 'Delegated credentials cannot exceed the actor scopes',
        status: 403,
      });
      assertMailFn(!actor.inboxId || input.inboxId === actor.inboxId, {
        code: 'MAILFN_FORBIDDEN',
        message: 'Inbox credentials cannot delegate outside their inbox',
        status: 403,
      });
    }
    if (input.inboxId) {
      const inbox = await this.requireInbox(input.projectId, input.inboxId);
      assertMailFn(
        inbox.status === 'active' && (!inbox.expiresAt || !isExpiredAt(inbox.expiresAt, this.now())),
        { code: 'MAILFN_INBOX_INACTIVE', message: 'Inbox is not active', status: 410 },
      );
    }
    const created = await this.issueCredential(input);
    await this.audit(actor, 'credential.created', 'credential', created.credential.id, {
      inboxId: input.inboxId ?? null,
      scopeCount: input.permissions.length,
    });
    return created;
  }

  public async rotateCredential(actor: Actor, credentialId: string, idempotencyKey: string): Promise<CreatedCredential> {
    const credential = await this.requireCredential(credentialId);
    await this.authorize(actor, 'token:manage', credential.projectId, credential.inboxId);
    if (!actor.scopes.includes('project:admin')) {
      assertMailFn(credential.permissions.every((scope) => actor.scopes.includes(scope)), {
        code: 'MAILFN_FORBIDDEN',
        message: 'Rotated credentials cannot exceed the actor scopes',
        status: 403,
      });
      assertMailFn(!actor.inboxId || credential.inboxId === actor.inboxId, {
        code: 'MAILFN_FORBIDDEN',
        message: 'Inbox credentials cannot rotate credentials outside their inbox',
        status: 403,
      });
    }
    assertMailFn(idempotencyKey.trim().length > 0, {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Credential rotation requires an idempotency key', status: 400,
    });
    assertMailFn(this.secretProtector, {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Secret protection must be configured before rotating credentials', status: 500,
    });
    const key = `credential.rotate:${idempotencyKey}`;
    const stored = await this.store.getIdempotency(credential.projectId, key);
    if (stored && !isExpiredAt(stored.expiresAt, this.now())) {
      return this.completeCredentialRotation(actor, credential, stored);
    }
    if (stored) await this.store.deleteExpiredIdempotency(credential.projectId, key, this.now());

    const replacement = await this.buildCredential({
      projectId: credential.projectId,
      inboxId: credential.inboxId,
      permissions: credential.permissions,
      expiresAt: credential.expiresAt,
    });
    const now = this.now();
    const record: IdempotencyRecord = {
      key,
      projectId: credential.projectId,
      operation: 'credential.rotate',
      resourceId: replacement.credential.id,
      requestHash: credential.id,
      responseCiphertext: await this.secretProtector.protect(replacement.token),
      expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    };
    if (await this.store.createIdempotency(record)) {
      await this.store.saveCredential(replacement.credential);
      await this.audit(actor, 'credential.created', 'credential', replacement.credential.id, {
        inboxId: credential.inboxId ?? null,
        scopeCount: credential.permissions.length,
      });
    }
    const claimed = await this.store.getIdempotency(credential.projectId, key);
    assertMailFn(claimed, {
      code: 'MAILFN_STORAGE_FAILED', message: 'Credential rotation could not be claimed', status: 503, retryable: true,
    });
    return this.completeCredentialRotation(actor, credential, claimed);
  }

  public async revokeCredential(actor: Actor, credentialId: string, expectedInboxId?: string): Promise<Credential> {
    const credential = await this.requireCredential(credentialId);
    if (expectedInboxId !== undefined && credential.inboxId !== expectedInboxId) throw notFound('Credential');
    await this.authorize(actor, 'token:manage', credential.projectId, credential.inboxId);
    const updated: Credential = {
      ...credential,
      status: 'revoked',
      revokedAt: this.now(),
    };
    await this.store.saveCredential(updated);
    await this.audit(actor, 'credential.revoked', 'credential', credential.id, {});
    await this.event('credential.revoked', credential.projectId, {
      inboxId: credential.inboxId,
      payload: { credentialId: credential.id },
    });
    return updated;
  }

  public async createInbox(actor: Actor, input: CreateInboxInput): Promise<CreatedInbox> {
    assertMailFn(input.kind === 'stable' || input.kind === 'expiring', {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Inbox kind must be stable or expiring', status: 400,
    });
    assertMailFn(
      input.metadata === undefined || isStringRecord(input.metadata),
      { code: 'MAILFN_VALIDATION_FAILED', message: 'Inbox metadata values must be strings', status: 400 },
    );
    await this.authorize(actor, 'inbox:create', input.projectId);
    const project = await this.requireProject(input.projectId);
    const requestHash = await this.tokens.hash(JSON.stringify(normalizeIdempotentInboxInput(input)));
    if (input.idempotencyKey) {
      const replay = await this.replayInboxCreate(input.projectId, input.idempotencyKey, requestHash);
      if (replay) return replay;
    }
    const active = (await this.store.listInboxes(project.id)).filter((inbox) => inbox.status === 'active');
    if (active.length >= project.quota.maxActiveInboxes) throw quotaExceeded('active inboxes');
    const localPart = input.requestedLocalPart
      ? normalizeLocalPart(input.requestedLocalPart)
      : `inbox-${this.ids.generate('addr').replace(/^addr_/, '').slice(0, 20)}`;
    const domain = normalizeDomain(input.domain ?? this.defaultDomain);
    if (domain !== this.defaultDomain) {
      const configured = await this.store.getDomainByName(project.id, domain);
      assertMailFn(configured?.status === 'active' || configured?.status === 'verified', {
        code: 'MAILFN_DOMAIN_UNVERIFIED',
        message: 'Custom domain is not verified and active',
        status: 409,
      });
    }
    const address = normalizeAddress(`${localPart}@${domain}`);
    if (await this.store.getInboxByAddress(address)) {
      throw new MailFnError({ code: 'MAILFN_CONFLICT', message: 'Inbox address already exists', status: 409 });
    }
    const now = this.now();
    const expiresAt = resolveInboxExpiry(input, now);
    const inbox: Inbox = {
      id: this.ids.generate('inb'),
      projectId: project.id,
      address,
      displayName: input.displayName?.trim() || undefined,
      kind: input.kind,
      status: 'active',
      metadata: { ...(input.metadata ?? {}) },
      labels: [],
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };
    const credential = await this.buildCredential({
      projectId: project.id,
      inboxId: inbox.id,
      permissions: [
        'inbox:read',
        'inbox:write',
        'message:read',
        'message:wait',
        'message:extract',
        'message:label',
        'message:search',
        'draft:write',
      ],
      expiresAt: inbox.expiresAt,
    });
    const idempotency: IdempotencyRecord | undefined = input.idempotencyKey
      ? {
        key: input.idempotencyKey,
        projectId: project.id,
        operation: 'inbox.create',
        resourceId: inbox.id,
        requestHash,
        credentialId: credential.credential.id,
        responseCiphertext: this.secretProtector
          ? await this.secretProtector.protect(credential.token)
          : undefined,
        expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
        createdAt: now,
      }
      : undefined;
    try {
      await this.store.createInboxWithCredential(inbox, credential.credential, idempotency, project.quota.maxActiveInboxes);
    } catch (cause) {
      if (input.idempotencyKey) {
        const replay = await this.replayInboxCreate(project.id, input.idempotencyKey, requestHash);
        if (replay) return replay;
      }
      if (await this.store.getInboxByAddress(address)) {
        throw new MailFnError({ code: 'MAILFN_CONFLICT', message: 'Inbox address already exists', status: 409, cause });
      }
      if ((await this.store.listInboxes(project.id)).filter((entry) => entry.status === 'active').length >= project.quota.maxActiveInboxes) {
        throw quotaExceeded('active inboxes');
      }
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Inbox and credential could not be created atomically',
        status: 503,
        retryable: true,
        cause,
      });
    }
    await this.audit(actor, 'inbox.created', 'inbox', inbox.id, {
      kind: inbox.kind,
      expiresAt: inbox.expiresAt ?? null,
    });
    return { inbox, credential };
  }

  public async getInbox(actor: Actor, inboxId: string): Promise<Inbox> {
    const inbox = await this.requireInbox(actor.projectId, inboxId);
    await this.authorize(actor, 'inbox:read', inbox.projectId, inbox.id);
    return inbox;
  }

  public async listInboxes(actor: Actor): Promise<Inbox[]> {
    await this.authorize(actor, 'inbox:read', actor.projectId, actor.inboxId);
    const inboxes = await this.store.listInboxes(actor.projectId);
    return actor.inboxId ? inboxes.filter((inbox) => inbox.id === actor.inboxId) : inboxes;
  }

  public async updateInbox(actor: Actor, inboxId: string, input: UpdateInboxInput): Promise<Inbox> {
    const inbox = await this.requireInbox(actor.projectId, inboxId);
    await this.authorize(actor, 'inbox:write', inbox.projectId, inbox.id);
    assertMailFn(inbox.status !== 'deleting', {
      code: 'MAILFN_CONFLICT', message: 'Inbox deletion is already in progress', status: 409,
    });
    assertMailFn(input.status === undefined || input.status === 'active' || input.status === 'disabled', {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Inbox status must be active or disabled', status: 400,
    });
    assertMailFn(input.metadata === undefined || isStringRecord(input.metadata), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Inbox metadata values must be strings', status: 400,
    });
    const expiresAt = input.expiresAt === null ? undefined : input.expiresAt ?? inbox.expiresAt;
    if (expiresAt) requireFutureIso(expiresAt, this.now(), 'expiresAt');
    const updated: Inbox = {
      ...inbox,
      displayName: input.displayName === undefined ? inbox.displayName : input.displayName.trim() || undefined,
      status: input.status ?? inbox.status,
      metadata: input.metadata ? { ...input.metadata } : inbox.metadata,
      labels: input.labels ? normalizeLabels(input.labels) : inbox.labels,
      expiresAt,
      updatedAt: this.now(),
    };
    if (updated.status === 'active') {
      const project = await this.requireProject(inbox.projectId);
      if (!(await this.store.saveInboxWithActiveQuota(updated, project.quota.maxActiveInboxes))) {
        const latest = await this.store.getInbox(inbox.id);
        if (!latest || latest.status === 'deleted') throw notFound('Inbox');
        assertMailFn(latest.status !== 'deleting', {
          code: 'MAILFN_CONFLICT', message: 'Inbox deletion is already in progress', status: 409,
        });
        throw quotaExceeded('active inboxes');
      }
    } else {
      await this.store.saveInbox(updated);
    }
    await this.audit(actor, 'inbox.updated', 'inbox', inbox.id, { status: updated.status });
    return updated;
  }

  public async deleteInbox(actor: Actor, inboxId: string): Promise<Inbox> {
    const inbox = await this.requireInbox(actor.projectId, inboxId);
    await this.authorize(actor, 'inbox:delete', inbox.projectId, inbox.id);
    const compliance = await this.store.getComplianceProfile(inbox.projectId);
    assertMailFn(!compliance?.retentionLocked, {
      code: 'MAILFN_CONFLICT',
      message: 'Inbox deletion is blocked by the project retention lock',
      status: 409,
    });
    const startedAt = this.now();
    const deletionDueAt = compliance
      ? new Date(Date.parse(startedAt) + compliance.deletionSlaHours * 60 * 60 * 1000).toISOString()
      : undefined;
    const quiesced: Inbox = { ...inbox, status: 'deleting', updatedAt: startedAt };
    await this.store.saveInbox(quiesced);
    for (const credential of await this.store.listCredentials(inbox.projectId, inbox.id)) {
      if (credential.status === 'active') {
        await this.store.saveCredential({ ...credential, status: 'revoked', revokedAt: this.now() });
      }
    }
    await this.audit(actor, 'inbox.deletion_started', 'inbox', inbox.id, {
      inboxId: inbox.id,
      deletionDueAt: deletionDueAt ?? null,
    });
    // Quiesce before cleanup so new inbound writes cannot race past the message
    // listing. The deleting state remains retryable when object cleanup fails.
    await this.deleteInboxMessages(quiesced);
    await this.store.deleteDrafts(quiesced.projectId, quiesced.id);
    for (const webhook of await this.store.listWebhooks(quiesced.projectId, quiesced.id)) {
      if (webhook.status !== 'disabled') await this.store.saveWebhook({ ...webhook, status: 'disabled', updatedAt: this.now() });
    }
    const completedAt = this.now();
    const updated: Inbox = { ...quiesced, status: 'deleted', updatedAt: completedAt };
    await this.store.saveInbox(updated);
    await this.audit(actor, 'inbox.deleted', 'inbox', inbox.id, {
      inboxId: inbox.id,
      deletionDueAt: deletionDueAt ?? null,
      completedAt,
      metDeletionSla: deletionDueAt ? completedAt <= deletionDueAt : true,
    });
    return updated;
  }

  public async preflightInbound(
    input: Pick<InboundEnvelope, 'envelopeFrom' | 'envelopeTo' | 'rawSize'>,
  ): Promise<InboundPreflight> {
    const recipient = normalizeAddress(input.envelopeTo);
    const inbox = await this.store.getInboxByAddress(recipient);
    if (!inbox) throw unknownRecipient();
    const now = this.now();
    if (inbox.status !== 'active' || (inbox.expiresAt && isExpiredAt(inbox.expiresAt, now))) {
      throw new MailFnError({
        code: 'MAILFN_INBOX_INACTIVE',
        message: 'Recipient inbox is not active',
        status: 410,
      });
    }
    const project = await this.requireProject(inbox.projectId);
    if (!Number.isSafeInteger(input.rawSize) || input.rawSize < 0 || input.rawSize > project.quota.maxMessageBytes) {
      throw new MailFnError({
        code: 'MAILFN_MESSAGE_TOO_LARGE',
        message: 'Inbound message exceeds the configured size limit',
        status: 413,
      });
    }
    const envelopeFrom = normalizeEnvelopeSender(input.envelopeFrom);
    const senderReputation = envelopeFrom ? await this.store.getSenderReputation(project.id, envelopeFrom) : null;
    if (senderReputation?.status === 'block') {
      await this.systemAudit(project.id, 'sender.blocked', 'inbox', inbox.id, {
        inboxId: inbox.id,
        senderScore: senderReputation.score,
      }).catch(() => undefined);
      throw new MailFnError({
        code: 'MAILFN_SENDER_BLOCKED',
        message: 'Sender is blocked by recipient policy',
        status: 403,
      });
    }
    const messageId = this.ids.generate('msg');
    const reservation = await this.store.reserveIngressQuota({
      id: messageId,
      projectId: project.id,
      inboxId: inbox.id,
      sender: envelopeFrom,
      bucket: `${now.slice(0, 13)}:00:00.000Z`,
      projectLimit: project.quota.maxMessagesPerHour,
      inboxLimit: project.quota.maxMessagesPerInboxPerHour,
      senderLimit: project.quota.maxMessagesPerSenderPerHour,
      createdAt: now,
    });
    if (!reservation.allowed) {
      await this.systemAudit(project.id, 'rate_limit.exceeded', 'inbox', inbox.id, {
        dimension: `${reservation.dimension}_messages_per_hour`,
        inboxId: inbox.id,
      }).catch(() => undefined);
      throw new MailFnError({
        code: 'MAILFN_RATE_LIMITED',
        message: `${reservation.dimension} inbound message rate limit exceeded`,
        status: 429,
        retryable: true,
        details: { dimension: reservation.dimension },
      });
    }
    let storageReservation: 'created' | 'existing' | 'denied';
    try {
      storageReservation = await this.store.reserveStorage({
        id: messageId,
        projectId: project.id,
        bytes: input.rawSize,
        createdAt: now,
      }, project.quota.maxStoredBytes);
    } catch (cause) {
      await this.store.releaseIngressQuota(messageId).catch(() => undefined);
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED', message: 'Storage quota could not be reserved', status: 503, retryable: true, cause,
      });
    }
    if (storageReservation === 'denied') {
      await this.store.releaseIngressQuota(messageId).catch(() => undefined);
      await this.systemAudit(project.id, 'quota.exceeded', 'project', project.id, {
        dimension: 'stored_bytes',
      }).catch(() => undefined);
      throw quotaExceeded('stored bytes');
    }
    const preflight: InboundPreflight = {
      reservationId: messageId,
      projectId: project.id,
      inboxId: inbox.id,
      envelopeFrom,
      envelopeTo: recipient,
      rawSize: input.rawSize,
      createdAt: now,
      storageReserved: storageReservation === 'created',
    };
    this.inboundPreflights.set(messageId, preflight);
    return { ...preflight };
  }

  public async cancelInbound(preflight: InboundPreflight): Promise<void> {
    if (!this.matchesInboundPreflight(preflight)) return;
    await this.store.releaseIngressQuota(preflight.reservationId);
    if (preflight.storageReserved) await this.store.releaseStorage(preflight.reservationId);
    this.inboundPreflights.delete(preflight.reservationId);
  }

  public async receiveInbound(input: InboundEnvelope, preflight?: InboundPreflight): Promise<Message> {
    const recipient = normalizeAddress(input.envelopeTo);
    const envelopeFrom = normalizeEnvelopeSender(input.envelopeFrom);
    const providerDeliveryId = requireText(input.providerDeliveryId, 'providerDeliveryId');
    const now = this.now();
    const receivedAt = input.receivedAt ?? now;
    assertMailFn(Number.isFinite(Date.parse(receivedAt)), {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Inbound receivedAt must be an ISO timestamp',
      status: 400,
    });
    if (input.rawSize !== input.raw.byteLength) {
      if (preflight) await this.cancelInbound(preflight);
      throw new MailFnError({
        code: 'MAILFN_MESSAGE_TOO_LARGE',
        message: 'Inbound message size does not match the received bytes',
        status: 413,
      });
    }
    const inbox = await this.store.getInboxByAddress(recipient);
    if (!inbox) {
      if (preflight) await this.cancelInbound(preflight);
      throw unknownRecipient();
    }
    const existing = await this.store.getMessageByDelivery(inbox.id, providerDeliveryId);
    if (existing) {
      if (preflight) await this.cancelInbound(preflight);
      if ((existing.status === 'pending' || existing.status === 'queue_failed') && this.queue) {
        await this.enqueueParse(existing);
      }
      return (await this.store.getMessage(existing.id)) ?? existing;
    }
    const reservation = preflight ?? await this.preflightInbound(input);
    if (
      reservation.inboxId !== inbox.id || reservation.projectId !== inbox.projectId ||
      reservation.envelopeFrom !== envelopeFrom || reservation.envelopeTo !== recipient ||
      reservation.rawSize !== input.rawSize
    ) {
      await this.cancelInbound(reservation);
      throw new MailFnError({
        code: 'MAILFN_VALIDATION_FAILED',
        message: 'Inbound preflight does not match the delivered message',
        status: 400,
      });
    }
    if (inbox.status !== 'active' || (inbox.expiresAt && isExpiredAt(inbox.expiresAt, now))) {
      await this.cancelInbound(reservation);
      throw new MailFnError({ code: 'MAILFN_INBOX_INACTIVE', message: 'Recipient inbox is not active', status: 410 });
    }
    const project = await this.requireProject(reservation.projectId);
    if (!this.consumeInboundPreflight(reservation)) {
      throw new MailFnError({
        code: 'MAILFN_CONFLICT',
        message: 'Inbound preflight is missing, expired, or already consumed',
        status: 409,
      });
    }
    const messageId = reservation.reservationId;
    const storageReservation = reservation.storageReserved ? 'created' as const : 'existing' as const;
    if (!(await this.store.claimStorage(messageId, now))) {
      await this.store.releaseIngressQuota(messageId).catch(() => undefined);
      throw new MailFnError({
        code: 'MAILFN_CONFLICT',
        message: 'Inbound storage reservation is missing or expired',
        status: 409,
        retryable: true,
      });
    }
    const rawObjectKey = objectKey(project.id, inbox.id, messageId, 'raw.eml');
    try {
      await this.objects.put(rawObjectKey, input.raw, {
        contentType: 'message/rfc822',
        metadata: { projectId: project.id, inboxId: inbox.id, messageId },
      });
    } catch (error) {
      await this.store.releaseIngressQuota(messageId).catch(() => undefined);
      if (storageReservation === 'created') await this.store.releaseStorage(messageId).catch(() => undefined);
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Raw message could not be stored',
        status: 503,
        retryable: true,
        cause: error,
      });
    }
    const retention = inbox.kind === 'expiring' ? DEFAULT_EXPIRING_RETENTION : project.defaultRetentionPolicy;
    const message: Message = {
      id: messageId,
      projectId: project.id,
      inboxId: inbox.id,
      providerDeliveryId,
      envelopeFrom,
      envelopeTo: recipient,
      from: [{ address: envelopeFrom }],
      to: [{ address: recipient }],
      cc: [],
      bcc: [],
      replyTo: [],
      subject: headerFirst(input.headers, 'subject') ?? '',
      receivedAt,
      headers: input.headers ?? {},
      rawObjectKey,
      rawRetentionExpiresAt: new Date(Date.parse(receivedAt) + retention.rawTtlSeconds * 1000).toISOString(),
      attachmentRetentionExpiresAt: new Date(Date.parse(receivedAt) + retention.attachmentTtlSeconds * 1000).toISOString(),
      references: [],
      authenticationResults: input.authenticationResults ?? {},
      sizeBytes: input.rawSize,
      status: 'pending',
      labels: [],
      retentionExpiresAt: new Date(Date.parse(receivedAt) + retention.messageTtlSeconds * 1000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };
    let created = false;
    try {
      created = await this.store.createInboundMessageIfInboxActive(message);
    } catch (error) {
      await this.objects.delete(rawObjectKey).catch(() => undefined);
      await this.store.releaseIngressQuota(messageId).catch(() => undefined);
      if (storageReservation === 'created') await this.store.releaseStorage(messageId).catch(() => undefined);
      const canonical = await this.store.getMessageByDelivery(inbox.id, providerDeliveryId).catch(() => null);
      if (canonical) {
        if ((canonical.status === 'pending' || canonical.status === 'queue_failed') && this.queue) {
          await this.enqueueParse(canonical);
        }
        return (await this.store.getMessage(canonical.id)) ?? canonical;
      }
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Message metadata could not be stored',
        status: 503,
        retryable: true,
        cause: error,
      });
    }
    if (!created) {
      await this.objects.delete(rawObjectKey).catch(() => undefined);
      await this.store.releaseIngressQuota(messageId).catch(() => undefined);
      if (storageReservation === 'created') await this.store.releaseStorage(messageId).catch(() => undefined);
      const canonical = await this.store.getMessageByDelivery(inbox.id, providerDeliveryId).catch(() => null);
      if (canonical) {
        if ((canonical.status === 'pending' || canonical.status === 'queue_failed') && this.queue) {
          await this.enqueueParse(canonical);
        }
        return (await this.store.getMessage(canonical.id)) ?? canonical;
      }
      const currentInbox = await this.store.getInbox(inbox.id);
      if (!currentInbox || currentInbox.status !== 'active') {
        throw new MailFnError({ code: 'MAILFN_INBOX_INACTIVE', message: 'Recipient inbox is not active', status: 410 });
      }
      throw new MailFnError({
        code: 'MAILFN_CONFLICT',
        message: 'Inbound message identity is already in use',
        status: 409,
      });
    }
    await this.store.releaseStorageClaim(messageId).catch(() => undefined);
    await this.usage(project.id, 'inbound_message', 1, message.id).catch(() =>
      this.systemAudit(project.id, 'usage.append_failed', 'message', message.id, { metric: 'inbound_message' }).catch(() => undefined),
    );
    await this.usage(project.id, 'stored_bytes', message.sizeBytes, message.id).catch(() =>
      this.systemAudit(project.id, 'usage.append_failed', 'message', message.id, { metric: 'stored_bytes' }).catch(() => undefined),
    );
    await this.event('message.received', project.id, {
      inboxId: inbox.id,
      messageId: message.id,
      payload: { sizeBytes: message.sizeBytes, status: message.status },
    }).catch(() => this.systemAudit(project.id, 'event.append_failed', 'message', message.id, {
      eventType: 'message.received',
    }).catch(() => undefined));

    if (this.queue) {
      await this.enqueueParse(message);
    } else if (this.mimeParser) {
      await this.parseMessage(this.parseJob(message));
    }
    return (await this.store.getMessage(message.id)) ?? message;
  }

  private consumeInboundPreflight(preflight: InboundPreflight): boolean {
    if (!this.matchesInboundPreflight(preflight)) return false;
    this.inboundPreflights.delete(preflight.reservationId);
    return true;
  }

  private matchesInboundPreflight(preflight: InboundPreflight): boolean {
    const stored = this.inboundPreflights.get(preflight.reservationId);
    if (!stored ||
      stored.projectId !== preflight.projectId || stored.inboxId !== preflight.inboxId ||
      stored.envelopeFrom !== preflight.envelopeFrom || stored.envelopeTo !== preflight.envelopeTo ||
      stored.rawSize !== preflight.rawSize || stored.createdAt !== preflight.createdAt ||
      stored.storageReserved !== preflight.storageReserved
    ) return false;
    if (Date.parse(stored.createdAt) <= this.clock.now().getTime() - STORAGE_RESERVATION_LEASE_MS) {
      this.inboundPreflights.delete(preflight.reservationId);
      return false;
    }
    return true;
  }

  public async parseMessage(job: ParseJob): Promise<Message> {
    assertMailFn(job.version === 1 && job.type === 'mailfn.parse', {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Unsupported parse job version',
      status: 400,
    });
    assertMailFn(this.mimeParser, {
      code: 'MAILFN_PARSE_FAILED',
      message: 'No MIME parser is configured',
      status: 500,
    });
    const observed = await this.requireMessage(job.projectId, job.inboxId, job.messageId);
    if (observed.status === 'ready') return observed;
    const claimedAt = this.now();
    const leaseExpiresAt = new Date(Date.parse(claimedAt) + PARSE_LEASE_MS).toISOString();
    if (!(await this.store.claimMessageForParsing(observed.id, claimedAt, leaseExpiresAt))) {
      return (await this.store.getMessage(observed.id)) ?? observed;
    }
    const message = await this.requireMessage(job.projectId, job.inboxId, job.messageId);
    const written: Array<{ attachment: Attachment; key: string }> = [];
    const reservedAttachmentIds: string[] = [];
    try {
      const raw = await this.objects.get(message.rawObjectKey);
      assertMailFn(raw, {
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Raw MIME object is missing',
        status: 503,
        retryable: true,
      });
      const project = await this.requireProject(message.projectId);
      const parsed = await this.mimeParser.parse(raw);
      for (const [attachmentIndex, parsedAttachment] of parsed.attachments.entries()) {
        if (parsedAttachment.content.byteLength > project.quota.maxAttachmentBytes) {
          throw new MailFnError({
            code: 'MAILFN_ATTACHMENT_TOO_LARGE',
            message: 'Attachment exceeds the configured size limit',
            status: 413,
          });
        }
        const attachmentId = await deterministicAttachmentId(message.id, attachmentIndex);
        const storageReservation = await this.store.reserveStorage({
          id: attachmentId,
          projectId: project.id,
          bytes: parsedAttachment.content.byteLength,
          createdAt: this.now(),
        }, project.quota.maxStoredBytes);
        if (storageReservation === 'denied') throw quotaExceeded('stored bytes');
        if (!(await this.store.claimStorage(attachmentId, this.now()))) {
          throw new MailFnError({
            code: 'MAILFN_STORAGE_FAILED',
            message: 'Attachment storage reservation is missing or expired',
            status: 503,
            retryable: true,
          });
        }
        reservedAttachmentIds.push(attachmentId);
        const key = objectKey(project.id, message.inboxId, message.id, `attachments/${attachmentId}`);
        const attachment: Attachment = {
          id: attachmentId,
          projectId: project.id,
          inboxId: message.inboxId,
          messageId: message.id,
          filename: sanitizeFilename(parsedAttachment.filename ?? 'attachment'),
          contentType: normalizeContentType(parsedAttachment.contentType),
          sizeBytes: parsedAttachment.content.byteLength,
          objectKey: key,
          sha256: await sha256(parsedAttachment.content),
          contentId: parsedAttachment.contentId,
          disposition: parsedAttachment.disposition,
          createdAt: this.now(),
        };
        await this.objects.put(key, parsedAttachment.content, {
          contentType: attachment.contentType,
          metadata: { projectId: project.id, inboxId: message.inboxId, messageId: message.id },
        });
        written.push({ attachment, key });
        await this.store.saveAttachment(attachment);
        await this.store.releaseStorageClaim(attachmentId).catch(() => undefined);
        await this.usage(project.id, 'attachment_bytes', attachment.sizeBytes, attachment.id).catch(() =>
          this.systemAudit(project.id, 'usage.append_failed', 'attachment', attachment.id, { metric: 'attachment_bytes' }).catch(() => undefined),
        );
      }
      const now = this.now();
      const updated: Message = {
        ...message,
        internetMessageId: parsed.internetMessageId ?? message.internetMessageId,
        from: parsed.from.length ? normalizeMailAddresses(parsed.from) : message.from,
        to: parsed.to.length ? normalizeMailAddresses(parsed.to) : message.to,
        cc: normalizeMailAddresses(parsed.cc ?? []),
        bcc: normalizeMailAddresses(parsed.bcc ?? []),
        replyTo: normalizeMailAddresses(parsed.replyTo ?? []),
        subject: parsed.subject?.trim() ?? message.subject,
        textBody: parsed.text,
        htmlBody: parsed.html ? sanitizeHtml(parsed.html) : undefined,
        headers: parsed.headers,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references ?? [],
        authenticationResults: {
          ...(parsed.authenticationResults ?? {}),
          ...message.authenticationResults,
        },
        parsedAt: now,
        status: 'ready',
        parseErrorCode: undefined,
        parseRetryable: undefined,
        parseLeaseExpiresAt: undefined,
        updatedAt: now,
      };
      let thread: Thread | undefined;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const existingMessages = await this.store.listMessages(project.id, message.inboxId);
        const threads = await this.store.listThreads(project.id, message.inboxId);
        const candidate = resolveThread(updated, threads, existingMessages, this.ids, now);
        const expected = threads.find((entry) => entry.id === candidate.id) ?? null;
        if (await this.store.saveThreadIfUnchanged(candidate, expected)) {
          thread = candidate;
          break;
        }
      }
      if (!thread) {
        throw new MailFnError({
          code: 'MAILFN_STORAGE_FAILED', message: 'Thread membership update conflicted repeatedly',
          status: 503, retryable: true,
        });
      }
      updated.threadId = thread.id;
      await this.store.saveMessage(updated);
      await this.event('message.parsed', project.id, {
        inboxId: message.inboxId,
        messageId: message.id,
        payload: { attachmentCount: written.length, threadId: thread.id },
      }).catch(() => this.systemAudit(project.id, 'event.append_failed', 'message', message.id, {
        eventType: 'message.parsed',
      }).catch(() => undefined));
      return updated;
    } catch (error) {
      for (const entry of written) {
        await this.objects.delete(entry.key).catch(() => undefined);
        await this.store.deleteAttachment(entry.attachment.id).catch(() => undefined);
      }
      for (const attachmentId of reservedAttachmentIds) {
        await this.store.releaseStorage(attachmentId).catch(() => undefined);
      }
      const normalizedError = error instanceof MailFnError
        ? error
        : new MailFnError({
            code: 'MAILFN_PARSE_FAILED',
            message: 'MIME parsing failed',
            status: 422,
            retryable: true,
            cause: error,
          });
      const failed: Message = {
        ...message,
        status: 'parse_failed',
        parseErrorCode: normalizedError.code,
        parseRetryable: normalizedError.retryable,
        parseLeaseExpiresAt: undefined,
        updatedAt: this.now(),
      };
      await this.store.saveMessage(failed);
      await this.event('message.parse_failed', message.projectId, {
        inboxId: message.inboxId,
        messageId: message.id,
        payload: { errorCode: failed.parseErrorCode ?? 'MAILFN_PARSE_FAILED', retryable: normalizedError.retryable },
      });
      throw normalizedError;
    }
  }

  public async retryPendingMessages(projectId?: string, limit = 100): Promise<number> {
    assertMailFn(this.queue, {
      code: 'MAILFN_QUEUE_FAILED',
      message: 'No queue is configured',
      status: 503,
      retryable: true,
    });
    let queued = 0;
    const projects = projectId ? [await this.requireProject(projectId)] : await this.store.listProjects();
    for (const project of projects) {
      for (const inbox of await this.store.listInboxes(project.id)) {
        const messages = await this.store.listMessages(project.id, inbox.id);
        for (const message of messages) {
          if (queued >= limit) return queued;
          if (
            message.status === 'pending' ||
            message.status === 'queue_failed' ||
            (message.status === 'parse_failed' && message.parseRetryable !== false)
          ) {
            await this.enqueueParse(message);
            queued += 1;
          }
        }
      }
    }
    return queued;
  }

  public async retryWebhookDeliveries(projectId?: string, limit = 100): Promise<number> {
    if (!this.webhookDispatcher || !this.secretProtector) return 0;
    const projects = projectId ? [await this.requireProject(projectId)] : await this.store.listProjects();
    let processed = 0;
    for (const project of projects) {
      const events = new Map((await this.store.listEvents(project.id)).map((event) => [event.id, event]));
      for (const listedWebhook of await this.store.listWebhooks(project.id)) {
        let webhook = listedWebhook;
        if (webhook.status !== 'active') continue;
        for (const delivery of await this.store.listWebhookDeliveries(webhook.id)) {
          if (processed >= limit) return processed;
          const now = this.now();
          const failedReady = delivery.status === 'failed'
            && delivery.nextAttemptAt !== undefined
            && delivery.nextAttemptAt <= now;
          const abandonedPending = delivery.status === 'pending'
            && delivery.updatedAt <= new Date(Date.parse(now) - WEBHOOK_DELIVERY_LEASE_MS).toISOString();
          if (!failedReady && !abandonedPending) continue;
          const claimed: WebhookDelivery = {
            ...delivery,
            attempt: delivery.attempt + 1,
            status: 'pending',
            nextAttemptAt: undefined,
            updatedAt: now,
          };
          if (!(await this.store.claimWebhookDelivery(
            delivery.id,
            delivery.status,
            delivery.updatedAt,
            claimed,
          ))) continue;
          const event = events.get(delivery.eventId);
          if (!event) {
            await this.store.saveWebhookDelivery({
              ...claimed,
              status: 'dead_letter',
              nextAttemptAt: undefined,
              updatedAt: this.now(),
            });
            processed += 1;
            continue;
          }
          await this.deliverWebhook(webhook, event, claimed);
          webhook = (await this.store.getWebhook(webhook.id)) ?? webhook;
          processed += 1;
          if (webhook.status !== 'active') break;
        }
      }
    }
    return processed;
  }

  public async listMessages(actor: Actor, input: Omit<ListMessagesInput, 'projectId'>): Promise<Page<Message>> {
    await this.authorize(actor, 'message:read', actor.projectId, input.inboxId);
    await this.requireInbox(actor.projectId, input.inboxId);
    const filter = normalizeMessageFilter(input);
    const limit = boundedInteger(input.limit, 25, 1, 100, 'limit');
    const cursorContext = {
      kind: 'list' as const,
      projectId: actor.projectId,
      inboxId: input.inboxId,
      scope: listCursorScope(filter),
    };
    const cursorId = input.cursor ? decodeCursor(input.cursor, cursorContext) : undefined;
    const page = await this.store.listMessagesPage(actor.projectId, input.inboxId, filter, cursorId, limit);
    if (!page.cursorFound) {
      throw new MailFnError({
        code: 'MAILFN_VALIDATION_FAILED', message: 'Cursor no longer identifies this result set', status: 400,
      });
    }
    return {
      items: page.items,
      nextCursor: page.hasMore && page.items.length
        ? encodeCursor({ ...cursorContext, id: page.items.at(-1)!.id })
        : undefined,
    };
  }

  public async getMessage(actor: Actor, inboxId: string, messageId: string, markRead = true): Promise<Message> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    const message = await this.requireMessage(actor.projectId, inboxId, messageId);
    if (!markRead || message.readAt) return message;
    const updated = await this.store.markMessageRead(message.id, this.now());
    if (!updated) throw notFound('Message');
    await this.audit(actor, 'message.read', 'message', message.id, { inboxId });
    return updated;
  }

  public async getRawMessage(actor: Actor, inboxId: string, messageId: string): Promise<Uint8Array> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    const message = await this.requireMessage(actor.projectId, inboxId, messageId);
    if (message.rawDeletedAt) throw notFound('Raw message');
    const raw = await this.objects.get(message.rawObjectKey);
    if (!raw) throw notFound('Raw message');
    return raw;
  }

  public async getAttachment(actor: Actor, inboxId: string, messageId: string, attachmentId: string): Promise<{ attachment: Attachment; data: Uint8Array }> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    await this.requireMessage(actor.projectId, inboxId, messageId);
    const attachment = await this.store.getAttachment(attachmentId);
    if (!attachment || attachment.messageId !== messageId || attachment.inboxId !== inboxId) throw notFound('Attachment');
    const data = await this.objects.get(attachment.objectKey);
    if (!data) throw notFound('Attachment object');
    return { attachment, data };
  }

  public async listAttachments(actor: Actor, inboxId: string, messageId: string): Promise<AttachmentDescriptor[]> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    await this.requireMessage(actor.projectId, inboxId, messageId);
    return (await this.store.listAttachments(messageId)).map(publicAttachment);
  }

  public async waitForMessages(actor: Actor, input: Omit<WaitForMessageInput, 'projectId'>): Promise<WaitForMessageResult> {
    await this.authorize(actor, 'message:wait', actor.projectId, input.inboxId);
    await this.requireInbox(actor.projectId, input.inboxId);
    const filter = normalizeMessageFilter(input);
    validateIsoFilter(input.after, 'after');
    const timeoutMs = boundedNumber(input.timeoutMs, 30_000, 0, 120_000, 'timeoutMs');
    const pollIntervalMs = boundedNumber(input.pollIntervalMs, 250, 50, 5_000, 'pollIntervalMs');
    const expectedCount = boundedInteger(input.expectedCount, 1, 1, 100, 'expectedCount');
    const deadline = this.clock.now().getTime() + timeoutMs;
    while (true) {
      if (input.signal?.aborted) {
        throw new MailFnError({ code: 'MAILFN_ABORTED', message: 'Wait was cancelled', status: 499 });
      }
      const messages = await this.store.listMessages(actor.projectId, input.inboxId, {
        ...filter,
        receivedAfter: input.after ?? input.receivedAfter,
        status: input.status ?? 'ready',
      });
      if (messages.length >= expectedCount) {
        return { status: 'matched', messages: messages.slice(0, expectedCount), matchedAt: this.now() };
      }
      const remaining = deadline - this.clock.now().getTime();
      if (remaining <= 0) return { status: 'timeout', messages: [], timedOutAt: this.now(), retryable: true };
      try {
        await this.clock.sleep(Math.min(pollIntervalMs, remaining), input.signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new MailFnError({ code: 'MAILFN_ABORTED', message: 'Wait was cancelled', status: 499 });
        }
        throw error;
      }
    }
  }

  public async searchMessages(
    actor: Actor,
    input: Omit<SearchMessagesInput, 'projectId'>,
  ): Promise<Page<Message>> {
    await this.authorize(actor, 'message:search', actor.projectId, input.inboxId);
    validateIsoFilter(input.receivedAfter, 'receivedAfter');
    validateIsoFilter(input.receivedBefore, 'receivedBefore');
    const query = requireText(input.query, 'query').toLowerCase();
    const limit = boundedInteger(input.limit, 25, 1, 100, 'limit');
    const cursorContext = {
      kind: 'search' as const,
      projectId: actor.projectId,
      inboxId: input.inboxId,
      scope: JSON.stringify({ query, receivedAfter: input.receivedAfter ?? null, receivedBefore: input.receivedBefore ?? null }),
    };
    const cursorId = input.cursor ? decodeCursor(input.cursor, cursorContext) : undefined;
    const page = await this.store.searchMessagesPage(
      actor.projectId, input.inboxId,
      { query, receivedAfter: input.receivedAfter, receivedBefore: input.receivedBefore },
      cursorId, limit,
    );
    if (!page.cursorFound) {
      throw new MailFnError({
        code: 'MAILFN_VALIDATION_FAILED', message: 'Cursor no longer identifies this result set', status: 400,
      });
    }
    return {
      items: page.items,
      nextCursor: page.hasMore && page.items.length
        ? encodeCursor({ ...cursorContext, id: page.items.at(-1)!.id })
        : undefined,
    };
  }

  public async extractVerification(
    actor: Actor,
    inboxId: string,
    messageId: string,
    type: 'otp' | 'verification_link',
  ): Promise<ExtractedVerification> {
    await this.authorize(actor, 'message:extract', actor.projectId, inboxId);
    const message = await this.requireMessage(actor.projectId, inboxId, messageId);
    assertMailFn(message.status === 'ready', {
      code: 'MAILFN_CONFLICT',
      message: 'Message is not ready for extraction',
      status: 409,
      retryable: message.status === 'pending' || message.status === 'queue_failed',
    });
    const result = type === 'otp' ? extractOtp(message) : extractVerificationLink(message);
    if (!result) throw notFound(type === 'otp' ? 'OTP' : 'Verification link');
    await this.audit(actor, 'message.verification_extracted', 'message', message.id, { type });
    return result;
  }

  public async labelMessage(actor: Actor, inboxId: string, messageId: string, labels: string[]): Promise<Message> {
    await this.authorize(actor, 'message:label', actor.projectId, inboxId);
    await this.requireMessage(actor.projectId, inboxId, messageId);
    const updated = await this.store.setMessageLabels(messageId, normalizeLabels(labels), this.now());
    if (!updated) throw notFound('Message');
    return updated;
  }

  public async listThreads(actor: Actor, inboxId: string): Promise<Thread[]> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    return this.store.listThreads(actor.projectId, inboxId);
  }

  public async labelThread(actor: Actor, inboxId: string, threadId: string, labels: string[]): Promise<Thread> {
    await this.authorize(actor, 'message:label', actor.projectId, inboxId);
    const thread = await this.store.getThread(threadId);
    if (!thread || thread.projectId !== actor.projectId || thread.inboxId !== inboxId) throw notFound('Thread');
    const updated = { ...thread, labels: normalizeLabels(labels), updatedAt: this.now() };
    await this.store.saveThread(updated);
    return updated;
  }

  public async createDraft(actor: Actor, input: Omit<CreateDraftInput, 'projectId'>): Promise<Draft> {
    await this.authorize(actor, 'draft:write', actor.projectId, input.inboxId);
    await this.requireDraftInbox(actor.projectId, input.inboxId);
    if (input.threadId) {
      const thread = await this.store.getThread(input.threadId);
      if (!thread || thread.projectId !== actor.projectId || thread.inboxId !== input.inboxId) throw notFound('Thread');
    }
    if (input.inReplyToMessageId) {
      await this.requireMessage(actor.projectId, input.inboxId, input.inReplyToMessageId);
    }
    for (const attachmentId of input.attachmentIds ?? []) {
      const attachment = await this.store.getAttachment(attachmentId);
      if (!attachment || attachment.projectId !== actor.projectId || attachment.inboxId !== input.inboxId) {
        throw notFound('Attachment');
      }
    }
    const now = this.now();
    const draft: Draft = {
      id: this.ids.generate('drf'),
      projectId: actor.projectId,
      inboxId: input.inboxId,
      threadId: input.threadId,
      inReplyToMessageId: input.inReplyToMessageId,
      to: normalizeAddressList(input.to),
      cc: normalizeAddressList(input.cc ?? []),
      bcc: normalizeAddressList(input.bcc ?? []),
      subject: requireText(input.subject, 'subject'),
      text: input.text,
      html: input.html ? sanitizeHtml(input.html) : undefined,
      attachmentIds: [...(input.attachmentIds ?? [])],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.saveDraftIfInboxWritable(draft))) throw notFound('Inbox');
    await this.audit(actor, 'draft.created', 'draft', draft.id, { inboxId: draft.inboxId });
    return draft;
  }

  public async listDrafts(actor: Actor, inboxId: string): Promise<Draft[]> {
    await this.authorize(actor, 'draft:write', actor.projectId, inboxId);
    await this.requireDraftInbox(actor.projectId, inboxId);
    return this.store.listDrafts(actor.projectId, inboxId);
  }

  public async getDraft(actor: Actor, draftId: string): Promise<Draft> {
    const draft = await this.store.getDraft(draftId);
    if (!draft) throw notFound('Draft');
    await this.authorize(actor, 'draft:write', draft.projectId, draft.inboxId);
    await this.requireDraftInbox(draft.projectId, draft.inboxId);
    return draft;
  }

  public async updateDraft(actor: Actor, draftId: string, input: UpdateDraftInput): Promise<Draft> {
    const draft = await this.getDraft(actor, draftId);
    assertMailFn(draft.status === 'draft', {
      code: 'MAILFN_CONFLICT', message: 'Only draft messages can be updated', status: 409,
    });
    const attachmentIds = input.attachmentIds ?? draft.attachmentIds;
    for (const attachmentId of attachmentIds) {
      const attachment = await this.store.getAttachment(attachmentId);
      if (!attachment || attachment.projectId !== draft.projectId || attachment.inboxId !== draft.inboxId) throw notFound('Attachment');
    }
    const updated: Draft = {
      ...draft,
      ...(input.to ? { to: normalizeAddressList(input.to) } : {}),
      ...(input.cc ? { cc: normalizeAddressList(input.cc) } : {}),
      ...(input.bcc ? { bcc: normalizeAddressList(input.bcc) } : {}),
      ...(input.subject !== undefined ? { subject: requireText(input.subject, 'subject') } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.html !== undefined ? { html: input.html ? sanitizeHtml(input.html) : undefined } : {}),
      attachmentIds: [...attachmentIds],
      updatedAt: this.now(),
    };
    if (!(await this.store.saveDraftIfInboxWritable(updated))) throw notFound('Inbox');
    return updated;
  }

  public async discardDraft(actor: Actor, draftId: string): Promise<Draft> {
    const draft = await this.getDraft(actor, draftId);
    assertMailFn(draft.status === 'draft', {
      code: 'MAILFN_CONFLICT', message: 'Only draft messages can be discarded', status: 409,
    });
    const discarded = { ...draft, status: 'discarded' as const, updatedAt: this.now() };
    if (!(await this.store.saveDraftIfInboxWritable(discarded))) throw notFound('Inbox');
    return discarded;
  }

  public async createReplyDraft(actor: Actor, inboxId: string, messageId: string, input: { text?: string; html?: string; replyAll?: boolean }): Promise<Draft> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    assertMailFn(input.replyAll === undefined || typeof input.replyAll === 'boolean', {
      code: 'MAILFN_VALIDATION_FAILED', message: 'replyAll must be a boolean', status: 400,
    });
    const message = await this.requireMessage(actor.projectId, inboxId, messageId);
    const recipients = message.replyTo.length
      ? message.replyTo.map((entry) => entry.address)
      : [message.envelopeFrom];
    if (input.replyAll) {
      recipients.push(...message.to.map((entry) => entry.address), ...message.cc.map((entry) => entry.address));
    }
    return this.createDraft(actor, {
      inboxId,
      threadId: message.threadId,
      inReplyToMessageId: message.id,
      to: Array.from(new Set(recipients.filter((address) => address !== message.envelopeTo))),
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
      text: input.text,
      html: input.html,
    });
  }

  public async createForwardDraft(
    actor: Actor,
    inboxId: string,
    messageId: string,
    input: { to: string[]; text?: string; html?: string; includeOriginalAttachments?: boolean },
  ): Promise<Draft> {
    await this.authorize(actor, 'message:read', actor.projectId, inboxId);
    assertMailFn(
      input.includeOriginalAttachments === undefined || typeof input.includeOriginalAttachments === 'boolean',
      {
        code: 'MAILFN_VALIDATION_FAILED',
        message: 'includeOriginalAttachments must be a boolean',
        status: 400,
      },
    );
    const message = await this.requireMessage(actor.projectId, inboxId, messageId);
    const attachments = input.includeOriginalAttachments
      ? await this.store.listAttachments(message.id)
      : [];
    const original = `\n\n--- Forwarded message ---\nFrom: ${message.envelopeFrom}\nDate: ${message.receivedAt}\nSubject: ${message.subject}\nTo: ${message.envelopeTo}\n\n${message.textBody ?? ''}`;
    return this.createDraft(actor, {
      inboxId,
      threadId: message.threadId,
      to: input.to,
      subject: /^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`,
      text: `${input.text ?? ''}${original}`,
      html: input.html,
      attachmentIds: attachments.map((attachment) => attachment.id),
    });
  }

  public async sendDraft(actor: Actor, draftId: string): Promise<Draft> {
    const draft = await this.store.getDraft(draftId);
    if (!draft) throw notFound('Draft');
    await this.authorize(actor, 'send:write', draft.projectId, draft.inboxId);
    const inbox = await this.requireDraftInbox(draft.projectId, draft.inboxId);
    assertMailFn(inbox.status === 'active' && (!inbox.expiresAt || !isExpiredAt(inbox.expiresAt, this.now())), {
      code: 'MAILFN_INBOX_INACTIVE', message: 'Inbox is not active', status: 410,
    });
    if (draft.status === 'sent') return draft;
    assertMailFn(draft.status === 'draft' || draft.status === 'sending', {
      code: 'MAILFN_CONFLICT',
      message: 'Draft has already been finalized',
      status: 409,
    });
    assertMailFn(this.sendAdapter, {
      code: 'MAILFN_SEND_UNAVAILABLE',
      message: 'SendFn adapter is not configured',
      status: 501,
    });
    await this.assertOutboundAllowed(inbox);
    const project = await this.requireProject(draft.projectId);
    const period = this.now().slice(0, 10);
    const parent = draft.inReplyToMessageId ? await this.store.getMessage(draft.inReplyToMessageId) : null;
    const attachments = [];
    for (const attachmentId of draft.attachmentIds) {
      const attachment = await this.store.getAttachment(attachmentId);
      if (!attachment || attachment.projectId !== draft.projectId || attachment.inboxId !== draft.inboxId) throw notFound('Attachment');
      const content = await this.objects.get(attachment.objectKey);
      if (!content) throw notFound('Attachment object');
      attachments.push({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        content,
        sha256: attachment.sha256,
      });
    }
    const request: SendRequest = {
      idempotencyKey: `mailfn:draft:${draft.id}`,
      projectId: draft.projectId,
      inboxId: draft.inboxId,
      from: inbox.address,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      headers: {
        ...(parent?.internetMessageId ? { 'In-Reply-To': parent.internetMessageId } : {}),
        ...(parent?.references.length || parent?.internetMessageId
          ? { References: [...(parent?.references ?? []), parent?.internetMessageId].filter(Boolean).join(' ') }
          : {}),
      },
      attachmentIds: draft.attachmentIds,
      attachments,
      metadata: { draftId: draft.id, ...(draft.threadId ? { threadId: draft.threadId } : {}) },
    };
    const outboundUsage: UsageRecord = {
      id: `outbound_${draft.id}`,
      projectId: project.id,
      metric: 'outbound_message',
      quantity: 1,
      resourceId: draft.id,
      period,
      createdAt: this.now(),
    };
    const outboundReservation = await this.store.reserveOutboundUsage(outboundUsage, project.quota.maxOutboundPerDay);
    if (outboundReservation === 'denied') throw quotaExceeded('outbound messages');
    if (draft.status === 'draft') {
      const claimed = await this.store.claimDraft(draft.id, 'draft', { ...draft, status: 'sending', updatedAt: this.now() });
      if (!claimed) {
        const latest = await this.store.getDraft(draft.id);
        if (latest?.status !== 'sending' && latest?.status !== 'sent') {
          if (outboundReservation === 'created') await this.store.releaseUsage(outboundUsage.id).catch(() => undefined);
          throw new MailFnError({
            code: 'MAILFN_CONFLICT', message: 'Draft could not be claimed for sending', status: 409,
          });
        }
        if (latest.status === 'sent') return latest;
      }
    }
    let result: Awaited<ReturnType<MailFnSendAdapter['send']>>;
    try {
      result = await this.sendAdapter.send(request);
    } catch (error) {
      if (outboundReservation === 'created') await this.store.releaseUsage(outboundUsage.id).catch(() => undefined);
      await this.store.claimDraft(
        draft.id,
        'sending',
        { ...draft, status: 'draft', updatedAt: this.now() },
      ).catch(() => undefined);
      throw error;
    }
    const updated: Draft = {
      ...draft,
      status: result.status === 'sent' ? 'sent' : 'sending',
      providerMessageId: result.providerMessageId,
      updatedAt: this.now(),
    };
    if (!(await this.store.saveDraftIfInboxWritable(updated))) return updated;
    if (result.status === 'queued') return updated;
    await this.event('draft.sent', project.id, {
      inboxId: draft.inboxId,
      payload: { draftId: draft.id, providerMessageId: result.providerMessageId },
    });
    return updated;
  }

  public async createWebhook(
    actor: Actor,
    input: { inboxId?: string; url: string; eventTypes: MailFnEventType[] },
  ): Promise<CreatedWebhook> {
    await this.authorize(actor, 'webhook:manage', actor.projectId, input.inboxId);
    assertMailFn(
      Array.isArray(input.eventTypes) && input.eventTypes.length > 0 &&
        input.eventTypes.every((eventType) => MAILFN_EVENT_TYPES.includes(eventType)),
      { code: 'MAILFN_VALIDATION_FAILED', message: 'Webhook event types are invalid or empty', status: 400 },
    );
    assertMailFn(this.secretProtector, {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Secret protection must be configured before creating webhooks',
      status: 500,
    });
    const project = await this.requireProject(actor.projectId);
    if (input.inboxId) await this.requireInbox(project.id, input.inboxId);
    const url = parseWebhookUrl(input.url);
    if (this.webhookDispatcher?.validateUrl) {
      try {
        await this.webhookDispatcher.validateUrl(url);
      } catch (cause) {
        throw new MailFnError({
          code: 'MAILFN_VALIDATION_FAILED',
          message: cause instanceof Error ? cause.message : 'Webhook URL is not deliverable',
          status: 400,
          cause,
        });
      }
    }
    const id = this.ids.generate('whk');
    const created = await this.tokens.create(id);
    const now = this.now();
    const webhook: Webhook = {
      id,
      projectId: project.id,
      inboxId: input.inboxId,
      url: url.toString(),
      eventTypes: Array.from(new Set(input.eventTypes)),
      secretHash: created.hash,
      secretCiphertext: await this.secretProtector.protect(created.token),
      status: 'active',
      consecutiveFailures: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.createWebhookWithQuota(webhook, project.quota.maxWebhooks))) throw quotaExceeded('webhooks');
    await this.audit(actor, 'webhook.created', 'webhook', id, { inboxId: input.inboxId ?? null });
    return { webhook: { ...webhook, secretCiphertext: undefined }, secret: created.token };
  }

  public async createDomain(actor: Actor, domainName: string): Promise<MailDomain> {
    await this.authorize(actor, 'domain:manage', actor.projectId);
    assertMailFn(this.domainAdapter, {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'No domain adapter is configured',
      status: 501,
    });
    const project = await this.requireProject(actor.projectId);
    const domain = normalizeDomain(domainName);
    if (await this.store.getDomainByNameAcrossProjects(domain)) {
      throw new MailFnError({ code: 'MAILFN_CONFLICT', message: 'Domain already exists', status: 409 });
    }
    const token = this.ids.generate('verify').replace(/^verify_/, '');
    const now = this.now();
    const entry: MailDomain = {
      id: this.ids.generate('dom'),
      projectId: project.id,
      domain,
      status: 'pending',
      verificationToken: token,
      expectedRecords: [
        { type: 'TXT', name: `_mailfn.${domain}`, value: `mailfn-verification=${token}` },
        ...await this.domainAdapter.getRequiredDnsRecords(domain),
      ],
      createdAt: now,
      updatedAt: now,
    };
    if (!(await this.store.createDomainWithQuota(entry, project.quota.maxDomains))) {
      if (await this.store.getDomainByNameAcrossProjects(domain)) {
        throw new MailFnError({ code: 'MAILFN_CONFLICT', message: 'Domain already exists', status: 409 });
      }
      throw quotaExceeded('domains');
    }
    return entry;
  }

  public async verifyDomain(actor: Actor, domainId: string): Promise<MailDomain> {
    const domain = await this.store.getDomain(domainId);
    if (!domain) throw notFound('Domain');
    await this.authorize(actor, 'domain:manage', domain.projectId);
    assertMailFn(!domain.routingRuleId || this.domainAdapter, {
      code: 'MAILFN_VALIDATION_FAILED', message: 'No domain adapter is configured', status: 501,
    });
    assertMailFn(this.domainAdapter, {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'No domain adapter is configured',
      status: 501,
    });
    const result = await this.domainAdapter.verifyDns(domain);
    const now = this.now();
    if (!result.verified) {
      const failed = { ...domain, status: 'failed' as const, failureReason: result.diagnostics.join('; '), lastCheckedAt: now, updatedAt: now };
      await this.store.saveDomain(failed);
      return failed;
    }
    const routing = await this.domainAdapter.createRouting(domain);
    const active: MailDomain = {
      ...domain,
      status: 'active',
      routingRuleId: routing.routingRuleId,
      verifiedAt: now,
      lastCheckedAt: now,
      failureReason: undefined,
      updatedAt: now,
    };
    try {
      await this.store.saveDomain(active);
    } catch (cause) {
      await this.domainAdapter.disableRouting(active).catch(() => undefined);
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Domain routing was rolled back because active state could not be persisted',
        status: 503,
        retryable: true,
        cause,
      });
    }
    await this.event('domain.verified', domain.projectId, { payload: { domainId: domain.id, domain: domain.domain } });
    return active;
  }

  public async disableDomain(actor: Actor, domainId: string): Promise<MailDomain> {
    const domain = await this.store.getDomain(domainId);
    if (!domain) throw notFound('Domain');
    await this.authorize(actor, 'domain:manage', domain.projectId);
    return this.disableDomainRouting(domain);
  }

  private async disableDomainRouting(domain: MailDomain): Promise<MailDomain> {
    if (domain.status === 'disabled' && !domain.routingRuleId) return domain;
    if (domain.status === 'disabled') {
      if (!this.domainAdapter) throw new MailFnError({
        code: 'MAILFN_DOMAIN_ROUTING_FAILED',
        message: 'Domain routing teardown requires the configured provider adapter',
        status: 503,
        retryable: true,
      });
      await this.domainAdapter.disableRouting(domain);
      const reconciled = { ...domain, routingRuleId: undefined, updatedAt: this.now() };
      await this.store.saveDomain(reconciled);
      return reconciled;
    }
    const disabling = { ...domain, status: 'disabling' as const, updatedAt: this.now() };
    await this.store.saveDomain(disabling);
    try {
      if (disabling.routingRuleId && !this.domainAdapter) {
        throw new Error('MAILFN_DOMAIN_ADAPTER_UNAVAILABLE');
      }
      if (disabling.routingRuleId) await this.domainAdapter!.disableRouting(disabling);
    } catch (cause) {
      throw new MailFnError({
        code: 'MAILFN_DOMAIN_ROUTING_FAILED',
        message: 'Domain routing teardown failed and remains retryable',
        status: 503,
        retryable: true,
        cause,
      });
    }
    const updated = { ...disabling, status: 'disabled' as const, routingRuleId: undefined, updatedAt: this.now() };
    try {
      await this.store.saveDomain(updated);
    } catch (cause) {
      throw new MailFnError({
        code: 'MAILFN_STORAGE_FAILED',
        message: 'Domain routing was disabled but final state could not be persisted',
        status: 503,
        retryable: true,
        cause,
      });
    }
    return updated;
  }

  public async runRetention(projectId?: string): Promise<RetentionResult> {
    const result: RetentionResult = {
      expiredInboxes: 0,
      deletedMessages: 0,
      deletedObjects: 0,
      releasedStorageReservations: 0,
      auditEventsDeleted: 0,
      eventRecordsDeleted: 0,
      webhookDeliveriesDeleted: 0,
    };
    const projects = projectId ? [await this.requireProject(projectId)] : await this.store.listProjects();
    const now = this.now();
    for (const project of projects) {
      const compliance = await this.store.getComplianceProfile(project.id);
      const reservationCutoff = new Date(Date.parse(now) - STORAGE_RESERVATION_LEASE_MS).toISOString();
      const claimCutoff = new Date(Date.parse(now) - STORAGE_WRITE_LEASE_MS).toISOString();
      result.releasedStorageReservations += await this.store.releaseOrphanedStorageReservations(
        project.id,
        reservationCutoff,
        claimCutoff,
      );
      for (const inbox of await this.store.listInboxes(project.id)) {
        let effectiveInbox = inbox;
        if (!['expired', 'deleting', 'deleted'].includes(inbox.status) && inbox.expiresAt && isExpiredAt(inbox.expiresAt, now)) {
          effectiveInbox = { ...inbox, status: 'expired', updatedAt: now };
          await this.store.saveInbox(effectiveInbox);
          result.expiredInboxes += 1;
          await this.event('inbox.expired', project.id, { inboxId: inbox.id, payload: {} });
          for (const credential of await this.store.listCredentials(project.id, inbox.id)) {
            if (credential.status === 'active') await this.store.saveCredential({ ...credential, status: 'expired' });
          }
        }
        if (compliance?.retentionLocked) continue;
        if (effectiveInbox.status === 'deleting') {
          try {
            for (const credential of await this.store.listCredentials(project.id, effectiveInbox.id)) {
              if (credential.status === 'active') {
                await this.store.saveCredential({ ...credential, status: 'revoked', revokedAt: now });
              }
            }
            for (const message of await this.store.listMessages(project.id, effectiveInbox.id)) {
              result.deletedObjects += await this.deleteMessageObjects(message);
              await this.deleteMessageRecord(message);
              result.deletedMessages += 1;
            }
            await this.store.deleteDrafts(project.id, effectiveInbox.id);
            for (const webhook of await this.store.listWebhooks(project.id, effectiveInbox.id)) {
              if (webhook.status !== 'disabled') {
                await this.store.saveWebhook({ ...webhook, status: 'disabled', updatedAt: now });
              }
            }
            await this.store.saveInbox({ ...effectiveInbox, status: 'deleted', updatedAt: now });
            await this.systemAudit(project.id, 'inbox.deletion_recovered', 'inbox', effectiveInbox.id, {
              inboxId: effectiveInbox.id,
            }).catch(() => undefined);
          } catch {
            await this.systemAudit(project.id, 'inbox.deletion_retry_failed', 'inbox', effectiveInbox.id, {
              inboxId: effectiveInbox.id,
            }).catch(() => undefined);
          }
          continue;
        }
        const messages = await this.store.listMessages(project.id, inbox.id);
        for (const message of messages) {
          const retention = effectiveInbox.kind === 'expiring' ? DEFAULT_EXPIRING_RETENTION : project.defaultRetentionPolicy;
          const inboxDeletion = effectiveInbox.status === 'expired' && retention.deleteOnInboxExpiry;
          if (message.retentionExpiresAt <= now || inboxDeletion) {
            try {
              result.deletedObjects += await this.deleteMessageObjects(message);
              await this.deleteMessageRecord(message);
              result.deletedMessages += 1;
              await this.event('retention.deleted', project.id, {
                inboxId: inbox.id,
                messageId: message.id,
                payload: { reason: inboxDeletion ? 'inbox_expired' : 'message_expired' },
              });
            } catch {
              await this.systemAudit(project.id, 'retention.delete_failed', 'message', message.id, {
                objectType: 'message',
              }).catch(() => undefined);
            }
            continue;
          }
          if (!message.rawDeletedAt && message.rawRetentionExpiresAt <= now) {
            try {
              await this.objects.delete(message.rawObjectKey);
              await this.store.releaseStorage(message.id);
              await this.store.saveMessage({ ...message, rawDeletedAt: now, updatedAt: now });
              result.deletedObjects += 1;
            } catch {
              await this.systemAudit(project.id, 'retention.delete_failed', 'message', message.id, {
                objectType: 'raw',
              }).catch(() => undefined);
            }
          }
          if (message.attachmentRetentionExpiresAt <= now) {
            for (const attachment of await this.store.listAttachments(message.id)) {
              try {
                await this.objects.delete(attachment.objectKey);
                await this.store.releaseStorage(attachment.id);
                await this.store.deleteAttachment(attachment.id);
                result.deletedObjects += 1;
              } catch {
                await this.systemAudit(project.id, 'retention.delete_failed', 'attachment', attachment.id, {
                  objectType: 'attachment',
                }).catch(() => undefined);
              }
            }
          }
        }
      }
      if (!compliance?.retentionLocked) {
        const historyCutoff = new Date(
          Date.parse(now) - project.defaultRetentionPolicy.auditTtlSeconds * 1000,
        ).toISOString();
        result.webhookDeliveriesDeleted += await this.store.deleteTerminalWebhookDeliveriesBefore(project.id, historyCutoff);
        result.eventRecordsDeleted += await this.store.deleteEventsBefore(project.id, historyCutoff);
        result.auditEventsDeleted += await this.store.deleteExpiredAudits(project.id, now);
      }
    }
    return result;
  }

  public async getOperationalSnapshot(actor: Actor): Promise<OperationalSnapshot> {
    await this.authorize(actor, 'audit:read', actor.projectId);
    const inboxes = await this.store.listInboxes(actor.projectId);
    const allMessages = (await Promise.all(inboxes.map((inbox) => this.store.listMessages(actor.projectId, inbox.id)))).flat();
    const events = await this.store.listEvents(actor.projectId);
    const audits = await this.store.listAudits(actor.projectId);
    return {
      generatedAt: this.now(),
      activeInboxes: inboxes.filter((inbox) => inbox.status === 'active').length,
      expiredInboxes: inboxes.filter((inbox) => inbox.status === 'expired').length,
      pendingMessages: allMessages.filter((message) => message.status === 'pending').length,
      parseFailures: allMessages.filter((message) => message.status === 'parse_failed').length,
      queuedFailures: allMessages.filter((message) => message.status === 'queue_failed').length,
      storedBytes: await this.projectStoredBytes(actor.projectId),
      webhookFailures: events.filter((event) => event.type === 'webhook.delivery_failed').length,
      authorizationFailures: audits.filter((event) => event.action === 'authorization.failed').length,
      rateLimitEvents: audits.filter((event) => event.action === 'rate_limit.exceeded').length,
    };
  }

  public evaluateOperationalAlerts(snapshot: OperationalSnapshot): OperationalAlert[] {
    const checks: Array<[keyof OperationalSnapshot, number, string]> = [
      ['parseFailures', 5, 'MAILFN_PARSE_FAILURES_HIGH'],
      ['queuedFailures', 1, 'MAILFN_QUEUE_FAILURES_PRESENT'],
      ['webhookFailures', 10, 'MAILFN_WEBHOOK_FAILURES_HIGH'],
      ['authorizationFailures', 50, 'MAILFN_AUTHORIZATION_FAILURES_HIGH'],
    ];
    return checks.flatMap(([key, threshold, code]) => {
      const value = snapshot[key];
      if (typeof value !== 'number' || value < threshold) return [];
      return [{
        code,
        severity: value >= threshold * 5 ? 'critical' as const : 'warning' as const,
        message: `${String(key)} reached ${value}`,
        value,
        threshold,
      }];
    });
  }

  public async getAuditEvents(actor: Actor, after?: string): Promise<AuditEvent[]> {
    await this.authorize(actor, 'audit:read', actor.projectId);
    return this.store.listAudits(actor.projectId, after);
  }

  public async configureCompliance(actor: Actor, input: Omit<ComplianceProfile, 'projectId' | 'updatedAt'>): Promise<ComplianceProfile> {
    await this.authorize(actor, 'project:admin', actor.projectId);
    this.assertDataRegion(input.dataRegion);
    const project = await this.requireProject(actor.projectId);
    assertMailFn(input.dataRegion === project.dataRegion, {
      code: 'MAILFN_CONFLICT',
      message: 'Compliance data region must match the project storage region; in-place region migration is not supported',
      status: 409,
    });
    assertMailFn(Number.isInteger(input.deletionSlaHours) && input.deletionSlaHours > 0, {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Compliance deletionSlaHours must be a positive integer', status: 400,
    });
    assertMailFn(typeof input.retentionLocked === 'boolean' && typeof input.exportEnabled === 'boolean', {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Compliance flags must be booleans', status: 400,
    });
    const profile: ComplianceProfile = { ...input, projectId: actor.projectId, updatedAt: this.now() };
    await this.store.saveComplianceProfile(profile);
    return profile;
  }

  public async exportCompliance(actor: Actor): Promise<ComplianceExport> {
    await this.authorize(actor, 'project:admin', actor.projectId);
    const project = await this.requireProject(actor.projectId);
    const compliance = await this.store.getComplianceProfile(actor.projectId);
    assertMailFn(compliance?.exportEnabled, {
      code: 'MAILFN_PUBLIC_PLATFORM_DISABLED',
      message: 'Compliance export is not enabled for this project',
      status: 403,
    });
    const inboxes = await this.store.listInboxes(actor.projectId);
    const messages = (await Promise.all(inboxes.map((inbox) => this.store.listMessages(actor.projectId, inbox.id)))).flat();
    const attachments = (await Promise.all(messages.map((message) => this.store.listAttachments(message.id))))
      .flat()
      .map(publicAttachment);
    const result: ComplianceExport = {
      generatedAt: this.now(),
      project,
      compliance,
      inboxes,
      messages,
      attachments,
      audits: await this.store.listAudits(actor.projectId),
      usage: await this.store.listUsage(actor.projectId),
    };
    await this.audit(actor, 'compliance.exported', 'project', project.id, {
      inboxCount: inboxes.length,
      messageCount: messages.length,
      attachmentCount: attachments.length,
    });
    return result;
  }

  public async reportAbuse(
    actor: Actor,
    input: Pick<AbuseCase, 'kind' | 'resourceType' | 'resourceId' | 'reason'>,
  ): Promise<AbuseCase> {
    await this.authorize(actor, 'support:write', actor.projectId);
    assertMailFn(['project', 'inbox', 'message', 'domain'].includes(input.resourceType), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid abuse resource type', status: 400,
    });
    await this.assertAbuseResource(actor.projectId, input.resourceType, input.resourceId);
    assertMailFn(['spam', 'phishing', 'malware', 'complaint', 'bounce', 'policy'].includes(input.kind), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid abuse kind', status: 400,
    });
    const now = this.now();
    const abuseCase: AbuseCase = {
      id: this.ids.generate('abu'),
      projectId: actor.projectId,
      ...input,
      reason: requireText(input.reason, 'reason'),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveAbuseCase(abuseCase);
    await this.applyReputationSignal(abuseCase);
    await this.event('abuse.reported', actor.projectId, { payload: { abuseCaseId: abuseCase.id, kind: abuseCase.kind } });
    return abuseCase;
  }

  public async listAbuseCases(actor: Actor): Promise<AbuseCase[]> {
    await this.authorize(actor, 'support:write', actor.projectId);
    return this.store.listAbuseCases(actor.projectId);
  }

  public async updateAbuseCase(
    actor: Actor,
    abuseCaseId: string,
    input: { status: AbuseCase['status']; disableResource?: boolean },
  ): Promise<AbuseCase> {
    await this.authorize(actor, 'support:write', actor.projectId);
    const abuseCase = (await this.store.listAbuseCases(actor.projectId)).find((candidate) => candidate.id === abuseCaseId);
    if (!abuseCase) throw notFound('Abuse case');
    assertMailFn(['open', 'investigating', 'resolved', 'dismissed'].includes(input.status), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid abuse case status', status: 400,
    });
    assertMailFn(input.disableResource === undefined || typeof input.disableResource === 'boolean', {
      code: 'MAILFN_VALIDATION_FAILED', message: 'disableResource must be a boolean', status: 400,
    });
    if (input.disableResource) await this.disableAbuseResource(actor, abuseCase);
    const updated = { ...abuseCase, status: input.status, updatedAt: this.now() };
    await this.store.saveAbuseCase(updated);
    await this.audit(actor, 'abuse.updated', 'abuse_case', updated.id, {
      status: updated.status,
      resourceType: updated.resourceType,
      resourceDisabled: Boolean(input.disableResource),
    });
    return updated;
  }

  public async listSenderReputations(actor: Actor): Promise<SenderReputation[]> {
    await this.authorize(actor, 'support:write', actor.projectId);
    return this.store.listSenderReputations(actor.projectId);
  }

  public async updateSenderReputation(
    actor: Actor,
    senderAddress: string,
    input: Pick<SenderReputation, 'status' | 'score'> & { reason?: string },
  ): Promise<SenderReputation> {
    await this.authorize(actor, 'support:write', actor.projectId);
    assertMailFn(['allow', 'monitor', 'block'].includes(input.status), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid sender reputation status', status: 400,
    });
    assertMailFn(Number.isInteger(input.score) && input.score >= 0 && input.score <= 100, {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Sender reputation score must be an integer from 0 to 100', status: 400,
    });
    const sender = normalizeAddress(senderAddress);
    const existing = await this.store.getSenderReputation(actor.projectId, sender);
    const reputation: SenderReputation = {
      projectId: actor.projectId,
      sender,
      status: input.status,
      score: input.score,
      complaintCount: existing?.complaintCount ?? 0,
      bounceCount: existing?.bounceCount ?? 0,
      reason: input.reason?.trim() || undefined,
      updatedAt: this.now(),
    };
    await this.store.saveSenderReputation(reputation);
    await this.audit(actor, 'reputation.updated', 'sender', sender, { status: reputation.status, score: reputation.score });
    return reputation;
  }

  public async createSupportCase(
    actor: Actor,
    input: Pick<SupportCase, 'subject' | 'severity' | 'description'>,
  ): Promise<SupportCase> {
    await this.authorize(actor, 'support:write', actor.projectId);
    assertMailFn(this.publicPlatform.supportEnabled, {
      code: 'MAILFN_PUBLIC_PLATFORM_DISABLED',
      message: 'Support surfaces are disabled',
      status: 403,
    });
    const now = this.now();
    const supportCase: SupportCase = {
      id: this.ids.generate('sup'),
      projectId: actor.projectId,
      subject: requireText(input.subject, 'subject'),
      severity: input.severity,
      status: 'open',
      description: requireText(input.description, 'description'),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.saveSupportCase(supportCase);
    return supportCase;
  }

  public async listSupportCases(actor: Actor): Promise<SupportCase[]> {
    await this.authorize(actor, 'support:write', actor.projectId);
    assertMailFn(this.publicPlatform.supportEnabled, {
      code: 'MAILFN_PUBLIC_PLATFORM_DISABLED', message: 'Support surfaces are disabled', status: 403,
    });
    return this.store.listSupportCases(actor.projectId);
  }

  public async updateSupportCase(
    actor: Actor,
    supportCaseId: string,
    input: { status: SupportCase['status'] },
  ): Promise<SupportCase> {
    await this.authorize(actor, 'support:write', actor.projectId);
    assertMailFn(this.publicPlatform.supportEnabled, {
      code: 'MAILFN_PUBLIC_PLATFORM_DISABLED', message: 'Support surfaces are disabled', status: 403,
    });
    assertMailFn(['open', 'waiting', 'resolved'].includes(input.status), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid support case status', status: 400,
    });
    const supportCase = (await this.store.listSupportCases(actor.projectId)).find((candidate) => candidate.id === supportCaseId);
    if (!supportCase) throw notFound('Support case');
    const updated = { ...supportCase, status: input.status, updatedAt: this.now() };
    await this.store.saveSupportCase(updated);
    return updated;
  }

  public async getUsage(actor: Actor, period?: string): Promise<UsageRecord[]> {
    await this.authorize(actor, 'billing:read', actor.projectId);
    assertMailFn(this.publicPlatform.billingEnabled, {
      code: 'MAILFN_PUBLIC_PLATFORM_DISABLED',
      message: 'Billing surfaces are disabled',
      status: 403,
    });
    return this.store.listUsage(actor.projectId, period);
  }

  private async replayInboxCreate(projectId: string, key: string, requestHash: string): Promise<CreatedInbox | null> {
    const stored = await this.store.getIdempotency(projectId, key);
    const existing = stored && !isExpiredAt(stored.expiresAt, this.now()) ? stored : null;
    if (!existing) {
      if (stored) await this.store.deleteExpiredIdempotency(projectId, key, this.now());
      return null;
    }
    if (existing.requestHash !== requestHash) {
      throw new MailFnError({
        code: 'MAILFN_CONFLICT',
        message: 'Idempotency key was used with a different request',
        status: 409,
      });
    }
    const inbox = await this.requireInbox(projectId, existing.resourceId);
    if (existing.credentialId && existing.responseCiphertext && this.secretProtector) {
      const credential = await this.requireCredential(existing.credentialId);
      assertMailFn(credential.status === 'active' && (!credential.expiresAt || !isExpiredAt(credential.expiresAt, this.now())), {
        code: 'MAILFN_CONFLICT',
        message: 'Inbox exists but its original credential is no longer active',
        status: 409,
        details: { inboxId: inbox.id },
      });
      return {
        inbox,
        credential: {
          credential,
          token: await this.secretProtector.reveal(existing.responseCiphertext),
        },
      };
    }
    throw new MailFnError({
      code: 'MAILFN_CONFLICT',
      message: 'Inbox already exists but its one-time credential cannot be replayed without secret protection',
      status: 409,
      details: { inboxId: inbox.id },
    });
  }

  private async completeCredentialRotation(
    actor: Actor,
    credential: Credential,
    record: IdempotencyRecord,
  ): Promise<CreatedCredential> {
    assertMailFn(record.operation === 'credential.rotate' && record.requestHash === credential.id, {
      code: 'MAILFN_CONFLICT', message: 'Idempotency key was used for a different credential rotation', status: 409,
    });
    assertMailFn(record.responseCiphertext && this.secretProtector, {
      code: 'MAILFN_CONFLICT', message: 'Credential rotation cannot replay its one-time token', status: 409,
    });
    const token = await this.secretProtector.reveal(record.responseCiphertext);
    let replacement = await this.store.getCredential(record.resourceId);
    if (!replacement) {
      replacement = {
        id: record.resourceId,
        projectId: credential.projectId,
        inboxId: credential.inboxId,
        tokenHash: await this.tokens.hash(token),
        tokenPrefix: token.slice(0, Math.min(24, token.length)),
        permissions: credential.permissions,
        status: 'active',
        expiresAt: credential.expiresAt,
        createdAt: record.createdAt,
      };
      await this.store.saveCredential(replacement);
    }
    if (credential.status === 'active') await this.revokeCredential(actor, credential.id);
    return { credential: replacement, token };
  }

  private async buildCredential(input: CreateCredentialInput): Promise<CreatedCredential> {
    assertMailFn(input.permissions.length > 0 && input.permissions.every((scope) => MAILFN_SCOPES.includes(scope)), {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Credential permissions are invalid or empty',
      status: 400,
    });
    if (input.expiresAt) requireFutureIso(input.expiresAt, this.now(), 'expiresAt');
    const id = this.ids.generate('cred');
    const created = await this.tokens.create(id);
    const credential: Credential = {
      id,
      projectId: input.projectId,
      inboxId: input.inboxId,
      tokenHash: created.hash,
      tokenPrefix: created.prefix,
      permissions: Array.from(new Set(input.permissions)),
      status: 'active',
      expiresAt: input.expiresAt,
      createdAt: this.now(),
    };
    return { credential, token: created.token };
  }

  private async issueCredential(input: CreateCredentialInput): Promise<CreatedCredential> {
    const created = await this.buildCredential(input);
    await this.store.saveCredential(created.credential);
    return created;
  }

  private async disableAbuseResource(actor: Actor, abuseCase: AbuseCase): Promise<void> {
    if (abuseCase.resourceType === 'inbox') {
      const inbox = await this.requireInbox(actor.projectId, abuseCase.resourceId);
      await this.store.saveInbox({ ...inbox, status: 'disabled', updatedAt: this.now() });
      for (const credential of await this.store.listCredentials(actor.projectId, inbox.id)) {
        if (credential.status === 'active') {
          await this.store.saveCredential({ ...credential, status: 'revoked', revokedAt: this.now() });
        }
      }
      return;
    }
    if (abuseCase.resourceType === 'domain') {
      const domain = await this.store.getDomain(abuseCase.resourceId);
      if (!domain || domain.projectId !== actor.projectId) throw notFound('Domain');
      await this.disableDomainRouting(domain);
      return;
    }
    throw new MailFnError({
      code: 'MAILFN_CONFLICT',
      message: 'Automated abuse enforcement is supported only for inbox and domain resources',
      status: 409,
    });
  }

  private async assertAbuseResource(projectId: string, resourceType: AbuseCase['resourceType'], resourceId: string): Promise<void> {
    if (resourceType === 'project') {
      if (resourceId !== projectId) throw notFound('Abuse resource');
      return;
    }
    if (resourceType === 'inbox') {
      const inbox = await this.store.getInbox(resourceId);
      if (!inbox || inbox.projectId !== projectId) throw notFound('Abuse resource');
      return;
    }
    if (resourceType === 'message') {
      const message = await this.store.getMessage(resourceId);
      if (!message || message.projectId !== projectId) throw notFound('Abuse resource');
      return;
    }
    const domain = await this.store.getDomain(resourceId);
    if (!domain || domain.projectId !== projectId) throw notFound('Abuse resource');
  }

  private async applyReputationSignal(abuseCase: AbuseCase): Promise<void> {
    if (abuseCase.resourceType !== 'message') return;
    const message = await this.store.getMessage(abuseCase.resourceId);
    if (!message || message.projectId !== abuseCase.projectId) return;
    const sender = message.envelopeFrom;
    const existing = await this.store.getSenderReputation(abuseCase.projectId, sender);
    const penalty: Record<AbuseCase['kind'], number> = {
      spam: 30,
      phishing: 100,
      malware: 100,
      complaint: 25,
      bounce: 10,
      policy: 20,
    };
    const score = Math.max(0, (existing?.score ?? 100) - penalty[abuseCase.kind]);
    const status: SenderReputation['status'] =
      abuseCase.kind === 'phishing' || abuseCase.kind === 'malware' || score <= 20
        ? 'block'
        : score < 80
          ? 'monitor'
          : 'allow';
    await this.store.saveSenderReputation({
      projectId: abuseCase.projectId,
      sender,
      status,
      score,
      complaintCount: (existing?.complaintCount ?? 0) + (abuseCase.kind === 'bounce' ? 0 : 1),
      bounceCount: (existing?.bounceCount ?? 0) + (abuseCase.kind === 'bounce' ? 1 : 0),
      reason: `abuse:${abuseCase.id}`,
      updatedAt: this.now(),
    });
  }

  private async enqueueParse(message: Message): Promise<void> {
    assertMailFn(this.queue, {
      code: 'MAILFN_QUEUE_FAILED',
      message: 'No queue is configured',
      status: 503,
      retryable: true,
    });
    try {
      await this.queue.enqueue(this.parseJob(message));
      if (message.status === 'queue_failed' || message.status === 'parse_failed') {
        await this.store.saveMessage({
          ...message,
          status: 'pending',
          parseErrorCode: undefined,
          parseRetryable: undefined,
          updatedAt: this.now(),
        });
      }
    } catch (error) {
      await this.store.saveMessage({ ...message, status: 'queue_failed', updatedAt: this.now() });
      throw new MailFnError({
        code: 'MAILFN_QUEUE_FAILED',
        message: 'Message was stored but parse work could not be queued',
        status: 503,
        retryable: true,
        details: { messageId: message.id },
        cause: error,
      });
    }
  }

  private parseJob(message: Message): ParseJob {
    return {
      id: this.ids.generate('job'),
      version: 1,
      type: 'mailfn.parse',
      projectId: message.projectId,
      inboxId: message.inboxId,
      messageId: message.id,
      rawObjectKey: message.rawObjectKey,
      attempt: 1,
      createdAt: this.now(),
    };
  }

  private async event(
    type: MailFnEventType,
    projectId: string,
    input: { inboxId?: string; messageId?: string; payload: Record<string, unknown> },
  ): Promise<MailFnEvent> {
    const event: MailFnEvent = {
      id: this.ids.generate('evt'),
      version: MAILFN_EVENT_VERSION,
      type,
      projectId,
      inboxId: input.inboxId,
      messageId: input.messageId,
      occurredAt: this.now(),
      payload: input.payload,
    };
    await this.store.appendEvent(event);
    await this.dispatchEvent(event);
    return event;
  }

  private async dispatchEvent(event: MailFnEvent): Promise<void> {
    if (!this.webhookDispatcher || !this.secretProtector) return;
    const webhooks = (await this.store.listWebhooks(event.projectId)).filter(
      (webhook) =>
        webhook.status === 'active' &&
        webhook.eventTypes.includes(event.type) &&
        (!webhook.inboxId || webhook.inboxId === event.inboxId),
    );
    for (const webhook of webhooks) {
      const now = this.now();
      const delivery: WebhookDelivery = {
        id: this.ids.generate('whd'),
        webhookId: webhook.id,
        eventId: event.id,
        attempt: 1,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };
      await this.store.saveWebhookDelivery(delivery);
      const result = await this.deliverWebhook(webhook, event, delivery);
      if (!result.ok && event.type !== 'webhook.delivery_failed') {
        await this.event('webhook.delivery_failed', event.projectId, {
          inboxId: event.inboxId,
          messageId: event.messageId,
          payload: { webhookId: webhook.id, deliveryId: delivery.id, retryable: result.retryable },
        });
      }
    }
  }

  private async deliverWebhook(
    webhook: Webhook,
    event: MailFnEvent,
    delivery: WebhookDelivery,
  ): Promise<{ ok: boolean; status?: number; retryable: boolean }> {
    const protectedSecret = webhook.secretCiphertext;
    let result: { ok: boolean; status?: number; retryable: boolean };
    if (!protectedSecret) {
      result = { ok: false, retryable: false };
    } else {
      try {
        result = await this.webhookDispatcher!.deliver({
          webhook: { ...webhook, secretCiphertext: await this.secretProtector!.reveal(protectedSecret) },
          event,
          deliveryId: delivery.id,
          timestamp: this.now(),
        });
      } catch {
        // Webhook delivery is an independent, retryable side effect. A consumer
        // outage must never roll back a successfully accepted inbound message.
        result = { ok: false, retryable: true };
      }
    }
    const retryable = !result.ok && result.retryable && delivery.attempt < 8;
    await this.store.recordWebhookDeliveryResult(webhook.id, result.ok, this.now());
    await this.store.saveWebhookDelivery({
      ...delivery,
      status: result.ok ? 'delivered' : retryable ? 'failed' : 'dead_letter',
      responseStatus: result.status,
      nextAttemptAt: retryable
        ? new Date(this.clock.now().getTime() + Math.min(3_600, 2 ** delivery.attempt) * 1_000).toISOString()
        : undefined,
      updatedAt: this.now(),
    });
    return result;
  }

  private async authorize(actor: Actor, scope: MailFnScope, projectId: string, inboxId?: string): Promise<void> {
    const allowed =
      actor.projectId === projectId &&
      (actor.scopes.includes(scope) || actor.scopes.includes('project:admin')) &&
      (!actor.inboxId || actor.inboxId === inboxId);
    if (allowed) return;
    await this.systemAudit(projectId, 'authorization.failed', inboxId ? 'inbox' : 'project', inboxId ?? projectId, {
      actorId: actor.actorId,
      requiredScope: scope,
    }).catch(() => undefined);
    throw new MailFnError({
      code: actor.projectId === projectId ? 'MAILFN_FORBIDDEN' : 'MAILFN_NOT_FOUND',
      message: actor.projectId === projectId ? 'Credential does not have the required scope' : 'Resource not found',
      status: actor.projectId === projectId ? 403 : 404,
    });
  }

  private async requireProject(id: string): Promise<Project> {
    const project = await this.store.getProject(id);
    if (!project || project.status !== 'active') throw notFound('Project');
    return project;
  }

  private async requireInbox(projectId: string, inboxId: string): Promise<Inbox> {
    const inbox = await this.store.getInbox(inboxId);
    if (!inbox || inbox.projectId !== projectId || inbox.status === 'deleted') throw notFound('Inbox');
    return inbox;
  }

  private async requireDraftInbox(projectId: string, inboxId: string): Promise<Inbox> {
    const inbox = await this.requireInbox(projectId, inboxId);
    assertMailFn(inbox.status !== 'deleting', {
      code: 'MAILFN_CONFLICT', message: 'Inbox deletion is already in progress', status: 409,
    });
    return inbox;
  }

  private async requireCredential(id: string): Promise<Credential> {
    const credential = await this.store.getCredential(id);
    if (!credential) throw notFound('Credential');
    return credential;
  }

  private async requireMessage(projectId: string, inboxId: string, messageId: string): Promise<Message> {
    const message = await this.store.getMessage(messageId);
    if (!message || message.projectId !== projectId || message.inboxId !== inboxId) throw notFound('Message');
    return message;
  }

  private async audit(
    actor: Actor,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.store.appendAudit(await this.buildAuditEvent(actor, action, resourceType, resourceId, metadata));
  }

  private async buildAuditEvent(
    actor: Actor,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, string | number | boolean | null>,
    projectOverride?: Project,
  ): Promise<AuditEvent> {
    const forbidden = /body|code|otp|link|token|secret|credential|password|content/i;
    const safeMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => !forbidden.test(key)));
    let inboxId = actor.inboxId ?? (typeof metadata.inboxId === 'string' ? metadata.inboxId : undefined);
    if (!inboxId && resourceType === 'inbox') inboxId = resourceId;
    if (!inboxId && resourceType === 'message') inboxId = (await this.store.getMessage(resourceId))?.inboxId;
    if (!inboxId && resourceType === 'attachment') inboxId = (await this.store.getAttachment(resourceId))?.inboxId;
    if (!inboxId && resourceType === 'draft') inboxId = (await this.store.getDraft(resourceId))?.inboxId;
    if (!inboxId && resourceType === 'thread') inboxId = (await this.store.getThread(resourceId))?.inboxId;
    const project = projectOverride ?? await this.store.getProject(actor.projectId);
    const inbox = inboxId ? await this.store.getInbox(inboxId) : null;
    const retention = inbox?.kind === 'expiring'
      ? DEFAULT_EXPIRING_RETENTION
      : project?.defaultRetentionPolicy ?? DEFAULT_STABLE_RETENTION;
    const createdAt = this.now();
    return {
      id: this.ids.generate('aud'),
      projectId: actor.projectId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      action,
      resourceType,
      resourceId,
      metadata: safeMetadata,
      createdAt,
      retentionExpiresAt: new Date(Date.parse(createdAt) + retention.auditTtlSeconds * 1000).toISOString(),
    };
  }

  private systemAudit(
    projectId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    return this.audit(
      { actorType: 'system', actorId: 'mailfn', projectId, scopes: [...MAILFN_SCOPES] },
      action,
      resourceType,
      resourceId,
      metadata,
    );
  }

  private async usage(projectId: string, metric: UsageRecord['metric'], quantity: number, resourceId?: string): Promise<void> {
    const now = this.now();
    await this.store.appendUsage({
      id: resourceId ? `use_${metric}_${resourceId}` : this.ids.generate('use'),
      projectId,
      metric,
      quantity,
      resourceId,
      period: now.slice(0, 10),
      createdAt: now,
    });
  }

  private async projectStoredBytes(projectId: string): Promise<number> {
    let total = 0;
    for (const inbox of await this.store.listInboxes(projectId)) {
      for (const message of await this.store.listMessages(projectId, inbox.id)) {
        if (!message.rawDeletedAt) total += message.sizeBytes;
        for (const attachment of await this.store.listAttachments(message.id)) total += attachment.sizeBytes;
      }
    }
    return total;
  }

  private async deleteMessageObjects(message: Message): Promise<number> {
    let count = 0;
    if (!message.rawDeletedAt) {
      await this.objects.delete(message.rawObjectKey);
      await this.store.releaseStorage(message.id);
      count += 1;
    }
    for (const attachment of await this.store.listAttachments(message.id)) {
      await this.objects.delete(attachment.objectKey);
      await this.store.releaseStorage(attachment.id);
      count += 1;
      await this.store.deleteAttachment(attachment.id);
    }
    return count;
  }

  private async deleteInboxMessages(inbox: Inbox): Promise<void> {
    for (const message of await this.store.listMessages(inbox.projectId, inbox.id)) {
      await this.deleteMessageObjects(message);
      await this.deleteMessageRecord(message);
    }
  }

  private async deleteMessageRecord(message: Message): Promise<void> {
    if (!message.threadId) {
      await this.store.deleteMessage(message.id);
      return;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const expected = await this.store.getThread(message.threadId);
      if (!expected || !expected.messageIds.includes(message.id)) {
        await this.store.deleteMessage(message.id);
        return;
      }
      const remainingMessages = (
        await Promise.all(expected.messageIds
          .filter((messageId) => messageId !== message.id)
          .map((messageId) => this.store.getMessage(messageId)))
      ).filter((entry): entry is Message => entry !== null);
      const next: Thread | null = remainingMessages.length
        ? {
          ...expected,
          messageIds: remainingMessages.map((entry) => entry.id),
          participants: Array.from(new Set(remainingMessages.flatMap((entry) => [
            ...entry.from.map((address) => address.address),
            ...entry.to.map((address) => address.address),
            ...entry.cc.map((address) => address.address),
          ]))).sort(),
          lastMessageAt: remainingMessages.reduce(
            (latest, entry) => entry.receivedAt > latest ? entry.receivedAt : latest,
            remainingMessages[0]!.receivedAt,
          ),
          updatedAt: this.now(),
        }
        : null;
      if (await this.store.deleteMessageWithThread(message.id, expected, next)) return;
      if (!(await this.store.getMessage(message.id))) return;
    }
    throw new MailFnError({
      code: 'MAILFN_STORAGE_FAILED',
      message: 'Message retention conflicted with a concurrent thread update',
      status: 503,
      retryable: true,
    });
  }

  private async assertOutboundAllowed(inbox: Inbox): Promise<void> {
    if (!this.publicPlatform.enabled) return;
    assertMailFn(this.publicPlatform.productionSecurityApproved, {
      code: 'MAILFN_PRODUCTION_APPROVAL_REQUIRED',
      message: 'Public outbound requires explicit production-security approval',
      status: 403,
    });
    if (this.publicPlatform.verifiedDomainsRequiredForOutbound) {
      const domain = await this.store.getDomainByName(inbox.projectId, addressDomain(inbox.address));
      assertMailFn(domain?.status === 'active', {
        code: 'MAILFN_DOMAIN_UNVERIFIED',
        message: 'Outbound sender domain is not verified',
        status: 403,
      });
    }
  }

  private assertDataRegion(region: string): void {
    assertMailFn(this.publicPlatform.allowedDataRegions.includes(region), {
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Requested data region is not available',
      status: 400,
    });
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}

function mergeRetention(base: RetentionPolicy, input?: Partial<RetentionPolicy>): RetentionPolicy {
  const result = { ...base, ...input };
  if (typeof result.deleteOnInboxExpiry !== 'boolean') {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid retention value deleteOnInboxExpiry', status: 400 });
  }
  for (const [key, value] of Object.entries(result)) {
    if (key === 'deleteOnInboxExpiry') continue;
    if (!Number.isInteger(value) || Number(value) <= 0) {
      throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: `Invalid retention value ${key}`, status: 400 });
    }
  }
  return result;
}

function validateQuota(quota: Project['quota']): void {
  if (Object.values(quota).some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Project quotas must be positive', status: 400 });
  }
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid project slug', status: 400 });
  }
  return slug;
}

function requireText(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: `${field} must be a string`, status: 400 });
  }
  const normalized = value.trim();
  if (!normalized) throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: `${field} is required`, status: 400 });
  return normalized;
}

function requireFutureIso(value: string, now: string, field: string): void {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.parse(now)) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: `${field} must be a future ISO timestamp`, status: 400 });
  }
}

function resolveInboxExpiry(input: CreateInboxInput, now: string): string | undefined {
  if (input.kind === 'stable' && input.expirySeconds === undefined) return undefined;
  const seconds = input.expirySeconds ?? 24 * 60 * 60;
  if (!Number.isFinite(seconds) || seconds < 60 || seconds > 365 * 24 * 60 * 60) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid inbox expiry', status: 400 });
  }
  return new Date(Date.parse(now) + seconds * 1000).toISOString();
}

function normalizeIdempotentInboxInput(input: CreateInboxInput): Record<string, unknown> {
  return {
    projectId: input.projectId,
    kind: input.kind,
    requestedLocalPart: input.requestedLocalPart?.toLowerCase(),
    domain: input.domain?.toLowerCase(),
    displayName: input.displayName,
    expirySeconds: input.expirySeconds,
    metadata: Object.fromEntries(Object.entries(input.metadata ?? {}).sort(([left], [right]) => left.localeCompare(right))),
  };
}

function objectKey(projectId: string, inboxId: string, messageId: string, suffix: string): string {
  return `mailfn/${projectId}/${inboxId}/${messageId}/${suffix}`;
}

function headerFirst(headers: Record<string, string[]> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  return value?.[0];
}

function normalizeLabels(labels: string[]): string[] {
  assertMailFn(Array.isArray(labels) && labels.every((label) => typeof label === 'string'), {
    code: 'MAILFN_VALIDATION_FAILED', message: 'Labels must be an array of strings', status: 400,
  });
  return Array.from(new Set(labels.map((label) => label.trim().toLowerCase()).filter(Boolean))).sort();
}

function publicAttachment(attachment: Attachment): AttachmentDescriptor {
  const { projectId: _projectId, objectKey: _objectKey, ...descriptor } = attachment;
  return descriptor;
}

function normalizeAddressList(addresses: string[]): string[] {
  assertMailFn(Array.isArray(addresses) && addresses.every((address) => typeof address === 'string'), {
    code: 'MAILFN_VALIDATION_FAILED', message: 'Address list must be an array of strings', status: 400,
  });
  return Array.from(new Set(addresses.map(normalizeAddress)));
}

function normalizeMessageFilter<T extends MessageFilter>(filter: T): T {
  validateIsoFilter(filter.receivedAfter, 'receivedAfter');
  validateIsoFilter(filter.receivedBefore, 'receivedBefore');
  if (filter.status !== undefined) {
    assertMailFn(['pending', 'ready', 'parse_failed', 'queue_failed', 'deleted'].includes(filter.status), {
      code: 'MAILFN_VALIDATION_FAILED', message: 'Message status filter is invalid', status: 400,
    });
  }
  return filter.labels === undefined ? filter : { ...filter, labels: normalizeLabels(filter.labels) };
}

function validateIsoFilter(value: string | undefined, field: string): void {
  if (value === undefined) return;
  assertMailFn(typeof value === 'string' && Number.isFinite(Date.parse(value)), {
    code: 'MAILFN_VALIDATION_FAILED', message: `${field} must be an ISO timestamp`, status: 400,
  });
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number, field: string): number {
  const resolved = value ?? fallback;
  assertMailFn(Number.isFinite(resolved), {
    code: 'MAILFN_VALIDATION_FAILED', message: `${field} must be a finite number`, status: 400,
  });
  return Math.min(maximum, Math.max(minimum, resolved));
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number, field: string): number {
  const resolved = value ?? fallback;
  assertMailFn(Number.isInteger(resolved), {
    code: 'MAILFN_VALIDATION_FAILED', message: `${field} must be an integer`, status: 400,
  });
  return Math.min(maximum, Math.max(minimum, resolved));
}

function normalizeMailAddresses(addresses: Array<{ address: string; name?: string }>) {
  return addresses.map((entry) => ({ address: normalizeAddress(entry.address), name: entry.name?.trim() || undefined }));
}

function sanitizeHtml(html: string): string {
  return sanitizeMarkup(html, {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'a', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr',
      'th', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'small', 'sub', 'sup',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['alt', 'title', 'width', 'height', 'data-mailfn-remote-image'],
      '*': ['dir', 'lang'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      img: (_tagName, attributes) => ({
        tagName: 'img',
        attribs: {
          ...(attributes.alt ? { alt: attributes.alt } : {}),
          ...(attributes.title ? { title: attributes.title } : {}),
          ...(attributes.width ? { width: attributes.width } : {}),
          ...(attributes.height ? { height: attributes.height } : {}),
          'data-mailfn-remote-image': 'blocked',
        },
      }),
    },
  });
}

function assertWebhookUrl(url: URL): void {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const invalidName = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal');
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)?.slice(1).map(Number);
  const invalidIpv4 = Boolean(ipv4 && (
    ipv4.some((part) => part > 255) ||
    ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 ||
    (ipv4[0] === 100 && ipv4[1]! >= 64 && ipv4[1]! <= 127) ||
    (ipv4[0] === 169 && ipv4[1] === 254) ||
    (ipv4[0] === 172 && ipv4[1]! >= 16 && ipv4[1]! <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 168) ||
    (ipv4[0] === 198 && (ipv4[1] === 18 || ipv4[1] === 19)) ||
    ipv4[0]! >= 224
  ));
  const invalidIpv6 = hostname === '::' || hostname === '::1' || /^(?:fc|fd|fe8|fe9|fea|feb)/i.test(hostname) || hostname.startsWith('::ffff:');
  assertMailFn(url.protocol === 'https:' && !url.username && !url.password && !invalidName && !invalidIpv4 && !invalidIpv6, {
    code: 'MAILFN_VALIDATION_FAILED',
    message: 'Webhook URL must be a public HTTPS endpoint without credentials',
    status: 400,
  });
}

function parseWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new MailFnError({
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Webhook URL is invalid',
      status: 400,
      cause,
    });
  }
  assertWebhookUrl(url);
  return url;
}

function sanitizeFilename(value: string): string {
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f"\\/;]/g, '_').slice(0, 255) || 'attachment';
}

function normalizeContentType(value?: string): string {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  return normalized && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalized) ? normalized : 'application/octet-stream';
}

async function sha256(value: Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function deterministicAttachmentId(messageId: string, index: number): Promise<string> {
  const digest = await sha256(new TextEncoder().encode(`${messageId}:${index}`));
  return `att_${digest.slice(0, 32)}`;
}

interface CursorPayload {
  version: 1;
  kind: 'list' | 'search';
  projectId: string;
  inboxId: string;
  scope: string;
  id: string;
}

function encodeCursor(payload: Omit<CursorPayload, 'version'>): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, ...payload } satisfies CursorPayload));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `mcur_${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}

function decodeCursor(cursor: string, expected: Omit<CursorPayload, 'version' | 'id'>): string {
  try {
    if (!cursor.startsWith('mcur_')) throw new Error('prefix');
    const encoded = cursor.slice(5).replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))) as Partial<CursorPayload>;
    if (
      payload.version !== 1 || payload.kind !== expected.kind || payload.projectId !== expected.projectId ||
      payload.inboxId !== expected.inboxId || payload.scope !== expected.scope || typeof payload.id !== 'string' || !payload.id
    ) throw new Error('scope');
    return payload.id;
  } catch (cause) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Invalid or out-of-scope cursor', status: 400, cause });
  }
}

function listCursorScope(input: Omit<ListMessagesInput, 'projectId'>): string {
  return JSON.stringify({
    sender: input.sender ?? null,
    senderDomain: input.senderDomain ?? null,
    recipient: input.recipient ?? null,
    subject: input.subject ?? null,
    text: input.text ?? null,
    receivedAfter: input.receivedAfter ?? null,
    receivedBefore: input.receivedBefore ?? null,
    unreadOnly: input.unreadOnly ?? null,
    threadId: input.threadId ?? null,
    labels: input.labels ? [...input.labels].sort() : null,
    status: input.status ?? null,
  });
}

function notFound(resource: string): MailFnError {
  return new MailFnError({ code: 'MAILFN_NOT_FOUND', message: `${resource} not found`, status: 404 });
}

function unauthorized(): MailFnError {
  return new MailFnError({ code: 'MAILFN_UNAUTHORIZED', message: 'Invalid or expired MailFn credential', status: 401 });
}

function unknownRecipient(): MailFnError {
  return new MailFnError({ code: 'MAILFN_UNKNOWN_RECIPIENT', message: 'Recipient is not registered', status: 404 });
}

function quotaExceeded(dimension: string): MailFnError {
  return new MailFnError({
    code: 'MAILFN_QUOTA_EXCEEDED',
    message: `Project quota exceeded for ${dimension}`,
    status: 429,
    retryable: false,
  });
}
