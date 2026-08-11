/**
 * In-memory adapter for testing
 */

import { createAdapterFactory } from '../../adapter/factory.js';
import { NotFoundError } from '../../adapter/errors.js';
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
  InternalCrud,
  InternalColumnDef,
} from '../../adapter/types.js';

export interface MemoryAdapterConfig {
  namespace?: {
    enabled: boolean;
    separator?: string;
    prefix?: string;
  };
  debug?: boolean;
}

type MemoryInternalSnapshot = {
  store: Map<string, Map<string, Record<string, unknown>>>;
  ensuredTables: Set<string>;
};

type MemoryInternalCrudState = {
  crud: InternalCrud;
  snapshot(): MemoryInternalSnapshot;
  restore(snapshot: MemoryInternalSnapshot): void;
};

function createMemoryInternalCrud(): MemoryInternalCrudState {
  const internalStore = new Map<string, Map<string, Record<string, unknown>>>();
  const ensuredTables = new Set<string>();
  const TABLE_NAME_RE = /^__datafn_[a-z0-9_]+$/;

  function matchesInternalWhere(
    record: Record<string, unknown>,
    where: Array<{ field: string; op: string; value: unknown }>,
  ): boolean {
    return where.every((w) => {
      const val = record[w.field];
      switch (w.op) {
        case 'eq': return val === w.value;
        case 'ne': return val !== w.value;
        case 'in':
          return Array.isArray(w.value) && w.value.includes(val);
        case 'gt': return (val as number) > (w.value as number);
        case 'gte': return (val as number) >= (w.value as number);
        case 'lt': return (val as number) < (w.value as number);
        case 'lte': return (val as number) <= (w.value as number);
        default: throw new Error(`Unsupported internal CRUD operator: ${w.op}`);
      }
    });
  }

  const crud: InternalCrud = {
    async ensureTable(name: string, _columns: InternalColumnDef[]): Promise<void> {
      if (!TABLE_NAME_RE.test(name)) {
        throw new Error(`ensureTable: table name must start with "__datafn_": "${name}"`);
      }
      if (ensuredTables.has(name)) return;
      if (!internalStore.has(name)) {
        internalStore.set(name, new Map());
      }
      ensuredTables.add(name);
    },

    async create(
      table: string,
      data: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      if (!internalStore.has(table)) {
        internalStore.set(table, new Map());
      }
      const store = internalStore.get(table)!;
      const id = (data.id as string) ?? Math.random().toString(36).substr(2, 9);
      const record = { ...data, id };
      store.set(id, record);
      return record;
    },

    async findOne(
      table: string,
      where: Array<{ field: string; op: string; value: unknown }>,
    ): Promise<Record<string, unknown> | null> {
      const store = internalStore.get(table);
      if (!store) return null;
      for (const record of store.values()) {
        if (matchesInternalWhere(record, where)) return { ...record };
      }
      return null;
    },

    async findMany(
      table: string,
      where: Array<{ field: string; op: string; value: unknown }>,
      opts?: { orderBy?: string; limit?: number },
    ): Promise<Record<string, unknown>[]> {
      const store = internalStore.get(table);
      if (!store) return [];
      let results = Array.from(store.values()).filter((r) => matchesInternalWhere(r, where));
      if (opts?.orderBy) {
        const desc = opts.orderBy.startsWith('-');
        const field = desc ? opts.orderBy.slice(1) : opts.orderBy;
        results.sort((a, b) => {
          const av = a[field] as number;
          const bv = b[field] as number;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return desc ? -cmp : cmp;
        });
      }
      if (typeof opts?.limit === 'number') {
        results = results.slice(0, opts.limit);
      }
      return results.map((r) => ({ ...r }));
    },

    async update(
      table: string,
      where: Array<{ field: string; op: string; value: unknown }>,
      data: Record<string, unknown>,
    ): Promise<number> {
      const store = internalStore.get(table);
      if (!store) return 0;
      let count = 0;
      for (const [id, record] of store.entries()) {
        if (matchesInternalWhere(record, where)) {
          store.set(id, { ...record, ...data });
          count++;
        }
      }
      return count;
    },

    async delete(
      table: string,
      where: Array<{ field: string; op: string; value: unknown }>,
    ): Promise<number> {
      const store = internalStore.get(table);
      if (!store) return 0;
      let count = 0;
      for (const [id, record] of store.entries()) {
        if (matchesInternalWhere(record, where)) {
          store.delete(id);
          count++;
        }
      }
      return count;
    },

    /** EXE-018: Batch create for change-tracking performance */
    async createMany(
      table: string,
      data: Record<string, unknown>[],
    ): Promise<Record<string, unknown>[]> {
      if (!internalStore.has(table)) {
        internalStore.set(table, new Map());
      }
      const tableStore = internalStore.get(table)!;
      const results: Record<string, unknown>[] = [];
      for (const item of data) {
        const id = (item.id as string) ?? Math.random().toString(36).substr(2, 9);
        const record = { ...item, id };
        tableStore.set(id, record);
        results.push(record);
      }
      return results;
    },
  };

  return {
    crud,
    snapshot() {
      return {
        store: new Map(
          Array.from(internalStore, ([tableName, records]) => [
            tableName,
            new Map(Array.from(records, ([id, record]) => [id, structuredClone(record)])),
          ]),
        ),
        ensuredTables: new Set(ensuredTables),
      };
    },
    restore(snapshot) {
      internalStore.clear();
      for (const [tableName, records] of snapshot.store) {
        internalStore.set(
          tableName,
          new Map(Array.from(records, ([id, record]) => [id, structuredClone(record)])),
        );
      }
      ensuredTables.clear();
      for (const tableName of snapshot.ensuredTables) {
        ensuredTables.add(tableName);
      }
    },
  };
}

