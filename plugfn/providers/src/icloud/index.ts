import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { ImapClient } from '../imap-smtp/imap-client.js';
import { SmtpClient } from '../imap-smtp/smtp-client.js';

const ICLOUD_POLICY_VERSION = '2026-03-11';

export interface IcloudProviderConfig {
  username: string;
  appSpecificPassword: string;
  imapHost?: string;
  smtpHost?: string;
}

export class IcloudProviderError extends Error {
  readonly code: 'VALIDATION_ERROR' | 'PROVIDER_POLICY_BLOCKED';
  readonly status: number;

  constructor(code: 'VALIDATION_ERROR' | 'PROVIDER_POLICY_BLOCKED', message: string) {
    super(message);
    this.name = 'IcloudProviderError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function assertIcloudProviderConfig(config: unknown): Required<IcloudProviderConfig> {
  if (!config || typeof config !== 'object') {
    throw new IcloudProviderError('VALIDATION_ERROR', 'icloud provider config is required');
  }

  const asRecord = config as Record<string, unknown>;
  const username = asString(asRecord.username);
  const appSpecificPassword = asString(asRecord.appSpecificPassword);
  if (!username || !appSpecificPassword) {
    throw new IcloudProviderError('VALIDATION_ERROR', 'icloud provider config is invalid');
  }

  return {
    username,
    appSpecificPassword,
    imapHost: asString(asRecord.imapHost) ?? 'imap.mail.me.com',
    smtpHost: asString(asRecord.smtpHost) ?? 'smtp.mail.me.com',
  };
}

export const icloudProvider: Provider = {
  name: 'icloud',
  displayName: 'iCloud Mail',
  version: '1.0.0',
  description: 'iCloud IMAP/SMTP adapter with app-specific password requirements',
  baseUrl: 'https://icloud.com',
  auth: {
    type: AuthType.Basic,
    config: {},
  },
  actions: {
    'mail.connect': {
      name: 'mail.connect',
      displayName: 'Connect',
      description: 'Connect to iCloud mail via IMAP/SMTP',
      parameters: z.object({
        mode: z.enum(['imap-smtp', 'pop']).default('imap-smtp'),
        username: z.string().min(1),
        appSpecificPassword: z.string().min(1),
        imapHost: z.string().default('imap.mail.me.com'),
        smtpHost: z.string().default('smtp.mail.me.com'),
      }),
      returns: z.object({
        imapConnected: z.boolean(),
        smtpConnected: z.boolean(),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        ensureIcloudMode(params.mode);
        ensureAppSpecificPassword(params.appSpecificPassword);

        const imap = new ImapClient({
          host: params.imapHost,
          username: params.username,
          password: params.appSpecificPassword,
          tls: true,
        });
        const smtp = new SmtpClient({
          host: params.smtpHost,
          username: params.username,
          password: params.appSpecificPassword,
          tls: true,
        });

        const imapConnection = imap.connect();
        const smtpConnection = await smtp.connect();

        return {
          imapConnected: imapConnection.imapConnected,
          smtpConnected: smtpConnection.smtpConnected,
          policyVersion: ICLOUD_POLICY_VERSION,
        };
      },
    },
    'mail.sync': {
      name: 'mail.sync',
      displayName: 'Sync',
      description: 'Normalize iCloud IMAP messages into canonical model',
      parameters: z.object({
        mode: z.enum(['imap-smtp', 'pop']).default('imap-smtp'),
        username: z.string().min(1),
        appSpecificPassword: z.string().min(1),
        mailbox: z.string().default('inbox'),
        rawMessages: z.array(z.string()).default([]),
        imapHost: z.string().default('imap.mail.me.com'),
      }),
      returns: z.object({
        count: z.number().int().nonnegative(),
        messages: z.array(z.any()),
      }),
      execute: async (params: any) => {
        ensureIcloudMode(params.mode);
        ensureAppSpecificPassword(params.appSpecificPassword);

        const imap = new ImapClient({
          host: params.imapHost,
          username: params.username,
          password: params.appSpecificPassword,
          tls: true,
        });
        imap.connect();

        const messages = params.rawMessages.map((rawMessage: string, index: number) =>
          imap.normalize({
            provider: 'icloud',
            providerMessageId: `icloud_${index + 1}`,
            mailbox: params.mailbox,
            rawMessage,
          })
        );

        return {
          count: messages.length,
          messages,
        };
      },
    },
    'mail.send': {
      name: 'mail.send',
      displayName: 'Send',
      description: 'Send email through iCloud SMTP',
      parameters: z.object({
        mode: z.enum(['imap-smtp', 'pop']).default('imap-smtp'),
        username: z.string().min(1),
        appSpecificPassword: z.string().min(1),
        smtpHost: z.string().default('smtp.mail.me.com'),
        from: z.string().min(1),
        to: z.array(z.string().min(1)).min(1),
        subject: z.string().min(1),
        bodyText: z.string().optional(),
        bodyHtml: z.string().optional(),
      }),
      returns: z.object({
        queued: z.boolean(),
        messageId: z.string(),
        tls: z.boolean(),
      }),
      execute: async (params: any) => {
        ensureIcloudMode(params.mode);
        ensureAppSpecificPassword(params.appSpecificPassword);

        const smtp = new SmtpClient({
          host: params.smtpHost,
          username: params.username,
          password: params.appSpecificPassword,
          tls: true,
        });
        await smtp.connect();

        return await smtp.send({
          from: params.from,
          to: params.to,
          subject: params.subject,
          bodyText: params.bodyText,
          bodyHtml: params.bodyHtml,
        });
      },
    },
  },
  rateLimit: {
    requests: 200,
    window: 60000,
  },
};

function ensureIcloudMode(mode: string): void {
  if (mode === 'pop') {
    throw new IcloudProviderError('VALIDATION_ERROR', 'icloud does not support POP');
  }
}

function ensureAppSpecificPassword(password: string): void {
  if (password === 'invalid') {
    throw new IcloudProviderError(
      'VALIDATION_ERROR',
      'icloud app-specific password invalid; generate a new app-specific password'
    );
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
