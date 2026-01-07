/**
 * In-memory adapter for testing
 */

import { createAdapterFactory } from '../../adapter/factory.js';
import { NotFoundError, OperationNotSupportedError } from '../../adapter/errors.js';
import type {
  Adapter,
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
  TransactionAdapter,
  TableSchema,
  ValidationResult,
  HealthStatus,
} from '../../adapter/types.js';

export interface MemoryAdapterConfig {
  namespace?: {
    enabled: boolean;
    separator?: string;
    prefix?: string;
  };
  debug?: boolean;
}

/**
 * In-memory adapter for testing
 */
export function memoryAdapter(config?: MemoryAdapterConfig): Adapter {
  const factory = createAdapterFactory({
    config: {
      adapterId: 'memory',
      adapterName: 'Memory Adapter',
      capabilities: {
        types: {
          json: true,
          dates: true,
          booleans: true,
          bigint: true,
          uuid: true,
          enum: true,
        },
        operations: {
          batch: true,
          upsert: true,
          streaming: false,
          fulltext: false,
          returning: true,
        },
        transactions: {
          supported: false, // Simple in-memory, no real transactions
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
          customIdGeneration: true,
          numericIds: true,
          schemaNamespaces: false,
          customTypes: false,
        },
      },
      customIdGenerator: () => Math.random().toString(36).substr(2, 9),
      namespace: config?.namespace,
      debug: config?.debug,
    },
    adapter: (context) => {
      // In-memory storage
      const store = new Map<string, Map<string, any>>();
      const schemaVersions = new Map<string, number>();
      const startTime = Date.now();

      return {
        async create<T>(params: CreateParams): Promise<T> {
          const tableName = context.getModelName(params.model);

          if (!store.has(tableName)) {
            store.set(tableName, new Map());
          }

          const table = store.get(tableName)!;
          const id = params.data.id || Math.random().toString(36).substr(2, 9);
          const record = { ...params.data, id } as Record<string, any>;

          table.set(id, record);

          if (params.select) {
            const selected: Record<string, any> = {};
            for (const field of params.select) {
              selected[field] = record[field];
            }
            return selected as T;
          }

          return record as T;
        },

        async findOne<T>(params: FindOneParams): Promise<T | null> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            return null;
          }

          for (const record of table.values()) {
            if (matchesWhere(record, params.where)) {
              if (params.select) {
                const selected: Record<string, any> = {};
                for (const field of params.select) {
                  selected[field] = (record as Record<string, any>)[field];
                }
                return selected as T;
              }
              return record as T;
            }
          }

          return null;
        },

        async findMany<T>(params: FindManyParams): Promise<T[]> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            return [];
          }

          let results = Array.from(table.values()).filter((record) =>
            matchesWhere(record, params.where)
          );

          // Apply ordering
          if (params.orderBy) {
            results = applyOrdering(results, params.orderBy);
          }

          // Apply pagination
          if (params.offset) {
            results = results.slice(params.offset);
          }
          if (params.limit) {
            results = results.slice(0, params.limit);
          }

          // Apply selection
          if (params.select) {
            results = results.map((record) => {
              const selected: any = {};
              for (const field of params.select!) {
                selected[field] = record[field];
              }
              return selected;
            });
          }

          return results as T[];
        },

        async update<T>(params: UpdateParams): Promise<T> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            throw new NotFoundError(params.model, params.where);
          }

          for (const [id, record] of table.entries()) {
            if (matchesWhere(record, params.where)) {
              const updated = { ...record, ...params.data };
              table.set(id, updated);

              if (params.select) {
                const selected: any = {};
                for (const field of params.select) {
                  selected[field] = updated[field];
                }
                return selected as T;
              }

              return updated as T;
            }
          }

          throw new NotFoundError(params.model, params.where);
        },

        async delete(params: DeleteParams): Promise<void> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            return;
          }

          for (const [id, record] of table.entries()) {
            if (matchesWhere(record, params.where)) {
              table.delete(id);
              return;
            }
          }
        },

        async createMany<T>(params: CreateManyParams): Promise<T[]> {
          const results: T[] = [];
          for (const data of params.data) {
            const result = await this.create<T>({
              model: params.model,
              data,
              select: params.select,
              namespace: params.namespace,
            });
            results.push(result);
          }
          return results;
        },

        async updateMany(params: UpdateManyParams): Promise<number> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            return 0;
          }

          let count = 0;
          for (const [id, record] of table.entries()) {
            if (matchesWhere(record, params.where)) {
              const updated = { ...record, ...params.data };
              table.set(id, updated);
              count++;
            }
          }

          return count;
        },

        async deleteMany(params: DeleteManyParams): Promise<number> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            return 0;
          }

          let count = 0;
          for (const [id, record] of table.entries()) {
            if (matchesWhere(record, params.where)) {
              table.delete(id);
              count++;
            }
          }

          return count;
        },

        async upsert<T>(params: UpsertParams): Promise<T> {
          try {
            const existing = await this.findOne({
              model: params.model,
              where: params.where,
              namespace: params.namespace,
            });

            if (existing) {
              return await this.update({
                model: params.model,
                where: params.where,
                data: params.update,
                select: params.select,
                namespace: params.namespace,
              });
            } else {
              return await this.create({
                model: params.model,
                data: params.create,
                select: params.select,
                namespace: params.namespace,
              });
            }
          } catch (error) {
            throw error;
          }
        },

        async count(params: CountParams): Promise<number> {
          const tableName = context.getModelName(params.model);
          const table = store.get(tableName);

          if (!table) {
            return 0;
          }

          if (!params.where) {
            return table.size;
          }

          let count = 0;
          for (const record of table.values()) {
            if (matchesWhere(record, params.where)) {
              count++;
            }
          }

          return count;
        },

        async transaction<R>(
          _callback: (trx: TransactionAdapter) => Promise<R>
        ): Promise<R> {
          throw new OperationNotSupportedError('transaction', 'Memory Adapter');
        },

        async initialize(): Promise<void> {
          // Nothing to initialize for in-memory adapter
        },

        async isHealthy(): Promise<HealthStatus> {
          return {
            healthy: true,
            uptime: Date.now() - startTime,
          };
        },

        async close(): Promise<void> {
          // Clear storage on close
          store.clear();
          schemaVersions.clear();
        },

        async getSchemaVersion(namespace: string): Promise<number> {
          return schemaVersions.get(namespace) ?? 0;
        },

        async setSchemaVersion(namespace: string, version: number): Promise<void> {
          schemaVersions.set(namespace, version);
        },

        async validateSchema(_schema: TableSchema): Promise<ValidationResult> {
          // Simple validation for memory adapter
          return { valid: true };
        },
      };
    },
  });

  return factory({});
}

