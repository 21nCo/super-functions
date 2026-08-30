import { Adapter } from '@superfunctions/db';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError } from '../errors';
import {
  EmailTransaction,
  CreateEmailTransaction,
  SmsTransaction,
  CreateSmsTransaction,
  WhatsAppTransaction,
  CreateWhatsAppTransaction,
  PushNotification,
  CreatePushNotification,
  DeviceToken,
  CreateDeviceToken,
  SuppressionList,
  CreateSuppression,
  CommunicationEvent,
  CreateEvent,
  Platform
} from '../types';

export interface FindEmailParams {
  userId?: string;
  status?: string;
  providerMessageId?: string;
  limit?: number;
  offset?: number;
}

export interface FindSmsParams {
  userId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface FindWhatsAppParams {
  userId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface FindPushParams {
  userId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface FindSuppressionParams {
  reason?: string;
  limit?: number;
  offset?: number;
}

export interface FindEventParams {
  referenceId?: string;
  referenceType?: 'email' | 'push' | 'sms' | 'whatsapp';
  providerMessageId?: string;
  provider?: string;
  userId?: string;
  eventType?: string;
  startAt?: Date;
  endAt?: Date;
  limit?: number;
  offset?: number;
}

const DEFAULT_EVENT_QUERY_LIMIT = 50;
const MAX_EVENT_QUERY_LIMIT = 200;

export class SendfnDb {
  constructor(private adapter: Adapter) {}

  private normalizeSuppressionEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private resolveEventQueryLimit(limit?: number): number {
    if (limit === undefined) {
      return DEFAULT_EVENT_QUERY_LIMIT;
    }

    if (!Number.isFinite(limit) || limit < 0) {
      throw new ValidationError('`limit` must be a non-negative number');
    }

    return Math.min(limit, MAX_EVENT_QUERY_LIMIT);
  }

  private resolveOffset(offset?: number): number | undefined {
    if (offset === undefined) {
      return undefined;
    }

    if (!Number.isFinite(offset) || offset < 0) {
      throw new ValidationError('`offset` must be a non-negative number');
    }

    return offset;
  }

  private validateEventWindow(startAt?: Date, endAt?: Date): void {
    if (startAt && endAt && startAt >= endAt) {
      throw new ValidationError('`startAt` must be earlier than `endAt`');
    }
  }

  private async getReferenceRecord(
    event: Pick<CommunicationEvent, 'referenceId' | 'referenceType'>
  ): Promise<EmailTransaction | SmsTransaction | WhatsAppTransaction | PushNotification | null> {
    switch (event.referenceType) {
      case 'email':
        return this.getEmailTransaction(event.referenceId);
      case 'sms':
        return this.getSmsTransaction(event.referenceId);
      case 'whatsapp':
        return this.getWhatsAppTransaction(event.referenceId);
      case 'push':
        return this.getPushNotification(event.referenceId);
      default:
        return null;
    }
  }

  // --- Email Transactions ---

  async createEmailTransaction(data: CreateEmailTransaction, id = uuidv4()): Promise<EmailTransaction> {
    return this.adapter.create<EmailTransaction>({
      model: 'email_transactions',
      data: {
        ...data,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  async updateEmailTransaction(id: string, data: Partial<EmailTransaction>): Promise<EmailTransaction> {
    return this.adapter.update<EmailTransaction>({
      model: 'email_transactions',
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: {
        ...data,
        updatedAt: new Date(),
      }
    });
  }

  async claimStalePendingEmailTransaction(
    id: string,
    staleBefore: Date,
  ): Promise<EmailTransaction | null> {
    const claimed = await this.adapter.updateMany({
      model: 'email_transactions',
      where: [
        { field: 'id', operator: 'eq', value: id },
        { field: 'status', operator: 'eq', value: 'pending' },
        { field: 'updatedAt', operator: 'lte', value: staleBefore },
      ],
      data: { updatedAt: new Date() },
    });
    return claimed === 1 ? this.getEmailTransaction(id) : null;
  }

  async getEmailTransaction(id: string): Promise<EmailTransaction | null> {
    return this.adapter.findOne<EmailTransaction>({
      model: 'email_transactions',
      where: [{ field: 'id', operator: 'eq', value: id }]
    });
  }

  async findEmailTransactions(params: FindEmailParams): Promise<EmailTransaction[]> {
    const where: any[] = [];
    if (params.userId) where.push({ field: 'userId', operator: 'eq', value: params.userId });
    if (params.status) where.push({ field: 'status', operator: 'eq', value: params.status });
    if (params.providerMessageId) {
      where.push({ field: 'providerMessageId', operator: 'eq', value: params.providerMessageId });
    }

    return this.adapter.findMany<EmailTransaction>({
      model: 'email_transactions',
      where,
      limit: params.limit,
      offset: params.offset,
      orderBy: [{ field: 'createdAt', direction: 'desc' }]
    });
  }

  async getEmailTransactionByProviderMessageId(providerMessageId: string): Promise<EmailTransaction | null> {
    return this.adapter.findOne<EmailTransaction>({
      model: 'email_transactions',
      where: [{ field: 'providerMessageId', operator: 'eq', value: providerMessageId }]
    });
  }

  // --- SMS Transactions ---

  async createSmsTransaction(data: CreateSmsTransaction): Promise<SmsTransaction> {
    return this.adapter.create<SmsTransaction>({
      model: 'sms_transactions',
      data: {
        ...data,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  async updateSmsTransaction(id: string, data: Partial<SmsTransaction>): Promise<SmsTransaction> {
    return this.adapter.update<SmsTransaction>({
      model: 'sms_transactions',
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: {
        ...data,
        updatedAt: new Date(),
      }
    });
  }

  async getSmsTransaction(id: string): Promise<SmsTransaction | null> {
    return this.adapter.findOne<SmsTransaction>({
      model: 'sms_transactions',
      where: [{ field: 'id', operator: 'eq', value: id }]
    });
  }

  async findSmsTransactions(params: FindSmsParams): Promise<SmsTransaction[]> {
    const where: any[] = [];
    if (params.userId) where.push({ field: 'userId', operator: 'eq', value: params.userId });
    if (params.status) where.push({ field: 'status', operator: 'eq', value: params.status });

    return this.adapter.findMany<SmsTransaction>({
      model: 'sms_transactions',
      where,
      limit: params.limit,
      offset: params.offset,
      orderBy: [{ field: 'createdAt', direction: 'desc' }]
    });
  }

  // --- WhatsApp Transactions ---

  async createWhatsAppTransaction(data: CreateWhatsAppTransaction): Promise<WhatsAppTransaction> {
    return this.adapter.create<WhatsAppTransaction>({
      model: 'whatsapp_transactions',
      data: {
        ...data,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  async updateWhatsAppTransaction(id: string, data: Partial<WhatsAppTransaction>): Promise<WhatsAppTransaction> {
    return this.adapter.update<WhatsAppTransaction>({
      model: 'whatsapp_transactions',
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: {
        ...data,
        updatedAt: new Date(),
      }
    });
  }

  async getWhatsAppTransaction(id: string): Promise<WhatsAppTransaction | null> {
    return this.adapter.findOne<WhatsAppTransaction>({
      model: 'whatsapp_transactions',
      where: [{ field: 'id', operator: 'eq', value: id }]
    });
  }

  async findWhatsAppTransactions(params: FindWhatsAppParams): Promise<WhatsAppTransaction[]> {
    const where: any[] = [];
    if (params.userId) where.push({ field: 'userId', operator: 'eq', value: params.userId });
    if (params.status) where.push({ field: 'status', operator: 'eq', value: params.status });

    return this.adapter.findMany<WhatsAppTransaction>({
      model: 'whatsapp_transactions',
      where,
      limit: params.limit,
      offset: params.offset,
      orderBy: [{ field: 'createdAt', direction: 'desc' }]
    });
  }

  // --- Push Notifications ---

  async createPushNotification(data: CreatePushNotification): Promise<PushNotification> {
    return this.adapter.create<PushNotification>({
      model: 'push_notifications',
      data: {
        ...data,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  async updatePushNotification(id: string, data: Partial<PushNotification>): Promise<PushNotification> {
    return this.adapter.update<PushNotification>({
      model: 'push_notifications',
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: {
        ...data,
        updatedAt: new Date(),
      }
    });
  }

  async getPushNotification(id: string): Promise<PushNotification | null> {
    return this.adapter.findOne<PushNotification>({
      model: 'push_notifications',
      where: [{ field: 'id', operator: 'eq', value: id }]
    });
  }

  async findPushNotifications(params: FindPushParams): Promise<PushNotification[]> {
    const where: any[] = [];
    if (params.userId) where.push({ field: 'userId', operator: 'eq', value: params.userId });
    if (params.status) where.push({ field: 'status', operator: 'eq', value: params.status });

    return this.adapter.findMany<PushNotification>({
      model: 'push_notifications',
      where,
      limit: params.limit,
      offset: params.offset,
      orderBy: [{ field: 'createdAt', direction: 'desc' }]
    });
  }

  // --- Device Tokens ---

  async upsertDeviceToken(data: CreateDeviceToken): Promise<DeviceToken> {
    // Check if exists
    const existing = await this.adapter.findOne<DeviceToken>({
      model: 'device_tokens',
      where: [
        { field: 'userId', operator: 'eq', value: data.userId },
        { field: 'token', operator: 'eq', value: data.token },
        { field: 'platform', operator: 'eq', value: data.platform }
      ]
    });

    if (existing) {
      return this.adapter.update<DeviceToken>({
        model: 'device_tokens',
        where: [{ field: 'id', operator: 'eq', value: existing.id }],
        data: {
          ...data,
          isActive: true,
          updatedAt: new Date()
        }
      });
    }

    return this.adapter.create<DeviceToken>({
      model: 'device_tokens',
      data: {
        ...data,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  }

  async getDeviceTokensByUser(userId: string, platform?: Platform): Promise<DeviceToken[]> {
    const where: any[] = [
      { field: 'userId', operator: 'eq', value: userId },
      { field: 'isActive', operator: 'eq', value: true }
    ];

    if (platform) {
      where.push({ field: 'platform', operator: 'eq', value: platform });
    }

    return this.adapter.findMany<DeviceToken>({
      model: 'device_tokens',
      where
    });
  }

  async findDeviceTokens(params: {
    userId?: string;
    platform?: Platform;
    isActive?: boolean;
    olderThan?: Date;
  }): Promise<DeviceToken[]> {
    const where: any[] = [];

    if (params.userId) where.push({ field: 'userId', operator: 'eq', value: params.userId });
    if (params.platform) where.push({ field: 'platform', operator: 'eq', value: params.platform });
    if (params.isActive !== undefined) where.push({ field: 'isActive', operator: 'eq', value: params.isActive });
    if (params.olderThan) where.push({ field: 'lastUsedAt', operator: 'lt', value: params.olderThan });

    return this.adapter.findMany<DeviceToken>({
      model: 'device_tokens',
      where
    });
  }

  async deactivateDeviceToken(token: string): Promise<void> {
    // We need to find it first or update many
    const tokens = await this.adapter.findMany<DeviceToken>({
        model: 'device_tokens',
        where: [{ field: 'token', operator: 'eq', value: token }]
    });

    for (const t of tokens) {
        await this.adapter.update({
            model: 'device_tokens',
            where: [{ field: 'id', operator: 'eq', value: t.id }],
            data: { isActive: false, updatedAt: new Date() }
        });
    }
  }

  async deactivateDeviceTokenById(id: string): Promise<void> {
    await this.adapter.update({
      model: 'device_tokens',
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: { isActive: false, updatedAt: new Date() }
    });
  }

  async deleteDeviceToken(id: string): Promise<void> {
    await this.adapter.delete({
      model: 'device_tokens',
      where: [{ field: 'id', operator: 'eq', value: id }]
    });
  }

  // --- Suppression List ---

  async addToSuppressionList(data: CreateSuppression): Promise<SuppressionList> {
    const normalizedEmail = this.normalizeSuppressionEmail(data.email);
    const existing = await this.adapter.findOne<SuppressionList>({
        model: 'suppression_list',
        where: [{ field: 'email', operator: 'eq', value: normalizedEmail }]
    });

    if (existing) return existing;

    return this.adapter.create<SuppressionList>({
      model: 'suppression_list',
      data: {
        ...data,
        email: normalizedEmail,
        id: uuidv4(),
        createdAt: new Date(),
      }
    });
  }

  async isEmailSuppressed(email: string): Promise<boolean> {
    const entry = await this.getSuppressionListEntry(email);
    return !!entry;
  }

  async getSuppressionListEntry(email: string): Promise<SuppressionList | null> {
    return this.adapter.findOne<SuppressionList>({
      model: 'suppression_list',
      where: [{ field: 'email', operator: 'eq', value: this.normalizeSuppressionEmail(email) }]
    });
  }

  async removeFromSuppressionList(email: string): Promise<void> {
    const entry = await this.getSuppressionListEntry(email);
    if (entry) {
        await this.adapter.delete({
            model: 'suppression_list',
            where: [{ field: 'id', operator: 'eq', value: entry.id }]
        });
    }
  }

  async findSuppressionList(params: FindSuppressionParams): Promise<SuppressionList[]> {
    const where: any[] = [];
    if (params.reason) where.push({ field: 'reason', operator: 'eq', value: params.reason });

    return this.adapter.findMany<SuppressionList>({
      model: 'suppression_list',
      where,
      limit: params.limit,
      offset: params.offset,
      orderBy: [{ field: 'email', direction: 'asc' }]
    });
  }

  // --- Events ---

  async recordEvent(data: CreateEvent): Promise<CommunicationEvent> {
    return this.adapter.create<CommunicationEvent>({
      model: 'communication_events',
      data: {
        ...data,
        id: uuidv4(),
        createdAt: new Date(),
      }
    });
  }

  async getEventsByReference(
    referenceId: string,
    referenceType: 'email' | 'push' | 'sms' | 'whatsapp'
  ): Promise<CommunicationEvent[]> {
    return this.adapter.findMany<CommunicationEvent>({
      model: 'communication_events',
      where: [
        { field: 'referenceId', operator: 'eq', value: referenceId },
        { field: 'referenceType', operator: 'eq', value: referenceType }
      ],
      orderBy: [{ field: 'eventTimestamp', direction: 'asc' }]
    });
  }

  async findEvents(params: FindEventParams): Promise<CommunicationEvent[]> {
    this.validateEventWindow(params.startAt, params.endAt);
    const limit = this.resolveEventQueryLimit(params.limit);
    const offset = this.resolveOffset(params.offset) ?? 0;
    const requiresReferenceFiltering = Boolean(params.providerMessageId || params.userId);

    const where: any[] = [];
    if (params.referenceId) where.push({ field: 'referenceId', operator: 'eq', value: params.referenceId });
    if (params.referenceType) where.push({ field: 'referenceType', operator: 'eq', value: params.referenceType });
    if (params.eventType) where.push({ field: 'eventType', operator: 'eq', value: params.eventType });
    if (params.provider) where.push({ field: 'provider', operator: 'eq', value: params.provider });
    if (params.startAt) where.push({ field: 'eventTimestamp', operator: 'gte', value: params.startAt });
    if (params.endAt) where.push({ field: 'eventTimestamp', operator: 'lt', value: params.endAt });
    if (params.providerMessageId && params.referenceType === 'push') {
      return [];
    }

    const events = await this.adapter.findMany<CommunicationEvent>({
      model: 'communication_events',
      where,
      limit: requiresReferenceFiltering ? undefined : limit,
      offset: requiresReferenceFiltering ? undefined : offset,
      orderBy: [{ field: 'eventTimestamp', direction: 'asc' }]
    });

    if (!requiresReferenceFiltering) {
      return events;
    }

    const referenceCache = new Map<string, EmailTransaction | SmsTransaction | PushNotification | null>();

    const resolveReference = async (
      event: CommunicationEvent
    ): Promise<EmailTransaction | SmsTransaction | PushNotification | null> => {
      const cacheKey = `${event.referenceType}:${event.referenceId}`;
      if (!referenceCache.has(cacheKey)) {
        referenceCache.set(cacheKey, await this.getReferenceRecord(event));
      }

      return referenceCache.get(cacheKey) ?? null;
    };

    const filtered: CommunicationEvent[] = [];
    for (const event of events) {
      const reference = await resolveReference(event);
      if (!reference) {
        continue;
      }

      if (params.providerMessageId) {
        if (!('providerMessageId' in reference) || reference.providerMessageId !== params.providerMessageId) {
          continue;
        }
      }

      if (params.userId) {
        const recipientUserIds = Array.isArray(reference.metadata?.recipientUserIds)
          ? reference.metadata.recipientUserIds.filter((value): value is string => typeof value === 'string')
          : [];
        if (!('userId' in reference) || (reference.userId !== params.userId && !recipientUserIds.includes(params.userId))) {
          continue;
        }
      }

      filtered.push(event);
    }

    return filtered.slice(offset, offset + limit);
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    const adapter = this.adapter as Adapter & { $disconnect?: () => Promise<void> };
    if (typeof adapter.close === 'function') {
      await adapter.close();
      return;
    }
    if (typeof adapter.$disconnect === 'function') {
      await adapter.$disconnect();
    }
  }
}
