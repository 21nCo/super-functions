export const MAILFN_API_VERSION = 'v1' as const;
export const MAILFN_EVENT_VERSION = 1 as const;

export type ProjectStatus = 'active' | 'suspended' | 'deleted';
export type InboxKind = 'stable' | 'expiring';
export type InboxStatus = 'active' | 'disabled' | 'expired' | 'deleting' | 'deleted';
export type MessageStatus = 'pending' | 'ready' | 'parse_failed' | 'queue_failed' | 'deleted';
export type DomainStatus = 'pending' | 'verifying' | 'verified' | 'active' | 'disabling' | 'disabled' | 'failed';
export type WebhookStatus = 'active' | 'disabled' | 'quarantined';
export type CredentialStatus = 'active' | 'revoked' | 'expired';
export type DraftStatus = 'draft' | 'sending' | 'sent' | 'discarded';
export type DataRegion = 'global' | 'eu' | 'us' | 'in' | (string & {});

export const MAILFN_SCOPES = [
  'project:admin',
  'inbox:create',
  'inbox:read',
  'inbox:write',
  'inbox:delete',
  'token:manage',
  'message:read',
  'message:wait',
  'message:extract',
  'message:label',
  'message:search',
  'draft:write',
  'send:write',
  'webhook:manage',
  'domain:manage',
  'audit:read',
  'billing:read',
  'support:write',
] as const;

export type MailFnScope = (typeof MAILFN_SCOPES)[number];

export interface RetentionPolicy {
  messageTtlSeconds: number;
  rawTtlSeconds: number;
  attachmentTtlSeconds: number;
  auditTtlSeconds: number;
  deleteOnInboxExpiry: boolean;
}

export interface ProjectQuota {
  maxActiveInboxes: number;
  /** Total accepted inbound messages across the project in one UTC hour. */
  maxMessagesPerHour: number;
  maxMessagesPerInboxPerHour: number;
  maxMessagesPerSenderPerHour: number;
  maxMessageBytes: number;
  maxAttachmentBytes: number;
  maxStoredBytes: number;
  maxWebhooks: number;
  maxDomains: number;
  maxOutboundPerDay: number;
}

export interface Project {
  id: string;
  slug: string;
  displayName: string;
  status: ProjectStatus;
  environment: string;
  dataRegion: DataRegion;
  defaultRetentionPolicy: RetentionPolicy;
  quota: ProjectQuota;
  createdAt: string;
  updatedAt: string;
}

