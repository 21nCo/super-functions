import { afterEach, describe, expect, it, vi } from 'vitest';

import { runMailFnCli } from './index.js';

afterEach(() => vi.unstubAllGlobals());

describe('MailFn CLI', () => {
  it('prints help without requiring MailFn credentials', async () => {
    const output: string[] = [];
    await expect(runMailFnCli({
      args: ['--help'], env: {}, stdout: (value) => output.push(value), stderr: () => undefined,
    })).resolves.toBe(0);
    expect(output.join('')).toContain('MailFn commands:');
  });

  it('redacts message bodies by default and reveals only with an explicit flag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: { id: 'm', subject: 'Verification 123456', headers: { authorization: ['Bearer 123456'] }, metadata: { link: 'https://secret.test' }, textBody: 'Code is 123456', htmlBody: '<p>123456</p>' },
      error: null,
      meta: { requestId: 'req', version: 'v1' },
    })));
    const hidden: string[] = [];
    expect(await runMailFnCli({
      args: ['message', 'read', 'i', 'm', '--url', 'https://mailfn.test', '--token', 'secret'],
      stdout: (value) => hidden.push(value), stderr: () => undefined,
    })).toBe(0);
    expect(hidden.join('')).toContain('[REDACTED]');
    expect(hidden.join('')).not.toContain('123456');
    expect(hidden.join('')).not.toContain('secret.test');

    const shown: string[] = [];
    expect(await runMailFnCli({
      args: ['message', 'read', 'i', 'm', '--url', 'https://mailfn.test', '--token', 'secret', '--show-content'],
      stdout: (value) => shown.push(value), stderr: () => undefined,
    })).toBe(0);
    expect(shown.join('')).toContain('123456');
    expect(shown.join('')).toContain('secret.test');
  });

  it('prints extraction values only for the explicit extraction command', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: { type: 'otp', value: '654321', sourceMessageId: 'm', receivedAt: '', matchedField: 'text' },
      error: null,
      meta: { requestId: 'req', version: 'v1' },
    })));
    const output: string[] = [];
    expect(await runMailFnCli({
      args: ['message', 'extract', 'i', 'm', '--url', 'https://mailfn.test', '--token', 'secret'],
      stdout: (value) => output.push(value), stderr: () => undefined,
    })).toBe(0);
    expect(output.join('')).toContain('654321');
  });

  it('applies the same redaction policy to JSON and reveals credentials only explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: {
        inbox: { id: 'i', address: 'agent@example.com' },
        credential: { credential: { id: 'cred_1' }, token: 'mfn_plaintext_secret' },
      },
      error: null,
      meta: { requestId: 'req', version: 'v1' },
    })));
    const hidden: string[] = [];
    expect(await runMailFnCli({
      args: ['inbox', 'create', '--json', '--url', 'https://mailfn.test', '--token', 'admin'],
      stdout: (value) => hidden.push(value), stderr: () => undefined,
    })).toBe(0);
    expect(hidden.join('')).toContain('[REDACTED]');
    expect(hidden.join('')).not.toContain('mfn_plaintext_secret');

    const shown: string[] = [];
    expect(await runMailFnCli({
      args: ['inbox', 'create', '--json', '--show-secrets', '--url', 'https://mailfn.test', '--token', 'admin'],
      stdout: (value) => shown.push(value), stderr: () => undefined,
    })).toBe(0);
    expect(shown.join('')).toContain('mfn_plaintext_secret');
  });

  it('redacts JSON message metadata and attachment filenames unless content is explicitly shown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      data: [{ id: 'a', filename: 'otp-123456.txt', contentType: 'text/plain' }],
      error: null,
      meta: { requestId: 'req', version: 'v1' },
    })));
    const hidden: string[] = [];
    expect(await runMailFnCli({
      args: ['message', 'attachments', 'i', 'm', '--json', '--url', 'https://mailfn.test', '--token', 'admin'],
      stdout: (value) => hidden.push(value), stderr: () => undefined,
    })).toBe(0);
    expect(hidden.join('')).not.toContain('otp-123456.txt');
    expect(hidden.join('')).toContain('[REDACTED]');
  });
});
