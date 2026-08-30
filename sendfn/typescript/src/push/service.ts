import {
  SendPushParams,
  PushNotification,
  SendfnOptions,
  Platform
} from '../types';
import { PushProviderError } from '../errors';
import { SendfnDatabaseAdapter } from '../database/adapter';
import { PushProvider } from './provider';
import { DeviceTokenManager } from './device-manager';
import { mapWithConcurrency, resolveConcurrency } from '../utils/concurrency';

const PLATFORM_ORDER: Platform[] = ['android', 'ios', 'web'];
const DEFAULT_BULK_CONCURRENCY = 5;

export class PushService {
  constructor(
    private providers: Map<Platform, PushProvider>,
    private adapter: SendfnDatabaseAdapter,
    private deviceManager: DeviceTokenManager,
    private options: SendfnOptions
  ) {}

  async sendPush(params: SendPushParams): Promise<PushNotification> {
    // 1. Resolve tokens
    const platformTokenSets = new Map<Platform, Set<string>>();

    // If userId provided, fetch tokens
    const userIds = Array.isArray(params.userId) ? params.userId : [params.userId];
    const recipientMetadata = { ...(params.metadata || {}), recipientUserIds: [...userIds] };

    // This is simplified. Ideally we fetch all tokens for all users.
    for (const uid of userIds) {
        const devices = await this.deviceManager.getActiveDevices(uid);
        for (const device of devices) {
            const tokens = platformTokenSets.get(device.platform) ?? new Set<string>();
            tokens.add(device.token);
            platformTokenSets.set(device.platform, tokens);
        }
    }

    if (platformTokenSets.size === 0) {
        // Create a failed notification record or just return?
        // Let's create a failed one to track intent.
        const notification = await this.adapter.createPushNotification({
            userId: userIds.join(','),
            title: params.title,
            body: params.body,
            data: params.data || null,
            deviceTokens: [],
            platform: 'web', // Default/Unknown
            provider: 'none',
            status: 'failed',
            sentCount: 0,
            failedCount: 0,
            sentAt: null,
            metadata: { ...recipientMetadata, error: 'No active devices found' }
        });
        return notification;
    }

    // 2. Create PushNotification record(s)
    // The schema assumes single provider per record?
    // "provider: string (e.g., "fcm", "apns")"
    // If we send to mixed platforms, we might need multiple records or a "mixed" provider.
    // For v0, let's create one record per platform send to keep it clean.
    // But the method returns Promise<PushNotification>.
    // Let's assume we return the "primary" one or aggregate.
    // Actually, if we have multiple platforms, we should probably treat them as separate operations internally
    // but the API call is single.
    // Let's handle just one for simplicity in return type, or change return type.
    // The spec says: "Return PushNotification".

    // Let's iterate platforms and send.

    const platforms = PLATFORM_ORDER.filter((platform) => (platformTokenSets.get(platform)?.size ?? 0) > 0);
    const missingPlatform = platforms.find((platform) => !this.providers.has(platform));
    if (missingPlatform) {
      throw new PushProviderError(`No push provider configured for platform ${missingPlatform}`, {
        retryable: false,
      });
    }
    let logicalNotificationId: string | null = null;
    let firstNotificationId: string | null = null;
    let aggregateSentCount = 0;
    let aggregateFailedCount = 0;
    let logicalMetadata: Record<string, any> = {
      ...recipientMetadata,
      notificationIds: [] as string[],
    };
    let logicalSentAt: Date | null = null;
    let firstProviderError: unknown;
    const providerErrors: Array<{ platform: Platform; provider: string; error: string }> = [];

    for (const platform of platforms) {
        const pTokens = [...platformTokenSets.get(platform)!];
        const provider = this.providers.get(platform)!;

        const notification = await this.adapter.createPushNotification({
            userId: userIds.join(','),
            title: params.title,
            body: params.body,
            data: params.data || null,
            deviceTokens: pTokens,
            platform: platform,
            provider: provider.name,
            status: 'pending',
            sentCount: 0,
            failedCount: 0,
            sentAt: null,
            metadata: recipientMetadata
        });

        (logicalMetadata.notificationIds as string[]).push(notification.id);
        firstNotificationId ??= notification.id;

        let response: Awaited<ReturnType<PushProvider['sendPush']>>;
        try {
            response = await provider.sendPush({
                platform,
                deviceTokens: pTokens,
                title: params.title,
                body: params.body,
                data: params.data,
                imageUrl: params.imageUrl,
                badge: params.badge,
                sound: params.sound,
                priority: params.priority,
                ttl: params.ttl,
                collapseKey: params.collapseKey,
                category: params.category
            });

        } catch (error: any) {
             await this.adapter.updatePushNotification(notification.id, {
                status: 'failed',
                metadata: { ...recipientMetadata, error: error.message }
            });

             if (this.options.eventTracking !== false) await this.adapter.recordEvent({
                referenceId: notification.id,
                referenceType: 'push',
                eventType: 'failed',
                provider: provider.name,
                providerEventId: null,
                recipientEmail: null,
                recipientPhone: null,
                deviceToken: null,
                metadata: { error: error.message },
                eventTimestamp: new Date()
            });

            aggregateFailedCount += pTokens.length;
            firstProviderError ??= error;
            providerErrors.push({ platform, provider: provider.name, error: error.message });
            continue;
        }

        if (response.invalidTokens.length > 0) {
            await this.deviceManager.deactivateTokens(response.invalidTokens);
        }

        const delivered = response.successCount > 0;
        await this.adapter.updatePushNotification(notification.id, {
            status: delivered ? 'sent' : 'failed',
            sentCount: response.successCount,
            failedCount: response.failedCount,
            sentAt: response.timestamp,
            metadata: {
                ...recipientMetadata,
                results: response.results
            }
        });

        if (this.options.eventTracking !== false) await this.adapter.recordEvent({
            referenceId: notification.id,
            referenceType: 'push',
            eventType: delivered ? 'sent' : 'failed',
            provider: provider.name,
            providerEventId: null,
            recipientEmail: null,
            recipientPhone: null,
            deviceToken: null,
            metadata: {
                successCount: response.successCount,
                failedCount: response.failedCount
            },
            eventTimestamp: response.timestamp
        });

        aggregateSentCount += response.successCount;
        aggregateFailedCount += response.failedCount;
        if (delivered) logicalNotificationId ??= notification.id;
        if (!logicalSentAt) {
          logicalSentAt = response.timestamp;
        }
    }

    logicalNotificationId ??= firstNotificationId;
    if (!logicalNotificationId) {
        throw new PushProviderError("Failed to process push for any platform");
    }

    const existingLogicalNotification = await this.adapter.getPushNotification(logicalNotificationId);
    const logicalNotification = await this.adapter.updatePushNotification(logicalNotificationId, {
      status: aggregateSentCount > 0 ? 'sent' : 'failed',
      sentCount: aggregateSentCount,
      failedCount: aggregateFailedCount,
      sentAt: logicalSentAt,
      metadata: {
        ...(existingLogicalNotification?.metadata || {}),
        ...logicalMetadata,
        ...(providerErrors.length > 0 ? { providerErrors } : {}),
      },
    });

    if (aggregateSentCount === 0 && firstProviderError) {
      throw firstProviderError;
    }
    return logicalNotification;
  }

  async sendBulkPush(notifications: SendPushParams[]): Promise<PushNotification[]> {
      return mapWithConcurrency(
        notifications,
        resolveConcurrency(this.options.bulkConcurrency, DEFAULT_BULK_CONCURRENCY),
        async (notification) => this.sendPush(notification)
      );
  }
}
