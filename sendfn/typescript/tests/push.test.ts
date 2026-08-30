import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService } from '../src/push/service';
import { DeviceTokenManager } from '../src/push/device-manager';
import { SendfnDb } from '../src/database/sendfn-db';
import type { PushProvider, SendPushRequest, SendPushResponse } from '../src/push/provider';
import type { EmailProvider, SendEmailRequest, SendEmailResponse } from '../src/email/provider';
import { EmailService } from '../src/email/service';
import { TemplateEngine, TemplateRegistry } from '../src/templates/engine';
import { ValidationError, SendfnError } from '../src/errors';
import { FcmProvider } from '../src/push/fcm';
import { ApnsProvider } from '../src/push/apns';
import { StrongMockAdapter } from './mock-adapter';
import { sendfn } from '../src';

class FakePushProvider implements PushProvider {
  readonly capabilities = {
    maxPayloadSize: 4096,
    supportsBatching: true,
    supportsScheduling: false,
    supportsImages: true,
    supportsSilentPush: true,
  };

  active = 0;
  observedMaxConcurrency = 0;

  constructor(
    public readonly name: string,
    public readonly platform: 'ios' | 'android' | 'web',
    private readonly options: {
      invalidTokens?: string[];
      delayMs?: number;
    } = {}
  ) {}

  async initialize(): Promise<void> {}

  async sendPush(params: SendPushRequest): Promise<SendPushResponse> {
    this.active += 1;
    this.observedMaxConcurrency = Math.max(this.observedMaxConcurrency, this.active);
    await new Promise((resolve) => setTimeout(resolve, this.options.delayMs ?? 5));
    this.active -= 1;

    const invalidTokens = params.deviceTokens.filter((token) =>
      (this.options.invalidTokens ?? []).includes(token)
    );
    const failedTokens = new Set(invalidTokens);

    return {
      success: failedTokens.size < params.deviceTokens.length,
      successCount: params.deviceTokens.length - failedTokens.size,
      failedCount: failedTokens.size,
      invalidTokens,
      results: params.deviceTokens.map((token) => ({
        token,
        success: !failedTokens.has(token),
        error: failedTokens.has(token) ? 'invalid token' : undefined,
      })),
      timestamp: new Date('2026-04-05T00:00:00Z'),
    };
  }

  async sendBulkPush(params: SendPushRequest[]): Promise<SendPushResponse[]> {
    return Promise.all(params.map((request) => this.sendPush(request)));
  }

