/**
 * @superfunctions/db - Shared database adapter system
 */

// Core factory
export { createAdapterFactory } from './adapter/factory.js';

// Types
export type {
  Adapter,
  TransactionAdapter,
  AdapterFactoryConfig,
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
  KVStoreAdapter,
  KVStoreAdapterFactory,
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
