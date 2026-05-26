import { describe, expect, it } from 'vitest';
import {
  assertYahooProviderConfig,
  resolveYahooScopes,
  yahooProvider,
} from '../src/yahoo/index.js';

describe('yahoo provider', () => {
  it('connects when policy allows OAuth IMAP/SMTP mode', async () => {
    const result = await yahooProvider.actions['mail.connect'].execute(
      {
        tenantId: 'tenant-1',
        policy: {
          imapOauthAllowed: true,
        },
        credentials: 'valid',
        host: 'imap.mail.yahoo.com',
        smtpHost: 'smtp.mail.yahoo.com',
        username: 'user@yahoo.com',
        password: 'oauth-token',
      },
      createActionContext()
    );

    expect(result).toMatchObject({
      imapConnected: true,
      smtpConnected: true,
      policyVersion: '2026-03-11',
    });
  });

  it('blocks connect when policy disallows requested integration mode', async () => {
    await expect(
      yahooProvider.actions['mail.connect'].execute(
        {
          tenantId: 'tenant-1',
          policy: {
            imapOauthAllowed: false,
          },
          credentials: 'valid',
          host: 'imap.mail.yahoo.com',
          smtpHost: 'smtp.mail.yahoo.com',
          username: 'user@yahoo.com',
          password: 'oauth-token',
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'yahoo policy disallows requested integration mode',
    });
  });

  it('supports inbound sync and outbound send conformance paths', async () => {
    const syncResult = await yahooProvider.actions['mail.sync'].execute(
      {
        host: 'imap.mail.yahoo.com',
        username: 'user@yahoo.com',
        password: 'oauth-token',
        mailbox: 'inbox',
        rawMessages: [buildRawMessage()],
      },
      createActionContext()
    );
    expect(syncResult.count).toBe(1);
    expect(syncResult.messages[0].providerMessageId).toBe('yahoo_1');
    expect(syncResult.messages[0].mailbox).toBe('inbox');

    const sendResult = await yahooProvider.actions['mail.send'].execute(
      {
        from: 'user@yahoo.com',
        to: ['recipient@example.com'],
        subject: 'Hello',
        bodyText: 'Body',
        host: 'smtp.mail.yahoo.com',
        username: 'user@yahoo.com',
        password: 'oauth-token',
      },
      createActionContext()
    );
    expect(sendResult.queued).toBe(true);
    expect(sendResult.messageId).toMatch(/^msg_/);
    expect(sendResult.tls).toBe(true);
  });

  it('returns deterministic validation error for missing provider config', () => {
    expect(() => assertYahooProviderConfig(undefined)).toThrowError(
      'yahoo provider config is required'
    );
  });

  it('blocks non-approved scope profile combinations', () => {
    expect(() => resolveYahooScopes(['mail.read.fullbody'])).toThrowError(
      'feature scope policy not found: mail.read.fullbody'
    );
  });
});

function createActionContext() {
  const noopHttp = {
    get: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    post: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    put: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    patch: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
    delete: async () => ({ data: {}, status: 200, statusText: 'OK', headers: {} }),
  };

  return {
    userId: 'user-1',
    connectionId: 'conn-1',
    provider: {
      name: 'yahoo',
      baseUrl: 'https://api.login.yahoo.com',
    },
    auth: {
      type: 'oauth2',
      credentials: {},
    },
    http: noopHttp,
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

function buildRawMessage(): string {
  return [
    'From: sender@example.com',
    'To: user@yahoo.com',
    'Subject: Yahoo sync',
    'Date: Thu, 12 Mar 2026 00:00:00 GMT',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello from Yahoo',
  ].join('\r\n');
}
