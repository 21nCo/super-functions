import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { ImapClient, ImapClientError } from './imap-client.js';

export interface ImapSmtpCapabilityConfig {
  read?: boolean;
  search?: boolean;
  move?: boolean;
  idle?: boolean;
}

export interface ImapSmtpProviderConfig {
  host: string;
  username: string;
  password: string;
  port?: number;
  tls?: boolean;
  explicitInsecureOverride?: boolean;
  capabilities?: ImapSmtpCapabilityConfig;
}

export interface ImapSmtpPolicyDecision {
  providerId: 'imap-smtp';
  operation: string;
  allowed: boolean;
  policyVersion: string;
  reason?: string;
  timestamp: string;
}

const IMAP_SMTP_POLICY_VERSION = '2026-03-11';
const policyDecisionLog: ImapSmtpPolicyDecision[] = [];

export class ImapSmtpProviderError extends Error {
  readonly code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR';
  readonly status: number;

  constructor(code: 'PROVIDER_POLICY_BLOCKED' | 'VALIDATION_ERROR', message: string) {
    super(message);
    this.name = 'ImapSmtpProviderError';
    this.code = code;
    this.status = code === 'PROVIDER_POLICY_BLOCKED' ? 403 : 400;
  }
}

export function assertImapSmtpProviderConfig(config: unknown): Required<ImapSmtpProviderConfig> {
  if (!config || typeof config !== 'object') {
    throw new ImapSmtpProviderError('VALIDATION_ERROR', 'imap-smtp provider config is required');
  }

  const value = config as Record<string, unknown>;
  const host = asNonEmptyString(value.host);
  const username = asNonEmptyString(value.username);
  const password = asNonEmptyString(value.password);

  if (!host || !username || !password) {
    throw new ImapSmtpProviderError('VALIDATION_ERROR', 'imap-smtp provider config is invalid');
  }

  return {
    host,
    username,
    password,
    port: asPositiveInteger(value.port) ?? 993,
    tls: asBoolean(value.tls) ?? true,
    explicitInsecureOverride: asBoolean(value.explicitInsecureOverride) ?? false,
    capabilities: {
      read: readCapability(value.capabilities, 'read', true),
      search: readCapability(value.capabilities, 'search', true),
      move: readCapability(value.capabilities, 'move', true),
      idle: readCapability(value.capabilities, 'idle', true),
    },
  };
}

export function getImapSmtpPolicyDecisionLog(): ImapSmtpPolicyDecision[] {
  return policyDecisionLog.map((entry) => ({ ...entry }));
}

export const imapSmtpProvider: Provider = {
  name: 'imap-smtp',
  displayName: 'Generic IMAP',
  version: '1.0.0',
  description: 'Generic standards-based inbound IMAP adapter with secure transport defaults',
  baseUrl: 'imap://generic',
  auth: {
    type: AuthType.Basic,
    config: {},
  },
  actions: {
    'mail.connect': {
      name: 'mail.connect',
      displayName: 'Connect',
      description: 'Validate inbound IMAP connectivity with policy controls',
      parameters: z.object({
        host: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        port: z.number().int().positive().optional(),
        tls: z.boolean().optional(),
        explicitInsecureOverride: z.boolean().optional(),
        capabilities: z
          .object({
            read: z.boolean().optional(),
            search: z.boolean().optional(),
            move: z.boolean().optional(),
            idle: z.boolean().optional(),
          })
          .optional(),
      }),
      returns: z.object({
        imapConnected: z.boolean(),
        tls: z.boolean(),
        policyVersion: z.string(),
      }),
      execute: async (params: any) => {
        const config = assertImapSmtpProviderConfig(params);
        assertSecureTransportPolicy('mail.connect', config.tls, config.explicitInsecureOverride);

        const imap = new ImapClient({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          tls: config.tls,
          explicitInsecureOverride: config.explicitInsecureOverride,
          capabilities: {
            read: config.capabilities.read,
            search: config.capabilities.search,
            move: config.capabilities.move,
            idle: config.capabilities.idle,
          },
        });

        const imapConnection = imap.connect();

        return {
          imapConnected: imapConnection.imapConnected,
          tls: config.tls,
          policyVersion: IMAP_SMTP_POLICY_VERSION,
        };
      },
    },
    'mail.sync': {
      name: 'mail.sync',
      displayName: 'Sync',
      description: 'Parse RFC822 messages and normalize into canonical model',
      parameters: z.object({
        host: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(1),
        tls: z.boolean().optional(),
        explicitInsecureOverride: z.boolean().optional(),
        mailbox: z.string().default('inbox'),
        rawMessages: z.array(z.string()).default([]),
        capabilities: z
          .object({
            read: z.boolean().optional(),
            search: z.boolean().optional(),
            move: z.boolean().optional(),
            idle: z.boolean().optional(),
          })
          .optional(),
      }),
      returns: z.object({
        count: z.number().int().nonnegative(),
        messages: z.array(z.any()),
      }),
      execute: async (params: any) => {
        const config = assertImapSmtpProviderConfig(params);
        assertSecureTransportPolicy('mail.sync', config.tls, config.explicitInsecureOverride);
        assertCapabilityEnabled('mail.sync', config.capabilities.read === true, 'read');

        const imap = new ImapClient({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          tls: config.tls,
          explicitInsecureOverride: config.explicitInsecureOverride,
          capabilities: {
            read: config.capabilities.read,
            search: config.capabilities.search,
            move: config.capabilities.move,
            idle: config.capabilities.idle,
          },
        });
        imap.connect();

        const messages = (params.rawMessages as string[]).map((rawMessage, index) =>
          imap.normalize({
            provider: 'imap-smtp',
            providerMessageId: `imap_${index + 1}`,
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
  },
  rateLimit: {
    requests: 100,
    window: 60000,
  },
};

function assertSecureTransportPolicy(
  operation: string,
  tls: boolean,
  explicitInsecureOverride: boolean
): void {
  if (!tls && !explicitInsecureOverride) {
    pushPolicyDecision(operation, false, 'insecure transport disabled');
    throw new ImapSmtpProviderError('PROVIDER_POLICY_BLOCKED', 'insecure transport disabled');
  }

  pushPolicyDecision(operation, true);
}

function assertCapabilityEnabled(
  operation: string,
  enabled: boolean,
  capability: string
): void {
  if (!enabled) {
    pushPolicyDecision(operation, false, `${capability} capability disabled`);
    throw new ImapSmtpProviderError(
      'VALIDATION_ERROR',
      `imap-smtp capability ${capability} is disabled`
    );
  }
}

function pushPolicyDecision(operation: string, allowed: boolean, reason?: string): void {
  policyDecisionLog.push({
    providerId: 'imap-smtp',
    operation,
    allowed,
    policyVersion: IMAP_SMTP_POLICY_VERSION,
    reason,
    timestamp: new Date().toISOString(),
  });
}

function readCapability(
  capabilities: unknown,
  key: keyof ImapSmtpCapabilityConfig,
  defaultValue: boolean
): boolean {
  if (!capabilities || typeof capabilities !== 'object') {
    return defaultValue;
  }

  const value = (capabilities as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : defaultValue;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function normalizeImapProviderError(error: unknown): never {
  if (error instanceof ImapSmtpProviderError) {
    throw error;
  }
  if (error instanceof ImapClientError) {
    throw new ImapSmtpProviderError(error.code, error.message);
  }
  throw error;
}