/**
 * In-memory adapter for testing
 */
export function memoryAdapter(config?: MemoryAdapterConfig): Adapter {
  let adapter!: Adapter;
  let operationTail = Promise.resolve();
  const internalCrudState = createMemoryInternalCrud();
  const enqueueOperation = <T>(operation: () => Promise<T>): Promise<T> => {
    let releaseOperation!: () => void;
    const previousOperation = operationTail;
    operationTail = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });

    return (async () => {
      await previousOperation;
      try {
        return await operation();
      } finally {
        releaseOperation();
      }
    })();
  };
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
          strictUpdateNotFound: true,
        },
        transactions: {
          supported: true,
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

      const cloneStore = () => new Map(
        Array.from(store, ([tableName, records]) => [
          tableName,
          new Map(Array.from(records, ([id, record]) => [id, structuredClone(record)])),
        ]),
      );

      const restoreStore = (
        storeSnapshot: Map<string, Map<string, any>>,
        schemaVersionsSnapshot: Map<string, number>,
      ) => {
        store.clear();
        for (const [tableName, records] of storeSnapshot) {
          store.set(
            tableName,
            new Map(Array.from(records, ([id, record]) => [id, structuredClone(record)])),
          );
        }
        schemaVersions.clear();
        for (const [namespace, version] of schemaVersionsSnapshot) {
          schemaVersions.set(namespace, version);
        }
      };

      return {
        async create<T>(params: CreateParams): Promise<T> {
          const tableName = context.getModelName(params.model);

          if (!store.has(tableName)) {
            store.set(tableName, new Map());
          }

          const table = store.get(tableName)!;
          const id = params.data.id || Math.random().toString(36).substr(2, 9);

          // Enforce uniqueness: create must fail if record with this ID already exists
          if (table.has(id)) {
            throw new Error(`UNIQUE constraint failed: record with id "${id}" already exists in ${tableName}`);
          }

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
          callback: (trx: TransactionAdapter) => Promise<R>
        ): Promise<R> {
          const storeSnapshot = cloneStore();
          const schemaVersionsSnapshot = new Map(schemaVersions);
          const internalSnapshot = internalCrudState.snapshot();
          let rolledBack = false;
          const transactionAdapter = Object.assign(
            Object.fromEntries(
              Object.entries(adapter).filter(([key]) => key !== 'transaction' && key !== 'close'),
            ),
            {
              async commit() {},
              async rollback() {
                restoreStore(storeSnapshot, schemaVersionsSnapshot);
                internalCrudState.restore(internalSnapshot);
                rolledBack = true;
              },
            },
          ) as unknown as TransactionAdapter;

          try {
            return await callback(transactionAdapter);
          } catch (error) {
            if (!rolledBack) {
              restoreStore(storeSnapshot, schemaVersionsSnapshot);
              internalCrudState.restore(internalSnapshot);
            }
            throw error;
          }
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

  adapter = Object.assign(factory({}), { internal: internalCrudState.crud });
  const queuedAdapterMethods = new Map(
    Reflect.ownKeys(adapter).map((property) => [property, Reflect.get(adapter, property)])
  );

  const transactionAwareInternal = new Proxy(internalCrudState.crud, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => enqueueOperation(() => Promise.resolve(Reflect.apply(value, target, args)));
    },
  });

  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === 'internal') return transactionAwareInternal;

      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      if (value !== queuedAdapterMethods.get(property)) {
        return value.bind(target);
      }
      return (...args: unknown[]) => enqueueOperation(() => Promise.resolve(Reflect.apply(value, target, args)));
    },
  });
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
