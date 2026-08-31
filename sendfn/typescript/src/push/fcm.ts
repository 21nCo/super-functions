import * as admin from 'firebase-admin';
import { PushProvider, PushProviderCapabilities, SendPushRequest, SendPushResponse } from './provider';
import { FcmConfig } from '../types';
import { PushProviderError, ValidationError } from '../errors';

const MAX_FCM_BATCH_SIZE = 500;
let nextAppId = 1;

function stringifyData(data: SendPushRequest['data']): Record<string, string> | undefined {
  if (!data) return undefined;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (
      (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      || (typeof value === 'number' && !Number.isFinite(value))
    ) {
      throw new ValidationError(`Push data value for \`${key}\` must be a string, finite number, or boolean`, {
        code: 'SENDFN_VALIDATION_ERROR',
        retryable: false,
      });
    }
    return [key, String(value)];
  }));
}

export class FcmProvider implements PushProvider {
  readonly name = 'fcm';
  readonly platform = 'android'; // Also supports web, but spec says Android primarily for FCM
  readonly capabilities: PushProviderCapabilities = {
    maxPayloadSize: 4096,
    supportsBatching: true, // Multicast
    supportsScheduling: false,
    supportsImages: true,
    supportsSilentPush: true,
  };

  private app: admin.app.App;
  private closed = false;

  constructor(private config: FcmConfig) {
    this.app = admin.initializeApp({
        credential: admin.credential.cert(config.serviceAccountKey as admin.ServiceAccount),
        projectId: config.projectId,
    }, `sendfn-${nextAppId++}`);
  }

  async initialize(): Promise<void> {
    // Initialized in constructor
  }

  async sendPush(params: SendPushRequest): Promise<SendPushResponse> {
    const invalidTokens: string[] = [];
    const results: { token: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let start = 0; start < params.deviceTokens.length; start += MAX_FCM_BATCH_SIZE) {
      const chunkTokens = params.deviceTokens.slice(start, start + MAX_FCM_BATCH_SIZE);
      const message: admin.messaging.MulticastMessage = {
      tokens: chunkTokens,
      notification: {
        title: params.title,
        body: params.body,
        imageUrl: params.imageUrl,
      },
      data: stringifyData(params.data),
      android: params.platform === 'web' ? undefined : {
        priority: params.priority === 'high' ? 'high' : 'normal',
        ttl: params.ttl === undefined ? undefined : params.ttl * 1000, // ms
        collapseKey: params.collapseKey,
        notification: {
            sound: params.sound || 'default',
        }
      },
      webpush: params.platform === 'web' ? {
        headers: {
          ...(params.ttl === undefined ? {} : { TTL: String(params.ttl) }),
          ...(params.collapseKey ? { Topic: params.collapseKey } : {}),
          ...(params.priority ? { Urgency: params.priority === 'high' ? 'high' : 'normal' } : {}),
        },
        ...(params.sound ? { data: { sound: params.sound } } : {}),
      } : undefined,
    };

    try {
      const response = await this.app.messaging().sendEachForMulticast(message);

      successCount += response.successCount;
      failedCount += response.failureCount;

      const chunkResults = response.responses.map((res, idx) => {
        if (!res.success) {
            if (res.error?.code === 'messaging/registration-token-not-registered' ||
                res.error?.code === 'messaging/invalid-registration-token') {
                invalidTokens.push(chunkTokens[idx]);
            }
        }
        return {
            token: chunkTokens[idx],
            success: res.success,
            error: res.error?.message
        };
      });

      results.push(...chunkResults);
    } catch (error: any) {
        if (results.length === 0) {
          throw new PushProviderError(`FCM Error: ${error.message}`);
        }

        const unattemptedTokens = params.deviceTokens.slice(start);
        failedCount += unattemptedTokens.length;
        results.push(...unattemptedTokens.map((token) => ({
          token,
          success: false,
          error: `FCM Error: ${error.message}`,
        })));
        break;
    }
    }

      return {
        success: failedCount === 0,
        successCount,
        failedCount,
        invalidTokens,
        results,
        timestamp: new Date(),
      };
  }

  async sendBulkPush(params: SendPushRequest[]): Promise<SendPushResponse[]> {
      // Just iterate for now
      const results: SendPushResponse[] = [];
      for (const req of params) {
          results.push(await this.sendPush(req));
      }
      return results;
  }

  validateToken(token: string): boolean {
    return !!token; // Basic check
  }

  async isHealthy(): Promise<boolean> {
    return true; // Hard to check without sending
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.app.delete();
    this.closed = true;
  }
}

export function fcmAdapter(config: FcmConfig): FcmProvider {
  return new FcmProvider(config);
}
