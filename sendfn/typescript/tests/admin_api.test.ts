import { describe, expect, it } from 'vitest';
import type { EmailProvider, SendEmailRequest, SendEmailResponse } from '../src/email/provider';
import type { PushProvider, SendPushRequest, SendPushResponse } from '../src/push/provider';
import { sendfn, type SendfnConfig } from '../src/sendfn';
import { StrongMockAdapter } from './mock-adapter';

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

  async initialize(): Promise<void> {}

  async sendEmail(_params: SendEmailRequest): Promise<SendEmailResponse> {
    return {
      success: true,
      providerMessageId: 'ses-admin-1',
      timestamp: new Date('2026-04-05T00:00:00Z'),
    };
  }

  async sendBulkEmail(): Promise<SendEmailResponse[]> {
    return [];
  }

  validateEmail(): boolean {
    return true;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {}
}

class FakePushProvider implements PushProvider {
  readonly name = 'fake-apns';
  readonly platform = 'ios';
  readonly capabilities = {
    maxPayloadSize: 4096,
    supportsBatching: true,
    supportsScheduling: false,
    supportsImages: true,
    supportsSilentPush: true,
  };

  initializeCalls = 0;

  async initialize(): Promise<void> {
    this.initializeCalls += 1;
  }

  async sendPush(params: SendPushRequest): Promise<SendPushResponse> {
    return {
      success: true,
      successCount: params.deviceTokens.length,
      failedCount: 0,
      invalidTokens: [],
      results: params.deviceTokens.map((token) => ({ token, success: true })),
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

describe('admin API envelopes', () => {
  it('awaits provider initialization failures and initializes shared push providers once', async () => {
    const failingEmail = new FakeEmailProvider();
    failingEmail.initialize = async () => {
      throw new Error('credentials unavailable');
    };
    const failingClient = sendfn({
      database: new StrongMockAdapter() as any,
      emailProvider: failingEmail,
      email: { fromEmail: 'noreply@example.com' },
    });
    await expect(failingClient.email({
      userId: 'user-1',
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
    })).rejects.toMatchObject({
      code: 'SENDFN_EMAIL_PROVIDER_ERROR',
      message: 'credentials unavailable',
    });

    const pushProvider = new FakePushProvider();
    const pushClient = sendfn({
      database: new StrongMockAdapter() as any,
      pushProviders: { android: pushProvider, web: pushProvider },
    });
    await pushClient.registerDevice({ userId: 'user-1', token: 'token-1', platform: 'android' });
    await pushClient.push({ userId: 'user-1', title: 'Hello', body: 'World' });
    expect(pushProvider.initializeCalls).toBe(1);
    await Promise.all([failingClient.close(), pushClient.close()]);
  });

  it('returns canonical success envelopes for authorized admin email sends', async () => {
    const client = sendfn({
      database: new StrongMockAdapter() as any,
      emailProvider: new FakeEmailProvider(),
      email: {
        fromEmail: 'noreply@example.com',
      },
      enableApi: true,
      apiConfig: {
        adminKey: 'top-secret',
      },
    } satisfies SendfnConfig);

    const response = await (client.router as any).handle(
      new Request('http://localhost/email', {
        method: 'POST',
        headers: {
          authorization: 'Bearer top-secret',
          'content-type': 'application/json',
          'x-request-id': 'req_admin_success',
        },
        body: JSON.stringify({
          userId: 'user-1',
          to: 'user@example.com',
          subject: 'Hello',
          html: '<p>Hello</p>',
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        status: 'sent',
        providerMessageId: 'ses-admin-1',
      },
      error: null,
      meta: {
        requestId: 'req_admin_success',
        version: 'v0',
      },
    });
  });

  it('returns canonical unauthorized envelopes for admin routes', async () => {
    const client = sendfn({
      database: new StrongMockAdapter() as any,
      enableApi: true,
      apiConfig: {
        adminKey: 'top-secret',
      },
    } satisfies SendfnConfig);

    const response = await (client.router as any).handle(
      new Request('http://localhost/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'req_admin_unauthorized',
        },
        body: JSON.stringify({
          userId: 'user-1',
          to: 'user@example.com',
          subject: 'Hello',
          html: '<p>Hello</p>',
        }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      data: null,
      error: {
        code: 'SENDFN_UNAUTHORIZED',
        message: 'Unauthorized',
        retryable: false,
      },
      meta: {
        requestId: 'req_admin_unauthorized',
        version: 'v0',
      },
    });
  });

  it('rejects unsupported runtime push-provider keys', () => {
    expect(() =>
      sendfn({
        database: new StrongMockAdapter() as any,
        pushProviders: {
          windows: new FakePushProvider(),
        } as any,
      } satisfies SendfnConfig)
    ).toThrowError('Unsupported push provider platform: windows');
  });

  it('exposes device-token admin routes used by native push clients', async () => {
    const client = sendfn({
      database: new StrongMockAdapter() as any,
      pushProviders: {
        ios: new FakePushProvider(),
      },
      enableApi: true,
      apiConfig: {
        adminKey: 'top-secret',
      },
    } satisfies SendfnConfig);

    const registerResponse = await (client.router as any).handle(
      new Request('http://localhost/devices', {
        method: 'POST',
        headers: {
          authorization: 'Bearer top-secret',
          'content-type': 'application/json',
          'x-request-id': 'req_device_register',
        },
        body: JSON.stringify({
          userId: 'user-1',
          token: 'ios-token',
          platform: 'ios',
          appVersion: '1.0.0',
        }),
      }),
    );

    expect(registerResponse.status).toBe(201);
    await expect(registerResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        userId: 'user-1',
        token: 'ios-token',
        platform: 'ios',
        isActive: true,
      },
      meta: {
        requestId: 'req_device_register',
      },
    });

    const listResponse = await (client.router as any).handle(
      new Request('http://localhost/devices?userId=user-1&platform=ios', {
        headers: {
          authorization: 'Bearer top-secret',
          'x-request-id': 'req_device_list',
        },
      }),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        devices: [
          {
            userId: 'user-1',
            token: 'ios-token',
            platform: 'ios',
          },
        ],
      },
    });
  });

  it('returns validation envelopes for malformed device refresh and query inputs', async () => {
    const client = sendfn({
      database: new StrongMockAdapter() as any,
      enableApi: true,
      apiConfig: {
        adminKey: 'top-secret',
      },
    } satisfies SendfnConfig);

    const headers = {
      authorization: 'Bearer top-secret',
      'content-type': 'application/json',
    };
    const malformedRefresh = await (client.router as any).handle(
      new Request('http://localhost/devices/refresh', {
        method: 'POST',
        headers,
        body: JSON.stringify([]),
      }),
    );
    expect(malformedRefresh.status).toBe(400);
    await expect(malformedRefresh.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SENDFN_VALIDATION_ERROR',
      },
    });

    const invalidPlatform = await (client.router as any).handle(
      new Request('http://localhost/devices?userId=user-1&platform=windows', {
        headers,
      }),
    );
    expect(invalidPlatform.status).toBe(400);
    await expect(invalidPlatform.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SENDFN_VALIDATION_ERROR',
      },
    });

    const blankUser = await (client.router as any).handle(
      new Request('http://localhost/devices?userId=%20%20%20', {
        headers,
      }),
    );
    expect(blankUser.status).toBe(400);
    await expect(blankUser.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'SENDFN_VALIDATION_ERROR',
      },
    });
  });
});
