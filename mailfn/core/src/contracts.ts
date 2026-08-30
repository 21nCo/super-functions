import type {
  AbuseCase,
  Attachment,
  AuditEvent,
  ComplianceProfile,
  Credential,
  Draft,
  DomainDnsRecord,
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
  ParseJob,
  ParsedMessage,
  Project,
  SendRequest,
  SendResult,
  SupportCase,
  Thread,
  UsageRecord,
  Webhook,
  WebhookDelivery,
} from './types.js';

export interface MailFnStore {
  getProject(id: string): Promise<Project | null>;
  getProjectBySlug(slug: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<void>;
  createProjectWithCredential(project: Project, credential: Credential, audit: AuditEvent): Promise<void>;

  getInbox(id: string): Promise<Inbox | null>;
  getInboxByAddress(address: string): Promise<Inbox | null>;
  listInboxes(projectId: string): Promise<Inbox[]>;
  saveInbox(inbox: Inbox): Promise<void>;
  saveInboxWithActiveQuota(inbox: Inbox, maxActiveInboxes: number): Promise<boolean>;
  createInboxWithCredential(
    inbox: Inbox,
    credential: Credential,
    idempotency: IdempotencyRecord | undefined,
    maxActiveInboxes: number,
  ): Promise<void>;

  getCredential(id: string): Promise<Credential | null>;
  listCredentials(projectId: string, inboxId?: string): Promise<Credential[]>;
  saveCredential(credential: Credential): Promise<void>;
  touchCredentialIfActive(id: string, lastUsedAt: string): Promise<boolean>;

  getMessage(id: string): Promise<Message | null>;
  getMessageByDelivery(inboxId: string, providerDeliveryId: string): Promise<Message | null>;
  listMessages(projectId: string, inboxId: string, filter?: MessageFilter): Promise<Message[]>;
  listMessagesPage(
    projectId: string,
    inboxId: string,
    filter: MessageFilter,
    cursorId: string | undefined,
    limit: number,
  ): Promise<{ items: Message[]; hasMore: boolean; cursorFound: boolean }>;
  searchMessages(projectId: string, inboxId: string, input: Omit<SearchMessagesInput, 'projectId' | 'inboxId'>): Promise<Message[]>;
  searchMessagesPage(
    projectId: string,
    inboxId: string,
    input: Omit<SearchMessagesInput, 'projectId' | 'inboxId' | 'cursor' | 'limit'>,
    cursorId: string | undefined,
    limit: number,
  ): Promise<{ items: Message[]; hasMore: boolean; cursorFound: boolean }>;
  createInboundMessageIfInboxActive(message: Message): Promise<boolean>;
  saveMessage(message: Message): Promise<void>;
  claimMessageForParsing(messageId: string, claimedAt: string, leaseExpiresAt: string): Promise<boolean>;
  markMessageRead(messageId: string, readAt: string): Promise<Message | null>;
  setMessageLabels(messageId: string, labels: string[], updatedAt: string): Promise<Message | null>;
  deleteMessage(id: string): Promise<void>;

  getAttachment(id: string): Promise<Attachment | null>;
  listAttachments(messageId: string): Promise<Attachment[]>;
  saveAttachment(attachment: Attachment): Promise<void>;
  deleteAttachment(id: string): Promise<void>;

  getThread(id: string): Promise<Thread | null>;
  listThreads(projectId: string, inboxId: string): Promise<Thread[]>;
  saveThread(thread: Thread): Promise<void>;
  saveThreadIfUnchanged(thread: Thread, expected: Thread | null): Promise<boolean>;
  deleteMessageWithThread(messageId: string, expected: Thread, next: Thread | null): Promise<boolean>;

  getWebhook(id: string): Promise<Webhook | null>;
  listWebhooks(projectId: string, inboxId?: string): Promise<Webhook[]>;
  createWebhookWithQuota(webhook: Webhook, maxWebhooks: number): Promise<boolean>;
  saveWebhook(webhook: Webhook): Promise<void>;
  saveWebhookDelivery(delivery: WebhookDelivery): Promise<void>;
  listWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]>;

  getDraft(id: string): Promise<Draft | null>;
  listDrafts(projectId: string, inboxId: string): Promise<Draft[]>;
  saveDraft(draft: Draft): Promise<void>;
  saveDraftIfInboxWritable(draft: Draft): Promise<boolean>;
  claimDraft(draftId: string, expectedStatus: Draft['status'], draft: Draft): Promise<boolean>;
  deleteDrafts(projectId: string, inboxId: string): Promise<void>;

