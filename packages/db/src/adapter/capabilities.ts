/**
 * Capability system for adapter feature detection
 */

import type { TransactionIsolation } from './types.js';

export interface AdapterCapabilities {
  // Supported data types
  types: {
    json: boolean;
    dates: boolean;
    booleans: boolean;
    bigint: boolean;
    uuid: boolean;
    enum: boolean;
  };

  // Supported operations
  operations: {
    batch: boolean; // createMany, updateMany, deleteMany
    upsert: boolean; // Upsert operation
    streaming: boolean; // Stream large datasets
    fulltext: boolean; // Full-text search
    returning: boolean; // RETURNING clause support
  };

  // Transaction support
  transactions: {
    supported: boolean;
    nested: boolean; // Savepoints
    isolation?: TransactionIsolation[];
  };

  // Performance characteristics
  performance: {
    maxBatchSize?: number;
    supportsJoins: boolean;
    supportsPreparedStatements: boolean;
  };

  // Schema capabilities
  schema: {
    migrations: boolean;
    constraints: boolean;
    indexes: boolean;
  };

  // Advanced features
  advanced: {
    customIdGeneration: boolean;
    numericIds: boolean;
    schemaNamespaces: boolean;
    customTypes: boolean;
  };
}

/**
 * Default capabilities - conservative defaults that work everywhere
 */
export const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  types: {
    json: false,
    dates: true,
    booleans: true,
    bigint: false,
    uuid: false,
    enum: false,
  },
  operations: {
    batch: false,
    upsert: false,
    streaming: false,
    fulltext: false,
    returning: false,
  },
  transactions: {
    supported: false,
    nested: false,
  },
  performance: {
    supportsJoins: false,
    supportsPreparedStatements: false,
  },
  schema: {
    migrations: false,
    constraints: false,
    indexes: false,
  },
  advanced: {
    customIdGeneration: false,
    numericIds: false,
    schemaNamespaces: false,
    customTypes: false,
  },
};

/**
 * Merge partial capabilities with defaults
 */
export function mergeCapabilities(
  partial: Partial<AdapterCapabilities>
): AdapterCapabilities {
  return {
    types: { ...DEFAULT_CAPABILITIES.types, ...partial.types },
    operations: { ...DEFAULT_CAPABILITIES.operations, ...partial.operations },
    transactions: { ...DEFAULT_CAPABILITIES.transactions, ...partial.transactions },
    performance: { ...DEFAULT_CAPABILITIES.performance, ...partial.performance },
    schema: { ...DEFAULT_CAPABILITIES.schema, ...partial.schema },
    advanced: { ...DEFAULT_CAPABILITIES.advanced, ...partial.advanced },
  };
}
