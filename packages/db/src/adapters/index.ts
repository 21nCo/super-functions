/**
 * Built-in adapters
 */

// Memory adapter (for testing)
export { memoryAdapter } from './memory/index.js';
export type { MemoryAdapterConfig } from './memory/index.js';

// Drizzle adapter
export { drizzleAdapter } from './drizzle/index.js';
export type { DrizzleAdapterConfig, DrizzleDialect } from './drizzle/index.js';

// Prisma adapter
export { prismaAdapter } from './prisma/index.js';
export type { PrismaAdapterConfig } from './prisma/index.js';

// Kysely adapter
export { kyselyAdapter } from './kysely/index.js';
export type { KyselyAdapterConfig, KyselyDialect } from './kysely/index.js';