  validateToken(token: string): boolean {
    return Boolean(token);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

class FakeEmailProvider implements EmailProvider {
  readonly name = 'fake-email';
  readonly capabilities = {
    supportsTemplates: true,
    supportsAttachments: true,
    supportsBulkSend: false,
    supportsScheduling: false,
    maxRecipientsPerEmail: 50,
    maxAttachmentSize: 10 * 1024 * 1024,
  };

  active = 0;
  observedMaxConcurrency = 0;

  async initialize(): Promise<void> {}

  async sendEmail(_params: SendEmailRequest): Promise<SendEmailResponse> {
    this.active += 1;
    this.observedMaxConcurrency = Math.max(this.observedMaxConcurrency, this.active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.active -= 1;

    return {
      success: true,
      providerMessageId: `msg-${Math.random()}`,
      timestamp: new Date('2026-04-05T00:00:00Z'),
    };
  }

  async sendBulkEmail(params: SendEmailRequest[]): Promise<SendEmailResponse[]> {
    return Promise.all(params.map((request) => this.sendEmail(request)));
  }

  validateEmail(email: string): boolean {
    return email.includes('@');
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

function assertNonSequential(observedMaxConcurrency: number): void {
  if (observedMaxConcurrency <= 1) {
    throw new SendfnError('Bulk send path is purely sequential', {
      code: 'SENDFN_BULK_SEQUENTIAL_PATH',
      retryable: false,
    });
  }
}

function assertApnsConcurrencyCap(observedMaxConcurrency: number): void {
  if (observedMaxConcurrency > 10) {
    throw new SendfnError('APNS concurrency cap exceeded', {
      code: 'SENDFN_INTERNAL_ERROR',
      retryable: false,
    });
  }
}

function captureThrownError(fn: () => void): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

describe('push and device phase 5 contracts', () => {
  let adapter: StrongMockAdapter;
  let db: SendfnDb;
  let deviceManager: DeviceTokenManager;

  beforeEach(() => {
    adapter = new StrongMockAdapter();
    db = new SendfnDb(adapter as any);
    deviceManager = new DeviceTokenManager(db);
  });

  it('chunks FCM requests at 500 tokens', async () => {
    const provider = Object.create(FcmProvider.prototype) as FcmProvider & {
      app: { messaging(): { sendEachForMulticast(message: { tokens: string[]; data?: Record<string, string> }): Promise<any> } };
    };
    const chunkSizes: number[] = [];
    const payloads: Array<Record<string, string> | undefined> = [];
    provider.app = {
      messaging: () => ({
        sendEachForMulticast: async (message) => {
          chunkSizes.push(message.tokens.length);
          payloads.push(message.data);
          return {
            successCount: message.tokens.length,
            failureCount: 0,
            responses: message.tokens.map(() => ({ success: true })),
          };
        },
      }),
    };

    const response = await provider.sendPush({
      deviceTokens: Array.from({ length: 501 }, (_, index) => `tok-${index}`),
      title: 'Hello',
      body: 'World',
      data: { screen: 'inbox', attempt: 2, enabled: true },
    });

    expect(chunkSizes).toEqual([500, 1]);
    expect(response.successCount).toBe(501);
    expect(response.failedCount).toBe(0);
    expect(payloads).toEqual([
      { screen: 'inbox', attempt: '2', enabled: 'true' },
      { screen: 'inbox', attempt: '2', enabled: 'true' },
    ]);

    await expect(provider.sendPush({
      deviceTokens: ['tok'],
      title: 'Invalid',
      body: 'Payload',
      data: { nested: { unsafe: true } } as any,
    })).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: 'Push data value for `nested` must be a string, finite number, or boolean',
    });
  });

  it('does not instantiate an unused configured FCM fallback', async () => {
    const client = sendfn({
      database: adapter as any,
      pushProviders: {
        android: new FakePushProvider('android-custom', 'android'),
        web: new FakePushProvider('web-custom', 'web'),
      },
      push: { providers: { fcm: { serviceAccountKey: {} } } },
    });
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('caps APNS in-flight concurrency at 10', async () => {
    let active = 0;
    let observedMaxConcurrency = 0;
    const provider = Object.create(ApnsProvider.prototype) as ApnsProvider & {
      client: { send(notification: { deviceToken: string }): Promise<void> };
    };
    (provider as any).config = { bundleId: 'org.example.app' };
    provider.client = {
      send: async () => {
        active += 1;
        observedMaxConcurrency = Math.max(observedMaxConcurrency, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
      },
    };

    const response = await provider.sendPush({
      deviceTokens: Array.from({ length: 25 }, (_, index) => `ios-${index}`),
      title: 'Hello',
      body: 'World',
    });

    expect(response.successCount).toBe(25);
    expect(response.failedCount).toBe(0);
    expect(observedMaxConcurrency).toBeLessThanOrEqual(10);
    expect(() => assertApnsConcurrencyCap(observedMaxConcurrency)).not.toThrow();
    expect(captureThrownError(() => assertApnsConcurrencyCap(11))).toMatchObject({
      code: 'SENDFN_INTERNAL_ERROR',
      message: 'APNS concurrency cap exceeded',
    });
  });

  it('rejects APNS configuration without a non-empty bundle ID topic', () => {
    expect(
      () =>
        new ApnsProvider({
          bundleId: '   ',
          keyId: 'key-id',
          teamId: 'team-id',
          key: 'signing-key',
        })
    ).toThrowError('APNS configuration requires a non-empty `bundleId` topic');
  });

  it('selects the APNS host from the production option', () => {
    const common = {
      bundleId: 'org.example.app',
      keyId: 'key-id',
      teamId: 'team-id',
      key: 'signing-key',
    };
    expect((new ApnsProvider({ ...common, production: true }) as any).client.host)
      .toBe('api.push.apple.com');
    expect((new ApnsProvider({ ...common, production: false }) as any).client.host)
      .toBe('api.sandbox.push.apple.com');
  });

  it('returns the first stable platform notification and deactivates invalid tokens before resolution', async () => {
    await deviceManager.registerDevice({
      userId: 'user-1',
      token: 'android-good',
      platform: 'android',
    });
    await deviceManager.registerDevice({
      userId: 'user-1',
      token: 'ios-bad',
      platform: 'ios',
      deviceInfo: { model: 'iPhone' },
    });
    await deviceManager.registerDevice({
      userId: 'user-1',
      token: 'web-good',
      platform: 'web',
    });

    const androidProvider = new FakePushProvider('android-provider', 'android');
    const iosProvider = new FakePushProvider('ios-provider', 'ios', {
      invalidTokens: ['ios-bad'],
    });
    const webProvider = new FakePushProvider('web-provider', 'web');

    const service = new PushService(
      new Map([
        ['android', androidProvider],
        ['ios', iosProvider],
        ['web', webProvider],
      ]),
      db,
      deviceManager,
      {
        bulkConcurrency: 5,
      }
    );

    const result = await service.sendPush({
      userId: 'user-1',
      title: 'Hello',
      body: 'World',
      metadata: { campaign: 'spring' },
    });

    const notifications = adapter.records('push_notifications');
    expect(notifications).toHaveLength(3);
    expect(result.id).toBe(notifications[0].id);
    expect(result.provider).toBe('android-provider');
    expect(result.sentCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.metadata).toMatchObject({
      campaign: 'spring',
      notificationIds: notifications.map((notification) => notification.id),
    });

    const activeDevices = await deviceManager.getActiveDevices('user-1');
    expect(activeDevices.map((device) => device.token)).toEqual(['android-good', 'web-good']);
  });

  it('supports injected push providers without legacy credential config', async () => {
    await deviceManager.registerDevice({
      userId: 'ios-user',
      token: 'ios-token',
      platform: 'ios',
    });

    const iosProvider = new FakePushProvider('custom-apns', 'ios');
    const service = new PushService(
      new Map([
        ['ios', iosProvider],
      ]),
      db,
      deviceManager,
      {}
    );

    const result = await service.sendPush({
      userId: 'ios-user',
      title: 'Urgent email',
      body: 'Your OTP is ready.',
      data: {
        messageId: 'gmail-msg-1',
      },
    });

    expect(result).toMatchObject({
      provider: 'custom-apns',
      platform: 'ios',
      sentCount: 1,
      status: 'sent',
    });
  });

  it('fails when active device platforms have no configured provider', async () => {
    await deviceManager.registerDevice({
      userId: 'ios-user',
      token: 'ios-token',
      platform: 'ios',
    });
    const service = new PushService(new Map(), db, deviceManager, {});
    await expect(service.sendPush({
      userId: 'ios-user',
      title: 'Hello',
      body: 'World',
    })).rejects.toMatchObject({
      code: 'SENDFN_PUSH_PROVIDER_ERROR',
      message: 'No push provider configured for platform ios',
    });
  });

  it('preflights every active platform before sending any push', async () => {
    await deviceManager.registerDevice({ userId: 'mixed-user', token: 'android-token', platform: 'android' });
    await deviceManager.registerDevice({ userId: 'mixed-user', token: 'ios-token', platform: 'ios' });
    const androidProvider = new FakePushProvider('android-provider', 'android');
    const send = vi.spyOn(androidProvider, 'sendPush');
    const service = new PushService(new Map([['android', androidProvider]]), db, deviceManager, {});
    await expect(service.sendPush({ userId: 'mixed-user', title: 'Hello', body: 'World' }))
      .rejects.toMatchObject({ message: 'No push provider configured for platform ios' });
    expect(send).not.toHaveBeenCalled();
    expect(adapter.records('push_notifications')).toHaveLength(0);
  });

  it('records partial provider delivery as sent when at least one token succeeds', async () => {
    await deviceManager.registerDevice({ userId: 'partial-user', token: 'good', platform: 'android' });
    await deviceManager.registerDevice({ userId: 'partial-user', token: 'bad', platform: 'android' });
    const provider = new FakePushProvider('android-provider', 'android');
    vi.spyOn(provider, 'sendPush').mockResolvedValue({
      success: false,
      successCount: 1,
      failedCount: 1,
      invalidTokens: ['bad'],
      results: [
        { token: 'good', success: true },
        { token: 'bad', success: false, error: 'invalid token' },
      ],
      timestamp: new Date('2026-04-05T00:00:00Z'),
    });
    const service = new PushService(new Map([['android', provider]]), db, deviceManager, {});
    const result = await service.sendPush({ userId: 'partial-user', title: 'Hello', body: 'World' });
    expect(result).toMatchObject({ status: 'sent', sentCount: 1, failedCount: 1 });
    expect(adapter.records('communication_events')).toEqual([
      expect.objectContaining({ eventType: 'sent' }),
    ]);
  });

  it('returns aggregate success when a later platform provider throws', async () => {
    await deviceManager.registerDevice({ userId: 'partial-platform-user', token: 'android-good', platform: 'android' });
    await deviceManager.registerDevice({ userId: 'partial-platform-user', token: 'ios-failed', platform: 'ios' });
    const androidProvider = new FakePushProvider('android-provider', 'android');
    const iosProvider = new FakePushProvider('ios-provider', 'ios');
    vi.spyOn(iosProvider, 'sendPush').mockRejectedValue(new Error('APNS unavailable'));
    const service = new PushService(new Map([
      ['android', androidProvider],
      ['ios', iosProvider],
    ]), db, deviceManager, {});

    const result = await service.sendPush({
      userId: 'partial-platform-user',
      title: 'Hello',
      body: 'World',
    });

    expect(result).toMatchObject({ status: 'sent', sentCount: 1, failedCount: 1 });
    expect(result.metadata).toMatchObject({
      providerErrors: [{ platform: 'ios', provider: 'ios-provider', error: 'APNS unavailable' }],
    });
    expect(adapter.records('push_notifications')).toEqual([
      expect.objectContaining({ platform: 'android', status: 'sent' }),
      expect.objectContaining({ platform: 'ios', status: 'failed' }),
    ]);
  });

  it('keeps a first-platform provider failure failed when a later platform succeeds', async () => {
    await deviceManager.registerDevice({ userId: 'reverse-partial-user', token: 'android-failed', platform: 'android' });
    await deviceManager.registerDevice({ userId: 'reverse-partial-user', token: 'ios-good', platform: 'ios' });
    const androidProvider = new FakePushProvider('android-provider', 'android');
    const iosProvider = new FakePushProvider('ios-provider', 'ios');
    vi.spyOn(androidProvider, 'sendPush').mockRejectedValue(new Error('FCM unavailable'));
    const service = new PushService(new Map([
      ['android', androidProvider],
      ['ios', iosProvider],
    ]), db, deviceManager, {});

    const result = await service.sendPush({
      userId: 'reverse-partial-user',
      title: 'Hello',
      body: 'World',
    });

    expect(result).toMatchObject({ platform: 'ios', status: 'sent', sentCount: 1, failedCount: 1 });
    expect(adapter.records('push_notifications')).toEqual([
      expect.objectContaining({ platform: 'android', status: 'failed' }),
      expect.objectContaining({ platform: 'ios', status: 'sent' }),
    ]);
  });

  it('validates device registrations before persistence', async () => {
    await expect(
      deviceManager.registerDevice({
        userId: '',
        token: 'token',
        platform: 'ios',
      })
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: '`userId` is required to register a device token',
    });

    await expect(
      deviceManager.registerDevice({
        userId: 'user-1',
        token: '',
        platform: 'ios',
      })
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: '`token` is required to register a device',
    });

    await expect(
      deviceManager.registerDevice({
        userId: 42,
        token: 'token',
        platform: 'ios',
      } as any)
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: '`userId` is required to register a device token',
    });

    await expect(
      deviceManager.registerDevice({
        userId: 'user-1',
        token: false,
        platform: 'ios',
      } as any)
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: '`token` is required to register a device',
    });
  });

  it('refreshes device tokens by preserving metadata and rejects mismatched old tokens', async () => {
    const initial = await deviceManager.registerDevice({
      userId: 'user-123',
      token: 'old-token',
      platform: 'android',
      appVersion: '1.0.0',
      deviceInfo: { model: 'Pixel' },
    });

    const refreshed = await deviceManager.refreshDeviceToken(
      'old-token',
      'new-token',
      'user-123',
      'android'
    );

    expect(initial.deviceInfo).toEqual({ model: 'Pixel' });
    expect(refreshed.token).toBe('new-token');
    expect(refreshed.appVersion).toBe('1.0.0');
    expect(refreshed.deviceInfo).toEqual({ model: 'Pixel' });

    const activeTokens = await deviceManager.getActiveDevices('user-123', 'android');
    expect(activeTokens.map((device) => device.token)).toEqual(['new-token']);

    await expect(
      deviceManager.refreshDeviceToken('missing-token', 'other-token', 'user-123', 'android')
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: 'Old device token was not found for the supplied user and platform',
    });
  });

  it('validates refresh inputs before deactivating the old token', async () => {
    await deviceManager.registerDevice({
      userId: 'user-123',
      token: 'old-token',
      platform: 'android',
    });

    await expect(
      deviceManager.refreshDeviceToken(
        'old-token',
        42 as any,
        'user-123',
        'android'
      )
    ).rejects.toMatchObject({
      code: 'SENDFN_VALIDATION_ERROR',
      message: '`token` is required to register a device',
    });

    const activeTokens = await deviceManager.getActiveDevices('user-123', 'android');
    expect(activeTokens.map((device) => device.token)).toEqual(['old-token']);
  });

  it('keeps a no-op token refresh active', async () => {
    const initial = await deviceManager.registerDevice({
      userId: 'user-123',
      token: 'same-token',
      platform: 'android',
    });
    const refreshed = await deviceManager.refreshDeviceToken(
      'same-token',
      'same-token',
      'user-123',
      'android'
    );
    expect(refreshed.id).toBe(initial.id);
    expect((await deviceManager.getActiveDevices('user-123', 'android')).map((device) => device.token)).toEqual(['same-token']);
  });

  it('refreshes only the matched user token when token strings are shared', async () => {
    await deviceManager.registerDevice({ userId: 'user-a', token: 'shared', platform: 'android' });
    await deviceManager.registerDevice({ userId: 'user-b', token: 'shared', platform: 'android' });
    await deviceManager.refreshDeviceToken('shared', 'replacement', 'user-a', 'android');

    expect((await deviceManager.getActiveDevices('user-a')).map((device) => device.token)).toEqual(['replacement']);
    expect((await deviceManager.getActiveDevices('user-b')).map((device) => device.token)).toEqual(['shared']);
  });

  it('reactivates existing tuples, cleans up inactive devices, and keeps bulk push bounded', async () => {
    const registered = await deviceManager.registerDevice({
      userId: 'user-1',
      token: 'dup-token',
      platform: 'android',
    });
    await deviceManager.deactivateTokens(['dup-token']);
    const reactivated = await deviceManager.registerDevice({
      userId: 'user-1',
      token: 'dup-token',
      platform: 'android',
    });

    expect(reactivated.id).toBe(registered.id);
    expect(adapter.records('device_tokens')).toHaveLength(1);
    expect((await deviceManager.getActiveDevices('user-1')).map((device) => device.token)).toEqual(['dup-token']);

    await deviceManager.deactivateTokens(['dup-token']);
    const removed = await deviceManager.cleanupInactiveDevices(new Date(Date.now() + 1_000));
    expect(removed).toBe(1);
    expect(adapter.records('device_tokens')).toHaveLength(0);

    for (let index = 0; index < 20; index += 1) {
      await deviceManager.registerDevice({
        userId: `bulk-user-${index}`,
        token: `bulk-token-${index}`,
        platform: 'android',
      });
    }

    const provider = new FakePushProvider('android-provider', 'android', { delayMs: 5 });
    const service = new PushService(new Map([['android', provider]]), db, deviceManager, {
      bulkConcurrency: 5,
    });

    await service.sendBulkPush(
      Array.from({ length: 20 }, (_, index) => ({
        userId: `bulk-user-${index}`,
        title: 'Hello',
        body: 'World',
      }))
    );

    expect(provider.observedMaxConcurrency).toBeLessThanOrEqual(5);
    expect(provider.observedMaxConcurrency).toBeGreaterThan(1);
    expect(() => assertNonSequential(provider.observedMaxConcurrency)).not.toThrow();
    expect(captureThrownError(() => assertNonSequential(1))).toMatchObject({
      code: 'SENDFN_BULK_SEQUENTIAL_PATH',
      message: 'Bulk send path is purely sequential',
    });
  });

  it('runs TypeScript bulk email with bounded concurrency instead of a sequential loop', async () => {
    const provider = new FakeEmailProvider();
    const service = new EmailService(
      provider,
      db,
      new TemplateEngine(),
      new TemplateRegistry(),
      {
        fromEmail: 'noreply@example.com',
      },
      {
        bulkConcurrency: 5,
      }
    );

    await service.sendBulkEmail(
      Array.from({ length: 20 }, (_, index) => ({
        userId: `email-user-${index}`,
        to: `user-${index}@example.com`,
        subject: 'Hello',
        html: '<p>Hello</p>',
      }))
    );

    expect(provider.observedMaxConcurrency).toBeLessThanOrEqual(5);
    expect(provider.observedMaxConcurrency).toBeGreaterThan(1);
    expect(() => assertNonSequential(provider.observedMaxConcurrency)).not.toThrow();
  });
});
