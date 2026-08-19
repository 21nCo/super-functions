/**
 * Drizzle adapter
 *
 * Generic adapter that maps the Superfunctions Adapter interface to Drizzle ORM.
 * Reads schema from Drizzle's internal registry (db._.fullSchema).
 * Consumers must pass schema to drizzle() constructor.
 */

import * as drizzleOrm from 'drizzle-orm';
import type {
  Adapter,
  AdapterSchemaInput,
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
import { NotFoundError, OperationNotSupportedError } from '../../adapter/errors.js';
import { createDrizzleInternalCrud } from './internal.js';
import { normalizeAdapterSchema } from '../../adapter/schema-codecs.js';

export type DrizzleDialect = 'postgres' | 'mysql' | 'sqlite';

export interface DrizzleAdapterConfig {
  db: any; // Drizzle database instance
  dialect: DrizzleDialect;
  // Upsert conflict targets by model. If string[], will be used as composite key.
  upsertKeys?: Record<string, string | string[]>;
  // Optional Drizzle table for schema version tracking; if omitted, schema version methods will be no-ops.
  schemaVersionsTable?: any;
  /**
   * @deprecated Function authors should wrap incoming adapters with
   * `wrapWithSchema(adapter, getSchema(...))` inside their create/init function.
   * This option remains for compatibility and app-level direct adapter usage.
   */
  adapterSchema?: AdapterSchemaInput;
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

function loadDrizzleOps(): typeof import('drizzle-orm') {
  return drizzleOrm;
}

function buildWhere(
  drizzleOps: typeof import('drizzle-orm'),
  tbl: any,
  where: WhereClause[] | undefined,
) {
  if (!where || where.length === 0) return undefined;
  const { and, or, not, eq, ne, gt, gte, lt, lte, inArray, isNull, isNotNull, sql } = drizzleOps;
  const parts = where.map((clause) => {
    const col = tbl[clause.field];
    const op = clause.operator;
    const val = clause.value as any;

    switch (op) {
      case 'eq':
        if (val === null) {
          return isNull(col);
        }
        return eq(col, val);
      case 'ne':
        if (val === null) {
          return isNotNull(col);
        }
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

function buildOrder(
  drizzleOps: typeof import('drizzle-orm'),
  tbl: any,
  orderBy: OrderBy[] | undefined,
) {
  if (!orderBy || orderBy.length === 0) return undefined;
  const { asc, desc } = drizzleOps;
  return orderBy.map((o) => {
    const col = tbl[o.field];
    return o.direction === 'desc' ? desc(col) : asc(col);
  });
}

export function drizzleAdapter(config: DrizzleAdapterConfig): Adapter {
  if (!config?.db) throw new Error('drizzleAdapter: config.db is required');
  const drizzleOps = loadDrizzleOps();

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
            // Use the id field (primary key) for re-selection
            const id = (data as any)['id'];
            if (!id) {
              throw new Error(
                'Drizzle adapter: MySQL create with select requires "id" field in data for re-selection. ' +
                'Ensure the id is generated before calling create().'
              );
            }
            const where = [{ field: 'id', operator: 'eq' as const, value: id }];
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
        const cond = buildWhere(drizzleOps, tbl, where);
        const rows = await q.where(cond).limit(1).execute();
        return rows?.[0] ?? null;
      },

      async findMany<T = any>({ model, where, select, orderBy, limit, offset }: FindManyParams): Promise<T[]> {
        const tbl = resolveTable(model);
        const selection = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
        let q = db.select(selection as any).from(tbl);
        const cond = buildWhere(drizzleOps, tbl, where);
        if (cond) q = q.where(cond) as any;
        const order = buildOrder(drizzleOps, tbl, orderBy);
        if (order && order.length > 0) q = q.orderBy(...order) as any;
        if (typeof limit === 'number') q = q.limit(limit) as any;
        if (typeof offset === 'number') q = q.offset(offset) as any;
        const rows = await q.execute();
        return rows as T[];
      },

      async update<T = any>({ model, where, data, select }: UpdateParams): Promise<T> {
        const tbl = resolveTable(model);
        const cond = buildWhere(drizzleOps, tbl, where);
        const q = db.update(tbl).set(data as any).where(cond);
        if (dialect === 'mysql') {
          await q.execute();
          const row = await this.findOne<T>({ model, where, select });
          if (!row) throw new NotFoundError(model, where);
          return row;
        } else {
          const returning = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
          const res = await (returning ? q.returning(returning as any) : q.returning()).execute();
          const row = Array.isArray(res) ? res[0] : (res as any);
          if (!row) throw new NotFoundError(model, where);
          return row as T;
        }
      },

      async updateMany({ model, where, data }: UpdateManyParams): Promise<number> {
        const tbl = resolveTable(model);
        const cond = buildWhere(drizzleOps, tbl, where);
        const q = db.update(tbl).set(data as any).where(cond);
        const result = await q.execute();
        // drizzle returns driver-dependent result; for better-sqlite3 it's { changes: N, lastInsertRowid: X }
        const n = (result as any)?.changes ?? (result as any)?.rowsAffected ?? (result as any)?.rowCount ?? 0;
        return typeof n === 'number' ? n : 0;
      },

      async delete({ model, where }: DeleteParams): Promise<void> {
        const tbl = resolveTable(model);
        const cond = buildWhere(drizzleOps, tbl, where);
        await db.delete(tbl).where(cond).execute();
      },

      async deleteMany({ model, where }: DeleteManyParams): Promise<number> {
        const tbl = resolveTable(model);
        const cond = buildWhere(drizzleOps, tbl, where);
        const res = await db.delete(tbl).where(cond).execute();
        const n = (res as any)?.changes ?? (res as any)?.rowsAffected ?? (res as any)?.rowCount ?? 0;
        return typeof n === 'number' ? n : 0;
      },

      async upsert<T = any>({ model, where, create, update, select, conflictTarget }: UpsertParams): Promise<T> {
        const tbl = resolveTable(model);
        if (!where || where.length === 0) throw new Error('upsert requires a non-empty where clause targeting unique columns');

        // Determine conflict target: explicit param > config > derived from where
        let target: string | string[] | undefined =
          conflictTarget ?? config.upsertKeys?.[model];
        if (!target) {
          // derive from where fields
          target = where.length === 1 ? where[0].field : where.map((w) => w.field);
        }

        const hasUpdate = update && Object.keys(update).length > 0;
        const targetFields = Array.isArray(target) ? target : [target];
        const stableWhere = targetFields
          .map((field) => {
            const fromCreate = (create as any)[field];
            if (fromCreate !== undefined) {
              return { field, operator: 'eq' as const, value: fromCreate };
            }

            const fromWhere = where.find((clause) => clause.field === field && clause.operator === 'eq');
            return fromWhere
              ? { field, operator: 'eq' as const, value: fromWhere.value }
              : null;
          })
          .filter((clause): clause is { field: string; operator: 'eq'; value: unknown } => clause !== null);
        const reselectWhere = stableWhere.length === targetFields.length ? stableWhere : where;

        if (config.dialect === 'mysql') {
          const insertQuery = db.insert(tbl).values(create as any);

          try {
            if (hasUpdate) {
              await insertQuery.onDuplicateKeyUpdate({ set: update as any }).execute();
            } else {
              await insertQuery.execute();
            }
          } catch (error: any) {
            if (hasUpdate || error?.code !== 'ER_DUP_ENTRY') {
              throw error;
            }
          }

          const row = await this.findOne<T>({
            model,
            where: reselectWhere,
            select,
          });

          if (row) {
            return row;
          }

          throw new Error('Upsert failed to return a row');
        } else {
          const keys = Array.isArray(target) ? target.map((k) => (tbl as any)[k]) : [(tbl as any)[target as string]];
          const returning = select && select.length > 0 ? Object.fromEntries(select.map((k) => [k, (tbl as any)[k]])) : undefined;
          const q = hasUpdate
            ? db.insert(tbl).values(create as any)
                .onConflictDoUpdate({ target: keys as any, set: update as any })
            : db.insert(tbl).values(create as any)
                .onConflictDoNothing({ target: keys as any });
          const res = await (returning ? q.returning(returning as any) : q.returning()).execute();
          // onConflictDoNothing returns empty array when conflict occurs; fall back to findOne
          if ((!res || (Array.isArray(res) && res.length === 0)) && !hasUpdate) {
            const row = await this.findOne<T>({ model, where, select });
            return row as T;
          }
          return (Array.isArray(res) ? res[0] : (res as any)) as T;
        }
      },

      async count({ model, where }: CountParams): Promise<number> {
        const tbl = resolveTable(model);
        const { sql } = drizzleOps;
        const cond = buildWhere(drizzleOps, tbl, where);
        const rows = await db
          .select({ value: sql<number>`count(*)`.as('value') })
          .from(tbl)
          .where(cond)
          .execute();
        const v = rows?.[0]?.value;
        return typeof v === 'number' ? v : Number(v ?? 0);
      },

      async transaction<R>(fn: (trx: any) => Promise<R>): Promise<R> {
        if (dialect === 'sqlite') {
          throw new OperationNotSupportedError('transaction', 'DrizzleAdapter (SQLite async transactions)');
        }

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

        const now = new Date().toISOString();
        const data = { namespace, version, appliedAt: now };

        if (dialect === 'mysql') {
          // MySQL: use onDuplicateKeyUpdate for atomic upsert
          await db
            .insert(schemaVersionsTable)
            .values(data)
            .onDuplicateKeyUpdate({ set: { version, appliedAt: now } })
            .execute();
        } else {
          // Postgres/SQLite: use onConflictDoUpdate for atomic upsert
          await db
            .insert(schemaVersionsTable)
            .values(data)
            .onConflictDoUpdate({
              target: [(schemaVersionsTable as any).namespace],
              set: { version, appliedAt: now }
            })
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
        operations: { batch: true, upsert: true, streaming: false, fulltext: false, returning: config.dialect !== 'mysql', strictUpdateNotFound: true },
        transactions: { supported: config.dialect !== 'sqlite', nested: false, isolation: undefined },
        performance: { supportsJoins: true, supportsPreparedStatements: true },
        schema: { migrations: false, constraints: true, indexes: true },
        advanced: { customIdGeneration: false, numericIds: true, schemaNamespaces: true, customTypes: true },
      },
    },
    adapter: createImpl,
  });

  const adapter = factory({
    schema: normalizeAdapterSchema(config.adapterSchema),
  });
  const internalCrud = createDrizzleInternalCrud(config.db, config.dialect, drizzleOps.sql);
  return Object.assign(adapter, { internal: internalCrud });
}
