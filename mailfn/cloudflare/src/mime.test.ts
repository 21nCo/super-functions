import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { PostalMimeParser } from './mime.js';

describe('PostalMimeParser', () => {
  it.each([
    ['quoted-printable-alternative.eml', (parsed: Awaited<ReturnType<PostalMimeParser['parse']>>) => {
      expect(parsed.subject).toBe('Olá verification');
      expect(parsed.text).toContain('café code 246810');
      expect(parsed.html).toContain('<strong>246810</strong>');
    }],
    ['base64-unicode.eml', (parsed: Awaited<ReturnType<PostalMimeParser['parse']>>) => {
      expect(parsed.subject).toBe('Привет ✓');
      expect(parsed.text).toContain('Unicode body ✓');
    }],
    ['inline-and-attachment.eml', (parsed: Awaited<ReturnType<PostalMimeParser['parse']>>) => {
      expect(parsed.replyTo).toEqual([{ address: 'support@example.com', name: 'Support' }]);
      expect(parsed.attachments).toHaveLength(2);
      expect(parsed.attachments.map((entry) => entry.disposition)).toEqual(['inline', 'attachment']);
      expect(parsed.attachments[0]?.contentId).toBe('logo@example.com');
    }],
    ['malformed-truncated.eml', (parsed: Awaited<ReturnType<PostalMimeParser['parse']>>) => {
      expect(parsed.subject).toBe('Truncated multipart');
      expect(parsed.text).toContain('still recover this body');
    }],
  ] as const)('parses MIME fixture %s deterministically', async (name, assertFixture) => {
    const content = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
    const parsed = await new PostalMimeParser().parse(new Uint8Array(content));
    assertFixture(parsed);
  });

  it('parses text, HTML, encodings, threading, authentication, and attachments', async () => {
    const raw = [
      'From: Sender <sender@example.com>',
      'To: Target <target@inbound.example.com>',
      'Subject: =?UTF-8?Q?Verify_=E2=9C=93?=',
      'Message-ID: <message@example.com>',
      'In-Reply-To: <parent@example.com>',
      'References: <root@example.com> <parent@example.com>',
      'Authentication-Results: mx.example; spf=pass; dkim=pass; dmarc=pass',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="outer"',
      '',
      '--outer',
      'Content-Type: multipart/alternative; boundary="inner"',
      '',
      '--inner',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Your code is 123456',
      '--inner',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Your code is <strong>123456</strong></p>',
      '--inner--',
      '--outer',
      'Content-Type: text/plain; name="proof.txt"',
      'Content-Disposition: attachment; filename="proof.txt"',
      'Content-Transfer-Encoding: base64',
      '',
      'ZXZpZGVuY2U=',
      '--outer--',
      '',
    ].join('\r\n');
    const parsed = await new PostalMimeParser().parse(new TextEncoder().encode(raw));
    expect(parsed.subject).toBe('Verify ✓');
    expect(parsed.from).toEqual([{ address: 'sender@example.com', name: 'Sender' }]);
    expect(parsed.inReplyTo).toBe('<parent@example.com>');
    expect(parsed.references).toEqual(['<root@example.com>', '<parent@example.com>']);
    expect(parsed.authenticationResults).toMatchObject({ spf: 'pass', dkim: 'pass', dmarc: 'pass' });
    expect(parsed.text).toContain('123456');
    expect(parsed.html).toContain('<strong>123456</strong>');
    expect(parsed.attachments).toHaveLength(1);
    expect(new TextDecoder().decode(parsed.attachments[0]!.content)).toBe('evidence');
  });

  it('keeps malformed input deterministic instead of executing remote content', async () => {
    const parsed = await new PostalMimeParser().parse(new TextEncoder().encode('Subject: broken\r\n\r\nbody'));
    expect(parsed.subject).toBe('broken');
    expect(parsed.text).toContain('body');
    expect(parsed.attachments).toEqual([]);
  });
});
