import type { TableSchema, FieldSchema } from '@superfunctions/db';
import type { DatabaseTable } from './introspection.js';
import {
  databaseStringLength,
  isUnboundedMySqlTextType,
  mysqlVarcharLength,
} from './mysql-types.js';

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

export function resolvePhysicalTableName(namespace: string, modelName: string): string {
  const normalizedNamespace = toSnakeCase(namespace);
  const normalizedModelName = toSnakeCase(modelName);

  if (!normalizedNamespace || normalizedModelName.startsWith(`${normalizedNamespace}_`)) {
    return normalizedModelName;
  }

  return `${normalizedNamespace}_${normalizedModelName}`;
}

/**
 * Map FieldSchema type to generic SQL type for comparison
 */
function mapFieldTypeToSQLType(field: FieldSchema): string {
  if (field.type === 'date' || field.type === 'datetime') {
    switch (resolveDateStorageType(field)) {
      case 'timestamp':
      case 'timestamptz':
        return 'timestamp';
      case 'iso-text':
        return 'text';
      case 'epoch-ms-integer':
        return 'integer';
      case 'epoch-ms-bigint':
        return 'bigint';
    }
  }

  switch (field.type) {
    case 'string': return 'text';
    case 'number': return 'integer';
    case 'bigint': return 'bigint';
    case 'boolean': return 'boolean';
    case 'json': return 'json';
    default: return 'text';
  }
}

function resolveDateValueType(field: FieldSchema): NonNullable<FieldSchema['dateValueType']> {
  return field.dateValueType ?? 'date';
}

function resolveDateStorageType(field: FieldSchema): NonNullable<FieldSchema['dateStorageType']> {
  if (field.dateStorageType) {
    return field.dateStorageType;
  }

  switch (resolveDateValueType(field)) {
    case 'date':
      return 'timestamp';
    case 'iso-string':
      return 'iso-text';
    case 'epoch-ms':
      return 'epoch-ms-bigint';
  }
}

/**
 * Normalize column type from database for comparison
 */
function normalizeColumnType(dbType: string): string {
  const lower = dbType.toLowerCase();
  // Normalize common type variations
  if (lower.includes('char') || lower.includes('text')) return 'text';
  if (lower.includes('int') && !lower.includes('bigint')) return 'integer';
  if (lower.includes('bigint')) return 'bigint';
  if (lower.includes('bool')) return 'boolean';
  if (lower.includes('timestamp') || lower.includes('datetime')) return 'timestamp';
  if (lower.includes('json')) return 'json';
  return lower;
}


export interface SchemaDiff {
  missing: string[]; // tables that should exist but don't
  extra: string[]; // tables that exist but shouldn't
  mismatched: Array<{
    table: string;
    reason: string;
  }>;
}

export interface MySqlIndexColumnMetadata {
  dataType: string;
  columnType?: string;
  maxLength?: number | null;
}

export interface LibrarySchemaRequirement {
  namespace: string;
  version: number;
  tables: TableSchema[];
}

export interface TableDiff {
  tableName: string;
  action: 'create' | 'alter' | 'drop';
  missingColumns?: string[];
  extraColumns?: string[];
  columnChanges?: Array<{
    column: string;
    change: string;
    current?: {
      dataType: string;
      columnType?: string;
      maxLength?: number | null;
      extra?: string | null;
      generationExpression?: string | null;
      isVisible?: boolean;
      characterSet?: string | null;
      collation?: string | null;
      comment?: string | null;
      isNullable: boolean;
      defaultValue?: string | null;
    };
  }>;
  missingIndexes?: Array<{
    name: string;
    columns: string[];
    unique: boolean;
  }>;
  changedIndexes?: Array<{
    name: string;
    current: {
      columns: string[];
      unique: boolean;
      textColumns?: string[];
      prefixLengths?: Array<number | null>;
      columnMetadata?: Array<MySqlIndexColumnMetadata | null>;
    };
    required: { columns: string[]; unique: boolean };
  }>;
}

