import { z } from 'zod';
import {
  createDefaultProviderPolicyRegistry,
  ProviderPolicyError,
} from '@superfunctions/oauth-providers';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { ImapClient } from '../imap-smtp/imap-client.js';
import { SmtpClient } from '../imap-smtp/smtp-client.js';

const policyRegistry = createDefaultProviderPolicyRegistry();
const supportedYahooFeatures = new Set(['mail.read.metadata', 'mail.send', 'profile.basic']);

export interface YahooProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

export class YahooProviderError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR' | 'OAUTH_SCOPE_DISALLOWED';
  readonly status: number;

  constructor(
    code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR' | 'OAUTH_SCOPE_DISALLOWED',
    message: string
  ) {
    super(message);
    this.name = 'YahooProviderError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function assertYahooProviderConfig(config: unknown): YahooProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new YahooProviderError('VALIDATION_ERROR', 'yahoo provider config is required');
  }

  const asRecord = config as Record<string, unknown>;
  const clientId = asString(asRecord.clientId);
  const clientSecret = asString(asRecord.clientSecret);
  const redirectUris = Array.isArray(asRecord.redirectUris)
    ? asRecord.redirectUris.filter((value): value is string => {
        return typeof value === 'string' && value.trim().length > 0;
      })
    : [];

  if (!clientId || !clientSecret || redirectUris.length === 0) {
    throw new YahooProviderError('VALIDATION_ERROR', 'yahoo provider config is invalid');
  }

  return {
    clientId,
    clientSecret,
    redirectUris,
  };
}

export function resolveYahooScopes(
  features: string[] = ['mail.read.metadata', 'mail.send', 'profile.basic']
): string[] {
  const policy = policyRegistry.getPolicy('yahoo');
  const scopes = new Set<string>();

  for (const feature of features) {
    if (!supportedYahooFeatures.has(feature)) {
      throw new YahooProviderError(
        'OAUTH_SCOPE_DISALLOWED',
        `feature scope policy not found: ${feature}`
      );
    }

    const featurePolicy = policy.featureScopes[feature];
    if (!featurePolicy) {
      throw new YahooProviderError(
        'OAUTH_SCOPE_DISALLOWED',
        `feature scope policy not found: ${feature}`
      );
    }

    for (const scope of featurePolicy.allowedScopes) {
      scopes.add(scope);
    }
  }

  return [...scopes];
}

export const yahooProvider: Provider = {
  name: 'yahoo',
  displayName: 'Yahoo Mail',
  version: '1.0.0',
  description: 'Yahoo OAuth IMAP/SMTP adapter with policy gating',
  baseUrl: 'https://api.login.yahoo.com',
  auth: {
    type: AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
      tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
      scopes: resolveYahooScopes(),
      scopeSeparator: ' ',
    },
  },
  actions: {
    'mail.connect': {
      name: 'mail.connect',
      displayName: 'Connect',
      description: 'Validate Yahoo OAuth IMAP/SMTP connect permissions',
      parameters: z.object({
        tenantId: z.string().min(1),
        policy: z
          .object({
            imapOauthAllowed: z.boolean().optional(),
          })
          .optional(),
        credentials: z.string().optional(),
        host: z.string().default('imap.mail.yahoo.com'),
        smtpHost: z.string().default('smtp.mail.yahoo.com'),
        username: z.string().default('user@yahoo.com'),
        password: z.string().default('oauth-token'),
      }),
      returns: z.object({
        imapConnected: z.boolean(),
        smtpConnected: z.boolean(),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        assertYahooOperationAllowed('mail.read.metadata');
        assertYahooOperationAllowed('mail.send');
        if (params.policy?.imapOauthAllowed === false) {
          throw new YahooProviderError(
            'PROVIDER_POLICY_BLOCKED',
            'yahoo policy disallows requested integration mode'
          );
        }
        if (params.credentials && params.credentials !== 'valid') {
          throw new YahooProviderError('VALIDATION_ERROR', 'yahoo credentials invalid');
        }

        const imap = new ImapClient({
          host: params.host,
          username: params.username,
          password: params.password,
          tls: true,
        });
        const smtp = new SmtpClient({
          host: params.smtpHost,
          username: params.username,
          password: params.password,
          tls: true,
        });

        const imapConnection = imap.connect();
        const smtpConnection = await smtp.connect();

        return {
          imapConnected: imapConnection.imapConnected,
          smtpConnected: smtpConnection.smtpConnected,
          policyVersion: policyRegistry.getPolicy('yahoo').policyVersion,
        };
      },
    },
    'mail.sync': {
      name: 'mail.sync',
      displayName: 'Sync',
      description: 'Normalize Yahoo IMAP RFC messages to canonical model',
      parameters: z.object({
        rawMessages: z.array(z.string()).default([]),
        mailbox: z.string().default('inbox'),
        host: z.string().default('imap.mail.yahoo.com'),
        username: z.string().default('user@yahoo.com'),
        password: z.string().default('oauth-token'),
      }),
      returns: z.object({
        count: z.number().int().nonnegative(),
        messages: z.array(z.any()),
      }),
      execute: async (params: any) => {
        assertYahooOperationAllowed('mail.read.metadata');
        const imap = new ImapClient({
          host: params.host,
          username: params.username,
          password: params.password,
          tls: true,
        });
        imap.connect();

        const messages = params.rawMessages.map((rawMessage: string, index: number) =>
          imap.normalize({
            provider: 'yahoo',
            providerMessageId: `yahoo_${index + 1}`,
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
      description: 'Send Yahoo mail through SMTP path',
      parameters: z.object({
        host: z.string().default('smtp.mail.yahoo.com'),
        username: z.string().default('user@yahoo.com'),
        password: z.string().default('oauth-token'),
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
        assertYahooOperationAllowed('mail.send');
        const smtp = new SmtpClient({
          host: params.host,
          username: params.username,
          password: params.password,
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
    requests: 500,
    window: 60000,
  },
};

function assertYahooOperationAllowed(operation: 'mail.read.metadata' | 'mail.send'): void {
  try {
    policyRegistry.assertOperationAllowed({
      providerId: 'yahoo',
      operation,
      featureMode: operation === 'mail.send' ? 'snippet' : 'metadata-only',
    });
  } catch (error) {
    if (error instanceof ProviderPolicyError) {
      throw new YahooProviderError('PROVIDER_POLICY_BLOCKED', error.message);
    }
    throw error;
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