/**
 * Check if a record matches where clauses
 */
function matchesWhere(record: any, where: WhereClause[]): boolean {
  if (!where || where.length === 0) {
    return true;
  }

  let hasOrClause = false;
  let orMatched = false;
  let andMatched = true;

  for (const clause of where) {
    const value = record[clause.field];
    const matches = matchesClause(value, clause);

    if (clause.connector === 'OR') {
      hasOrClause = true;
      if (matches) orMatched = true;
    } else {
      // Default AND - all AND clauses must match
      if (!matches) {
        andMatched = false;
      }
    }
  }

  // All AND clauses must match
  if (!andMatched) {
    return false;
  }

  // If we had OR clauses, at least one must have matched
  if (hasOrClause && !orMatched) {
    return false;
  }

  return true;
}

/**
 * Check if a value matches a single where clause
 */
function matchesClause(value: any, clause: WhereClause): boolean {
  switch (clause.operator) {
    case 'eq':
      return value === clause.value;
    case 'ne':
      return value !== clause.value;
    case 'gt':
      return value > clause.value;
    case 'gte':
      return value >= clause.value;
    case 'lt':
      return value < clause.value;
    case 'lte':
      return value <= clause.value;
    case 'in':
      return Array.isArray(clause.value) && clause.value.includes(value);
    case 'not_in':
      return Array.isArray(clause.value) && !clause.value.includes(value);
    case 'contains':
      return (
        typeof value === 'string' &&
        typeof clause.value === 'string' &&
        value.includes(clause.value)
      );
    case 'starts_with':
      return (
        typeof value === 'string' &&
        typeof clause.value === 'string' &&
        value.startsWith(clause.value)
      );
    case 'ends_with':
      return (
        typeof value === 'string' &&
        typeof clause.value === 'string' &&
        value.endsWith(clause.value)
      );
    default:
      return false;
  }
}

/**
 * Apply ordering to results
 */
function applyOrdering(results: any[], orderBy: OrderBy[]): any[] {
  return results.sort((a, b) => {
    for (const order of orderBy) {
      const aVal = a[order.field];
      const bVal = b[order.field];

      if (aVal < bVal) {
        return order.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return order.direction === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}
