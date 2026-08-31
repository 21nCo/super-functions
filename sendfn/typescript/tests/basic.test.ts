import { describe, it, expect, beforeEach } from 'vitest';
import { sendfn, SendfnConfig, awsSesAdapter, consoleSmsAdapter } from '../src';
import { StrongMockAdapter } from './mock-adapter';

describe('Sendfn SDK Basic Test', () => {
  let client: ReturnType<typeof sendfn>;
  let mockAdapter: StrongMockAdapter;

  beforeEach(() => {
    mockAdapter = new StrongMockAdapter();
    const config: SendfnConfig = {
      database: mockAdapter,
      // Use adapter pattern
      emailProvider: awsSesAdapter({
          accessKeyId: 'fake',
          secretAccessKey: 'fake',
          region: 'us-east-1'
      }),
      email: {
        fromEmail: 'test@example.com'
      },
      smsProvider: consoleSmsAdapter(),
      options: {
        suppressionEnabled: true,
      }
    };
    client = sendfn(config);
  });

  it('should initialize correctly', () => {
    expect(client).toBeDefined();
  });

  it('should allow device registration', async () => {
    const token = await client.registerDevice({
      userId: 'user-1',
      token: 'token-123',
      platform: 'android',
    });

    expect(token).toBeDefined();
    expect(token.userId).toBe('user-1');
  });

  it('should check suppression list', async () => {
    await client.addToSuppressionList({
        email: 'bounced@example.com',
        reason: 'bounce',
        source: 'manual',
        bounceType: 'Permanent',
        suppressedAt: new Date()
    });

    const result = await client.checkSuppressionList('bounced@example.com');
    expect(result.suppressed).toBe(true);
  });

  it('should allow sending sms via console adapter', async () => {
      const res = await client.sms({
          userId: 'user-1',
          to: '+1234567890',
          message: 'Hello World'
      });

      expect(res).toBeDefined();
      expect(res.status).toBe('sent');
      expect(res.provider).toBe('console-sms');
  });
});
