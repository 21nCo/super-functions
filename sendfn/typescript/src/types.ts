import { z } from 'zod';
import { Adapter } from '@superfunctions/db';
import { EmailProvider } from './email/provider';
import { SmsProvider } from './sms/provider';
import type { PushProvider } from './push/provider';
import type { WhatsAppProvider } from './whatsapp/provider';
import type { AwsSesWebhookHandler } from './events/webhook-handler';

// --- Configuration ---

export interface SendfnConfig {
  database: Adapter;
  email?: EmailConfig; // Kept for legacy options (fromEmail, etc) but provider is external
  emailProvider?: EmailProvider; // New adapter pattern
  smsProvider?: SmsProvider; // New adapter pattern
  whatsappProvider?: WhatsAppProvider;
  pushProviders?: Partial<Record<Platform, PushProvider>>; // Adapter pattern for APNS, FCM, web push, etc.
  push?: PushConfig;
  templates?: TemplateConfig;
  options?: SendfnOptions;
  enableApi?: boolean;
  apiConfig?: {
    adminKey?: string;
  };
  awsSns?: {
    /** SNS topics authorized to deliver SES lifecycle events. */
    topicArns: string[];
    /** Optional replay window. Omit to allow delayed SNS retries. */
    maxAgeMs?: number;
  };
}

export interface EmailConfig {
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
  awsSes?: AwsSesConfig;
  resend?: ResendConfig;
  // removed internal provider config since it's passed via adapter
}

export interface AwsSesConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  configurationSetName?: string;
}

export interface ResendConfig {
  apiKey: string;
  endpoint?: string;
}

export interface PushConfig {
  providers: {
    fcm?: FcmConfig;
    apns?: ApnsConfig;
  };
}

export interface FcmConfig {
  serviceAccountKey: object | string;
  projectId?: string;
}

export interface ApnsConfig {
  bundleId: string;
  keyId: string;
  teamId: string;
  key: string;
  production?: boolean;
}

export interface TemplateConfig {
    // Future template config
}

export interface SendfnOptions {
  suppressionEnabled?: boolean; // default: true
  retryAttempts?: number; // default: 3
  retryDelay?: number; // default: 1000ms
  eventTracking?: boolean; // default: true
  bulkConcurrency?: number; // default: 5
  logger?: any; // Replace with proper logger interface if needed
}

// --- Email ---

export interface SendEmailParams {
  /** Stable caller key. Reusing it returns the original transaction without another provider send. */
  idempotencyKey?: string;
  userId: string;
  from?: string;
  replyTo?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateData?: Record<string, any>;
  attachments?: Attachment[];
  headers?: Record<string, string>;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface Attachment {
  filename: string;
  content: Uint8Array | string;
  contentType?: string;
  encoding?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text?: string;
  variables: string[];
  metadata?: Record<string, any>;
}

// --- SMS ---

export interface SendSmsParams {
  userId: string;
  to: string; // Phone number
  message: string;
  metadata?: Record<string, any>;
}

// --- WhatsApp ---

export interface MetaWhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
  endpoint?: string;
}

export interface SendWhatsAppParams {
  userId: string;
  to: string;
  message: string;
  previewUrl?: boolean;
  metadata?: Record<string, any>;
}

// --- Push ---

export type PushDataValue = string | number | boolean;
export type PushData = Record<string, PushDataValue>;

export interface SendPushParams {
  userId: string | string[];
  title: string;
  body: string;
  data?: PushData;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  priority?: 'high' | 'normal';
  ttl?: number;
  collapseKey?: string;
  category?: string;
  metadata?: Record<string, any>;
}

export interface RegisterDeviceParams {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  deviceInfo?: Record<string, any>;
}

// --- Database Models (Zod Schemas) ---

