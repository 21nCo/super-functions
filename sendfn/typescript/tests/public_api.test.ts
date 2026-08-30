import { beforeEach, describe, expect, it } from 'vitest';
import {
  EmailProviderError,
  SendEmailParams,
  ValidationError,
  sendfn,
  SendfnConfig,
} from '../src';
import { StrongMockAdapter } from './mock-adapter';

describe('sendfn public API parity', () => {
  let adapter: StrongMockAdapter;
  let client: ReturnType<typeof sendfn>;

  beforeEach(() => {
    adapter = new StrongMockAdapter();
    const config: SendfnConfig = {
      database: adapter as any,
      awsSns: { topicArns: ['arn:aws:sns:us-east-1:123456789012:sendfn'] },
    };
    client = sendfn(config);
  });

  it('does not expose an AWS SES webhook handler without authorized topics', () => {
    const unconfigured = sendfn({ database: adapter as any });
    expect(() => unconfigured.getWebhookHandlers()).toThrowError(
      'Configure at least one `awsSns.topicArns` entry before exposing AWS SES webhooks'
    );
  });

  it('exposes the phase 1 lifecycle surface', () => {
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(client));
    const expected = [
      'email',
      'bulkEmail',
      'sms',
      'whatsapp',
      'push',
      'bulkPush',
      'registerDevice',
      'getDevices',
      'deactivateDevice',
      'refreshDeviceToken',
      'cleanupInactiveDevices',
      'registerTemplate',
      'getTemplate',
      'listTemplates',
      'getEmailEvents',
      'getPushEvents',
      'getSmsEvents',
      'getWhatsAppEvents',
      'queryEvents',
      'checkSuppressionList',
      'addToSuppressionList',
      'bulkAddToSuppressionList',
      'exportSuppressionList',
      'removeFromSuppressionList',
      'getWebhookHandlers',
      'close',
    ];

    for (const methodName of expected) {
      expect(methodNames).toContain(methodName);
    }

    expect(client.getWebhookHandlers()).toHaveProperty('awsSes');
  });

  it('wires refresh/cleanup and suppression export helpers', async () => {
    await client.registerDevice({
      userId: 'user-1',
      token: 'old-token',
      platform: 'android',
    });

    const refreshed = await client.refreshDeviceToken(
      'old-token',
      'new-token',
      'user-1',
      'android'
    );
    expect(refreshed.token).toBe('new-token');

    const activeDevices = await client.getDevices('user-1');
    expect(activeDevices.map((device) => device.token)).toEqual(['new-token']);

    const removed = await client.cleanupInactiveDevices(new Date(Date.now() + 1_000));
    expect(removed).toBe(1);

    await client.bulkAddToSuppressionList([
      {
        email: 'one@example.com',
        reason: 'manual',
        source: 'manual',
        bounceType: null,
        metadata: { source: 'test' },
        suppressedAt: new Date(),
      },
      {
        email: 'two@example.com',
        reason: 'bounce',
        source: 'aws-ses',
        bounceType: 'Permanent',
        metadata: {},
        suppressedAt: new Date(),
      },
    ]);

    const exported = await client.exportSuppressionList();
    expect(exported).toHaveLength(2);
  });

  it('surfaces typed errors and closes idempotently', async () => {
    const params: SendEmailParams = {
      userId: 'user-1',
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    };

    await expect(client.email(params)).rejects.toBeInstanceOf(EmailProviderError);
    await expect(client.email(params)).rejects.toMatchObject({
      code: 'SENDFN_EMAIL_PROVIDER_ERROR',
      retryable: true,
    });

    const validationError = new ValidationError('bad input');
    expect(validationError.code).toBe('SENDFN_VALIDATION_ERROR');
    expect(validationError.retryable).toBe(false);

    await client.close();
    await client.close();
    expect(adapter.closeCalls).toBe(1);
  });
});
