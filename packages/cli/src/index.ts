/**
 * @superfunctions/cli
 *
 * CLI tool for schema management and migrations
 */

// Re-export types from @superfunctions/db
export type {
  TableSchema,
  TableSchemaMap,
  FieldSchema,
  IndexSchema,
} from '@superfunctions/db';

// Config types
export interface SuperfunctionsConfig {
  adapter: AdapterConfig;
  migrationsDir?: string;

  // Array of file paths that contain library initializations
  // Example: ['./src/conduct.ts', './src/auth.ts']
  libraries?: string[];

  // Auto-discover library initialization files
  // true: Use default patterns
  // object: Custom patterns and exclusions
  autoDiscover?: boolean | {
    patterns: string[];
    exclude?: string[];
  };
}

export interface AdapterConfig {
  type: 'drizzle' | 'prisma' | 'kysely';  // TODO: Add 'mongodb' when MongoDBConfig is implemented
  drizzle?: DrizzleConfig;
  prisma?: PrismaConfig;
  kysely?: KyselyConfig;
}

export interface DrizzleConfig {
  dialect: 'postgres' | 'mysql' | 'sqlite';
  connectionString?: string;
  filename?: string;
  poolConfig?: any;
  schema?: Record<string, any>;
  schemaVersionsTable?: any;
}

export interface PrismaConfig {
  prisma: any;
  modelMap?: Record<string, string>;
  schemaVersionsTable?: string;
}

export interface KyselyConfig {
  dialect: 'postgres' | 'mysql' | 'sqlite';
  connectionString?: string;
  filename?: string;
  poolConfig?: any;
  schemaVersionsTable?: string;
}

export function defineConfig(config: SuperfunctionsConfig): SuperfunctionsConfig {
  return config;
}
