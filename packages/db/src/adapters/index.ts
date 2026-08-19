/**
 * Built-in adapters
 */

// Memory adapter (for testing)
export { memoryAdapter } from './memory/index.js';
export type { MemoryAdapterConfig } from './memory/index.js';
export {
  createMemoryAtomicKVStore,
  createMemoryIndexedDirectoryStore,
  createMemoryRuntimeStores,
} from './memory/stores.js';

// Cloudflare KV adapter
export { cloudflareKVStore, createCloudflareKVStore } from './cloudflare-kv/index.js';
export type { CloudflareKVNamespace, CloudflareKVStoreOptions } from './cloudflare-kv/index.js';

// Cloudflare Durable Object stores
export {
  cloudflareDurableObjectAtomicKVStore,
  cloudflareDurableObjectIndexedDirectoryStore,
  createCloudflareDurableObjectAtomicKVStore,
  createCloudflareDurableObjectIndexedDirectoryStore,
  cloudflareDurableObjectStoreProvisioningPlan,
  SuperfunctionsStoresDurableObject,
} from './cloudflare-do/index.js';
export type {
  CloudflareDurableObjectNamespace,
  CloudflareDurableObjectStub,
  CloudflareDurableObjectStoreOptions,
  DurableObjectStateLike,
} from './cloudflare-do/index.js';

// Redis/Valkey stores
export {
  redisAtomicKVStore,
  redisIndexedDirectoryStore,
  createRedisAtomicKVStore,
  createRedisIndexedDirectoryStore,
  redisStoreProvisioningPlan,
} from './redis/index.js';
export type { RedisCommandClient, RedisStoreOptions } from './redis/index.js';

// DynamoDB stores
export {
  dynamoDbAtomicKVStore,
  dynamoDbIndexedDirectoryStore,
  createDynamoDbAtomicKVStore,
  createDynamoDbIndexedDirectoryStore,
  dynamoDbSingleTableDefinition,
  dynamoDbStoreProvisioningPlan,
} from './dynamodb/index.js';
export type { DynamoDbSingleTableDefinition, DynamoDbStoreOptions } from './dynamodb/index.js';

// Drizzle adapter
export { drizzleAdapter } from './drizzle/index.js';
export type { DrizzleAdapterConfig, DrizzleDialect } from './drizzle/index.js';

// Prisma adapter
export { prismaAdapter } from './prisma/index.js';
export type { PrismaAdapterConfig } from './prisma/index.js';

// Kysely adapter
export { kyselyAdapter } from './kysely/index.js';
export type { KyselyAdapterConfig, KyselyDialect } from './kysely/index.js';
