import { ImapFlow } from 'imapflow';
import { describe, expect, it } from 'vitest';
import {
  assertImapSmtpProviderConfig,
  getImapSmtpPolicyDecisionLog,
  imapSmtpProvider,
} from '../src/imap-smtp/index.js';

describe('imap-smtp provider', () => {
  it('connects with secure defaults enabled', async () => {
    const result = await imapSmtpProvider.actions['mail.connect'].execute(
      {
        host: 'mail.example.com',
        username: 'user@example.com',
        password: 'password',
      },
      createActionContext()
    );

    expect(result).toMatchObject({
      imapConnected: true,
      tls: true,
      policyVersion: '2026-03-11',
    });
  });

  it('blocks insecure transport unless explicit override is enabled', async () => {
    await expect(
      imapSmtpProvider.actions['mail.connect'].execute(
        {
          host: 'mail.example.com',
          username: 'user@example.com',
          password: 'password',
          tls: false,
          explicitInsecureOverride: false,
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_BLOCKED',
      message: 'insecure transport disabled',
    });
  });

  it('records policy decision when insecure override is explicitly enabled', async () => {
    const before = getImapSmtpPolicyDecisionLog().length;
    await imapSmtpProvider.actions['mail.connect'].execute(
      {
        host: 'mail.example.com',
        username: 'user@example.com',
        password: 'password',
        tls: false,
        explicitInsecureOverride: true,
      },
      createActionContext()
    );
    const decisions = getImapSmtpPolicyDecisionLog();
    const latest = decisions[decisions.length - 1];

    expect(decisions.length).toBeGreaterThan(before);
    expect(latest).toMatchObject({
      providerId: 'imap-smtp',
      operation: 'mail.connect',
      allowed: true,
      policyVersion: '2026-03-11',
    });
    expect(ImapFlow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        port: 143,
        secure: false,
      })
    );
  });

  it('parses RFC MIME variants and attachment presence during sync', async () => {
    const result = await imapSmtpProvider.actions['mail.sync'].execute(
      {
        host: 'mail.example.com',
        username: 'user@example.com',
        password: 'password',
        mailbox: 'inbox',
        rawMessages: [buildMultipartRawMessage()],
      },
      createActionContext()
    );

    expect(result.count).toBe(1);
    expect(result.messages[0].providerMessageId).toBe('imap_1');
    expect(result.messages[0].bodyText).toContain('Plain text body');
    expect(result.messages[0].bodyHtml).toContain('<p>HTML body</p>');
    expect(result.messages[0].hasAttachments).toBe(true);
  });

  it('returns deterministic validation error for missing provider config', () => {
    expect(() => assertImapSmtpProviderConfig(undefined)).toThrowError(
      'imap-smtp provider config is required'
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
      name: 'imap-smtp',
      baseUrl: 'imap://generic',
    },
    auth: {
      type: 'basic',
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

function buildMultipartRawMessage(): string {
  return [
    'From: sender@example.com',
    'To: user@example.com',
    'Subject: Multipart message',
    'Date: Thu, 12 Mar 2026 00:00:00 GMT',
    'Content-Type: multipart/mixed; boundary="boundary123"',
    '',
    '--boundary123',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Plain text body',
    '--boundary123',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>HTML body</p>',
    '--boundary123',
    'Content-Type: application/pdf',
    'Content-Disposition: attachment; filename="statement.pdf"',
    '',
    'JVBERi0xLjQ=',
    '--boundary123--',
  ].join('\r\n');
}
