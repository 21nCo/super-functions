import { Attachment } from '../types';

export interface EmailProvider {
  readonly name: string;
  readonly capabilities: EmailProviderCapabilities;

  initialize(): Promise<void>;

  sendEmail(params: SendEmailRequest): Promise<SendEmailResponse>;

  sendBulkEmail(params: SendEmailRequest[]): Promise<SendEmailResponse[]>;

  validateEmail(email: string): boolean;

  isHealthy(): Promise<boolean>;

  close(): Promise<void>;
}

export interface EmailProviderCapabilities {
  /** Provider enforces the supplied idempotency key across retried API calls. */
  supportsIdempotency?: boolean;
  supportsTemplates: boolean;
  supportsAttachments: boolean;
  supportsBulkSend: boolean;
  supportsScheduling: boolean;
  maxRecipientsPerEmail: number;
  maxAttachmentSize: number; // bytes
}

export interface SendEmailRequest {
  idempotencyKey?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Attachment[];
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  providerMessageId?: string;
  timestamp: Date;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
