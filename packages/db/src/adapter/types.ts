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

  /** Raw CRUD for internal tables, bypasses ORM schema resolution */
  readonly internal: InternalCrud;
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
  /** Explicit ON CONFLICT target column(s). When set, overrides columns derived from `where`. */
  conflictTarget?: string | string[];
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

export type DateFieldValueType = 'date' | 'iso-string' | 'epoch-ms';

export type DateFieldStorageType =
  | 'timestamp'
  | 'timestamptz'
  | 'iso-text'
  | 'epoch-ms-integer'
  | 'epoch-ms-bigint';

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'bigint';
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  /**
   * Runtime value shape expected by the library for `date`/`datetime` fields.
   * Defaults to `date` for legacy `type: "date"` schemas.
   */
  dateValueType?: DateFieldValueType;
  /**
   * Physical value shape used by the adapter/storage layer.
   * Defaults are derived from `dateValueType`.
   */
  dateStorageType?: DateFieldStorageType;
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

export type AdapterSchemaInput =
  | TableSchemaMap
  | TableSchema[]
  | {
      schemas: TableSchema[];
    };

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

export interface RowLevelNamespaceConfig {
  /** Enable row-level namespace filtering. Default: false. */
  enabled: boolean;
  /** Column name for the discriminator. Default: "__ns". */
  columnName?: string;
  /** Whether namespace is mandatory on every CRUD call. Default: true. */
  mandatory?: boolean;
}

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

  // Row-level namespace isolation
  rowLevelNamespace?: RowLevelNamespaceConfig;

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

// ============================================================================
// Internal CRUD Types (bypasses ORM schema resolution)
// ============================================================================

export interface InternalColumnDef {
  name: string;
  type: 'text' | 'integer';
  primaryKey?: boolean;
}

export type InternalCrudOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in';

export interface InternalWhereClause {
  field: string;
  op: InternalCrudOperator;
  value: unknown;
}

export interface InternalCrud {
  /** Ensure an internal table exists (CREATE TABLE IF NOT EXISTS) */
  ensureTable(name: string, columns: InternalColumnDef[]): Promise<void>;