  getDomain(id: string): Promise<MailDomain | null>;
  getDomainByName(projectId: string, domain: string): Promise<MailDomain | null>;
  listDomains(projectId: string): Promise<MailDomain[]>;
  createDomain(domain: MailDomain): Promise<boolean>;
  saveDomain(domain: MailDomain): Promise<void>;

  appendEvent(event: MailFnEvent): Promise<void>;
  listEvents(projectId: string, after?: string): Promise<MailFnEvent[]>;
  appendAudit(event: AuditEvent): Promise<void>;
  listAudits(projectId: string, after?: string): Promise<AuditEvent[]>;
  deleteExpiredAudits(projectId: string, now: string): Promise<number>;

  getIdempotency(projectId: string, key: string): Promise<IdempotencyRecord | null>;
  saveIdempotency(record: IdempotencyRecord): Promise<void>;
  deleteExpiredIdempotency(projectId: string, key: string, now: string): Promise<void>;
  reserveIngressQuota(reservation: IngressQuotaReservation): Promise<IngressQuotaDecision>;
  releaseIngressQuota(reservationId: string): Promise<void>;
  reserveStorage(
    reservation: { id: string; projectId: string; bytes: number; createdAt: string },
    limit: number,
  ): Promise<'created' | 'existing' | 'denied'>;
  releaseStorage(reservationId: string): Promise<void>;

  appendUsage(record: UsageRecord): Promise<void>;
  reserveOutboundUsage(record: UsageRecord, limit: number): Promise<'created' | 'existing' | 'denied'>;
  releaseUsage(id: string): Promise<void>;
  listUsage(projectId: string, period?: string): Promise<UsageRecord[]>;
  saveAbuseCase(abuseCase: AbuseCase): Promise<void>;
  listAbuseCases(projectId: string): Promise<AbuseCase[]>;
  getSenderReputation(projectId: string, sender: string): Promise<SenderReputation | null>;
  listSenderReputations(projectId: string): Promise<SenderReputation[]>;
  saveSenderReputation(reputation: SenderReputation): Promise<void>;
  saveSupportCase(supportCase: SupportCase): Promise<void>;
  listSupportCases(projectId: string): Promise<SupportCase[]>;
  getComplianceProfile(projectId: string): Promise<ComplianceProfile | null>;
  saveComplianceProfile(profile: ComplianceProfile): Promise<void>;
}

export interface MailFnObjectStore {
  put(key: string, data: Uint8Array, options?: { contentType?: string; metadata?: Record<string, string> }): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  signDownload?(key: string, expiresInSeconds: number): Promise<string>;
}

export interface MailFnQueue {
  enqueue(job: ParseJob): Promise<void>;
}

export interface MailFnMimeParser {
  parse(raw: Uint8Array): Promise<ParsedMessage>;
}

export interface MailFnSendAdapter {
  /** Implementations must treat SendRequest.idempotencyKey as exactly-once for a logical send. */
  send(request: SendRequest): Promise<SendResult>;
}

export interface MailFnDomainAdapter {
  /** Provider-specific routing records. Core adds only MailFn's ownership TXT challenge. */
  getRequiredDnsRecords(domain: string): Promise<DomainDnsRecord[]>;
  createRouting(domain: MailDomain): Promise<{ routingRuleId: string }>;
  verifyDns(domain: MailDomain): Promise<{ verified: boolean; diagnostics: string[] }>;
  disableRouting(domain: MailDomain): Promise<void>;
}

export interface MailFnWebhookDispatcher {
  validateUrl?(url: URL): Promise<void>;
  deliver(input: {
    webhook: Webhook;
    event: MailFnEvent;
    deliveryId: string;
    timestamp: string;
  }): Promise<{ ok: boolean; status?: number; retryable: boolean }>;
}

export interface MailFnClock {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export interface MailFnIdGenerator {
  generate(prefix: string): string;
}

export interface MailFnTokenCodec {
  create(credentialId: string): Promise<{ token: string; hash: string; prefix: string }>;
  hash(token: string): Promise<string>;
  equals(left: string, right: string): boolean;
}

export interface MailFnSecretProtector {
  protect(secret: string): Promise<string>;
  reveal(ciphertext: string): Promise<string>;
}
