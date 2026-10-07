import { Adapter, WhereClause } from "@superfunctions/db";
import {
  createChatCacheKey,
  createCompletionCacheKey,
  createEmbeddingCacheKey,
  createRetrieverCacheKey
} from "../utils/cache-keys.js";

export interface ResponseCacheOptions {
  ttl?: number;
  namespace?: string;
  keyPrefix?: string;
  now?: () => number;
}

export class ResponseCache {
  private tableName = "langfn_cache";
  private readonly ttl: number;
  private readonly namespace?: string;
  private readonly keyPrefix: string;
  private readonly now: () => number;

  constructor(
    private readonly db: Adapter,
    ttlOrOptions: number | ResponseCacheOptions = 3600
  ) {
    const options = typeof ttlOrOptions === "number" ? { ttl: ttlOrOptions } : ttlOrOptions;
    this.ttl = options.ttl ?? 3600;
    this.namespace = options.namespace;
    this.keyPrefix = options.keyPrefix ?? "langfn";
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  async buildCompletionKey(
    prompt: string,
    model: string,
    provider: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const key = await createCompletionCacheKey({ provider, model, prompt, metadata, namespace: this.namespace });
    return `${this.keyPrefix}:${key}`;
  }

  async buildChatKey(
    messages: unknown[],
    model: string,
    provider: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const key = await createChatCacheKey({ provider, model, messages, metadata, namespace: this.namespace });
    return `${this.keyPrefix}:${key}`;
  }

  async buildEmbeddingKey(
    inputs: string[],
    model: string,
    provider: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const key = await createEmbeddingCacheKey({ provider, model, inputs, metadata, namespace: this.namespace });
    return `${this.keyPrefix}:${key}`;
  }

  async buildRetrieverKey(
    query: string,
    options: {
      provider?: string;
      model?: string;
      filter?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<string> {
    const key = await createRetrieverCacheKey({
      provider: options.provider,
      model: options.model,
      query,
      namespace: this.namespace,
      filter: options.filter,
      options: options.metadata
    });
    return `${this.keyPrefix}:${key}`;
  }

  async get(prompt: string, model: string, provider: string, metadata?: Record<string, any>): Promise<any | null> {
    const key = await this.buildCompletionKey(prompt, model, provider, metadata);
    const where = this.whereForKey(key);
    const record = await this.db.findOne<any>({
      model: this.tableName,
      where,
      namespace: this.namespace,
    });

    if (!record) return null;

    const expiresAt = Number(record.expiresAt ?? record.expires_at ?? 0);
    if (expiresAt < this.now()) {
      await this.db.delete({ model: this.tableName, where, namespace: this.namespace });
      return null;
    }

    return record.value;
  }

  async set(prompt: string, model: string, provider: string, value: any, metadata?: Record<string, any>): Promise<void> {
    const key = await this.buildCompletionKey(prompt, model, provider, metadata);
    const timestamp = this.now();
    const expiresAt = timestamp + this.ttl;
    const data = {
      key,
      value,
      expiresAt,
      createdAt: timestamp,
      namespace: this.namespace
    };

    await this.db.upsert({
      model: this.tableName,
      where: this.whereForKey(key),
      create: data,
      update: data,
      namespace: this.namespace,
    });
  }

  private whereForKey(key: string): WhereClause[] {
    const where: WhereClause[] = [{ field: "key", operator: "eq", value: key }];
    if (this.namespace !== undefined) {
      where.push({ field: "namespace", operator: "eq", value: this.namespace });
    }
    return where;
  }
}
