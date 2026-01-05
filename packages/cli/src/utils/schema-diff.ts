import type { TableSchema } from '@superfunctions/db';
import type { DatabaseTable } from './introspection.js';

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
  current: DatabaseTable[]
): TableDiff[] {
  const diffs: TableDiff[] = [];
  const currentMap = new Map(current.map((t) => [t.name, t]));
  const requiredMap = new Map(required.map((t) => [t.modelName, t]));

  // Check for missing tables (need to create)
  for (const reqTable of required) {
    if (!currentMap.has(reqTable.modelName)) {
      diffs.push({
        tableName: reqTable.modelName,
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
  for (const reqTable of required) {
    const curTable = currentMap.get(reqTable.modelName);
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
        tableName: reqTable.modelName,
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
