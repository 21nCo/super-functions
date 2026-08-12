import { describe, expect, it } from 'vitest';
import {
  listRequiredMailProviderIds,
  gmailProvider,
  outlookProvider,
  yahooProvider,
  icloudProvider,
  imapSmtpProvider,
} from '../src/index.js';
import { assertGmailProviderConfig } from '../src/gmail/index.js';
import {
  assertOutlookProviderConfig,
  resolveOutlookDeltaRequestUrl,
} from '../src/outlook/index.js';
import { assertYahooProviderConfig } from '../src/yahoo/index.js';
import { assertIcloudProviderConfig } from '../src/icloud/index.js';
import { assertImapSmtpProviderConfig } from '../src/imap-smtp/index.js';
import {
  normalizeGmailMessage,
  normalizeOutlookMessage,
  validateNormalizedMailMessage,
} from 'plugfn';

describe('provider contracts', () => {
  it('lists all required mail adapter ids', () => {
    expect(listRequiredMailProviderIds()).toEqual([
      'forwarding',
      'gmail',
      'icloud',
      'imap-smtp',
      'managed-mail',
      'outlook',
      'yahoo',
    ]);
  });

  it('registers gmail provider descriptor and mail sync action contract', () => {
    expect(gmailProvider.name).toBe('gmail');
    expect(gmailProvider.actions['mail.sync']).toBeDefined();
    expect(gmailProvider.actions['mail.watch.ensure']).toBeDefined();
    expect(gmailProvider.triggers?.['mail.update']).toBeDefined();
  });

  it('registers outlook provider descriptor and delta/subscription contracts', () => {
    expect(outlookProvider.name).toBe('outlook');
    expect(outlookProvider.actions['mail.sync']).toBeDefined();
    expect(outlookProvider.actions['mail.subscription.ensure']).toBeDefined();
    expect(outlookProvider.triggers?.['mail.update']).toBeDefined();
  });

  it('registers yahoo provider descriptor and IMAP/SMTP contracts', () => {
    expect(yahooProvider.name).toBe('yahoo');
    expect(yahooProvider.actions['mail.connect']).toBeDefined();
    expect(yahooProvider.actions['mail.sync']).toBeDefined();
    expect(yahooProvider.actions['mail.send']).toBeDefined();
  });

  it('registers icloud provider descriptor and IMAP/SMTP contracts', () => {
    expect(icloudProvider.name).toBe('icloud');
    expect(icloudProvider.actions['mail.connect']).toBeDefined();
    expect(icloudProvider.actions['mail.sync']).toBeDefined();
    expect(icloudProvider.actions['mail.send']).toBeDefined();
  });

  it('registers imap-smtp provider descriptor and capability-gated contracts', () => {
    expect(imapSmtpProvider.name).toBe('imap-smtp');
    expect(imapSmtpProvider.actions['mail.connect']).toBeDefined();
    expect(imapSmtpProvider.actions['mail.sync']).toBeDefined();
    expect(imapSmtpProvider.actions['mail.send']).toBeDefined();
  });

  it('normalizes gmail and outlook payloads into equivalent canonical fields', () => {
    const gmail = normalizeGmailMessage({
      id: 'g1',
      threadId: 'gt1',
      internalDate: `${Date.parse('2026-03-12T00:00:00.000Z')}`,
      labelIds: ['INBOX'],
      payload: {
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'To', value: 'user@example.com' },
          { name: 'Date', value: 'Thu, 12 Mar 2026 00:00:00 GMT' },
        ],
      },
    });

    const outlook = normalizeOutlookMessage({
      id: 'm1',
      conversationId: 'ct1',
      from: {
        emailAddress: {
          address: 'sender@example.com',
        },
      },
      toRecipients: [
        {
          emailAddress: {
            address: 'user@example.com',
          },
        },
      ],
      receivedDateTime: '2026-03-12T00:00:00.000Z',
      hasAttachments: false,
    });

    expect(gmail.providerMessageId).toBe('g1');
    expect(gmail.threadId).toBe('gt1');
    expect(gmail.hasAttachments).toBe(false);
    expect(outlook.providerMessageId).toBe('m1');
    expect(outlook.threadId).toBe('ct1');
    expect(outlook.hasAttachments).toBe(false);
  });

  it('rejects invalid normalized payload before persistence boundary', () => {
    expect(() =>
      validateNormalizedMailMessage({
        providerMessageId: '',
        receivedAt: 'not-a-date',
      })
    ).toThrowError('invalid normalized mail message');
  });

  it('returns deterministic validation error for missing gmail config', () => {
    expect(() => assertGmailProviderConfig(undefined)).toThrowError(
      'gmail provider config is required'
    );
  });

  it('returns deterministic validation error for missing outlook config', () => {
    expect(() => assertOutlookProviderConfig(undefined)).toThrowError(
      'outlook provider config is required'
    );
  });

  it('restricts Outlook delta checkpoints to the Microsoft Graph origin', () => {
    expect(
      resolveOutlookDeltaRequestUrl(
        'https://graph.microsoft.com',
        'https://graph.microsoft.com/v1.0/me/messages/delta?$skiptoken=abc'
      )
    ).toBe('https://graph.microsoft.com/v1.0/me/messages/delta?$skiptoken=abc');
    expect(() =>
      resolveOutlookDeltaRequestUrl(
        'https://graph.microsoft.com',
        'https://attacker.example/collect'
      )
    ).toThrowError('outlook delta checkpoint URL must use the Microsoft Graph origin');
  });

  it('returns deterministic validation error for missing yahoo config', () => {
    expect(() => assertYahooProviderConfig(undefined)).toThrowError(
      'yahoo provider config is required'
    );
  });

  it('returns deterministic validation error for missing icloud config', () => {
    expect(() => assertIcloudProviderConfig(undefined)).toThrowError(
      'icloud provider config is required'
    );
  });

  it('returns deterministic validation error for missing imap-smtp config', () => {
    expect(() => assertImapSmtpProviderConfig(undefined)).toThrowError(
      'imap-smtp provider config is required'
    );
  });
});