export interface Inbox {
  id: string;
  projectId: string;
  address: string;
  displayName?: string;
  kind: InboxKind;
  status: InboxStatus;
  metadata: Record<string, string>;
  labels: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Credential {
  id: string;
  projectId: string;
  inboxId?: string;
  tokenHash: string;
  tokenPrefix: string;
  permissions: MailFnScope[];
  status: CredentialStatus;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface MailAddress {
  address: string;
  name?: string;
}

export interface AuthenticationResults {
  spf?: string;
  dkim?: string;
  dmarc?: string;
  arc?: string;
  raw?: string;
}

export interface Message {
  id: string;
  projectId: string;
  inboxId: string;
  providerDeliveryId: string;
  internetMessageId?: string;
  envelopeFrom: string;
  envelopeTo: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  subject: string;
  receivedAt: string;
  parsedAt?: string;
  textBody?: string;
  htmlBody?: string;
  headers: Record<string, string[]>;
  rawObjectKey: string;
  rawRetentionExpiresAt: string;
  rawDeletedAt?: string;
  attachmentRetentionExpiresAt: string;
  threadId?: string;
  inReplyTo?: string;
  references: string[];
  authenticationResults: AuthenticationResults;
  sizeBytes: number;
  status: MessageStatus;
  labels: string[];
  readAt?: string;
  retentionExpiresAt: string;
  parseErrorCode?: string;
  /** Whether a reconciliation worker may safely enqueue this parse failure again. */
  parseRetryable?: boolean;
  /** Durable lease used to serialize at-least-once MIME parse deliveries. */
  parseLeaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  projectId: string;
  inboxId: string;
  messageId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  objectKey: string;
  sha256: string;
  contentId?: string;
  disposition?: string;
  createdAt: string;
}

/** Attachment metadata safe to expose through public API surfaces. */
export type AttachmentDescriptor = Omit<Attachment, 'projectId' | 'objectKey'>;

export interface Thread {
  id: string;
  projectId: string;
  inboxId: string;
  normalizedSubject: string;
  messageIds: string[];
  participants: string[];
  labels: string[];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export const MAILFN_EVENT_TYPES = [
  'message.received',
  'message.parsed',
  'message.parse_failed',
  'inbox.expiring',
  'inbox.expired',
  'webhook.delivery_failed',
  'credential.revoked',
  'retention.deleted',
  'domain.verified',
  'draft.sent',
  'abuse.reported',
] as const;

export type MailFnEventType = (typeof MAILFN_EVENT_TYPES)[number];

export interface MailFnEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  version: typeof MAILFN_EVENT_VERSION;
  type: MailFnEventType;
  projectId: string;
  inboxId?: string;
  messageId?: string;
  occurredAt: string;
  payload: TPayload;
}

export interface Webhook {
  id: string;
  projectId: string;
  inboxId?: string;
  url: string;
  eventTypes: MailFnEventType[];
  secretHash: string;
  secretCiphertext?: string;
  status: WebhookStatus;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  attempt: number;
  status: 'pending' | 'delivered' | 'failed' | 'dead_letter';
  responseStatus?: number;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  projectId: string;
  actorType: 'credential' | 'system' | 'admin';
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
  retentionExpiresAt: string;
}

export interface Draft {
  id: string;
  projectId: string;
  inboxId: string;
  threadId?: string;
  inReplyToMessageId?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text?: string;
  html?: string;
  attachmentIds: string[];
  status: DraftStatus;
  providerMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainDnsRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  value: string;
  priority?: number;
}

export interface MailDomain {
  id: string;
  projectId: string;
  domain: string;
  status: DomainStatus;
  verificationToken: string;
  expectedRecords: DomainDnsRecord[];
  routingRuleId?: string;
  verifiedAt?: string;
  lastCheckedAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UsageRecord {
  id: string;
  projectId: string;
  metric: 'inbound_message' | 'stored_bytes' | 'attachment_bytes' | 'outbound_message';
  quantity: number;
  resourceId?: string;
  period: string;
  createdAt: string;
}

export interface AbuseCase {
  id: string;
  projectId: string;
  kind: 'spam' | 'phishing' | 'malware' | 'complaint' | 'bounce' | 'policy';
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  resourceType: 'inbox' | 'message' | 'domain' | 'project';
  resourceId: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface SenderReputation {
  projectId: string;
  sender: string;
  status: 'allow' | 'monitor' | 'block';
  score: number;
  complaintCount: number;
  bounceCount: number;
  reason?: string;
  updatedAt: string;
}

export interface SupportCase {
  id: string;
  projectId: string;
  subject: string;
  severity: 'low' | 'normal' | 'high' | 'critical';
  status: 'open' | 'waiting' | 'resolved';
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceProfile {
  projectId: string;
  dataRegion: DataRegion;
  legalBasis?: string;
  retentionLocked: boolean;
  exportEnabled: boolean;
  deletionSlaHours: number;
  subprocessorsAcceptedAt?: string;
  updatedAt: string;
}

export interface IdempotencyRecord {
  key: string;
  projectId: string;
  operation: string;
  resourceId: string;
  requestHash: string;
  credentialId?: string;
  responseCiphertext?: string;
  expiresAt: string;
  createdAt: string;
}

export interface IngressQuotaReservation {
  id: string;
  projectId: string;
  inboxId: string;
  sender: string;
  bucket: string;
  projectLimit: number;
  inboxLimit: number;
  senderLimit: number;
  createdAt: string;
}

export type IngressQuotaDecision =
  | { allowed: true }
  | { allowed: false; dimension: 'project' | 'inbox' | 'sender' };

export interface ComplianceExport {
  generatedAt: string;
  project: Project;
  compliance: ComplianceProfile;
  inboxes: Inbox[];
  messages: Message[];
  attachments: AttachmentDescriptor[];
  audits: AuditEvent[];
  usage: UsageRecord[];
}

export interface Actor {
  actorType: 'credential' | 'system' | 'admin';
  actorId: string;
  projectId: string;
  inboxId?: string;
  scopes: MailFnScope[];
}

export interface CreateProjectInput {
  slug: string;
  displayName: string;
  environment?: string;
  dataRegion?: DataRegion;
  retentionPolicy?: Partial<RetentionPolicy>;
  quota?: Partial<ProjectQuota>;
}

export interface CreateInboxInput {
  projectId: string;
  kind: InboxKind;
  requestedLocalPart?: string;
  domain?: string;
  displayName?: string;
  expirySeconds?: number;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface UpdateInboxInput {
  displayName?: string;
  status?: Extract<InboxStatus, 'active' | 'disabled'>;
  metadata?: Record<string, string>;
  labels?: string[];
  expiresAt?: string | null;
}

export interface CreatedCredential {
  credential: Credential;
  token: string;
}

export interface CreateCredentialInput {
  projectId: string;
  inboxId?: string;
  permissions: MailFnScope[];
  expiresAt?: string;
}

export interface MessageFilter {
  sender?: string;
  senderDomain?: string;
  recipient?: string;
  subject?: string;
  text?: string;
  receivedAfter?: string;
  receivedBefore?: string;
  unreadOnly?: boolean;
  threadId?: string;
  labels?: string[];
  status?: MessageStatus;
}

export interface ListMessagesInput extends MessageFilter {
  projectId: string;
  inboxId: string;
  cursor?: string;
  limit?: number;
}

export interface SearchMessagesInput {
  projectId: string;
  inboxId: string;
  query: string;
  cursor?: string;
  limit?: number;
  receivedAfter?: string;
  receivedBefore?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface WaitForMessageInput extends MessageFilter {
  projectId: string;
  inboxId: string;
  after?: string;
  timeoutMs?: number;
  expectedCount?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}

export type WaitForMessageResult =
  | { status: 'matched'; messages: Message[]; matchedAt: string }
  | { status: 'timeout'; messages: []; timedOutAt: string; retryable: true };

export interface ExtractedVerification {
  type: 'otp' | 'verification_link';
  value: string;
  sourceMessageId: string;
  receivedAt: string;
  matchedField: 'subject' | 'text' | 'html';
}

export interface ParsedAttachment {
  filename?: string;
  contentType?: string;
  content: Uint8Array;
  contentId?: string;
  disposition?: string;
}

export interface ParsedMessage {
  internetMessageId?: string;
  from: MailAddress[];
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  replyTo?: MailAddress[];
  subject?: string;
  text?: string;
  html?: string;
  headers: Record<string, string[]>;
  inReplyTo?: string;
  references?: string[];
  authenticationResults?: AuthenticationResults;
  attachments: ParsedAttachment[];
}

export interface InboundEnvelope {
  providerDeliveryId: string;
  envelopeFrom: string;
  envelopeTo: string;
  raw: Uint8Array;
  rawSize: number;
  receivedAt?: string;
  headers?: Record<string, string[]>;
  authenticationResults?: AuthenticationResults;
}

export interface InboundPreflight {
  reservationId: string;
  projectId: string;
  inboxId: string;
  envelopeFrom: string;
  envelopeTo: string;
  rawSize: number;
  createdAt: string;
  storageReserved: boolean;
}

export interface ParseJob {
  id: string;
  version: 1;
  type: 'mailfn.parse';
  projectId: string;
  inboxId: string;
  messageId: string;
  rawObjectKey: string;
  attempt: number;
  createdAt: string;
}

export interface WebhookDeliveryJob {
  id: string;
  version: 1;
  type: 'mailfn.webhook-delivery';
  projectId: string;
  eventId: string;
  webhookId: string;
  deliveryId: string;
  expectedUpdatedAt: string;
  createdAt: string;
}

export type MailFnJob = ParseJob | WebhookDeliveryJob;

export interface RetentionResult {
  expiredInboxes: number;
  deletedMessages: number;
  deletedObjects: number;
  releasedStorageReservations: number;
  auditEventsDeleted: number;
  eventRecordsDeleted: number;
  webhookDeliveriesDeleted: number;
}

export interface PublicPlatformPolicy {
  enabled: boolean;
  productionSecurityApproved: boolean;
  billingEnabled: boolean;
  supportEnabled: boolean;
  /** Future public IMAP/SMTP/JMAP compatibility services; never implied by HTTP/MCP enablement. */
  protocolServicesEnabled: boolean;
  allowedDataRegions: DataRegion[];
  verifiedDomainsRequiredForOutbound: boolean;
}

export interface OperationalSnapshot {
  generatedAt: string;
  activeInboxes: number;
  expiredInboxes: number;
  pendingMessages: number;
  parseFailures: number;
  queuedFailures: number;
  storedBytes: number;
  webhookFailures: number;
  authorizationFailures: number;
  rateLimitEvents: number;
}

export interface OperationalAlert {
  code: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

export interface CreateDraftInput {
  projectId: string;
  inboxId: string;
  threadId?: string;
  inReplyToMessageId?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  attachmentIds?: string[];
}

export type UpdateDraftInput = Partial<Pick<CreateDraftInput, 'to' | 'cc' | 'bcc' | 'subject' | 'text' | 'html' | 'attachmentIds'>>;

export interface SendAttachment {
  id: string;
  filename: string;
  contentType: string;
  content: Uint8Array;
  sha256: string;
}

export interface SendRequest {
  idempotencyKey: string;
  projectId: string;
  inboxId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text?: string;
  html?: string;
  headers: Record<string, string>;
  attachmentIds: string[];
  attachments: SendAttachment[];
  metadata: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
  status: 'queued' | 'sent';
}
