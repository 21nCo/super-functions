import type {
  InternalCrud,
  InternalColumnDef,
  InternalWhereClause,
} from '../../adapter/types.js';
import {
  assertInternalColumnDefs,
  assertInternalIdentifier,
  assertInternalTableName,
  assertInternalWhereClauses,
  internalListOperatorValues,
  internalOperatorSql,
  isInternalListOperator,
  normalizeInternalResultCount,
  parseInternalOrderBy,
  quoteInternalIdentifier,
  type InternalSqlDialect,
} from '../internal-utils.js';

export type PrismaProvider = 'postgresql' | 'mysql' | 'sqlite' | 'cockroachdb';

function providerToDialect(provider: PrismaProvider): InternalSqlDialect {
  return provider === 'mysql' ? 'mysql' : provider === 'sqlite' ? 'sqlite' : 'postgres';
}

function resolvePrismaProvider(prisma: any, provider?: PrismaProvider): PrismaProvider {
  const resolved =
    provider ??
    prisma?._engineConfig?.activeProvider ??
    prisma?._activeProvider ??
    prisma?.$engineConfig?.activeProvider;

  if (
    resolved === 'postgresql' ||
    resolved === 'mysql' ||
    resolved === 'sqlite' ||
    resolved === 'cockroachdb'
  ) {
    return resolved;
  }

  throw new Error(
    'Prisma internal CRUD requires a provider (postgresql, mysql, sqlite, or cockroachdb) or a PrismaClient exposing activeProvider',
  );
}

function placeholderFor(provider: PrismaProvider, index: number): string {
  return provider === 'postgresql' || provider === 'cockroachdb' ? `$${index}` : '?';
}

function buildWhereSQL(
  where: InternalWhereClause[],
  provider: PrismaProvider,
  dialect: InternalSqlDialect,
  startIndex = 1,
): { clause: string; params: unknown[]; nextIndex: number } {
  if (where.length === 0) {
    return { clause: '', params: [], nextIndex: startIndex };
  }

  assertInternalWhereClauses(where);

  const parts: string[] = [];
  const params: unknown[] = [];
  let nextIndex = startIndex;

  for (const clause of where) {
    const fieldSql = quoteInternalIdentifier(clause.field, dialect);

    if (clause.value === null && clause.op === 'eq') {
      parts.push(`${fieldSql} IS NULL`);
      continue;
    }

    if (clause.value === null && clause.op === 'ne') {
      parts.push(`${fieldSql} IS NOT NULL`);
      continue;
    }

    if (isInternalListOperator(clause.op)) {
      const values = internalListOperatorValues(clause.value, clause.op);
      if (values.length === 0) {
        parts.push(clause.op === 'in' ? '1 = 0' : '1 = 1');
        continue;
      }
      const placeholders = values.map(() => placeholderFor(provider, nextIndex++));
      parts.push(`${fieldSql} ${internalOperatorSql(clause.op)} (${placeholders.join(', ')})`);
      params.push(...values);
      continue;
    }

    parts.push(
      `${fieldSql} ${internalOperatorSql(clause.op)} ${placeholderFor(provider, nextIndex++)}`,
    );
    params.push(clause.value);
  }

  return { clause: ` WHERE ${parts.join(' AND ')}`, params, nextIndex };
}

export function createPrismaInternalCrud(
  prisma: any,
  provider?: PrismaProvider,
): InternalCrud {
  const resolvedProvider = resolvePrismaProvider(prisma, provider);
  const dialect = providerToDialect(resolvedProvider);
  const ensurePromises = new Map<string, Promise<void>>();

  return {
    async ensureTable(name: string, columns: InternalColumnDef[]): Promise<void> {
      assertInternalTableName(name);
      assertInternalColumnDefs(columns);

      if (ensurePromises.has(name)) {
        return ensurePromises.get(name)!;
      }

      const promise = (async () => {
        const colDefs = columns.map((col) => {
          const sqlType = col.type === 'text' ? 'TEXT' : 'INTEGER';
          const pk = col.primaryKey ? ' PRIMARY KEY' : '';
          return `${quoteInternalIdentifier(col.name, dialect)} ${sqlType}${pk}`;
        });

        const ddl = `CREATE TABLE IF NOT EXISTS ${quoteInternalIdentifier(name, dialect)} (${colDefs.join(', ')})`;
        await prisma.$executeRawUnsafe(ddl);
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
      cols.forEach((col) => assertInternalIdentifier(col, 'column name'));

      const placeholders = cols
        .map((_, index) => placeholderFor(resolvedProvider, index + 1))
        .join(', ');
      const vals = cols.map((key) => data[key]);

      const sql = `INSERT INTO ${quoteInternalIdentifier(table, dialect)} (${cols
        .map((col) => quoteInternalIdentifier(col, dialect))
        .join(', ')}) VALUES (${placeholders})`;
      await prisma.$executeRawUnsafe(sql, ...vals);

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
      const { clause, params } = buildWhereSQL(where, resolvedProvider, dialect);
      const sql = `SELECT * FROM ${quoteInternalIdentifier(table, dialect)}${clause} LIMIT 1`;
      const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(sql, ...params);
      return rows[0] ?? null;
    },

    async findMany(
      table: string,
      where: InternalWhereClause[],
      opts?: { orderBy?: string; limit?: number },
    ): Promise<Record<string, unknown>[]> {
      assertInternalTableName(table);
      const { clause, params } = buildWhereSQL(where, resolvedProvider, dialect);
      let sql = `SELECT * FROM ${quoteInternalIdentifier(table, dialect)}${clause}`;

      if (opts?.orderBy) {
        const order = parseInternalOrderBy(opts.orderBy);
        sql += ` ORDER BY ${quoteInternalIdentifier(order.field, dialect)} ${order.direction}`;
      }

      if (typeof opts?.limit === 'number') {
        sql += ` LIMIT ${Math.trunc(opts.limit)}`;
      }

      return await prisma.$queryRawUnsafe(sql, ...params);
    },

    async update(
      table: string,
      where: InternalWhereClause[],
      data: Record<string, unknown>,
    ): Promise<number> {
      assertInternalTableName(table);
      const cols = Object.keys(data);
      cols.forEach((col) => assertInternalIdentifier(col, 'column name'));

      if (cols.length === 0) {
        return 0;
      }

      const setParts = cols.map(
        (col, index) => `${quoteInternalIdentifier(col, dialect)} = ${placeholderFor(resolvedProvider, index + 1)}`,
      );
      const setParams = cols.map((key) => data[key]);

      const {
        clause,
        params: whereParams,
      } = buildWhereSQL(where, resolvedProvider, dialect, cols.length + 1);
      const sql = `UPDATE ${quoteInternalIdentifier(table, dialect)} SET ${setParts.join(', ')}${clause}`;

      return normalizeInternalResultCount(
        await prisma.$executeRawUnsafe(sql, ...setParams, ...whereParams),
      );
    },

    async delete(
      table: string,
      where: InternalWhereClause[],
    ): Promise<number> {
      assertInternalTableName(table);
      const { clause, params } = buildWhereSQL(where, resolvedProvider, dialect);
      const sql = `DELETE FROM ${quoteInternalIdentifier(table, dialect)}${clause}`;

      return normalizeInternalResultCount(await prisma.$executeRawUnsafe(sql, ...params));
    },
  };
}
