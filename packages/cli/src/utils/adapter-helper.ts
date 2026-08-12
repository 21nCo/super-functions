/**
 * Helper to create adapters from CLI config for database operations
 */

import type { Adapter } from '@superfunctions/db';
import type { SuperfunctionsConfig } from '../index.js';

export interface AdapterConnection {
  adapter: Adapter;
  dialect: 'postgres' | 'mysql' | 'sqlite';
  rawConnection: any;
  close: () => Promise<void>;
}

/**
 * Create an adapter instance from config
 * This connects to the actual database for introspection and migrations
 */
export async function createAdapterFromConfig(
  config: SuperfunctionsConfig
): Promise<AdapterConnection> {
  const adapterType = config.adapter?.type;

  if (!adapterType) {
    throw new Error('adapter.type is required in config');
  }

  switch (adapterType) {
    case 'drizzle':
      return await createDrizzleAdapter(config);
    case 'prisma':
      return await createPrismaAdapter(config);
    case 'kysely':
      return await createKyselyAdapter(config);
    default:
      throw new Error(`Unsupported adapter type: ${adapterType}`);
  }
}

async function createDrizzleAdapter(
  config: SuperfunctionsConfig
): Promise<AdapterConnection> {
  // Import drizzle dynamically
  const drizzleConfig = config.adapter?.drizzle;
  if (!drizzleConfig) {
    throw new Error('adapter.drizzle config is required for Drizzle adapter');
  }

  const dialect = drizzleConfig.dialect;
  if (!dialect) {
    throw new Error('adapter.drizzle.dialect is required');
  }

  let db: any;
  let pool: any;

  // Connect based on dialect
  try {
    if (dialect === 'postgres') {
      const pg = await import('pg');
      pool = new pg.Pool({
        connectionString: drizzleConfig.connectionString,
        ...drizzleConfig.poolConfig,
      });

      const { drizzle } = await import('drizzle-orm/node-postgres');
      db = drizzle(pool);
    } else if (dialect === 'mysql') {
      const mysql = await import('mysql2/promise');
      pool = (mysql as any).createPool({
        uri: drizzleConfig.connectionString,
        ...drizzleConfig.poolConfig,
      });

      const { drizzle } = await import('drizzle-orm/mysql2');
      db = drizzle(pool);
    } else if (dialect === 'sqlite') {
      const Database = await import('better-sqlite3');
      const sqlite = new ((Database as any).default || (Database as any))(drizzleConfig.filename ?? ':memory:');

      const { drizzle } = await import('drizzle-orm/better-sqlite3');
      db = drizzle(sqlite);
      pool = sqlite;
    } else {
      throw new Error(`Unsupported Drizzle dialect: ${dialect}`);
    }
  } catch (e: any) {
    if (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Required dependencies not found for Drizzle ${dialect}. Install: npm install ${dialect === 'postgres' ? 'pg' : dialect === 'mysql' ? 'mysql2' : 'better-sqlite3'}`);
    }
    throw e;
  }

  // Import adapter factory
  const { drizzleAdapter } = await import('@superfunctions/db/adapters/drizzle');

  const adapter = drizzleAdapter({
    db,
    dialect,
    schemaVersionsTable: drizzleConfig.schemaVersionsTable,
  });

  return {
    adapter,
    dialect,
    rawConnection: dialect === 'sqlite' ? pool : pool,
    close: async () => {
      if (dialect === 'sqlite') {
        pool.close();
      } else {
        await pool.end();
      }
    },
  };
}

async function createPrismaAdapter(
  config: SuperfunctionsConfig
): Promise<AdapterConnection> {
  const prismaConfig = config.adapter?.prisma;
  if (!prismaConfig) {
    throw new Error('adapter.prisma config is required for Prisma adapter');
  }

  // User must provide their PrismaClient
  if (!prismaConfig.prisma) {
    throw new Error(
      'adapter.prisma.prisma (PrismaClient instance) is required. Import and instantiate it in your config.'
    );
  }

  const { prismaAdapter } = await import('@superfunctions/db/adapters');

  const adapter = prismaAdapter({
    prisma: prismaConfig.prisma,
    modelMap: prismaConfig.modelMap ?? {},
    schemaVersionsTable: prismaConfig.schemaVersionsTable,
  });

  // Determine dialect from datasource
  const datasourceUrl = process.env.DATABASE_URL ?? '';
  let dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres';
  if (datasourceUrl.startsWith('mysql:')) {
    dialect = 'mysql';
  } else if (datasourceUrl.startsWith('file:') || datasourceUrl.includes('sqlite')) {
    dialect = 'sqlite';
  }

  return {
    adapter,
    dialect,
    rawConnection: prismaConfig.prisma,
    close: async () => {
      await prismaConfig.prisma.$disconnect();
    },
  };
}

async function createKyselyAdapter(
  config: SuperfunctionsConfig
): Promise<AdapterConnection> {
  const kyselyConfig = config.adapter?.kysely;
  if (!kyselyConfig) {
    throw new Error('adapter.kysely config is required for Kysely adapter');
  }

  const dialect = kyselyConfig.dialect;
  if (!dialect) {
    throw new Error('adapter.kysely.dialect is required');
  }

  // Import Kysely dynamically
  let Kysely: any;
  try {
    const kyselyModule = await import('kysely');
    Kysely = kyselyModule.Kysely;
  } catch {
    throw new Error('kysely is required as a peer dependency for Kysely adapter');
  }

  let db: any;
  let pool: any;

  try {
    if (dialect === 'postgres') {
      const kyselyModule = await import('kysely');
      const pg = await import('pg');
      pool = new pg.Pool({
        connectionString: kyselyConfig.connectionString,
        ...kyselyConfig.poolConfig,
      });

      db = new Kysely({
        dialect: new kyselyModule.PostgresDialect({ pool }),
      });
    } else if (dialect === 'mysql') {
      const kyselyModule = await import('kysely');
      const mysql = await import('mysql2');
      pool = (mysql as any).createPool({
        uri: kyselyConfig.connectionString,
        ...kyselyConfig.poolConfig,
      });

      db = new Kysely({
        dialect: new kyselyModule.MysqlDialect({ pool }),
      });
    } else if (dialect === 'sqlite') {
      const kyselyModule = await import('kysely');
      const Database = await import('better-sqlite3');
      const sqlite = new ((Database as any).default || (Database as any))(kyselyConfig.filename ?? ':memory:');

      db = new Kysely({
        dialect: new kyselyModule.SqliteDialect({ database: sqlite }),
      });
      pool = sqlite;
    } else {
      throw new Error(`Unsupported Kysely dialect: ${dialect}`);
    }
  } catch (e: any) {
    if (e.code === 'MODULE_NOT_FOUND' || e.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Required dependencies not found for Kysely ${dialect}. Install: npm install kysely ${dialect === 'postgres' ? 'pg' : dialect === 'mysql' ? 'mysql2' : 'better-sqlite3'}`);
    }
    throw e;
  }

  const { kyselyAdapter } = await import('@superfunctions/db/adapters');

  const adapter = kyselyAdapter({
    db,
    dialect,
    schema: {}, // Empty schema map for CLI use
    schemaVersionsTable: kyselyConfig.schemaVersionsTable ?? '_superfunctions_schema_versions',
  });

  return {
    adapter,
    dialect,
    rawConnection: pool,
    close: async () => {
      if (dialect === 'sqlite') {
        pool.close();
      } else {
        await pool.end();
      }
    },
  };
}

/**
 * Get raw database connection for introspection
 */
export function getRawConnection(connection: AdapterConnection): any {
  return connection.rawConnection;
}
