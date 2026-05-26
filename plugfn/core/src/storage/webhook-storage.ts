import type { Adapter as DbAdapter } from '@superfunctions/db';
import {
  ensurePlugFnDatabaseAdapter,
  type PlugFnDatabaseStorageAdapter,
} from './adapters/database.js';

export interface WebhookRecord {
  id: string;
  provider: string;
  connectionId?: string;
  events: string[];
  webhookUrl: string;
  secret: string;
  status: 'active' | 'inactive';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Webhook storage interface
 */
export interface WebhookStorage {
  create(webhook: Omit<WebhookRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookRecord>;
  get(id: string): Promise<WebhookRecord | null>;
  list(provider?: string): Promise<WebhookRecord[]>;
  update(id: string, updates: Partial<WebhookRecord>): Promise<WebhookRecord>;
  delete(id: string): Promise<void>;
}

/**
 * Webhook storage implementation using adapter
 */
export class AdapterWebhookStorage implements WebhookStorage {
  private readonly adapter: PlugFnDatabaseStorageAdapter;

  constructor(adapter: DbAdapter | PlugFnDatabaseStorageAdapter) {
    this.adapter = ensurePlugFnDatabaseAdapter(adapter);
  }

  async create(webhook: Omit<WebhookRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookRecord> {
    const id = this.generateId();
    const now = new Date();
    
    const fullWebhook: WebhookRecord = {
      ...webhook,
      id,
      createdAt: now,
      updatedAt: now,
    };
    
    return this.adapter.createWebhook(fullWebhook);
  }

  async get(id: string): Promise<WebhookRecord | null> {
    return this.adapter.getWebhook(id);
  }

  async list(provider?: string): Promise<WebhookRecord[]> {
    return this.adapter.listWebhooks(provider);
  }

  async update(id: string, updates: Partial<WebhookRecord>): Promise<WebhookRecord> {
    await this.adapter.updateWebhook(id, {
      ...updates,
      updatedAt: new Date(),
    });
    
    const updated = await this.adapter.getWebhook(id);
    if (!updated) {
      throw new Error(`Webhook ${id} not found after update`);
    }
    
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.adapter.deleteWebhook(id);
  }

  private generateId(): string {
    return `hook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
