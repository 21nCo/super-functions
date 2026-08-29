import type { MailFnSendAdapter, SendRequest, SendResult } from '@mailfn/core';

export interface SendFnCompatible {
  sendEmail?(input: {
    idempotencyKey: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
    metadata?: Record<string, string>;
  }): Promise<{ id?: string; providerMessageId?: string; status?: string }>;
  email?(input: {
    idempotencyKey?: string;
    userId: string;
    from?: string;
    replyTo?: string;
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
    metadata?: Record<string, unknown>;
  }): Promise<{ id?: string; providerMessageId?: string; status?: string }>;
}

export interface SendFnAdapterOptions {
  userId?: (request: SendRequest) => string;
}

export function createSendFnAdapter(sendfn: SendFnCompatible, options: SendFnAdapterOptions = {}): MailFnSendAdapter {
  return {
    async send(request): Promise<SendResult> {
      let result: { id?: string; providerMessageId?: string; status?: string };
      if (sendfn.sendEmail) {
        result = await sendfn.sendEmail({
            idempotencyKey: request.idempotencyKey,
            from: request.from,
            to: request.to,
            cc: request.cc.length ? request.cc : undefined,
            bcc: request.bcc.length ? request.bcc : undefined,
            subject: request.subject,
            text: request.text,
            html: request.html,
            headers: request.headers,
            attachments: request.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: Buffer.from(attachment.content),
              contentType: attachment.contentType,
            })),
            metadata: mailFnMetadata(request),
          });
      } else if (sendfn.email) {
        result = await sendfn.email({
              idempotencyKey: request.idempotencyKey,
              userId: options.userId?.(request) ?? request.projectId,
              from: request.from,
              replyTo: request.from,
              to: request.to,
              cc: request.cc.length ? request.cc : undefined,
              bcc: request.bcc.length ? request.bcc : undefined,
              subject: request.subject,
              text: request.text,
              html: request.html,
              headers: request.headers,
              attachments: request.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: Buffer.from(attachment.content),
                contentType: attachment.contentType,
              })),
              metadata: {
                ...request.metadata,
                mailfnInboxId: request.inboxId,
                mailfnFrom: request.from,
                mailfnHeaders: request.headers,
                mailfnAttachmentIds: request.attachmentIds,
                mailfnIdempotencyKey: request.idempotencyKey,
              },
            });
      } else {
        throw new Error('SENDFN_SEND_METHOD_UNAVAILABLE');
      }
      if (result.status === 'failed') throw new Error('SENDFN_DELIVERY_FAILED');
      const providerMessageId = result.providerMessageId ?? result.id;
      if (!providerMessageId) throw new Error('SENDFN_PROVIDER_MESSAGE_ID_MISSING');
      return {
        providerMessageId,
        status: result.status === 'sent' || result.status === 'delivered' ? 'sent' : 'queued',
      };
    },
  };
}

function mailFnMetadata(request: SendRequest): Record<string, string> {
  return {
    ...request.metadata,
    mailfnInboxId: request.inboxId,
    mailfnFrom: request.from,
    mailfnHeaders: JSON.stringify(request.headers),
    mailfnAttachmentIds: JSON.stringify(request.attachmentIds),
    mailfnIdempotencyKey: request.idempotencyKey,
  };
}
