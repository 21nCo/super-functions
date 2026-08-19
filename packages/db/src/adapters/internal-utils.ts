import type {
  InternalColumnDef,
  InternalCrudOperator,
  InternalWhereClause,
} from '../adapter/types.js';

export type InternalSqlDialect = 'postgres' | 'mysql' | 'sqlite';

const INTERNAL_TABLE_NAME_RE = /^__datafn_[a-z0-9_]+$/;
const INTERNAL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const INTERNAL_OPERATOR_MAP: Record<InternalCrudOperator, string> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  in: 'IN',
  not_in: 'NOT IN',
};

export function assertInternalTableName(name: string): void {
  if (!INTERNAL_TABLE_NAME_RE.test(name)) {
    throw new Error(`ensureTable: table name must start with "__datafn_": "${name}"`);
  }
}

export function assertInternalIdentifier(
  identifier: string,
  label = 'identifier',
): void {
  if (!INTERNAL_IDENTIFIER_RE.test(identifier)) {
    throw new Error(`Invalid internal ${label}: "${identifier}"`);
  }
}

export function assertInternalColumnDefs(columns: InternalColumnDef[]): void {
  for (const column of columns) {
    assertInternalIdentifier(column.name, 'column name');
  }
}

export function assertInternalWhereClauses(where: InternalWhereClause[]): void {
  for (const clause of where) {
    assertInternalIdentifier(clause.field, 'field name');
  }
}

export function parseInternalOrderBy(
  orderBy: string,
): { field: string; direction: 'ASC' | 'DESC' } {
  const desc = orderBy.startsWith('-');
  const field = desc ? orderBy.slice(1) : orderBy;
  assertInternalIdentifier(field, 'orderBy field');
  return { field, direction: desc ? 'DESC' : 'ASC' };
}

export function internalOperatorSql(op: InternalCrudOperator): string {
  return INTERNAL_OPERATOR_MAP[op];
}

export function isInternalListOperator(
  op: InternalCrudOperator,
): op is 'in' | 'not_in' {
  return op === 'in' || op === 'not_in';
}

export function internalListOperatorValues(
  value: unknown,
  op: InternalCrudOperator,
): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Internal CRUD ${op} operator value must be an array`);
  }
  return value;
}

export function quoteInternalIdentifier(
  identifier: string,
  dialect: InternalSqlDialect,
): string {
  assertInternalIdentifier(identifier);
  return dialect === 'mysql' ? `\`${identifier}\`` : `"${identifier}"`;
}

export function normalizeInternalResultCount(result: any): number {
  const count =
    result?.changes ??
    result?.rowsAffected ??
    result?.rowCount ??
    result?.count ??
    result;
  return typeof count === 'number' ? count : Number(count ?? 0);
}
