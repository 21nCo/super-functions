import { createRequire } from 'node:module';
import type {
  InternalCrud,
  InternalColumnDef,
  InternalWhereClause,
} from '../../adapter/types.js';
import {
  assertInternalColumnDefs,
  assertInternalTableName,
  assertInternalWhereClauses,
  internalOperatorSql,
  normalizeInternalResultCount,
  parseInternalOrderBy,
  quoteInternalIdentifier,
} from '../internal-utils.js';

export type DrizzleDialect = 'postgres' | 'mysql' | 'sqlite';

const require = createRequire(import.meta.url);

function loadDrizzleSql() {
  try {
    return (require('drizzle-orm') as typeof import('drizzle-orm')).sql;
  } catch {
    throw new Error(
      'drizzleAdapter requires the optional peer dependency "drizzle-orm". Install drizzle-orm to use this adapter.'
    );
  }
}

function buildWhereClause(
  where: InternalWhereClause[],
  dialect: DrizzleDialect,
): { fragment: any; empty: boolean } {
  if (where.length === 0) {
    return { fragment: null, empty: true };
  }

  assertInternalWhereClauses(where);
  const sql = loadDrizzleSql();

  function buildCondition(clause: InternalWhereClause): any {
    const fieldSql = sql.raw(quoteInternalIdentifier(clause.field, dialect));

    if (clause.value === null && clause.op === 'eq') {
      return sql`${fieldSql} IS NULL`;
    }

    if (clause.value === null && clause.op === 'ne') {
      return sql`${fieldSql} IS NOT NULL`;
    }

    return sql`${fieldSql} ${sql.raw(internalOperatorSql(clause.op))} ${clause.value}`;
  }

  let combined = buildCondition(where[0]);
  for (let i = 1; i < where.length; i++) {
    combined = sql`${combined} AND ${buildCondition(where[i])}`;
  }

  return { fragment: combined, empty: false };
}