export interface MigrationPlan {
  namespace: string;
  fromVersion: number;
  toVersion: number;
  changes: TableDiff[];
}

/**
 * Compare required schemas against current state
 */
export function diffSchemas(
  required: LibrarySchemaRequirement[],
  currentVersions: Record<string, number>
): Record<string, { required: number; current: number; status: 'outdated' | 'up-to-date' | 'not-installed' }> {
  const result: Record<string, any> = {};

  for (const req of required) {
    const current = currentVersions[req.namespace] ?? 0;
    result[req.namespace] = {
      required: req.version,
      current,
      status: current === 0 ? 'not-installed' : current < req.version ? 'outdated' : 'up-to-date',
    };
  }

  return result;
}

/**
 * Compare required table schemas against current database tables
 */
export function diffTables(
  required: TableSchema[],
  current: DatabaseTable[],
  namespace: string
): TableDiff[] {
  const diffs: TableDiff[] = [];
  const currentMap = new Map(current.map((t) => [t.name, t]));

  // Map required tables to their actual DB names (namespace_snake_case)
  const requiredMap = new Map(
    required.map((t) => {
      const dbName = resolvePhysicalTableName(namespace, t.modelName);
      return [dbName, t];
    })
  );

  // Check for missing tables (need to create)
  for (const [dbName, _reqTable] of requiredMap.entries()) {
    if (!currentMap.has(dbName)) {
      diffs.push({
        tableName: dbName,
        action: 'create',
      });
    }
  }

  // Check for extra tables (might want to drop)
  for (const curTable of current) {
    if (!requiredMap.has(curTable.name)) {
      diffs.push({
        tableName: curTable.name,
        action: 'drop',
      });
    }
  }

  // Check for schema mismatches (need to alter)
  for (const [dbName, reqTable] of requiredMap.entries()) {
    const curTable = currentMap.get(dbName);
    if (!curTable) continue;

    const missingColumns: string[] = [];
    const extraColumns: string[] = [];
    const columnChanges: NonNullable<TableDiff['columnChanges']> = [];
    const requiredIndexes = (reqTable.indexes ?? []).map((requiredIndex) => ({
        name: requiredIndex.name,
        columns: requiredIndex.fields.map((fieldName) =>
          reqTable.fields[fieldName]?.fieldName ?? fieldName
        ),
        unique: requiredIndex.unique === true,
      }));
    const missingIndexes = requiredIndexes.filter(
      (requiredIndex) => !curTable.indexes.some(
        (currentIndex) => currentIndex.name === requiredIndex.name,
      ),
    );
    const changedIndexes = requiredIndexes.flatMap((requiredIndex) => {
      const currentIndex = curTable.indexes.find(
        (candidate) => candidate.name === requiredIndex.name,
      );
      if (!currentIndex) return [];
      const sameColumns =
        currentIndex.columns.length === requiredIndex.columns.length &&
        currentIndex.columns.every(
          (column, index) => column === requiredIndex.columns[index],
        );
      if (sameColumns && currentIndex.isUnique === requiredIndex.unique) return [];
      const currentTextColumns = currentIndex.columns.filter((column) => {
        const currentColumn = curTable.columns.find(
          (candidate) => candidate.columnName === column,
        );
        return currentColumn
          ? isUnboundedMySqlTextType(currentColumn.dataType)
          : false;
      });
      const currentColumnMetadata = currentIndex.columns.map((column) => {
        const currentColumn = curTable.columns.find(
          (candidate) => candidate.columnName === column,
        );
        return currentColumn
          ? {
              dataType: currentColumn.dataType,
              ...(currentColumn.columnType
                ? { columnType: currentColumn.columnType }
                : {}),
              ...(currentColumn.maxLength !== undefined
                ? { maxLength: currentColumn.maxLength }
                : {}),
            }
          : null;
      });
      return [{
        name: requiredIndex.name,
        current: {
          columns: [...currentIndex.columns],
          unique: currentIndex.isUnique,
          ...(currentTextColumns.length > 0 ? { textColumns: currentTextColumns } : {}),
          ...(currentIndex.prefixLengths?.some((length) => length !== null)
            ? { prefixLengths: [...currentIndex.prefixLengths] }
            : {}),
          ...(currentColumnMetadata.some((metadata) => metadata !== null)
            ? { columnMetadata: currentColumnMetadata }
            : {}),
        },
        required: {
          columns: [...requiredIndex.columns],
          unique: requiredIndex.unique,
        },
      }];
    });

    const curColMap = new Map(curTable.columns.map((c) => [c.columnName, c]));
    const reqFieldMap = reqTable.fields;

    // Check for missing columns
    for (const [fieldName, fieldSchema] of Object.entries(reqFieldMap)) {
      const colName = fieldSchema.fieldName ?? fieldName;
      if (!curColMap.has(colName)) {
        missingColumns.push(colName);
      } else {
        // Check for type/constraint changes
        const curCol = curColMap.get(colName)!;
        const changes: string[] = [];

        // Check for type changes
        // Map FieldSchema types to SQL types for comparison
        const expectedType = mapFieldTypeToSQLType(fieldSchema);
        const actualType = normalizeColumnType(curCol.dataType);

        if (expectedType !== actualType) {
          changes.push(`type changed from ${actualType} to ${expectedType}`);
        }

        if (curCol.dialect === 'mysql' && fieldSchema.type === 'string') {
          // Validate even when the database already has the same declared
          // width; otherwise an oversized schema can bypass every generator.
          const desiredLength = mysqlVarcharLength(fieldSchema);
          const actualLength = databaseStringLength(curCol);
          if (actualLength !== desiredLength) {
            changes.push(
              `maxLength changed from ${actualLength ?? 'unbounded'} to ${desiredLength ?? 'unbounded'}`,
            );
          }
        }

        if (fieldSchema.required && curCol.isNullable) {
          changes.push('changed to NOT NULL');
        }
        if (!fieldSchema.required && !curCol.isNullable) {
          changes.push('changed to NULLABLE');
        }

        if (changes.length > 0) {
          columnChanges.push({
            column: colName,
            change: changes.join(', '),
            current: {
              dataType: curCol.dataType,
              columnType: curCol.columnType,
              maxLength: curCol.maxLength,
              extra: curCol.extra,
              generationExpression: curCol.generationExpression,
              isVisible: curCol.isVisible,
              characterSet: curCol.characterSet,
              collation: curCol.collation,
              comment: curCol.comment,
              isNullable: curCol.isNullable,
              defaultValue: curCol.defaultValue,
            },
          });
        }
      }
    }

    // Check for extra columns
    for (const curCol of curTable.columns) {
      const found = Object.entries(reqFieldMap).some(
        ([fieldName, fieldSchema]) => (fieldSchema.fieldName ?? fieldName) === curCol.columnName
      );
      if (!found) {
        extraColumns.push(curCol.columnName);
      }
    }

    if (
      missingColumns.length > 0 ||
      extraColumns.length > 0 ||
      columnChanges.length > 0 ||
      missingIndexes.length > 0 ||
      changedIndexes.length > 0
    ) {
      diffs.push({
        tableName: dbName,
        action: 'alter',
        missingColumns,
        extraColumns,
        columnChanges,
        missingIndexes,
        changedIndexes,
      });
    }
  }

  return diffs;
}

/**
 * Create migration plan from schema diff
 */
export function createMigrationPlan(
  namespace: string,
  fromVersion: number,
  toVersion: number,
  tableDiffs: TableDiff[]
): MigrationPlan {
  return {
    namespace,
    fromVersion,
    toVersion,
    changes: tableDiffs,
  };
}
