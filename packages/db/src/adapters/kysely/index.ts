/**
 * Kysely adapter
 *
 * Maps the Superfunctions Adapter interface to Kysely query builder.
 * Kysely is a type-safe SQL query builder for TypeScript.
 */

import type {
  Adapter,
  AdapterImplementation,
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
} from '../../adapter/types.js';
import { createAdapterFactory } from '../../adapter/factory.js';
import { OperationNotSupportedError } from '../../adapter/errors.js';

export type KyselyDialect = 'postgres' | 'mysql' | 'sqlite';

export interface KyselyAdapterConfig {
  db: any; // Kysely instance
  dialect: KyselyDialect;
  schema: Record<string, string>; // model name -> table name
  schemaVersionsTable?: string; // optional table name for schema versions
  namespace?: any;
  debug?: boolean;
}

/**
 * Escape SQL LIKE wildcards to prevent SQL injection
 * Escapes % and _ characters that have special meaning in LIKE patterns
 */
function escapeLikeWildcards(value: string): string {
  return value.replace(/[%_]/g, '\\$&');
}

/**
 * Apply where clauses to Kysely query builder
 */
function applyWhere(qb: any, where: WhereClause[]): any {
  if (!where || where.length === 0) return qb;

  let builder = qb;
  for (let i = 0; i < where.length; i++) {
    const clause = where[i];
    const { field, operator, value, connector } = clause;
    const method = i === 0 || connector === 'AND' ? 'where' : 'orWhere';

    switch (operator) {
      case 'eq':
        builder = builder[method](field, '=', value);
        break;
      case 'ne':
        builder = builder[method](field, '!=', value);
        break;
      case 'gt':
        builder = builder[method](field, '>', value);
        break;
      case 'gte':
        builder = builder[method](field, '>=', value);
        break;
      case 'lt':
        builder = builder[method](field, '<', value);
        break;
      case 'lte':
        builder = builder[method](field, '<=', value);
        break;
      case 'in':
        builder = builder[method](field, 'in', Array.isArray(value) ? value : [value]);
        break;
      case 'not_in':
        builder = builder[method](field, 'not in', Array.isArray(value) ? value : [value]);
        break;
      case 'contains':
        builder = builder[method](field, 'like', `%${escapeLikeWildcards(String(value))}%`);
        break;
      case 'starts_with':
        builder = builder[method](field, 'like', `${escapeLikeWildcards(String(value))}%`);
        break;
      case 'ends_with':
        builder = builder[method](field, 'like', `%${escapeLikeWildcards(String(value))}`);
        break;
      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  return builder;
}

/**
 * Apply orderBy to Kysely query builder
 */
function applyOrderBy(qb: any, orderBy?: OrderBy[]): any {
  if (!orderBy || orderBy.length === 0) return qb;
  let builder = qb;
  for (const order of orderBy) {
    builder = builder.orderBy(order.field, order.direction);
  }
  return builder;
}

/**
 * Apply select to Kysely query builder
 */
function applySelect(qb: any, select?: string[]): any {
  if (!select || select.length === 0) return qb.selectAll();
  return qb.select(select);
}

export function kyselyAdapter(config: KyselyAdapterConfig): Adapter {
  if (!config?.db) throw new Error('kyselyAdapter: config.db is required');
  if (!config?.schema) throw new Error('kyselyAdapter: config.schema is required');

  const createImpl = (_ctx: any): AdapterImplementation => {
    const { db, schema, dialect, schemaVersionsTable } = config;

    const resolveTable = (model: string): string => {
      const tableName = schema[model];
      if (!tableName) throw new Error(`Kysely adapter: no table mapping for model "${model}"`);
      return tableName;
    };

    return {
      async create<T = any>({ model, data, select }: CreateParams): Promise<T> {
        const table = resolveTable(model);
        let qb = db.insertInto(table).values(data);

        if (dialect === 'mysql') {
          await qb.execute();
          // MySQL doesn't support returning; re-select if needed
          if (select && select.length > 0) {
            // Use 'id' field convention for re-selecting the inserted row
            const idValue = (data as any)['id'];
            if (!idValue) {
              throw new Error('Kysely adapter: MySQL create requires "id" field in data for re-selection');
            }
            let selectQb = db.selectFrom(table).where('id', '=', idValue);
            selectQb = applySelect(selectQb, select);
            const row = await selectQb.executeTakeFirst();
            return row as T;
          }
          return data as T;
        } else {
          qb = applySelect(qb.returning(select && select.length > 0 ? select : ['*' as any]), undefined);
          const result = await qb.executeTakeFirst();
          return result as T;
        }
      },

      async findOne<T = any>({ model, where, select }: FindOneParams): Promise<T | null> {
        const table = resolveTable(model);
        let qb = db.selectFrom(table);
        qb = applyWhere(qb, where);
        qb = applySelect(qb, select);
        const result = await qb.executeTakeFirst();
        return (result as T) ?? null;
      },

      async findMany<T = any>({ model, where, select, orderBy, limit, offset }: FindManyParams): Promise<T[]> {
        const table = resolveTable(model);
        let qb = db.selectFrom(table);
        qb = applyWhere(qb, where ?? []);
        qb = applySelect(qb, select);
        qb = applyOrderBy(qb, orderBy);
        if (typeof limit === 'number') qb = qb.limit(limit);
        if (typeof offset === 'number') qb = qb.offset(offset);
        const results = await qb.execute();
        return results as T[];
      },

      async update<T = any>({ model, where, data, select }: UpdateParams): Promise<T> {
        const table = resolveTable(model);
        let qb = db.updateTable(table).set(data);
        qb = applyWhere(qb, where);

        if (dialect === 'mysql') {
          await qb.execute();
          // Re-select for MySQL
          let selectQb = db.selectFrom(table);
          selectQb = applyWhere(selectQb, where);
          selectQb = applySelect(selectQb, select);
          const row = await selectQb.executeTakeFirst();
          if (!row) throw new Error('Update affected zero rows');
          return row as T;
        } else {
          qb = qb.returning(select && select.length > 0 ? select : ['*' as any]);
          const result = await qb.executeTakeFirst();
          return result as T;
        }
      },

      async delete({ model, where }: DeleteParams): Promise<void> {
        const table = resolveTable(model);
        let qb = db.deleteFrom(table);
        qb = applyWhere(qb, where);
        await qb.execute();
      },

      async createMany<T = any>({ model, data }: CreateManyParams): Promise<T[]> {
        const table = resolveTable(model);
        let qb = db.insertInto(table).values(data);

        if (dialect === 'mysql') {
          await qb.execute();
          return data as T[];
        } else {
          qb = qb.returning(['*' as any]);
          const results = await qb.execute();
          return results as T[];
        }
      },

      async updateMany({ model, where, data }: UpdateManyParams): Promise<number> {
        const table = resolveTable(model);
        let qb = db.updateTable(table).set(data);
        qb = applyWhere(qb, where ?? []);
        const result = await qb.execute();
        return Number((result as any).numUpdatedRows ?? (result as any).numAffectedRows ?? 0);
      },

      async deleteMany({ model, where }: DeleteManyParams): Promise<number> {
        const table = resolveTable(model);
        let qb = db.deleteFrom(table);
        qb = applyWhere(qb, where ?? []);
        const result = await qb.execute();
        return Number((result as any).numDeletedRows ?? (result as any).numAffectedRows ?? 0);
      },

      async upsert<T = any>({ model, where, create, update, select }: UpsertParams): Promise<T> {
        const table = resolveTable(model);

        // Kysely doesn't have native upsert; use insert...onConflict or fallback to update/insert
        if (dialect === 'postgres' || dialect === 'sqlite') {
          const conflictColumn = where.length > 0 ? where[0].field : 'id';
          let qb = db
            .insertInto(table)
            .values(create)
            .onConflict((oc: any) => oc.column(conflictColumn).doUpdateSet(update));

          if (select && select.length > 0) {
            qb = qb.returning(select);
          } else {
            qb = qb.returning(['*' as any]);
          }
          const result = await qb.executeTakeFirst();
          return result as T;
        } else {
          // MySQL: use INSERT...ON DUPLICATE KEY UPDATE for atomic upsert
          // Merge create and update data
          const allData = { ...create, ...update };
          const columns = Object.keys(allData);
          const values = Object.values(allData);

          // Helper function to escape MySQL identifiers
          const escapeIdentifier = (identifier: string): string => {
            return `\`${identifier.replace(/`/g, '``')}\``;
          };

          // Build UPDATE SET clause for ON DUPLICATE KEY
          const updateSet = Object.keys(update)
            .map(key => `${escapeIdentifier(key)} = VALUES(${escapeIdentifier(key)})`)
            .join(', ');

          // Execute raw SQL for atomic upsert with properly escaped identifiers
          const sql = `
            INSERT INTO ${escapeIdentifier(table)} (${columns.map(escapeIdentifier).join(', ')})
            VALUES (${columns.map(() => '?').join(', ')})
            ON DUPLICATE KEY UPDATE ${updateSet}
          `;

          await db.executeQuery({ sql, parameters: values } as any);

          // Re-select the upserted row
          const result = await this.findOne<T>({ model, where, select });
          if (!result) {
            throw new Error('Upsert succeeded but failed to retrieve result');
          }
          return result;
        }
      },

      async count({ model, where }: CountParams): Promise<number> {
        const table = resolveTable(model);
        let qb = db.selectFrom(table).select(db.fn.count('*').as('count'));
        qb = applyWhere(qb, where ?? []);
        const result = await qb.executeTakeFirst();
        return Number((result as any)?.count ?? 0);
      },

      async transaction<R>(fn: (trx: any) => Promise<R>): Promise<R> {
        return await db.transaction().execute(async (trx: any) => {
          const child = kyselyAdapter({ ...config, db: trx });
          return await fn(child);
        });
      },

      async initialize(): Promise<void> {
        // Kysely doesn't require explicit initialization
      },

      async isHealthy() {
        try {
          // Simple health check: select 1
          const result = await db.selectFrom(resolveTable(Object.keys(schema)[0])).select(db.fn.count('*').as('count')).executeTakeFirst();
          void result; // ignore result
          return { healthy: true, uptime: 0 };
        } catch {
          return { healthy: false, uptime: 0 };
        }
      },

      async close(): Promise<void> {
        if (db.destroy) await db.destroy();
      },

      async getSchemaVersion(namespace: string): Promise<number> {
        if (!schemaVersionsTable) return 0;
        try {
          const result = await db
            .selectFrom(schemaVersionsTable)
            .select('version')
            .where('namespace', '=', namespace)
            .executeTakeFirst();
          return result?.version ?? 0;
        } catch {
          return 0;
        }
      },

      async setSchemaVersion(namespace: string, version: number): Promise<void> {
        if (!schemaVersionsTable) {
          throw new OperationNotSupportedError('setSchemaVersion', 'KyselyAdapter (schemaVersionsTable not configured)');
        }
        const now = new Date().toISOString();
        const existing = await this.getSchemaVersion(namespace);
        if (existing === 0) {
          await db.insertInto(schemaVersionsTable).values({ namespace, version, appliedAt: now }).execute();
        } else {
          await db
            .updateTable(schemaVersionsTable)
            .set({ version, appliedAt: now })
            .where('namespace', '=', namespace)
            .execute();
        }
      },

      async validateSchema(): Promise<{ valid: boolean; errors?: string[] }> {
        return { valid: true };
      },
    };
  };

  const factory = createAdapterFactory({
    config: {
      adapterId: 'kysely',
      adapterName: 'Kysely Adapter',
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

  return factory({});
}
