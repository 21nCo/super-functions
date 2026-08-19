/**
 * @superfunctions/db - Shared database adapter system
 */

// Core factory
export { createAdapterFactory } from './adapter/factory.js';

// Row-level namespace isolation
export { wrapWithRowLevelNamespace, NamespaceRequiredError } from './adapter/row-level-namespace.js';
export { instrumentAdapter, instrumentKVStore } from './observability.js';
export type {
  AdapterInstrumentationOptions,
  KVStoreInstrumentationOptions,
} from './observability.js';

// Types
export type {
  Adapter,
  TransactionAdapter,
  AdapterFactoryConfig,
  RowLevelNamespaceConfig,
  AdapterFactoryOptions,
  AdapterContext,
  HealthStatus,
  CreateParams,
  FindOneParams,
  FindManyParams,
  UpdateParams,
  DeleteParams,
  CreateManyParams,
  UpdateManyParams,
  DeleteManyParams,
  UpsertParams,
  CountParams,
  WhereClause,
  OrderBy,
  JoinConfig,
  TableSchema,
  FieldSchema,
  IndexSchema,
  ConstraintSchema,
  TableSchemaMap,
  ValidationResult,
  CreateSchemaParams,
  SchemaCreation,
  TransactionIsolation,
  LibraryOptions,
  Logger,
  AdapterImplementation,
  AdapterSchemaInput,
  DateFieldStorageType,
  DateFieldValueType,
  KVStoreAdapter,
  KVStoreAdapterFactory,
  ConditionalKVSetResult,
  ConditionalKVStoreAdapter,
  ConditionalKVStoreAdapterFactory,
  AtomicKVStoreAdapter,
  AtomicKVStoreAdapterFactory,
  IndexedDirectoryRecord,
  IndexedDirectoryQuery,
  IndexedDirectoryQueryResult,
  IndexedDirectoryStoreAdapter,
  IndexedDirectoryStoreAdapterFactory,
  StoreProvisioningProvider,
  StoreProvisioningResource,
  StoreProvisioningPlan,
  ProvisionableStoreAdapter,
  AtomicStoreAdapter,
  AtomicStoreAdapterFactory,
  RuntimeStores,
  RedisAdapter,
  RedisAdapterFactory,
  InternalCrud,
  InternalColumnDef,
} from './adapter/types.js';

// Capabilities
export { DEFAULT_CAPABILITIES, mergeCapabilities } from './adapter/capabilities.js';
export type { AdapterCapabilities } from './adapter/capabilities.js';

// Errors
export {
  AdapterError,
  AdapterErrorCode,
  ConnectionError,
  ConstraintViolationError,
  NotFoundError,
  DuplicateKeyError,
  QueryFailedError,
  TransactionError,
  SchemaValidationError,
  OperationNotSupportedError,
} from './adapter/errors.js';
export type { AdapterErrorOptions } from './adapter/errors.js';

// Utils
export {
  NamespaceManager,
  createDefaultNamespaceManager,
  createNamespaceManager,
} from './utils/namespace.js';
export type { NamespaceConfig } from './utils/namespace.js';

// Schema Management
export { SchemaTracker, createSchemaTracker } from './migrations/schema-tracker.js';
export type { SchemaVersion } from './migrations/schema-tracker.js';
export { validateRecordAgainstSchema } from './migrations/runtime-validation.js';
export {
  normalizeAdapterSchema,
  transformRecordForRuntime,
  transformRecordForStorage,
  transformWhereForStorage,
  wrapWithSchema,
} from './adapter/schema-codecs.js';
