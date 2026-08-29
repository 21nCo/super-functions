import {
  type EmailProvider,
  type EmailProviderCapabilities,
  type SendEmailRequest,
  type SendEmailResponse
} from './provider';
import type { ResendConfig } from '../types';

interface ResendEmailResponse {
  id?: string;
  message?: string;
  name?: string;
}

export class ResendAdapter implements EmailProvider {
  readonly name = 'resend';
  readonly capabilities: EmailProviderCapabilities = {
    supportsIdempotency: true,
    supportsTemplates: false,
    supportsAttachments: true,
    supportsBulkSend: true,
    supportsScheduling: false,
    maxRecipientsPerEmail: 50,
    maxAttachmentSize: 40 * 1024 * 1024,
  };

  private endpoint: string;

  constructor(private config: ResendConfig) {
    this.endpoint = config.endpoint ?? 'https://api.resend.com/emails';
  }

  async initialize(): Promise<void> {
    // No-op.
  }

  async sendEmail(params: SendEmailRequest): Promise<SendEmailResponse> {
    const timestamp = new Date();

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          ...(params.idempotencyKey ? { 'Idempotency-Key': params.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: params.from,
          to: params.to,
          cc: params.cc,
          bcc: params.bcc,
          subject: params.subject,
          html: params.html,
          text: params.text,
          reply_to: params.replyTo,
          attachments: params.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content:
              typeof attachment.content === 'string'
                ? Buffer.from(attachment.content, attachment.encoding as BufferEncoding | undefined).toString('base64')
                : attachment.content.toString('base64'),
            content_type: attachment.contentType,
          })),
          tags: params.tags
            ? Object.entries(params.tags).map(([name, value]) => ({ name, value }))
            : undefined,
          headers: {
            ...(params.headers ?? {}),
            ...(params.metadata ? { 'X-Sendfn-Metadata': Buffer.from(JSON.stringify(params.metadata)).toString('base64url') } : {}),
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as ResendEmailResponse;

      if (!response.ok) {
        return {
          success: false,
          timestamp,
          error: {
            code: payload.name ?? `RESEND_${response.status}`,
            message: payload.message ?? 'Resend email request failed',
            retryable: response.status === 429 || response.status >= 500,
          },
        };
      }

      return {
        success: true,
        messageId: payload.id,
        providerMessageId: payload.id,
        timestamp,
      };
    } catch (error) {
      return {
        success: false,
        timestamp,
        error: {
          code: 'RESEND_REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Resend request failed',
          retryable: true,
        },
      };
    }
  }

  async sendBulkEmail(params: SendEmailRequest[]): Promise<SendEmailResponse[]> {
    const results: SendEmailResponse[] = [];
    for (const request of params) {
      results.push(await this.sendEmail(request));
    }
    return results;
  }

  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // No persistent resources.
  }
}

export function resendAdapter(config: ResendConfig): ResendAdapter {
  return new ResendAdapter(config);
}