export function createDrizzleInternalCrud(
  db: any,
  dialect: DrizzleDialect,
  drizzleSqlImpl: ReturnType<typeof loadDrizzleSql> = loadDrizzleSql(),
): InternalCrud {
  const ensurePromises = new Map<string, Promise<void>>();
  const sql = drizzleSqlImpl;

  // Dialect-aware execution helpers
  const isSQLite = dialect === 'sqlite';

  async function executeRaw(query: any): Promise<any> {
    if (isSQLite && typeof db.run === 'function') {
      // SQLite (better-sqlite3): use db.run()
      return await db.run(query);
    } else {
      // Postgres/MySQL: use db.execute()
      return await db.execute(query);
    }
  }

  async function queryRaw(query: any): Promise<any[]> {
    if (isSQLite && typeof db.all === 'function') {
      // SQLite (better-sqlite3): use db.all()
      return await db.all(query);
    } else {
      // Postgres/MySQL: use db.execute() which returns rows directly or in .rows property
      const result = await db.execute(query);
      // For Postgres, result is an array of rows directly
      // For MySQL, result might be { rows } or just the array
      return Array.isArray(result) ? result : (result?.rows ?? []);
    }
  }

  return {
    async ensureTable(name: string, columns: InternalColumnDef[]): Promise<void> {
      assertInternalTableName(name);
      assertInternalColumnDefs(columns);

      // Use a promise-based lock to prevent concurrent DDL for the same table.
      // Without this, concurrent calls pass the guard before any completes,
      // causing PostgreSQL pg_type duplicate key errors on CREATE TABLE IF NOT EXISTS.
      if (ensurePromises.has(name)) return ensurePromises.get(name)!;

      const promise = (async () => {
        const colDefs = columns.map((col) => {
          const sqlType = col.type === 'text' ? 'TEXT' : 'INTEGER';
          const pk = col.primaryKey ? ' PRIMARY KEY' : '';
          return `${quoteInternalIdentifier(col.name, dialect)} ${sqlType}${pk}`;
        });

        const ddl = `CREATE TABLE IF NOT EXISTS ${quoteInternalIdentifier(name, dialect)} (${colDefs.join(', ')})`;
        await executeRaw(sql.raw(ddl));
      })();

      ensurePromises.set(name, promise);
      try {
        await promise;
      } catch (error) {
        ensurePromises.delete(name);
        throw error;
      }
    },

    async create(
      table: string,
      data: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      assertInternalTableName(table);
      const cols = Object.keys(data);
      if (cols.length === 0) {
        throw new Error('create: data must not be empty');
      }
      cols.forEach((col) => assertInternalColumnDefs([{ name: col, type: 'text' }]));
      const vals = cols.map((k) => data[k]);
      const quotedColumns = cols.map((col) => quoteInternalIdentifier(col, dialect)).join(', ');

      const query = sql`INSERT INTO ${sql.raw(quoteInternalIdentifier(table, dialect))} (${sql.raw(quotedColumns)}) VALUES (${sql.join(
        vals.map((v) => sql`${v}`),
        sql`, `,
      )})`;

      await executeRaw(query);
      if (data.id !== undefined && data.id !== null) {
        return (
          (await this.findOne(table, [{ field: 'id', op: 'eq', value: data.id }])) ??
          data
        );
      }
      return data;
    },

    async findOne(
      table: string,
      where: InternalWhereClause[],
    ): Promise<Record<string, unknown> | null> {
      assertInternalTableName(table);
      const { fragment, empty } = buildWhereClause(where, dialect);

      const query = empty
        ? sql`SELECT * FROM ${sql.raw(quoteInternalIdentifier(table, dialect))} LIMIT 1`
        : sql`SELECT * FROM ${sql.raw(quoteInternalIdentifier(table, dialect))} WHERE ${fragment} LIMIT 1`;

      const rows = await queryRaw(query);
      return rows[0] ?? null;
    },

    async findMany(
      table: string,
      where: InternalWhereClause[],
      opts?: { orderBy?: string; limit?: number },
    ): Promise<Record<string, unknown>[]> {
      assertInternalTableName(table);
      const { fragment, empty } = buildWhereClause(where, dialect);

      let query;
      if (empty) {
        query = sql`SELECT * FROM ${sql.raw(quoteInternalIdentifier(table, dialect))}`;
      } else {
        query = sql`SELECT * FROM ${sql.raw(quoteInternalIdentifier(table, dialect))} WHERE ${fragment}`;
      }

      if (opts?.orderBy) {
        const order = parseInternalOrderBy(opts.orderBy);
        query = sql`${query} ORDER BY ${sql.raw(quoteInternalIdentifier(order.field, dialect))} ${sql.raw(order.direction)}`;
      }

      if (typeof opts?.limit === 'number') {
        query = sql`${query} LIMIT ${Math.trunc(opts.limit)}`;
      }

      return await queryRaw(query);
    },

    async update(
      table: string,
      where: InternalWhereClause[],
      data: Record<string, unknown>,
    ): Promise<number> {
      assertInternalTableName(table);
      const cols = Object.keys(data);
      cols.forEach((col) => assertInternalColumnDefs([{ name: col, type: 'text' }]));
      if (cols.length === 0) {
        return 0;
      }

      const setParts = cols.map((col) => sql`${sql.raw(quoteInternalIdentifier(col, dialect))} = ${data[col]}`);
      const setClause = sql.join(setParts, sql`, `);

      const { fragment, empty } = buildWhereClause(where, dialect);

      const query = empty
        ? sql`UPDATE ${sql.raw(quoteInternalIdentifier(table, dialect))} SET ${setClause}`
        : sql`UPDATE ${sql.raw(quoteInternalIdentifier(table, dialect))} SET ${setClause} WHERE ${fragment}`;

      const result = await executeRaw(query);
      return normalizeInternalResultCount(result);
    },

    async delete(
      table: string,
      where: InternalWhereClause[],
    ): Promise<number> {
      assertInternalTableName(table);
      const { fragment, empty } = buildWhereClause(where, dialect);

      const query = empty
        ? sql`DELETE FROM ${sql.raw(quoteInternalIdentifier(table, dialect))}`
        : sql`DELETE FROM ${sql.raw(quoteInternalIdentifier(table, dialect))} WHERE ${fragment}`;

      const result = await executeRaw(query);
      return normalizeInternalResultCount(result);
    },
  };
}
