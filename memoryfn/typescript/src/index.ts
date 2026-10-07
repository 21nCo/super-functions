import { MemoryFnConfig, validateMemoryPolicies } from './core/config';
import { MemoryFn } from './core/pipeline';
import { StorageAdapter } from './storage/adapter';
import { MemoryStorageAdapter } from './storage/memory/adapter';
import { PostgresAdapter } from './storage/pg/adapter';
import { OpenAIEmbedder } from './providers/embed/openai';
import { OpenAILLM } from './providers/llm/openai';
import { Embedder, LLMProvider } from './providers/types';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './storage/pg/schema';

// Simple factory for now
export function memoryfn(config: MemoryFnConfig): MemoryFn {
  validateMemoryPolicies(config);
  let storage: StorageAdapter;
  let embedder: Embedder | undefined;
  let llm: LLMProvider | undefined;

  const expectedStorageDimensions = config.storage.adapter?.embeddingDimensions
    ?? (config.storage.kind === 'pg' ? 1536 : undefined);
  if (config.embedder && expectedStorageDimensions !== undefined &&
      (config.embedder.dims ?? expectedStorageDimensions) !== expectedStorageDimensions) {
    throw new Error(`MEMORY_EMBEDDING_DIMENSION_MISMATCH: expected ${expectedStorageDimensions}`);
  }

  if (config.embedder && config.embedder.provider !== 'openai') {
    throw new Error(`MEMORY_EMBEDDER_UNSUPPORTED: ${config.embedder.provider}`);
  }

  if (config.llm && config.llm.provider !== 'openai') {
    throw new Error(`MEMORY_LLM_UNSUPPORTED: ${config.llm.provider}`);
  }

  // Init Storage
  if (config.storage.adapter) {
    storage = config.storage.adapter;
  } else if (config.storage.kind === 'pg') {
    if (config.storage.connection) {
      throw new Error('Inject a PostgresAdapter through storage.adapter; connections are caller-owned');
    }
    if (!config.storage.url) {
      throw new Error('Postgres connection URL is required for kind: pg');
    }
    const client = postgres(config.storage.url);
    const db = drizzle(client, { schema });
    storage = new PostgresAdapter(db, async () => { await client.end(); });
  } else if (config.storage.kind === 'memory') {
      storage = new MemoryStorageAdapter();
  } else if (config.storage.kind === 'sqlite') {
      throw new Error('SQLite requires an explicit storage.adapter; use kind: memory for process-local storage');
  } else {
      throw new Error(`Storage kind ${config.storage.kind} not yet supported`);
  }

  const storageDimensions = storage.embeddingDimensions;

  // Init Embedder
  if (config.embedder?.provider === 'openai') {
      if (!config.embedder.apiKey) {
          throw new Error('OpenAI API key required for embedder');
      }
      embedder = new OpenAIEmbedder({
          apiKey: config.embedder.apiKey,
          model: config.embedder.model,
          dims: config.embedder.dims ?? storageDimensions,
          batchSize: config.embedder.batchSize,
      });
  }

  // Init LLM
  if (config.llm?.provider === 'openai') {
      if (!config.llm.apiKey) {
          throw new Error('OpenAI API key required for LLM');
      }
      llm = new OpenAILLM({
          apiKey: config.llm.apiKey,
          model: config.llm.model,
          temperature: config.llm.temperature,
          maxTokens: config.llm.maxTokens
      });
  }

  return new MemoryFn(config, storage, embedder, llm);
}

export * from './core/types';
export * from './core/config';
export * from './core/pipeline';
export * from './providers/types';
export * from './storage/adapter';
export * from './storage/memory/adapter';
export { PostgresAdapter } from './storage/pg/adapter';