export const EmailTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  from: z.string().email(),
  subject: z.string(),
  templateId: z.string().nullable(),
  templateData: z.record(z.any()).nullable(),
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  status: z.enum(['pending', 'sent', 'delivered', 'bounced', 'complained', 'failed']),
  sentAt: z.date().nullable(),
  deliveredAt: z.date().nullable(),
  bouncedAt: z.date().nullable(),
  complainedAt: z.date().nullable(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EmailTransaction = z.infer<typeof EmailTransactionSchema>;

export const SmsTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  to: z.string(),
  message: z.string(),
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  status: z.enum(['pending', 'sent', 'delivered', 'failed']),
  sentAt: z.date().nullable(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type SmsTransaction = z.infer<typeof SmsTransactionSchema>;

export const WhatsAppTransactionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  to: z.string(),
  message: z.string(),
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  status: z.enum(['pending', 'sent', 'delivered', 'failed']),
  sentAt: z.date().nullable(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WhatsAppTransaction = z.infer<typeof WhatsAppTransactionSchema>;

export const PushNotificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.any()).nullable(),
  deviceTokens: z.array(z.string()),
  platform: z.enum(['ios', 'android', 'web']),
  provider: z.string(),
  status: z.enum(['pending', 'sent', 'failed']),
  sentCount: z.number().int().default(0),
  failedCount: z.number().int().default(0),
  sentAt: z.date().nullable(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PushNotification = z.infer<typeof PushNotificationSchema>;

export const DeviceTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  token: z.string(),
  platform: z.enum(['ios', 'android', 'web']),
  appVersion: z.string().nullable(),
  deviceInfo: z.record(z.any()).nullable(),
  isActive: z.boolean().default(true),
  lastUsedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type DeviceToken = z.infer<typeof DeviceTokenSchema>;

export const SuppressionListSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  reason: z.enum(['bounce', 'complaint', 'unsubscribe', 'manual']),
  source: z.string(),
  bounceType: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
  suppressedAt: z.date(),
  createdAt: z.date(),
});

export type SuppressionList = z.infer<typeof SuppressionListSchema>;

export const CommunicationEventSchema = z.object({
  id: z.string().uuid(),
  referenceId: z.string(), // Foreign key to EmailTransaction or PushNotification
  referenceType: z.enum(['email', 'push', 'sms', 'whatsapp']),
  eventType: z.enum(['sent', 'delivered', 'bounced', 'complained', 'opened', 'clicked', 'failed']),
  provider: z.string(),
  providerEventId: z.string().nullable(),
  recipientEmail: z.string().email().nullable(),
  recipientPhone: z.string().nullable(),
  deviceToken: z.string().nullable(),
  metadata: z.record(z.any()).default({}),
  eventTimestamp: z.date(),
  createdAt: z.date(),
});

export type CommunicationEvent = z.infer<typeof CommunicationEventSchema>;

// --- DTOs for Adapter ---

export type CreateEmailTransaction = Omit<EmailTransaction, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateSmsTransaction = Omit<SmsTransaction, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateWhatsAppTransaction = Omit<WhatsAppTransaction, 'id' | 'createdAt' | 'updatedAt'>;
export type CreatePushNotification = Omit<PushNotification, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateDeviceToken = Omit<DeviceToken, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateSuppression = Omit<SuppressionList, 'id' | 'createdAt'>;
export type CreateEvent = Omit<CommunicationEvent, 'id' | 'createdAt'>;

export type Platform = 'ios' | 'android' | 'web';

export type SendfnErrorDetails = Record<string, unknown>;

export interface QueryEventsParams {
  referenceId?: string;
  referenceType?: 'email' | 'push' | 'sms' | 'whatsapp';
  providerMessageId?: string;
  provider?: string;
  userId?: string;
  eventType?: CommunicationEvent['eventType'];
  startAt?: Date;
  endAt?: Date;
  limit?: number;
  offset?: number;
}

export interface SuppressionCheckResult {
  suppressed: boolean;
  entry?: SuppressionList | null;
  reason?: string;
}

export type AddSuppressionParams = CreateSuppression;

export interface SendfnClient {
  email(params: SendEmailParams): Promise<EmailTransaction>;
  bulkEmail(recipients: SendEmailParams[]): Promise<EmailTransaction[]>;
  sms(params: SendSmsParams): Promise<SmsTransaction>;
  whatsapp(params: SendWhatsAppParams): Promise<WhatsAppTransaction>;
  push(params: SendPushParams): Promise<PushNotification>;
  bulkPush(notifications: SendPushParams[]): Promise<PushNotification[]>;
  registerDevice(params: RegisterDeviceParams): Promise<DeviceToken>;
  getDevices(userId: string, platform?: Platform): Promise<DeviceToken[]>;
  deactivateDevice(token: string): Promise<void>;
  refreshDeviceToken(
    oldToken: string,
    newToken: string,
    userId: string,
    platform: Platform
  ): Promise<DeviceToken>;
  cleanupInactiveDevices(olderThan: Date): Promise<number>;
  registerTemplate(template: EmailTemplate): Promise<void>;
  getTemplate(templateId: string): Promise<EmailTemplate | undefined>;
  listTemplates(): Promise<EmailTemplate[]>;
  getEmailEvents(transactionId: string): Promise<CommunicationEvent[]>;
  getPushEvents(notificationId: string): Promise<CommunicationEvent[]>;
  getSmsEvents(transactionId: string): Promise<CommunicationEvent[]>;
  getWhatsAppEvents(transactionId: string): Promise<CommunicationEvent[]>;
  queryEvents(params: QueryEventsParams): Promise<CommunicationEvent[]>;
  checkSuppressionList(email: string): Promise<SuppressionCheckResult>;
  addToSuppressionList(params: AddSuppressionParams): Promise<SuppressionList>;
  bulkAddToSuppressionList(entries: AddSuppressionParams[]): Promise<void>;
  exportSuppressionList(limit?: number, offset?: number): Promise<SuppressionList[]>;
  removeFromSuppressionList(email: string): Promise<void>;
  getWebhookHandlers(): { awsSes: AwsSesWebhookHandler };
  close(): Promise<void>;
  router?: unknown;
}
