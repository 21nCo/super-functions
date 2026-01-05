/**
 * Core type definitions for the adapter system
 */

import type { AdapterCapabilities } from './capabilities.js';

// ============================================================================
// Adapter Interface
// ============================================================================

export interface Adapter {
  // Metadata
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilities;

  // Core CRUD operations
  create<T = any>(params: CreateParams): Promise<T>;
  findOne<T = any>(params: FindOneParams): Promise<T | null>;
  findMany<T = any>(params: FindManyParams): Promise<T[]>;
  update<T = any>(params: UpdateParams): Promise<T>;
  delete(params: DeleteParams): Promise<void>;

  // Batch operations
  createMany<T = any>(params: CreateManyParams): Promise<T[]>;
  updateMany(params: UpdateManyParams): Promise<number>;
  deleteMany(params: DeleteManyParams): Promise<number>;

  // Advanced operations
  upsert<T = any>(params: UpsertParams): Promise<T>;
  count(params: CountParams): Promise<number>;

  // Transaction support
  transaction<R>(callback: (trx: TransactionAdapter) => Promise<R>): Promise<R>;

  // Lifecycle management
  initialize(): Promise<void>;
  isHealthy(): Promise<HealthStatus>;
  close(): Promise<void>;

  // Schema management
  getSchemaVersion(namespace: string): Promise<number>;
  setSchemaVersion(namespace: string, version: number): Promise<void>;
  validateSchema(schema: TableSchema): Promise<ValidationResult>;

  // Optional: Schema generation for CLI
  createSchema?(params: CreateSchemaParams): Promise<SchemaCreation>;
}

export interface TransactionAdapter extends Omit<Adapter, 'transaction' | 'close'> {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface HealthStatus {
  healthy: boolean;
  connections?: {
    active: number;
    idle: number;
    max: number;
  };
  lastError?: Error;
  uptime: number;
}

// ============================================================================
// Operation Parameters
// ============================================================================

export interface CreateParams {
  model: string; // Table name
  data: Record<string, any>; // Data to insert
  select?: string[]; // Fields to return
  namespace?: string; // Library namespace
}

export interface FindOneParams {
  model: string;
  where: WhereClause[];
  select?: string[];
  join?: JoinConfig;
  namespace?: string;
}

export interface FindManyParams extends FindOneParams {
  limit?: number;
  offset?: number;
  orderBy?: OrderBy[];
}

export interface UpdateParams {
  model: string;
  where: WhereClause[];
  data: Record<string, any>;
  select?: string[];
  namespace?: string;
}

export interface DeleteParams {
  model: string;
  where: WhereClause[];
  namespace?: string;
}

export interface CreateManyParams {
  model: string;
  data: Record<string, any>[];
  select?: string[];
  namespace?: string;
}

export interface UpdateManyParams {
  model: string;
  where: WhereClause[];
  data: Record<string, any>;
  namespace?: string;
}

export interface DeleteManyParams {
  model: string;
  where: WhereClause[];
  namespace?: string;
}

export interface UpsertParams {
  model: string;
  where: WhereClause[];
  create: Record<string, any>;
  update: Record<string, any>;
  select?: string[];
  namespace?: string;
}

export interface CountParams {
  model: string;
  where?: WhereClause[];
  namespace?: string;
}

// ============================================================================
// Query Building Types
// ============================================================================

export interface WhereClause {
  field: string;
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'not_in'
    | 'contains'
    | 'starts_with'
    | 'ends_with';
  value: any;
  connector?: 'AND' | 'OR';
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface JoinConfig {
  model: string;
  on: {
    field: string;
    foreignField: string;
  };
  type?: 'inner' | 'left' | 'right';
}

// ============================================================================
// Schema Types
// ============================================================================

export interface TableSchema {
  modelName: string;
  fields: Record<string, FieldSchema>;
  indexes?: IndexSchema[];
  constraints?: ConstraintSchema[];
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'bigint';
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  references?: {
    model: string;
    field: string;
    onDelete?: 'cascade' | 'set null' | 'restrict';
    onUpdate?: 'cascade' | 'set null' | 'restrict';
  };
  fieldName?: string; // Custom column name
}

export interface IndexSchema {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface ConstraintSchema {
  name: string;
  type: 'check' | 'unique' | 'foreign_key';
  fields: string[];
  check?: string; // SQL check expression
}

export type TableSchemaMap = Record<string, TableSchema>;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface CreateSchemaParams {
  schema: TableSchemaMap;
  namespace?: string;
}

export interface SchemaCreation {
  sql?: string;
  success: boolean;
  errors?: string[];
}

// ============================================================================
// Factory Types
// ============================================================================

export interface AdapterFactoryConfig {
  // Required
  adapterId: string;
  adapterName?: string;

