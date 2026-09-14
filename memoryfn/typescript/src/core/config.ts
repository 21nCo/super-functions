import type { StorageAdapter } from '../storage/adapter';
import { AddMemoryInput, AddMemoryResult, SearchMemoryInput, SearchMemoryResult } from './types';

export interface MemoryFnConfig {
  storage: {
    kind: 'pg' | 'qdrant' | 'sqlite' | 'memory' | 'adapter';
    adapter?: StorageAdapter;
    url?: string;
    path?: string; // for sqlite
    dbAdapter?: 'drizzle' | 'prisma' | 'kysely';
    connection?: any; // generic connection options
    collectionName?: string;
    vectorDims?: number;
    pool?: {
      min?: number;
      max?: number;
      idleTimeoutMillis?: number;
    };
  };
  graph?: {
    kind: 'neo4j';
    url: string;
    username?: string;
    password?: string;
  };
  llm?: {
    provider: 'openai';
    model: string;
    apiKey?: string;
    temperature?: number;
    maxTokens?: number;
  };
  embedder?: {
    provider: 'openai';
    model: string;
    apiKey?: string;
    dims?: number;
    batchSize?: number;
  };
  reranker?: {
    provider: 'cohere' | 'hf';
    model: string;
    apiKey?: string;
  };
  observability?: {
    watchfn?: any; // Replace with actual WatchFn type
    traceAll?: boolean;
    logPrompts?: boolean;
    logResults?: boolean;
    metrics?: {
      enabled: boolean;
      trackCosts?: boolean;
      trackLatency?: boolean;
    };
    costTracking?: {
      llm?: Record<string, { input: number; output: number }>;
      embeddings?: Record<string, number>;
    };
  };
  policies?: {
    /** Redaction is not implemented; explicitly configured values are rejected. */
    redaction?: never;
    maxMemoriesPerContainer?: never;
    maxMemorySizeBytes?: never;
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  retry?: {
    maxRetries: number;
    backoff: 'exponential' | 'linear';
  };
  apiKey?: string; // For client/SDK usage
  baseUrl?: string; // For client/SDK usage
}

export interface IMemoryFn {
  add(input: AddMemoryInput): Promise<AddMemoryResult>;
  search(input: SearchMemoryInput): Promise<SearchMemoryResult>;
  // update, delete, getProfile, etc.
}

export function validateMemoryPolicies(config: MemoryFnConfig): void {
  if (config.policies?.redaction !== undefined) {
    throw new Error('MEMORY_REDACTION_UNSUPPORTED');
  }
  if (config.policies?.maxMemoriesPerContainer !== undefined || config.policies?.maxMemorySizeBytes !== undefined) {
    throw new Error('MEMORY_LIMITS_UNSUPPORTED');
  }
}
