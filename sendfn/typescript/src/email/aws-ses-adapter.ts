import {
  EmailProvider,
  EmailProviderCapabilities,
  SendEmailRequest,
  SendEmailResponse
} from './provider';
import { AwsSesConfig } from '../types';
import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
  MessageRejected,
  LimitExceededException
} from '@aws-sdk/client-ses';
import { isBareEmail } from './address';

export class AwsSesAdapter implements EmailProvider {
  readonly name = 'aws-ses';
  readonly capabilities: EmailProviderCapabilities = {
    supportsIdempotency: false,
    supportsTemplates: true,
    supportsAttachments: true,
    supportsBulkSend: true,
    supportsScheduling: false,
    maxRecipientsPerEmail: 50,
    maxAttachmentSize: 10 * 1024 * 1024,
  };

  private sesClient: SESClient;

  constructor(private config: AwsSesConfig) {
    this.sesClient = new SESClient({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async initialize(): Promise<void> {
    // No-op
  }

  async sendEmail(params: SendEmailRequest): Promise<SendEmailResponse> {
    try {
      if ((params.attachments && params.attachments.length > 0) || Object.keys(params.headers ?? {}).length > 0 || params.idempotencyKey) {
        return await this.sendRawEmail(params);
      } else {
        return await this.sendSimpleEmail(params);
      }
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  private async sendSimpleEmail(params: SendEmailRequest): Promise<SendEmailResponse> {
    const command = new SendEmailCommand({
      Source: params.from,
      Destination: {
        ToAddresses: params.to,
        CcAddresses: params.cc,
        BccAddresses: params.bcc,
      },
      Message: {
        Subject: { Data: params.subject },
        Body: {
          Html: params.html ? { Data: params.html } : undefined,
          Text: params.text ? { Data: params.text } : undefined,
        },
      },
      ConfigurationSetName: this.config.configurationSetName,
      ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
      Tags: Object.entries(params.tags ?? {}).map(([Name, Value]) => ({ Name, Value })),
    });

    const result = await this.sesClient.send(command);

    return {
      success: true,
      messageId: result.MessageId,
      providerMessageId: result.MessageId,
      timestamp: new Date(),
    };
  }

  private async sendRawEmail(params: SendEmailRequest): Promise<SendEmailResponse> {
    const boundary = `----=_Part_${Date.now()}`;
    let rawMessage = '';

    // Headers
    rawMessage += `From: ${params.from}\n`;
    rawMessage += `To: ${params.to.join(', ')}\n`;
    if (params.cc?.length) rawMessage += `Cc: ${params.cc.join(', ')}\n`;
    rawMessage += `Subject: ${params.subject}\n`;
    if (params.replyTo) rawMessage += `Reply-To: ${params.replyTo}\n`;
    for (const [name, value] of Object.entries(params.headers ?? {})) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value)) throw new Error('Invalid custom email header');
      rawMessage += `${name}: ${value}\n`;
    }
    if (params.idempotencyKey) rawMessage += `X-Sendfn-Idempotency-Key: ${params.idempotencyKey.replace(/[\r\n]/g, '')}\n`;
    rawMessage += `MIME-Version: 1.0\n`;
    rawMessage += `Content-Type: multipart/mixed; boundary="${boundary}"\n\n`;

    // Body (Multipart Alternative for Text/HTML)
    const altBoundary = `----=_Part_${Date.now()}_Alt`;
    rawMessage += `--${boundary}\n`;
    rawMessage += `Content-Type: multipart/alternative; boundary="${altBoundary}"\n\n`;

    // Text Part
    if (params.text) {
      rawMessage += `--${altBoundary}\n`;
      rawMessage += `Content-Type: text/plain; charset=UTF-8\n\n`;
      rawMessage += `${params.text}\n\n`;
    }

    // HTML Part
    if (params.html) {
      rawMessage += `--${altBoundary}\n`;
      rawMessage += `Content-Type: text/html; charset=UTF-8\n\n`;
      rawMessage += `${params.html}\n\n`;
    }

    rawMessage += `--${altBoundary}--

`;

    // Attachments
    if (params.attachments) {
      for (const att of params.attachments) {
        const filename = sanitizeMimeParameter(att.filename);
        rawMessage += `--${boundary}\n`;
        rawMessage += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${filename}"\n`;
        rawMessage += `Content-Transfer-Encoding: base64\n`;
        rawMessage += `Content-Disposition: attachment; filename="${filename}"\n\n`;

        const content = typeof att.content === 'string'
          ? Buffer.from(att.content, att.encoding as BufferEncoding | undefined).toString('base64')
          : Buffer.from(att.content).toString('base64');

        const chunked = content.match(/.{1,76}/g)?.join('\n') || content;
        rawMessage += `${chunked}\n\n`;
      }
    }

    rawMessage += `--${boundary}--
`;

    const command = new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(rawMessage) },
      Destinations: [...params.to, ...(params.cc ?? []), ...(params.bcc ?? [])],
      ConfigurationSetName: this.config.configurationSetName,
      Tags: Object.entries(params.tags ?? {}).map(([Name, Value]) => ({ Name, Value })),
    });

    const result = await this.sesClient.send(command);

    return {
      success: true,
      messageId: result.MessageId,
      providerMessageId: result.MessageId,
      timestamp: new Date(),
    };
  }

  async sendBulkEmail(params: SendEmailRequest[]): Promise<SendEmailResponse[]> {
    const results: SendEmailResponse[] = [];
    for (const req of params) {
        results.push(await this.sendEmail(req));
    }
    return results;
  }

  validateEmail(email: string): boolean {
    return isBareEmail(email);
  }

  async isHealthy(): Promise<boolean> {
    try {
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.sesClient.destroy();
  }

  private handleError(error: any): SendEmailResponse {
    let code = 'SENDFN_INTERNAL_ERROR';
    let retryable = false;

    if (error instanceof MessageRejected) {
      code = 'MESSAGE_REJECTED';
    } else if (error instanceof LimitExceededException) {
      code = 'LIMIT_EXCEEDED';
      retryable = true;
    } else if (error.name === 'ThrottlingException') {
      code = 'THROTTLING';
      retryable = true;
    }

    return {
      success: false,
      timestamp: new Date(),
      error: {
        code,
        message: error.message || 'Unknown error occurred',
        retryable,
      },
    };
  }
}

function sanitizeMimeParameter(value: string): string {
  return value.normalize('NFKC').replace(/[\u0000-\u001f\u007f"\\/;]/g, '_').slice(0, 255) || 'attachment';
}

export function awsSesAdapter(config: AwsSesConfig): AwsSesAdapter {
  return new AwsSesAdapter(config);
}
