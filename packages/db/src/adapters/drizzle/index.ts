/**
 * Drizzle adapter
 *
 * Generic adapter that maps the Superfunctions Adapter interface to Drizzle ORM.
 * Reads schema from Drizzle's internal registry (db._.fullSchema).
 * Consumers must pass schema to drizzle() constructor.
 */

import type {
  Adapter,
  AdapterImplementation,
  AdapterFactoryOptions,
  CreateParams,
  CreateManyParams,
  FindOneParams,
  FindManyParams,
  UpdateParams,
  UpdateManyParams,
  DeleteParams,
  DeleteManyParams,
  UpsertParams,
  CountParams,
  WhereClause,
  OrderBy,
} from '../../adapter/types.js';
import { createAdapterFactory } from '../../adapter/factory.js';
import { OperationNotSupportedError } from '../../adapter/errors.js';

// Import Drizzle helpers loosely to avoid strict peer typing
// eslint-disable-next-line @typescript-eslint/no-var-requires
// These are type-unsafe on purpose to avoid hard binding to a specific driver.
// Drizzle exports these from 'drizzle-orm'.
// We fall back to minimal shims if not present at runtime.
let drizzleOps: any = {};
try {
  // dynamic import to keep peer dep optional
  // @ts-ignore
  drizzleOps = await import('drizzle-orm');
} catch {
  // no-op: will throw if used without drizzle installed
}

export type DrizzleDialect = 'postgres' | 'mysql' | 'sqlite';

export interface DrizzleAdapterConfig {
  db: any; // Drizzle database instance
  dialect: DrizzleDialect;
  // Upsert conflict targets by model. If string[], will be used as composite key.
  upsertKeys?: Record<string, string | string[]>;
  // Optional Drizzle table for schema version tracking; if omitted, schema version methods will be no-ops.
  schemaVersionsTable?: any;
  namespace?: AdapterFactoryOptions['config']['namespace'];
  debug?: boolean;
}

/**
 * Escape SQL LIKE wildcards to prevent SQL injection
 * Escapes % and _ characters that have special meaning in LIKE patterns
 */
function escapeLikeWildcards(value: string): string {
  return value.replace(/[%_]/g, '\\$&');
}

function buildWhere(tbl: any, where: WhereClause[] | undefined) {
  if (!where || where.length === 0) return undefined;
  const { and, or, not, eq, ne, gt, gte, lt, lte, inArray, sql } = drizzleOps;
  const parts = where.map((clause) => {
    const col = tbl[clause.field];
    const op = clause.operator;
    const val = clause.value as any;

    switch (op) {
      case 'eq':
        return eq(col, val);
      case 'ne':
        return ne(col, val);
      case 'gt':
        return gt(col, val);
      case 'gte':
        return gte(col, val);
      case 'lt':
        return lt(col, val);
      case 'lte':
        return lte(col, val);
      case 'in':
        return inArray(col, Array.isArray(val) ? val : [val]);
      case 'not_in':
        return not(inArray(col, Array.isArray(val) ? val : [val]));
      case 'contains':
        return sql`${col} LIKE ${'%' + escapeLikeWildcards(String(val)) + '%'}`;
      case 'starts_with':
        return sql`${col} LIKE ${escapeLikeWildcards(String(val)) + '%'}`;
      case 'ends_with':
        return sql`${col} LIKE ${'%' + escapeLikeWildcards(String(val))}`;
      default:
        throw new Error(`Unsupported operator: ${op}`);
    }
  });

  // Combine using connectors (default AND)
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  let combined: any = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const connector = where[i]?.connector ?? 'AND';
    combined = connector === 'OR' ? or(combined, parts[i]) : and(combined, parts[i]);
  }
  return combined;
}

function buildOrder(tbl: any, orderBy: OrderBy[] | undefined) {
  if (!orderBy || orderBy.length === 0) return undefined;
  const { asc, desc } = drizzleOps;
  return orderBy.map((o) => {
    const col = tbl[o.field];
    return o.direction === 'desc' ? desc(col) : asc(col);
  });
}

