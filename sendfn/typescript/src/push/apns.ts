import { ApnsClient, Notification } from 'apns2';
import { PushProvider, PushProviderCapabilities, SendPushRequest, SendPushResponse } from './provider';
import { ApnsConfig } from '../types';
import { PushProviderError } from '../errors';
import { mapWithConcurrency } from '../utils/concurrency';

const APNS_CONCURRENCY_LIMIT = 10;

export class ApnsProvider implements PushProvider {
  readonly name = 'apns';
  readonly platform = 'ios';
  readonly capabilities: PushProviderCapabilities = {
    maxPayloadSize: 4096,
    supportsBatching: false, // APNS2 client handles concurrency but protocol is per-request
    supportsScheduling: false,
    supportsImages: true, // Via mutable-content
    supportsSilentPush: true,
  };

  private client: ApnsClient;

  constructor(private config: ApnsConfig) {
    const bundleId = config.bundleId?.trim();
    if (!bundleId) {
      throw new PushProviderError('APNS configuration requires a non-empty `bundleId` topic', {
        retryable: false,
      });
    }

    this.config = {
      ...config,
      bundleId,
    };
    this.client = new ApnsClient({
      team: config.teamId,
      keyId: config.keyId,
      signingKey: config.key,
      defaultTopic: bundleId,
      host: config.production === false ? 'api.sandbox.push.apple.com' : 'api.push.apple.com',
    });
  }

  async initialize(): Promise<void> {
    //
  }

  async sendPush(params: SendPushRequest): Promise<SendPushResponse> {
    const invalidTokens: string[] = [];
    const bundleId = this.config.bundleId;

    const results = await mapWithConcurrency(
      params.deviceTokens,
      APNS_CONCURRENCY_LIMIT,
      async (token) => {
        const notification: any = new Notification(token, {
            alert: {
                title: params.title,
                body: params.body,
            },
            data: params.data,
            badge: params.badge,
            sound: params.sound,
            topic: bundleId,
            category: params.category,
            priority: params.priority === 'high' ? 10 : 5,
            expiration: params.ttl === 0
              ? 0
              : params.ttl !== undefined
                ? Math.floor(Date.now() / 1000) + params.ttl
                : undefined,
            collapseId: params.collapseKey,
        });

        // If image, need mutable-content: 1 and attachment in data
        if (params.imageUrl) {
            notification.aps.mutableContent = 1;
            // Payload structure for image varies, usually in data
            if (!notification.payload) notification.payload = {};
            notification.payload = { ...notification.payload, image_url: params.imageUrl };
        }

        try {
            await this.client.send(notification);
            return { token, success: true };
        } catch (error: any) {
            let errMsg = error.reason || error.message;

            if (error.reason === 'BadDeviceToken' || error.reason === 'Unregistered') {
                invalidTokens.push(token);
            }

            return { token, success: false, error: errMsg };
        }
      }
    );

    let successCount = 0;
    let failedCount = 0;
    for (const result of results) {
      if (result.success) {
        successCount += 1;
      } else {
        failedCount += 1;
      }
    }

    return {
        success: failedCount === 0,
        successCount,
        failedCount,
        invalidTokens,
        results,
        timestamp: new Date()
    };
  }

  async sendBulkPush(params: SendPushRequest[]): Promise<SendPushResponse[]> {
    const results: SendPushResponse[] = [];
    for (const req of params) {
        results.push(await this.sendPush(req));
    }
    return results;
  }

  validateToken(token: string): boolean {
    return !!token;
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // No explicit close on ApnsClient? check docs.
    // It uses http2 session. It might need it.
    // Assuming standard usage.
  }
}

export function apnsAdapter(config: ApnsConfig): ApnsProvider {
  return new ApnsProvider(config);
}