  /** Create a record in an internal table */
  create(
    table: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /** Find one record in an internal table */
  findOne(
    table: string,
    where: InternalWhereClause[],
  ): Promise<Record<string, unknown> | null>;

  /** Find many records in an internal table */
  findMany(
    table: string,
    where: InternalWhereClause[],
    opts?: { orderBy?: string; limit?: number },
  ): Promise<Record<string, unknown>[]>;

  /** Update records matching where clause */
  update(
    table: string,
    where: InternalWhereClause[],
    data: Record<string, unknown>,
  ): Promise<number>;

  /** Delete records matching where clause */
  delete(
    table: string,
    where: InternalWhereClause[],
  ): Promise<number>;

  /** EXE-018: Optional batch create for change-tracking performance */
  createMany?(
    table: string,
    data: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]>;
}

// ============================================================================
// KV Store Adapter (for middleware/caching use cases)
// ============================================================================

export interface KVStoreAdapter {
  get(key: string): Promise<string | null>;
  set(input: { key: string; value: string; ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  incr?(input: { key: string; by?: number; ttlSeconds?: number }): Promise<{ value: number }>;
}

export interface KVStoreAdapterFactory<TConfig = unknown> {
  (config: TConfig): KVStoreAdapter;
}

export interface ConditionalKVSetResult {
  inserted: boolean;
  existing?: string;
}

/** KV store with atomic conditional writes for ownership and directory claims. */
export interface ConditionalKVStoreAdapter extends KVStoreAdapter {
  setIfAbsent(input: {
    key: string;
    value: string;
    ttlSeconds?: number;
  }): Promise<ConditionalKVSetResult>;
  compareAndSet?(input: {
    key: string;
    expected: string | null;
    value: string;
    ttlSeconds?: number;
  }): Promise<{ updated: boolean; existing?: string }>;
}

export interface ConditionalKVStoreAdapterFactory<TConfig = unknown> {
  (config: TConfig): ConditionalKVStoreAdapter;
}

/** Atomic KV store with conditional writes and counters. */
export interface AtomicKVStoreAdapter extends ConditionalKVStoreAdapter {
  incr(input: { key: string; by?: number; ttlSeconds?: number }): Promise<{ value: number }>;
  isHealthy?(): Promise<boolean>;
  close?(): Promise<void>;
}

export interface AtomicKVStoreAdapterFactory<TConfig = unknown> {
  (config: TConfig): AtomicKVStoreAdapter;
}

export interface IndexedDirectoryRecord {
  key: string;
  value: string;
  indexes?: Record<string, string | readonly string[] | null | undefined>;
  ttlSeconds?: number;
}

export interface IndexedDirectoryQuery {
  index: string;
  value: string;
  limit?: number;
  cursor?: string;
}

export interface IndexedDirectoryQueryResult {
  records: IndexedDirectoryRecord[];
  cursor?: string;
}

/** Directory store with adapter-owned secondary indexes for global lookup tables. */
export interface IndexedDirectoryStoreAdapter {
  get(key: string): Promise<IndexedDirectoryRecord | null>;
  put(record: IndexedDirectoryRecord): Promise<void>;
  putIfAbsent(record: IndexedDirectoryRecord): Promise<{
    inserted: boolean;
    existing?: IndexedDirectoryRecord;
  }>;
  update(record: IndexedDirectoryRecord): Promise<IndexedDirectoryRecord>;
  delete(key: string): Promise<void>;
  query(input: IndexedDirectoryQuery): Promise<IndexedDirectoryQueryResult>;
}

export interface IndexedDirectoryStoreAdapterFactory<TConfig = unknown> {
  (config: TConfig): IndexedDirectoryStoreAdapter;
}

export type StoreProvisioningProvider =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'dynamodb'
  | 'cloudflare-do'
  | 'redis'
  | 'memory'
  | (string & {});

export interface StoreProvisioningResource {
  type: string;
  name: string;
  [key: string]: unknown;
}

export interface StoreProvisioningPlan {
  id?: string;
  provider: StoreProvisioningProvider;
  resources: StoreProvisioningResource[];
  notes?: string[];
}

export interface ProvisionableStoreAdapter {
  getProvisioningPlan?(): StoreProvisioningPlan | StoreProvisioningPlan[];
}

// ============================================================================
// Runtime Stores
// ============================================================================

export interface AtomicStoreAdapter extends KVStoreAdapter {
  incr(input: { key: string; by?: number; ttlSeconds?: number }): Promise<{ value: number }>;
  isHealthy?(): Promise<boolean>;
  close?(): Promise<void>;
}

export interface RuntimeStores {
  kv?: KVStoreAdapter;
  atomicKv?: AtomicKVStoreAdapter;
  directory?: IndexedDirectoryStoreAdapter;
}

export interface AtomicStoreAdapterFactory<TConfig = unknown> {
  (config: TConfig): AtomicStoreAdapter;
}

// ============================================================================
// Redis Adapter (for atomic operations, caching, rate limiting)
// ============================================================================

/**
 * Redis adapter interface supporting atomic operations.
 * Compatible with Redis, Valkey, and other Redis-compatible implementations.
 */
export interface RedisAdapter {
  /** Atomic increment operation - returns new value */
  incr(key: string, by?: number): Promise<number>;

  /** Get current value */
  get(key: string): Promise<string | null>;

  /** Set value with optional TTL */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /** Delete key */
  del(key: string): Promise<void>;

  /** Check if adapter is healthy */
  isHealthy(): Promise<boolean>;

  /** Close connection */
  close(): Promise<void>;
}

export interface RedisAdapterFactory<TConfig = unknown> {
  (config: TConfig): RedisAdapter;
}