  // Capabilities (optional, defaults provided)
  capabilities?: Partial<AdapterCapabilities>;

  // Type support
  supportsJSON?: boolean;
  supportsDates?: boolean;
  supportsBooleans?: boolean;
  supportsNumericIds?: boolean;

  // Naming conventions
  usePlural?: boolean;
  caseStyle?: 'snake_case' | 'camelCase' | 'PascalCase';

  // Namespace configuration
  namespace?: {
    enabled: boolean;
    separator?: string;
    prefix?: string;
    schemaSupport?: boolean;
  };

  // Transaction support
  transaction?:
    | boolean
    | {
        enabled: boolean;
        isolationLevel?: TransactionIsolation;
        timeout?: number;
      };

  // Key mapping (e.g., MongoDB _id)
  mapKeysInput?: Record<string, string>;
  mapKeysOutput?: Record<string, string>;

  // Custom ID generation
  customIdGenerator?: () => string | number;
  disableIdGeneration?: boolean;

  // Debug logging
  debug?:
    | boolean
    | {
        logQueries?: boolean;
        logResults?: boolean;
        logTransactions?: boolean;
      };

  // Performance tuning
  performance?: {
    maxBatchSize?: number;
    queryTimeout?: number;
    maxConnections?: number;
  };
}

export type TransactionIsolation =
  | 'read_uncommitted'
  | 'read_committed'
  | 'repeatable_read'
  | 'serializable';

// ============================================================================
// Library Integration Types
// ============================================================================

export interface LibraryOptions {
  namespace?: string;
  schema?: TableSchemaMap;
  validateSchema?: boolean;
  autoMigrate?: boolean;
}

export interface AdapterContext {
  // Configuration from library
  options: LibraryOptions;

  // Schema for this library's tables
  schema: TableSchemaMap;

  // Helper functions
  getModelName: (model: string) => string;
  getFieldName: (params: { model: string; field: string }) => string;
  getDefaultModelName: (model: string) => string;
  getDefaultFieldName: (params: { model: string; field: string }) => string;

  // Data transformers
  transformInput: (data: any, model: string, action: 'create' | 'update') => Promise<any>;
  transformOutput: (data: any, model: string) => Promise<any>;

  // Logging
  log: Logger;
}

export interface Logger {
  debug: (message: string, ...args: any[]) => void;
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
}

// ============================================================================
// Adapter Implementation Types
// ============================================================================

export interface AdapterImplementation {
  create<T = any>(params: CreateParams): Promise<T>;
  findOne<T = any>(params: FindOneParams): Promise<T | null>;
  findMany<T = any>(params: FindManyParams): Promise<T[]>;
  update<T = any>(params: UpdateParams): Promise<T>;
  delete(params: DeleteParams): Promise<void>;
  createMany<T = any>(params: CreateManyParams): Promise<T[]>;
  updateMany(params: UpdateManyParams): Promise<number>;
  deleteMany(params: DeleteManyParams): Promise<number>;
  upsert<T = any>(params: UpsertParams): Promise<T>;
  count(params: CountParams): Promise<number>;
  transaction<R>(callback: (trx: TransactionAdapter) => Promise<R>): Promise<R>;
  initialize(): Promise<void>;
  isHealthy(): Promise<HealthStatus>;
  close(): Promise<void>;
  getSchemaVersion(namespace: string): Promise<number>;
  setSchemaVersion(namespace: string, version: number): Promise<void>;
  validateSchema(schema: TableSchema): Promise<ValidationResult>;
  createSchema?(params: CreateSchemaParams): Promise<SchemaCreation>;
}

export interface AdapterFactoryOptions {
  config: AdapterFactoryConfig;
  adapter: (context: AdapterContext) => AdapterImplementation;
}
