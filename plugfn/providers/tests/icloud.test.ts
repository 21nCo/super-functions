import { describe, expect, it } from 'vitest';
import {
  assertIcloudProviderConfig,
  icloudProvider,
} from '../src/icloud/index.js';

describe('icloud provider', () => {
  it('connects inbound IMAP with app-specific password credentials', async () => {
    const result = await icloudProvider.actions['mail.connect'].execute(
      {
        mode: 'imap-smtp',
        username: 'user@icloud.com',
        appSpecificPassword: 'valid-app-password',
        imapHost: 'imap.mail.me.com',
      },
      createActionContext()
    );

    expect(result).toMatchObject({
      imapConnected: true,
      policyVersion: '2026-03-11',
    });
  });

  it('rejects unsupported POP setup deterministically', async () => {
    await expect(
      icloudProvider.actions['mail.connect'].execute(
        {
          mode: 'pop',
          username: 'user@icloud.com',
          appSpecificPassword: 'valid-app-password',
          imapHost: 'imap.mail.me.com',
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'icloud does not support POP',
    });
  });

  it('surfaces actionable credential invalidation errors', async () => {
    await expect(
      icloudProvider.actions['mail.connect'].execute(
        {
          mode: 'imap-smtp',
          username: 'user@icloud.com',
          appSpecificPassword: 'invalid',
          imapHost: 'imap.mail.me.com',
        },
        createActionContext()
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'icloud app-specific password invalid; generate a new app-specific password',
    });
  });

  it('supports inbound sync', async () => {
    const syncResult = await icloudProvider.actions['mail.sync'].execute(
      {
        mode: 'imap-smtp',
        username: 'user@icloud.com',
        appSpecificPassword: 'valid-app-password',
        mailbox: 'inbox',
        rawMessages: [buildRawMessage()],
        imapHost: 'imap.mail.me.com',
      },
      createActionContext()
    );

    expect(syncResult.count).toBe(1);
    expect(syncResult.messages[0].providerMessageId).toBe('icloud_1');
    expect(syncResult.messages[0].mailbox).toBe('inbox');
  });

  it('returns deterministic validation error for missing provider config', () => {
    expect(() => assertIcloudProviderConfig(undefined)).toThrowError(
      'icloud provider config is required'
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
      name: 'icloud',
      baseUrl: 'https://icloud.com',
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

function buildRawMessage(): string {
  return [
    'From: sender@example.com',
    'To: user@icloud.com',
    'Subject: iCloud sync',
    'Date: Thu, 12 Mar 2026 00:00:00 GMT',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello from iCloud',
  ].join('\r\n');
}
