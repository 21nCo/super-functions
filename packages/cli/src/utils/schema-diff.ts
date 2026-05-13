import type { TableSchema, FieldSchema } from '@superfunctions/db';
import type { DatabaseTable } from './introspection.js';

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
    const columnChanges: Array<{ column: string; change: string }> = [];

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

    if (missingColumns.length > 0 || extraColumns.length > 0 || columnChanges.length > 0) {
      diffs.push({
        tableName: dbName,
        action: 'alter',
        missingColumns,
        extraColumns,
        columnChanges,
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
