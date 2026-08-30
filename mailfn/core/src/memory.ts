import type { MailFnObjectStore, MailFnStore } from './contracts.js';
import type {
  AbuseCase,
  Attachment,
  AuditEvent,
  ComplianceProfile,
  Credential,
  Draft,
  IdempotencyRecord,
  IngressQuotaDecision,
  IngressQuotaReservation,
  Inbox,
  MailDomain,
  MailFnEvent,
  Message,
  MessageFilter,
  SearchMessagesInput,
  SenderReputation,
  Project,
  SupportCase,
  Thread,
  UsageRecord,
  Webhook,
  WebhookDelivery,
} from './types.js';

function copy<T>(value: T): T {
  return structuredClone(value);
}

function values<T>(map: Map<string, T>): T[] {
  return Array.from(map.values(), copy);
}

export class MemoryMailFnStore implements MailFnStore {
  private readonly projects = new Map<string, Project>();
  private readonly inboxes = new Map<string, Inbox>();
  private readonly credentials = new Map<string, Credential>();
  private readonly messages = new Map<string, Message>();
  private readonly attachments = new Map<string, Attachment>();
  private readonly threads = new Map<string, Thread>();
  private readonly webhooks = new Map<string, Webhook>();
  private readonly webhookDeliveries = new Map<string, WebhookDelivery>();
  private readonly drafts = new Map<string, Draft>();
  private readonly domains = new Map<string, MailDomain>();
  private readonly events = new Map<string, MailFnEvent>();
  private readonly audits = new Map<string, AuditEvent>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly usage = new Map<string, UsageRecord>();
  private readonly abuseCases = new Map<string, AbuseCase>();
  private readonly senderReputations = new Map<string, SenderReputation>();
  private readonly supportCases = new Map<string, SupportCase>();
  private readonly compliance = new Map<string, ComplianceProfile>();
  private readonly ingressReservations = new Map<string, IngressQuotaReservation>();
  private readonly storageReservations = new Map<string, { id: string; projectId: string; bytes: number; createdAt: string }>();

  async getProject(id: string): Promise<Project | null> {
    return this.projects.has(id) ? copy(this.projects.get(id)!) : null;
  }
  async getProjectBySlug(slug: string): Promise<Project | null> {
    return copy(values(this.projects).find((project) => project.slug === slug) ?? null);
  }
  async listProjects(): Promise<Project[]> {
    return values(this.projects);
  }
  async saveProject(project: Project): Promise<void> {
    this.projects.set(project.id, copy(project));
  }
  async createProjectWithCredential(project: Project, credential: Credential, audit: AuditEvent): Promise<void> {
    if (values(this.projects).some((entry) => entry.slug === project.slug) || this.projects.has(project.id) || this.credentials.has(credential.id) || this.audits.has(audit.id)) {
      throw new Error('MAILFN_UNIQUE_CONSTRAINT');
    }
    this.projects.set(project.id, copy(project));
    this.credentials.set(credential.id, copy(credential));
    this.audits.set(audit.id, copy(audit));
  }

  async getInbox(id: string): Promise<Inbox | null> {
    return this.inboxes.has(id) ? copy(this.inboxes.get(id)!) : null;
  }
  async getInboxByAddress(address: string): Promise<Inbox | null> {
    return copy(values(this.inboxes).find((inbox) => inbox.address === address) ?? null);
  }
  async listInboxes(projectId: string): Promise<Inbox[]> {
    return values(this.inboxes).filter((inbox) => inbox.projectId === projectId);
  }
  async saveInbox(inbox: Inbox): Promise<void> {
    this.inboxes.set(inbox.id, copy(inbox));
  }
  async saveInboxWithActiveQuota(inbox: Inbox, maxActiveInboxes: number): Promise<boolean> {
    const current = this.inboxes.get(inbox.id);
    if (!current || current.projectId !== inbox.projectId) return false;
    if (current.status === 'deleting' || current.status === 'deleted') return false;
    if (current.status !== 'active' && values(this.inboxes).filter(
      (entry) => entry.projectId === inbox.projectId && entry.id !== inbox.id && entry.status === 'active',
    ).length >= maxActiveInboxes) return false;
    this.inboxes.set(inbox.id, copy(inbox));
    return true;
  }
  async createInboxWithCredential(
    inbox: Inbox,
    credential: Credential,
    idempotency: IdempotencyRecord | undefined,
    maxActiveInboxes: number,
  ): Promise<void> {
    if (values(this.inboxes).some((entry) => entry.address === inbox.address) || this.inboxes.has(inbox.id) || this.credentials.has(credential.id)) {
      throw new Error('MAILFN_UNIQUE_CONSTRAINT');
    }
    if (idempotency && this.idempotency.has(`${idempotency.projectId}:${idempotency.key}`)) throw new Error('MAILFN_UNIQUE_CONSTRAINT');
    if (values(this.inboxes).filter((entry) => entry.projectId === inbox.projectId && entry.status === 'active').length >= maxActiveInboxes) {
      throw new Error('MAILFN_ACTIVE_INBOX_QUOTA');
    }
    this.inboxes.set(inbox.id, copy(inbox));
    this.credentials.set(credential.id, copy(credential));
    if (idempotency) this.idempotency.set(`${idempotency.projectId}:${idempotency.key}`, copy(idempotency));
  }