export function drizzleAdapter(config: DrizzleAdapterConfig): Adapter {
  if (!config?.db) throw new Error('drizzleAdapter: config.db is required');
  if (!drizzleOps?.eq) throw new Error('drizzle-orm is required as a peerDependency to use drizzleAdapter');

  const createImpl = (ctx: any): AdapterImplementation => {
    const { db, dialect, schemaVersionsTable } = config;

    const resolveTable = (model: string) => {
      // Read schema from Drizzle's internal registry
      const schema = db._.fullSchema;

      if (!schema) {
        throw new Error(
          'drizzleAdapter: No schema found in Drizzle instance.\n' +
          'You must pass schema to drizzle() constructor: drizzle(client, { schema })\n' +
          'Run "superfunctions generate-schema" to generate schema file'
        );
      }

      const modelName = ctx.getModelName(model);
      const tbl = schema[modelName];

      if (!tbl) {
        throw new Error(
          `Drizzle adapter: no table mapping for model "${model}" (resolved to "${modelName}").\n` +
          `Available tables: ${Object.keys(schema).join(', ')}\n` +
          `Did you forget to include this library's schema when calling drizzle()?`
        );
      }

      return tbl;
    };

    return {
      async create<T = any>({ model, data, select }: CreateParams): Promise<T> {
        const tbl = resolveTable(model);
        const q = db.insert(tbl).values(data as any);
        if (dialect === 'mysql') {
          await q.execute();
          // MySQL has no returning; fetch the inserted row if selection present
          if (select && select.length > 0) {
            const where = Object.keys(data as any)
              .filter((k) => k in tbl)
              .slice(0, 1)
              .map((k) => ({ field: k, operator: 'eq' as const, value: (data as any)[k] }));
            const row = await this.findOne<T>({ model, where, select });
            return row as T;
          }
          return data as T;
        } else {
          const returning = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
          const res = await (returning ? q.returning(returning as any) : q.returning()).execute();
          return (res?.[0] ?? (data as any)) as T;
        }
      },

      async createMany<T = any>({ model, data }: CreateManyParams): Promise<T[]> {
        const tbl = resolveTable(model);
        const q = db.insert(tbl).values(data as any[]);
        if (dialect === 'mysql') {
          await q.execute();
          return data as T[]; // no returning
        } else {
          const res = await q.returning().execute();
          return (res ?? data) as T[];
        }
      },

      async findOne<T = any>({ model, where, select }: FindOneParams): Promise<T | null> {
        const tbl = resolveTable(model);
        const selection = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
        const q = db.select(selection as any).from(tbl);
        const cond = buildWhere(tbl, where);
        const rows = await q.where(cond).limit(1).execute();
        return rows?.[0] ?? null;
      },

      async findMany<T = any>({ model, where, select, orderBy, limit, offset }: FindManyParams): Promise<T[]> {
        const tbl = resolveTable(model);
        const selection = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
        let q = db.select(selection as any).from(tbl);
        const cond = buildWhere(tbl, where);
        if (cond) q = q.where(cond) as any;
        const order = buildOrder(tbl, orderBy);
        if (order && order.length > 0) q = q.orderBy(...order) as any;
        if (typeof limit === 'number') q = q.limit(limit) as any;
        if (typeof offset === 'number') q = q.offset(offset) as any;
        const rows = await q.execute();
        return rows as T[];
      },

      async update<T = any>({ model, where, data, select }: UpdateParams): Promise<T> {
        const tbl = resolveTable(model);
        const cond = buildWhere(tbl, where);
        const q = db.update(tbl).set(data as any).where(cond);
        if (dialect === 'mysql') {
          await q.execute();
          const row = await this.findOne<T>({ model, where, select });
          if (!row) throw new Error('Update affected zero rows');
          return row;
        } else {
          const returning = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
          const res = await (returning ? q.returning(returning as any) : q.returning()).execute();
          return (Array.isArray(res) ? res[0] : (res as any)) as T;
        }
      },

      async updateMany({ model, where, data }: UpdateManyParams): Promise<number> {
        const tbl = resolveTable(model);
        const cond = buildWhere(tbl, where);
        const q = db.update(tbl).set(data as any).where(cond);
        const result = await q.execute();
        // drizzle returns driver-dependent result; for better-sqlite3 it's { changes: N, lastInsertRowid: X }
        const n = (result as any)?.changes ?? (result as any)?.rowsAffected ?? (result as any)?.rowCount ?? 0;
        return typeof n === 'number' ? n : 0;
      },

      async delete({ model, where }: DeleteParams): Promise<void> {
        const tbl = resolveTable(model);
        const cond = buildWhere(tbl, where);
        const q = db.delete(tbl).where(cond);
        if (dialect === 'mysql') {
          // MySQL no returning; attempt to fetch first then delete
          const existing = await this.findOne({ model, where });
          await db.delete(tbl).where(cond).execute();
          return existing ?? null;
        } else {
          const res = await q.execute();
          void res; // ignore value; delete returns void
        }
      },

      async deleteMany({ model, where }: DeleteManyParams): Promise<number> {
        const tbl = resolveTable(model);
        const cond = buildWhere(tbl, where);
        const res = await db.delete(tbl).where(cond).execute();
        const n = (res as any)?.changes ?? (res as any)?.rowsAffected ?? (res as any)?.rowCount ?? 0;
        return typeof n === 'number' ? n : 0;
      },

      async upsert<T = any>({ model, where, create, update, select }: UpsertParams): Promise<T> {
        const tbl = resolveTable(model);
        if (!where || where.length === 0) throw new Error('upsert requires a non-empty where clause targeting unique columns');

        // Determine conflict target
        let target: string | string[] | undefined = config.upsertKeys?.[model];
        if (!target) {
          // derive from where fields
          target = where.length === 1 ? where[0].field : where.map((w) => w.field);
        }

        if (config.dialect === 'mysql') {
          const q = db.insert(tbl).values(create as any).onDuplicateKeyUpdate({ set: update as any });
          if (select && select.length > 0) {
            await q.execute();
            // reselect
            const row = await this.findOne<T>({ model, where, select });
            if (!row) throw new Error('Upsert failed to return a row');
            return row;
          } else {
            await q.execute();
            return (create as any) as T;
          }
        } else {
          const keys = Array.isArray(target) ? target.map((k) => (tbl as any)[k]) : [(tbl as any)[target as string]];
          const returning = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
          const q = db
            .insert(tbl)
            .values(create as any)
            .onConflictDoUpdate({ target: keys as any, set: update as any });
          const res = await (returning ? q.returning(returning as any) : q.returning()).execute();
          return (Array.isArray(res) ? res[0] : (res as any)) as T;
        }
      },

      async count({ model, where }: CountParams): Promise<number> {
        const tbl = resolveTable(model);
        const { sql } = drizzleOps;
        const cond = buildWhere(tbl, where);
        const rows = await db
          .select({ value: sql<number>`count(*)`.as('value') })
          .from(tbl)
          .where(cond)
          .execute();
        const v = rows?.[0]?.value;
        return typeof v === 'number' ? v : Number(v ?? 0);
      },

      async transaction<R>(fn: (trx: any) => Promise<R>): Promise<R> {
        // Drizzle's transaction API varies by dialect
        // For async dialects (postgres, mysql): db.transaction returns Promise
        // For better-sqlite3: db.transaction must be synchronous
        if (dialect === 'sqlite') {
          // better-sqlite3 uses synchronous transactions
          // We need to wrap the async callback in a way that works with sync transactions
          let result: R;
          let error: any;

          try {
            // Execute the transaction synchronously
            // The callback fn is async, but we'll handle it specially
            const child = drizzleAdapter({ ...config, db });
            const txAdapter: any = {
              ...child,
              transaction: async () => {
                throw new OperationNotSupportedError('transaction', 'DrizzleAdapter (nested transaction)');
              },
              close: async () => { },
              commit: async () => { },
              rollback: async () => { },
            };

            // For SQLite, we execute the async function and wait for it
            // better-sqlite3 transactions are immediate mode by default
            // We use db.transaction() which provides ACID guarantees
            if (typeof db.transaction === 'function') {
              // Use better-sqlite3's transaction wrapper
              const syncResult = db.transaction(() => {
                // This is a hack: we can't await inside a sync function
                // So we'll execute the async function and store the promise
                const promise = fn(txAdapter);
                // For better-sqlite3, operations are synchronous anyway
                // The async wrapper is just for API compatibility
                return promise;
              })();

              // Wait for the promise to resolve
              result = await syncResult;
            } else {
              // Fallback if transaction method doesn't exist
              result = await fn(txAdapter);
            }
          } catch (err) {
            error = err;
          }

          if (error) throw error;
          return result!;
        } else {
          // Async transaction for postgres/mysql
          return await db.transaction(async (trx: any) => {
            const child = drizzleAdapter({ ...config, db: trx });
            const txAdapter: any = {
              ...child,
              transaction: async () => {
                throw new OperationNotSupportedError('transaction', 'DrizzleAdapter (nested transaction)');
              },
              close: async () => { },
              commit: async () => { },
              rollback: async () => { },
            };
            return await fn(txAdapter);
          });
        }
      },

      async initialize(): Promise<void> { return; },

      async isHealthy() {
        return { healthy: true, uptime: 0 };
      },

      async close(): Promise<void> { return; },

      async getSchemaVersion(namespace: string): Promise<number> {
        if (!schemaVersionsTable) return 0;
        const rows = await db
          .select({ version: (schemaVersionsTable as any).version })
          .from(schemaVersionsTable)
          .where(drizzleOps.eq((schemaVersionsTable as any).namespace, namespace))
          .limit(1)
          .execute();
        return rows?.[0]?.version ?? 0;
      },

      async setSchemaVersion(namespace: string, version: number): Promise<void> {
        if (!schemaVersionsTable) throw new OperationNotSupportedError('setSchemaVersion', 'DrizzleAdapter (schemaVersionsTable not configured)');
        // Try update, then insert
        const existing = await this.getSchemaVersion(namespace);
        const now = new Date().toISOString();
        if (existing === 0) {
          await db.insert(schemaVersionsTable).values({ namespace, version, appliedAt: now }).execute();
        } else {
          await db
            .update(schemaVersionsTable)
            .set({ version, appliedAt: now })
            .where(drizzleOps.eq((schemaVersionsTable as any).namespace, namespace))
            .execute();
        }
      },

      async validateSchema(): Promise<{ valid: boolean; errors?: string[] }> {
        // Drizzle is strongly typed; runtime validation is out-of-scope here
        return { valid: true };
      },
    };
  };

  const factory = createAdapterFactory({
    config: {
      adapterId: 'drizzle',
      adapterName: 'Drizzle Adapter',
      debug: config.debug ?? false,
      namespace: config.namespace,
      capabilities: {
        types: { json: true, dates: true, booleans: true, bigint: true, uuid: true, enum: true },
        operations: { batch: true, upsert: true, streaming: false, fulltext: false, returning: config.dialect !== 'mysql' },
        transactions: { supported: true, nested: false, isolation: undefined },
        performance: { supportsJoins: true, supportsPreparedStatements: true },
        schema: { migrations: false, constraints: true, indexes: true },
        advanced: { customIdGeneration: false, numericIds: true, schemaNamespaces: true, customTypes: true },
      },
    },
    adapter: createImpl,
  });

  // Return an adapter instance for default (no library-provided overrides)
  return factory({});
}