  async getCredential(id: string): Promise<Credential | null> {
    return this.credentials.has(id) ? copy(this.credentials.get(id)!) : null;
  }
  async listCredentials(projectId: string, inboxId?: string): Promise<Credential[]> {
    return values(this.credentials).filter(
      (credential) => credential.projectId === projectId && (inboxId === undefined || credential.inboxId === inboxId),
    );
  }
  async saveCredential(credential: Credential): Promise<void> {
    this.credentials.set(credential.id, copy(credential));
  }
  async touchCredentialIfActive(id: string, lastUsedAt: string): Promise<boolean> {
    const credential = this.credentials.get(id);
    if (!credential || credential.status !== 'active') return false;
    this.credentials.set(id, copy({ ...credential, lastUsedAt }));
    return true;
  }

  async getMessage(id: string): Promise<Message | null> {
    return this.messages.has(id) ? copy(this.messages.get(id)!) : null;
  }
  async getMessageByDelivery(inboxId: string, providerDeliveryId: string): Promise<Message | null> {
    return copy(
      values(this.messages).find(
        (message) => message.inboxId === inboxId && message.providerDeliveryId === providerDeliveryId,
      ) ?? null,
    );
  }
  async listMessages(projectId: string, inboxId: string, filter: MessageFilter = {}): Promise<Message[]> {
    return values(this.messages)
      .filter((message) => message.projectId === projectId && message.inboxId === inboxId)
      .filter((message) => matchesMessage(message, filter))
      .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt) || right.id.localeCompare(left.id));
  }
  async listMessagesPage(
    projectId: string,
    inboxId: string,
    filter: MessageFilter,
    cursorId: string | undefined,
    limit: number,
  ): Promise<{ items: Message[]; hasMore: boolean; cursorFound: boolean }> {
    const messages = await this.listMessages(projectId, inboxId, filter);
    const cursorIndex = cursorId ? messages.findIndex((message) => message.id === cursorId) : -1;
    if (cursorId && cursorIndex < 0) return { items: [], hasMore: false, cursorFound: false };
    const start = cursorIndex + 1;
    return {
      items: messages.slice(start, start + limit),
      hasMore: start + limit < messages.length,
      cursorFound: true,
    };
  }
  async searchMessages(
    projectId: string,
    inboxId: string,
    input: Omit<SearchMessagesInput, 'projectId' | 'inboxId'>,
  ): Promise<Message[]> {
    const query = input.query.toLowerCase();
    return (await this.listMessages(projectId, inboxId, {
      receivedAfter: input.receivedAfter,
      receivedBefore: input.receivedBefore,
      status: 'ready',
    })).filter((message) =>
      `${message.subject}\n${message.textBody ?? ''}\n${message.htmlBody ?? ''}`.toLowerCase().includes(query),
    );
  }
  async searchMessagesPage(
    projectId: string,
    inboxId: string,
    input: Omit<SearchMessagesInput, 'projectId' | 'inboxId' | 'cursor' | 'limit'>,
    cursorId: string | undefined,
    limit: number,
  ): Promise<{ items: Message[]; hasMore: boolean; cursorFound: boolean }> {
    const messages = await this.searchMessages(projectId, inboxId, input);
    const cursorIndex = cursorId ? messages.findIndex((message) => message.id === cursorId) : -1;
    if (cursorId && cursorIndex < 0) return { items: [], hasMore: false, cursorFound: false };
    const start = cursorIndex + 1;
    return {
      items: messages.slice(start, start + limit),
      hasMore: start + limit < messages.length,
      cursorFound: true,
    };
  }
  async saveMessage(message: Message): Promise<void> {
    const duplicate = values(this.messages).find(
      (candidate) => candidate.id !== message.id && candidate.inboxId === message.inboxId &&
        candidate.providerDeliveryId === message.providerDeliveryId,
    );
    if (duplicate) throw new Error('MAILFN_UNIQUE_CONSTRAINT');
    this.messages.set(message.id, copy(message));
  }
  async createInboundMessageIfInboxActive(message: Message): Promise<boolean> {
    const inbox = this.inboxes.get(message.inboxId);
    if (!inbox || inbox.status !== 'active') return false;
    const duplicate = values(this.messages).find(
      (candidate) => candidate.id === message.id || (
        candidate.inboxId === message.inboxId && candidate.providerDeliveryId === message.providerDeliveryId
      ),
    );
    if (duplicate) return false;
    this.messages.set(message.id, copy(message));
    return true;
  }
  async claimMessageForParsing(messageId: string, claimedAt: string, leaseExpiresAt: string): Promise<boolean> {
    const message = this.messages.get(messageId);
    if (
      !message || message.status === 'ready' || message.status === 'deleted' ||
      (message.parseLeaseExpiresAt !== undefined && message.parseLeaseExpiresAt > claimedAt)
    ) return false;
    this.messages.set(messageId, copy({ ...message, parseLeaseExpiresAt: leaseExpiresAt, updatedAt: claimedAt }));
    return true;
  }
  async markMessageRead(messageId: string, readAt: string): Promise<Message | null> {
    const message = this.messages.get(messageId);
    if (!message) return null;
    if (!message.readAt) this.messages.set(messageId, copy({ ...message, readAt, updatedAt: readAt }));
    return copy(this.messages.get(messageId)!);
  }
  async setMessageLabels(messageId: string, labels: string[], updatedAt: string): Promise<Message | null> {
    const message = this.messages.get(messageId);
    if (!message) return null;
    const updated = { ...message, labels: [...labels], updatedAt };
    this.messages.set(messageId, copy(updated));
    return copy(updated);
  }
  async deleteMessage(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async getAttachment(id: string): Promise<Attachment | null> {
    return this.attachments.has(id) ? copy(this.attachments.get(id)!) : null;
  }
  async listAttachments(messageId: string): Promise<Attachment[]> {
    return values(this.attachments).filter((attachment) => attachment.messageId === messageId);
  }
  async saveAttachment(attachment: Attachment): Promise<void> {
    this.attachments.set(attachment.id, copy(attachment));
  }
  async deleteAttachment(id: string): Promise<void> {
    this.attachments.delete(id);
  }

  async getThread(id: string): Promise<Thread | null> {
    return this.threads.has(id) ? copy(this.threads.get(id)!) : null;
  }
  async listThreads(projectId: string, inboxId: string): Promise<Thread[]> {
    return values(this.threads)
      .filter((thread) => thread.projectId === projectId && thread.inboxId === inboxId)
      .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
  }
  async saveThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, copy(thread));
  }
  async saveThreadIfUnchanged(thread: Thread, expected: Thread | null): Promise<boolean> {
    const current = this.threads.get(thread.id) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.threads.set(thread.id, copy(thread));
    return true;
  }
  async deleteMessageWithThread(messageId: string, expected: Thread, next: Thread | null): Promise<boolean> {
    const current = this.threads.get(expected.id) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected) || !this.messages.has(messageId)) return false;
    this.messages.delete(messageId);
    if (next) this.threads.set(next.id, copy(next));
    else this.threads.delete(expected.id);
    return true;
  }

  async getWebhook(id: string): Promise<Webhook | null> {
    return this.webhooks.has(id) ? copy(this.webhooks.get(id)!) : null;
  }
  async listWebhooks(projectId: string, inboxId?: string): Promise<Webhook[]> {
    return values(this.webhooks).filter(
      (webhook) => webhook.projectId === projectId && (inboxId === undefined || webhook.inboxId === inboxId),
    );
  }
  async createWebhookWithQuota(webhook: Webhook, maxWebhooks: number): Promise<boolean> {
    if (this.webhooks.has(webhook.id)) return false;
    const activeCount = values(this.webhooks).filter(
      (entry) => entry.projectId === webhook.projectId && entry.status === 'active',
    ).length;
    if (activeCount >= maxWebhooks) return false;
    this.webhooks.set(webhook.id, copy(webhook));
    return true;
  }
  async saveWebhook(webhook: Webhook): Promise<void> {
    this.webhooks.set(webhook.id, copy(webhook));
  }
  async saveWebhookDelivery(delivery: WebhookDelivery): Promise<void> {
    this.webhookDeliveries.set(delivery.id, copy(delivery));
  }
  async listWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
    return values(this.webhookDeliveries).filter((delivery) => delivery.webhookId === webhookId);
  }

  async getDraft(id: string): Promise<Draft | null> {
    return this.drafts.has(id) ? copy(this.drafts.get(id)!) : null;
  }
  async listDrafts(projectId: string, inboxId: string): Promise<Draft[]> {
    return values(this.drafts).filter((draft) => draft.projectId === projectId && draft.inboxId === inboxId);
  }
  async saveDraft(draft: Draft): Promise<void> {
    this.drafts.set(draft.id, copy(draft));
  }
  async saveDraftIfInboxWritable(draft: Draft): Promise<boolean> {
    const inbox = this.inboxes.get(draft.inboxId);
    if (!inbox || inbox.projectId !== draft.projectId || inbox.status === 'deleting' || inbox.status === 'deleted') return false;
    this.drafts.set(draft.id, copy(draft));
    return true;
  }
  async claimDraft(draftId: string, expectedStatus: Draft['status'], draft: Draft): Promise<boolean> {
    const inbox = this.inboxes.get(draft.inboxId);
    if (!inbox || inbox.projectId !== draft.projectId || inbox.status === 'deleting' || inbox.status === 'deleted') return false;
    if (this.drafts.get(draftId)?.status !== expectedStatus) return false;
    this.drafts.set(draftId, copy(draft));
    return true;
  }
  async deleteDrafts(projectId: string, inboxId: string): Promise<void> {
    for (const [id, draft] of this.drafts) {
      if (draft.projectId === projectId && draft.inboxId === inboxId) this.drafts.delete(id);
    }
  }

  async getDomain(id: string): Promise<MailDomain | null> {
    return this.domains.has(id) ? copy(this.domains.get(id)!) : null;
  }
  async getDomainByName(projectId: string, domain: string): Promise<MailDomain | null> {
    return copy(
      values(this.domains).find((entry) => entry.projectId === projectId && entry.domain === domain) ?? null,
    );
  }
  async getDomainByNameAcrossProjects(domain: string): Promise<MailDomain | null> {
    return copy(values(this.domains).find((entry) => entry.domain === domain) ?? null);
  }
  async listDomains(projectId: string): Promise<MailDomain[]> {
    return values(this.domains).filter((domain) => domain.projectId === projectId);
  }
  async createDomain(domain: MailDomain): Promise<boolean> {
    if (values(this.domains).some((entry) => entry.domain === domain.domain)) {
      return false;
    }
    this.domains.set(domain.id, copy(domain));
    return true;
  }
  async createDomainWithQuota(domain: MailDomain, maxDomains: number): Promise<boolean> {
    if (values(this.domains).some((entry) => entry.domain === domain.domain)) {
      return false;
    }
    if (values(this.domains).filter((entry) => entry.projectId === domain.projectId).length >= maxDomains) {
      return false;
    }
    this.domains.set(domain.id, copy(domain));
    return true;
  }
  async saveDomain(domain: MailDomain): Promise<void> {
    this.domains.set(domain.id, copy(domain));
  }

  async appendEvent(event: MailFnEvent): Promise<void> {
    this.events.set(event.id, copy(event));
  }
  async listEvents(projectId: string, after?: string): Promise<MailFnEvent[]> {
    return values(this.events)
      .filter((event) => event.projectId === projectId && (!after || event.occurredAt > after))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }
  async deleteTerminalWebhookDeliveriesBefore(projectId: string, before: string): Promise<number> {
    let deleted = 0;
    for (const [id, delivery] of this.webhookDeliveries) {
      const webhook = this.webhooks.get(delivery.webhookId);
      if (webhook?.projectId === projectId && ['delivered', 'dead_letter'].includes(delivery.status) && delivery.updatedAt <= before) {
        this.webhookDeliveries.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
  async deleteEventsBefore(projectId: string, before: string): Promise<number> {
    const retryEventIds = new Set(values(this.webhookDeliveries)
      .filter((delivery) => delivery.status === 'pending' || delivery.status === 'failed')
      .map((delivery) => delivery.eventId));
    let deleted = 0;
    for (const [id, event] of this.events) {
      if (event.projectId === projectId && event.occurredAt <= before && !retryEventIds.has(id)) {
        this.events.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }
  async appendAudit(event: AuditEvent): Promise<void> {
    this.audits.set(event.id, copy(event));
  }
  async listAudits(projectId: string, after?: string): Promise<AuditEvent[]> {
    return values(this.audits)
      .filter((event) => event.projectId === projectId && (!after || event.createdAt > after))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  async deleteExpiredAudits(projectId: string, now: string): Promise<number> {
    let deleted = 0;
    for (const [id, event] of this.audits) {
      if (event.projectId === projectId && event.retentionExpiresAt <= now) {
        this.audits.delete(id);
        deleted += 1;
      }
    }
    return deleted;
  }

  async getIdempotency(projectId: string, key: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotency.get(`${projectId}:${key}`);
    return record ? copy(record) : null;
  }
  async createIdempotency(record: IdempotencyRecord): Promise<boolean> {
    const key = `${record.projectId}:${record.key}`;
    if (this.idempotency.has(key)) return false;
    this.idempotency.set(key, copy(record));
    return true;
  }
  async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    this.idempotency.set(`${record.projectId}:${record.key}`, copy(record));
  }
  async deleteExpiredIdempotency(projectId: string, key: string, now: string): Promise<void> {
    const storageKey = `${projectId}:${key}`;
    if ((this.idempotency.get(storageKey)?.expiresAt ?? now) <= now) this.idempotency.delete(storageKey);
  }
  async reserveIngressQuota(reservation: IngressQuotaReservation): Promise<IngressQuotaDecision> {
    for (const [id, entry] of this.ingressReservations) {
      if (entry.bucket < reservation.bucket) this.ingressReservations.delete(id);
    }
    const current = values(this.ingressReservations).filter(
      (entry) => entry.projectId === reservation.projectId && entry.bucket === reservation.bucket,
    );
    if (current.length >= reservation.projectLimit) return { allowed: false, dimension: 'project' };
    if (current.filter((entry) => entry.inboxId === reservation.inboxId).length >= reservation.inboxLimit) {
      return { allowed: false, dimension: 'inbox' };
    }
    if (current.filter((entry) => entry.sender === reservation.sender).length >= reservation.senderLimit) {
      return { allowed: false, dimension: 'sender' };
    }
    this.ingressReservations.set(reservation.id, copy(reservation));
    return { allowed: true };
  }
  async releaseIngressQuota(reservationId: string): Promise<void> {
    this.ingressReservations.delete(reservationId);
  }
  async reserveStorage(
    reservation: { id: string; projectId: string; bytes: number; createdAt: string },
    limit: number,
  ): Promise<'created' | 'existing' | 'denied'> {
    if (this.storageReservations.has(reservation.id)) return 'existing';
    const used = values(this.storageReservations)
      .filter((entry) => entry.projectId === reservation.projectId)
      .reduce((total, entry) => total + entry.bytes, 0);
    if (used + reservation.bytes > limit) return 'denied';
    this.storageReservations.set(reservation.id, copy(reservation));
    return 'created';
  }
  async releaseStorage(reservationId: string): Promise<void> {
    this.storageReservations.delete(reservationId);
  }

  async appendUsage(record: UsageRecord): Promise<void> {
    this.usage.set(record.id, copy(record));
  }
  async reserveOutboundUsage(record: UsageRecord, limit: number): Promise<'created' | 'existing' | 'denied'> {
    if (this.usage.has(record.id)) return 'existing';
    const used = values(this.usage)
      .filter((entry) => entry.projectId === record.projectId && entry.period === record.period && entry.metric === 'outbound_message')
      .reduce((total, entry) => total + entry.quantity, 0);
    if (used + record.quantity > limit) return 'denied';
    this.usage.set(record.id, copy(record));
    return 'created';
  }
  async releaseUsage(id: string): Promise<void> {
    this.usage.delete(id);
  }
  async listUsage(projectId: string, period?: string): Promise<UsageRecord[]> {
    return values(this.usage).filter(
      (record) => record.projectId === projectId && (period === undefined || record.period === period),
    );
  }
  async saveAbuseCase(abuseCase: AbuseCase): Promise<void> {
    this.abuseCases.set(abuseCase.id, copy(abuseCase));
  }
  async listAbuseCases(projectId: string): Promise<AbuseCase[]> {
    return values(this.abuseCases).filter((entry) => entry.projectId === projectId);
  }
  async getSenderReputation(projectId: string, sender: string): Promise<SenderReputation | null> {
    const value = this.senderReputations.get(`${projectId}:${sender}`);
    return value ? copy(value) : null;
  }
  async listSenderReputations(projectId: string): Promise<SenderReputation[]> {
    return values(this.senderReputations).filter((entry) => entry.projectId === projectId);
  }
  async saveSenderReputation(reputation: SenderReputation): Promise<void> {
    this.senderReputations.set(`${reputation.projectId}:${reputation.sender}`, copy(reputation));
  }
  async saveSupportCase(supportCase: SupportCase): Promise<void> {
    this.supportCases.set(supportCase.id, copy(supportCase));
  }
  async listSupportCases(projectId: string): Promise<SupportCase[]> {
    return values(this.supportCases).filter((entry) => entry.projectId === projectId);
  }
  async getComplianceProfile(projectId: string): Promise<ComplianceProfile | null> {
    return this.compliance.has(projectId) ? copy(this.compliance.get(projectId)!) : null;
  }
  async saveComplianceProfile(profile: ComplianceProfile): Promise<void> {
    this.compliance.set(profile.projectId, copy(profile));
  }
}

export class MemoryMailFnObjectStore implements MailFnObjectStore {
  private readonly objects = new Map<string, Uint8Array>();

  async put(key: string, data: Uint8Array): Promise<void> {
    this.objects.set(key, data.slice());
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.slice() ?? null;
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async signDownload(key: string): Promise<string> {
    if (!this.objects.has(key)) throw new Error('MAILFN_OBJECT_NOT_FOUND');
    return `memory://mailfn/${encodeURIComponent(key)}`;
  }
  size(): number {
    return this.objects.size;
  }
}

function matchesMessage(message: Message, filter: MessageFilter): boolean {
  if (filter.sender) {
    const value = filter.sender.toLowerCase();
    if (message.envelopeFrom.toLowerCase() !== value && !message.from.some((entry) => entry.address.toLowerCase() === value)) return false;
  }
  if (filter.senderDomain) {
    const domain = filter.senderDomain.toLowerCase();
    if (!message.from.some((entry) => entry.address.toLowerCase().endsWith(`@${domain}`))) return false;
  }
  if (filter.recipient && message.envelopeTo.toLowerCase() !== filter.recipient.toLowerCase()) return false;
  if (filter.subject && !message.subject.toLowerCase().includes(filter.subject.toLowerCase())) return false;
  if (filter.text) {
    const body = `${message.textBody ?? ''}\n${message.htmlBody ?? ''}`.toLowerCase();
    if (!body.includes(filter.text.toLowerCase())) return false;
  }
  const receivedAt = Date.parse(message.receivedAt);
  if (filter.receivedAfter && receivedAt <= Date.parse(filter.receivedAfter)) return false;
  if (filter.receivedBefore && receivedAt >= Date.parse(filter.receivedBefore)) return false;
  if (filter.unreadOnly && message.readAt) return false;
  if (filter.threadId && message.threadId !== filter.threadId) return false;
  if (filter.labels?.some((label) => !message.labels.includes(label))) return false;
  if (filter.status && message.status !== filter.status) return false;
  return true;
}
