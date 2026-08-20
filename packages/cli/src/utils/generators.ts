/**
 * Migration file generators for different ORMs
 */

import type { TableSchema, FieldSchema } from '@superfunctions/db';
import { resolvePhysicalTableName, type TableDiff, type MigrationPlan } from './schema-diff.js';
import {
  MYSQL_MAX_SAFE_INDEXED_VARCHAR_LENGTH,
  mysqlColumnTypeFromSnapshot,
  mysqlVarcharLength,
} from './mysql-types.js';

export type Dialect = 'postgres' | 'mysql' | 'sqlite';

/**
 * Map FieldSchema type to SQL type for given dialect
 */
function fieldTypeToSQL(field: FieldSchema, dialect: Dialect): string {
  const baseType = field.type;

  if (isDateField(field)) {
    return dateFieldToSQL(field, dialect);
  }

  switch (dialect) {
    case 'postgres':
      switch (baseType) {
        case 'string':
          return 'TEXT';
        case 'number':
          return 'INTEGER';
        case 'bigint':
          return 'BIGINT';
        case 'boolean':
          return 'BOOLEAN';
        case 'json':
          return 'JSONB';
        default:
          return 'TEXT';
      }

    case 'mysql':
      switch (baseType) {
        case 'string':
          {
            const length = mysqlVarcharLength(field);
            return length === null ? 'TEXT' : `VARCHAR(${length})`;
          }
        case 'number':
          return 'INT';
        case 'bigint':
          return 'BIGINT';
        case 'boolean':
          return 'BOOLEAN';
        case 'json':
          return 'JSON';
        default:
          return 'TEXT';
      }

    case 'sqlite':
      switch (baseType) {
        case 'string':
          return 'TEXT';
        case 'number':
        case 'bigint':
          return 'INTEGER';
        case 'boolean':
          return 'INTEGER'; // SQLite uses INTEGER for boolean
        case 'json':
          return 'TEXT'; // SQLite stores JSON as TEXT
        default:
          return 'TEXT';
      }
  }
}

function dateFieldToSQL(field: FieldSchema, dialect: Dialect): string {
  switch (resolveDateStorageType(field)) {
    case 'timestamp':
      return dialect === 'mysql' ? 'DATETIME' : dialect === 'sqlite' ? 'INTEGER' : 'TIMESTAMP';
    case 'timestamptz':
      return dialect === 'postgres' ? 'TIMESTAMPTZ' : dialect === 'sqlite' ? 'INTEGER' : 'TIMESTAMP';
    case 'iso-text':
      return 'TEXT';
    case 'epoch-ms-integer':
      return 'BIGINT';
    case 'epoch-ms-bigint':
      return 'BIGINT';
  }
}

function isDateField(field: FieldSchema): boolean {
  return field.type === 'date' || field.type === 'datetime';
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
 * Escape SQL string literals to prevent syntax errors
 * Handles single quotes (SQL standard) and backslashes (MySQL)
 */
function escapeSqlString(value: string, dialect: Dialect): string {
  // Escape single quotes by doubling them (SQL standard)
  let escaped = value.replace(/'/g, "''");

  // For MySQL, also escape backslashes
  if (dialect === 'mysql') {
    escaped = escaped.replace(/\\/g, '\\\\');
  }

  return `'${escaped}'`;
}

function escapeJavaScriptTemplateLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function schemaDefaultClause(field: FieldSchema, dialect: Dialect): string {
  if (field.defaultValue === undefined) return '';
  const value = typeof field.defaultValue === 'string'
    ? escapeSqlString(field.defaultValue, dialect)
    : String(field.defaultValue);
  return ` DEFAULT ${value}`;
}

function introspectedMySqlDefaultClause(input: {
  dataType: string;
  defaultValue?: string | null;
}): string {
  if (input.defaultValue == null) return '';
  const type = input.dataType.trim().toLowerCase();
  const value = String(input.defaultValue);
  if (
    /^(?:current_timestamp(?:\(\d*\))?|current_date|current_time(?:\(\d*\))?|localtimestamp(?:\(\d*\))?)$/i.test(value) &&
    /^(?:date|datetime|time|timestamp)$/.test(type)
  ) {
    return ` DEFAULT ${value}`;
  }
  if (/^(?:tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|boolean|bool|year)$/.test(type)) {
    return ` DEFAULT ${value}`;
  }
  return ` DEFAULT ${escapeSqlString(value, 'mysql')}`;
}

type MySqlColumnSnapshot = NonNullable<
  NonNullable<TableDiff['columnChanges']>[number]['current']
>;

function safeMySqlMetadataIdentifier(
  value: string | null | undefined,
  label: string,
): string {
  if (!value) return '';
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(`Unsupported introspected MySQL ${label}: ${value}`);
  }
  return value;
}

function safeMySqlMetadataFragment(value: string, label: string): string {
  const normalized = value.trim();
  if (
    /[;\r\n]/.test(normalized) ||
    normalized.includes('--') ||
    normalized.includes('/*') ||
    normalized.includes('*/')
  ) {
    throw new Error(`Unsupported introspected MySQL ${label}: ${value}`);
  }
  return normalized;
}

function mysqlCompleteColumnDefinition(
  sqlType: string,
  nullable: boolean,
  defaultClause: string,
  current: MySqlColumnSnapshot,
): string {
  const stringLike = /(?:char|text|enum|set)/i.test(sqlType);
  const characterSet = stringLike
    ? safeMySqlMetadataIdentifier(current.characterSet, 'character set')
    : '';
  const collation = stringLike
    ? safeMySqlMetadataIdentifier(current.collation, 'collation')
    : '';
  const characterClauses = [
    characterSet ? `CHARACTER SET ${characterSet}` : '',
    collation ? `COLLATE ${collation}` : '',
  ].filter(Boolean).join(' ');
  const comment = current.comment
    ? `COMMENT ${escapeSqlString(current.comment, 'mysql')}`
    : '';
  const visibility = current.isVisible === false ? 'INVISIBLE' : '';
  const rawExtra = safeMySqlMetadataFragment(current.extra ?? '', 'EXTRA');
  const generationMode = rawExtra.match(/\b(VIRTUAL|STORED)\s+GENERATED\b/i)?.[1]
    ?.toUpperCase() ?? '';
  const extra = rawExtra
    .replace(/\bDEFAULT_GENERATED\b/gi, '')
    .replace(/\b(?:VIRTUAL|STORED)\s+GENERATED\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const generationExpression = current.generationExpression?.trim();

  if (generationExpression) {
    const expression = safeMySqlMetadataFragment(
      generationExpression,
      'generation expression',
    );
    return [
      sqlType,
      characterClauses,
      `GENERATED ALWAYS AS (${expression})`,
      generationMode,
      nullable ? 'NULL' : 'NOT NULL',
      extra,
      visibility,
      comment,
    ].filter(Boolean).join(' ');
  }

  return [
    sqlType,
    characterClauses,
    nullable ? 'NULL' : 'NOT NULL',
    defaultClause.trim(),
    extra,
    visibility,
    comment,
  ].filter(Boolean).join(' ');
}

function mysqlChangedColumnDefinition(
  field: FieldSchema,
  current: MySqlColumnSnapshot,
): string {
  const defaultClause = field.defaultValue !== undefined
    ? schemaDefaultClause(field, 'mysql')
    : introspectedMySqlDefaultClause(current);
  return mysqlCompleteColumnDefinition(
    fieldTypeToSQL(field, 'mysql'),
    !field.required,
    defaultClause,
    current,
  );
}

function mysqlCurrentColumnDefinition(
  current: MySqlColumnSnapshot,
): string {
  return mysqlCompleteColumnDefinition(
    mysqlColumnTypeFromSnapshot(current),
    current.isNullable,
    introspectedMySqlDefaultClause(current),
    current,
  );
}

/**
 * Generate CREATE TABLE statement
 */
function generateCreateTableSQL(
  schema: TableSchema,
  dialect: Dialect,
  ifNotExists: boolean = true,
  tableName: string = schema.modelName
): string {
  const columns: string[] = [];

  // Add columns
  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const colName = field.fieldName ?? fieldName;
    const sqlType = fieldTypeToSQL(field, dialect);
    const parts = [colName, sqlType];

    if (field.required) {
      parts.push('NOT NULL');
    }

    if (field.unique) {
      parts.push('UNIQUE');
    }

    if (field.defaultValue !== undefined) {
      const defaultVal =
        typeof field.defaultValue === 'string'
          ? escapeSqlString(field.defaultValue, dialect)
          : field.defaultValue;
      parts.push(`DEFAULT ${defaultVal}`);
    }

    columns.push(`  ${parts.join(' ')}`);
  }

  // Add primary key (assume 'id' field is primary)
  const idField = Object.keys(schema.fields).find((f) => f === 'id');
  if (idField) {
    columns.push(`  PRIMARY KEY (${schema.fields[idField].fieldName ?? 'id'})`);
  }

  const ifNotExistsClause = ifNotExists ? 'IF NOT EXISTS ' : '';
  return `CREATE TABLE ${ifNotExistsClause}${tableName} (\n${columns.join(',\n')}\n);`;
}

function findSchemaForTable(
  schemas: TableSchema[],
  namespace: string,
  tableName: string
): TableSchema | undefined {
  return schemas.find((schema) => {
    return (
      schema.modelName === tableName
      || resolvePhysicalTableName(namespace, schema.modelName) === tableName
    );
  });
}

/**
 * Generate ALTER TABLE statements for column changes
 */
function generateAlterTableSQL(
  diff: TableDiff,
  schema: TableSchema,
  dialect: Dialect
): string[] {
  const statements: string[] = [];

  // Add missing columns
  if (diff.missingColumns) {
    for (const colName of diff.missingColumns) {
      const field = Object.entries(schema.fields).find(
        ([name, f]) => (f.fieldName ?? name) === colName
      )?.[1];
      if (!field) continue;

      const sqlType = fieldTypeToSQL(field, dialect);
      const parts = [sqlType];
      if (field.required) parts.push('NOT NULL');
      if (field.unique) parts.push('UNIQUE');

      if (dialect === 'mysql') {
        statements.push(`ALTER TABLE ${diff.tableName} ADD COLUMN ${colName} ${parts.join(' ')};`);
      } else {
        statements.push(`ALTER TABLE ${diff.tableName} ADD COLUMN ${colName} ${parts.join(' ')};`);
      }
    }
  }

  // Drop extra columns (commented out by default for safety)
  if (diff.extraColumns && diff.extraColumns.length > 0) {
    statements.push(
      `-- WARNING: The following columns exist but are not in the schema:`
    );
    for (const colName of diff.extraColumns) {
      statements.push(`-- ALTER TABLE ${diff.tableName} DROP COLUMN ${colName};`);
    }
  }

  // Handle column changes (NOT NULL, etc)
  if (diff.columnChanges) {
    for (const change of diff.columnChanges) {
      const field = Object.entries(schema.fields).find(
        ([name, candidate]) => (candidate.fieldName ?? name) === change.column,
      )?.[1];
      if (dialect === 'mysql' && field) {
        statements.push(
          `ALTER TABLE ${diff.tableName} MODIFY COLUMN ${change.column} ${
            change.current
              ? mysqlChangedColumnDefinition(field, change.current)
              : `${fieldTypeToSQL(field, dialect)} ${field.required ? 'NOT NULL' : 'NULL'}${schemaDefaultClause(field, dialect)}`
          };`,
        );
      } else {
        statements.push(
          `-- TODO: Handle column change for ${diff.tableName}.${change.column}: ${change.change}`
        );
      }
    }
  }

  for (const index of diff.missingIndexes ?? []) {
    statements.push(generateCreateIndexSQL(diff.tableName, index, dialect, schema));
  }
  for (const index of diff.changedIndexes ?? []) {
    statements.push(generateDropIndexSQL(diff.tableName, index.name, dialect));
    statements.push(generateCreateIndexSQL(diff.tableName, {
      name: index.name,
      ...index.required,
    }, dialect, schema));
  }

  return statements;
}

function generateCreateIndexSQL(
  tableName: string,
  index: { name: string; columns: string[]; unique: boolean },
  dialect: Dialect,
  schema?: TableSchema,
  knownTextColumns: readonly string[] = [],
): string {
  const ifNotExists = dialect === 'mysql' ? '' : 'IF NOT EXISTS ';
  const mysqlTextColumns = new Set(knownTextColumns);
  if (dialect === 'mysql' && schema) {
    let indexedKeyBytes = 0;
    for (const column of index.columns) {
      const field = Object.entries(schema.fields).find(
        ([fieldName, candidate]) => (candidate.fieldName ?? fieldName) === column,
      )?.[1];
      if (!field) {
        if (mysqlTextColumns.has(column)) {
          indexedKeyBytes += 191 * 4;
          continue;
        }
        throw new Error(
          `Cannot generate MySQL index ${index.name}: no schema field exists for column ${column}`,
        );
      }
      const physicalType = fieldTypeToSQL(field, dialect);
      if (field?.type === 'string') {
        const length = mysqlVarcharLength(field);
        if (length === null) {
          mysqlTextColumns.add(column);
          indexedKeyBytes += 191 * 4;
        } else {
          if (length > MYSQL_MAX_SAFE_INDEXED_VARCHAR_LENGTH) {
            throw new Error(
              `Cannot generate MySQL index ${index.name} on ${column}: maxLength ${length} exceeds the utf8mb4 full-column index limit ${MYSQL_MAX_SAFE_INDEXED_VARCHAR_LENGTH}`,
            );
          }
          indexedKeyBytes += length * 4;
        }
      } else if (physicalType === 'TEXT') {
        mysqlTextColumns.add(column);
        indexedKeyBytes += 191 * 4;
      } else if (/^(?:INT|INTEGER)$/.test(physicalType)) {
        indexedKeyBytes += 4;
      } else if (/^BIGINT$/.test(physicalType)) {
        indexedKeyBytes += 8;
      } else if (/^BOOLEAN$/.test(physicalType)) {
        indexedKeyBytes += 1;
      } else if (/^(?:DATE|DATETIME|TIMESTAMP|TIME)$/.test(physicalType)) {
        indexedKeyBytes += 8;
      } else {
        throw new Error(
          `Cannot generate MySQL index ${index.name}: encoded key size for ${column} (${physicalType}) cannot be proven safe`,
        );
      }
    }
    if (indexedKeyBytes > MYSQL_MAX_SAFE_INDEXED_VARCHAR_LENGTH * 4) {
      throw new Error(
        `Cannot generate MySQL index ${index.name}: encoded key size ${indexedKeyBytes} bytes exceeds the 3072-byte InnoDB limit`,
      );
    }
  }
  if (dialect === 'mysql' && index.unique) {
    const unsafeColumns = index.columns.filter((column) => mysqlTextColumns.has(column));
    if (unsafeColumns.length > 0) {
      throw new Error(
        `Cannot generate unique MySQL index ${index.name} on unbounded TEXT column(s): ${unsafeColumns.join(', ')}`,
      );
    }
  }
  const columns = index.columns.map((column) => {
    return dialect === 'mysql' && mysqlTextColumns.has(column)
      ? `${column}(191)`
      : column;
  });
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${ifNotExists}${index.name} ON ${tableName} (${columns.join(', ')});`;
}

function generateDropIndexSQL(
  tableName: string,
  indexName: string,
  dialect: Dialect,
): string {
  return dialect === 'mysql'
    ? `DROP INDEX ${indexName} ON ${tableName};`
    : `DROP INDEX IF EXISTS ${indexName};`;
}

function schemaIndexes(schema: TableSchema): Array<{ name: string; columns: string[]; unique: boolean }> {
  return (schema.indexes ?? []).map((index) => ({
    name: index.name,
    columns: index.fields.map((fieldName) => schema.fields[fieldName]?.fieldName ?? fieldName),
    unique: index.unique === true,
  }));
}

function generateKyselyCreateIndex(
  tableName: string,
  index: { name: string; columns: string[]; unique: boolean },
  dialect: Dialect,
  schema: TableSchema,
  knownTextColumns: readonly string[] = [],
): string {
  if (dialect === 'mysql') {
    return `  await sql\`${escapeJavaScriptTemplateLiteral(generateCreateIndexSQL(tableName, index, dialect, schema, knownTextColumns))}\`.execute(db);`;
  }
  const unique = index.unique ? `.unique()` : '';
  return `  await db.schema.createIndex('${index.name}').on('${tableName}').columns(${JSON.stringify(index.columns)})${unique}.execute();`;
}

/**
 * Generate DROP TABLE statement
 */
function generateDropTableSQL(tableName: string, ifExists: boolean = true): string {
  const ifExistsClause = ifExists ? 'IF EXISTS ' : '';
  return `-- DROP TABLE ${ifExistsClause}${tableName}; -- Commented out for safety`;
}

// ============================================================================
// Drizzle Migration Generator
// ============================================================================

export interface DrizzleMigrationFile {
  filename: string;
  content: string;
}

/**
 * Generate Drizzle migration file from migration plan
 */
export function generateDrizzleMigration(
  plan: MigrationPlan,
  schemas: TableSchema[],
  dialect: Dialect
): DrizzleMigrationFile {
  const timestamp = Date.now();
  const filename = `${timestamp}_${plan.namespace}_v${plan.toVersion}.sql`;

  const statements: string[] = [];
  statements.push(`-- Migration for ${plan.namespace}`);
  statements.push(`-- From version ${plan.fromVersion} to ${plan.toVersion}`);
  statements.push('');

  for (const diff of plan.changes) {
    if (diff.action === 'create') {
      const schema = findSchemaForTable(schemas, plan.namespace, diff.tableName);
      if (schema) {
        statements.push(generateCreateTableSQL(schema, dialect, true, diff.tableName));
        statements.push(...schemaIndexes(schema).map((index) => generateCreateIndexSQL(diff.tableName, index, dialect, schema)));
        statements.push('');
      }
    } else if (diff.action === 'alter') {
      const schema = findSchemaForTable(schemas, plan.namespace, diff.tableName);
      if (schema) {
        const alterStatements = generateAlterTableSQL(diff, schema, dialect);
        statements.push(...alterStatements);
        statements.push('');
      }
    } else if (diff.action === 'drop') {
      statements.push(generateDropTableSQL(diff.tableName));
      statements.push('');
    }
  }

  // Add schema version update
  statements.push(`-- Update schema version`);
  statements.push(
    `UPDATE _superfunctions_schema_versions SET version = ${plan.toVersion} WHERE namespace = '${plan.namespace}';`
  );
  statements.push(
    `INSERT INTO _superfunctions_schema_versions (namespace, version, updated_at) SELECT '${plan.namespace}', ${plan.toVersion}, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM _superfunctions_schema_versions WHERE namespace = '${plan.namespace}');`
  );

  return {
    filename,
    content: statements.join('\n'),
  };
}

// ============================================================================
// Prisma Migration Generator
// ============================================================================

export interface PrismaMigrationFile {
  filename: string;
  content: string;
}

/**
 * Generate Prisma migration file from migration plan
 */
export function generatePrismaMigration(
  plan: MigrationPlan,
  schemas: TableSchema[],
  dialect: Dialect
): PrismaMigrationFile {
  const timestamp = Date.now();
  const filename = `${timestamp}_${plan.namespace}_v${plan.toVersion}`;

  const statements: string[] = [];
  statements.push(`-- Migration for ${plan.namespace}`);
  statements.push(`-- From version ${plan.fromVersion} to ${plan.toVersion}`);
  statements.push('');

  for (const diff of plan.changes) {
    if (diff.action === 'create') {
      const schema = findSchemaForTable(schemas, plan.namespace, diff.tableName);
      if (schema) {
        statements.push(generateCreateTableSQL(schema, dialect, true, diff.tableName));
        statements.push(...schemaIndexes(schema).map((index) => generateCreateIndexSQL(diff.tableName, index, dialect, schema)));
        statements.push('');
      }
    } else if (diff.action === 'alter') {
      const schema = findSchemaForTable(schemas, plan.namespace, diff.tableName);
      if (schema) {
        const alterStatements = generateAlterTableSQL(diff, schema, dialect);
        statements.push(...alterStatements);
        statements.push('');
      }
    } else if (diff.action === 'drop') {
      statements.push(generateDropTableSQL(diff.tableName));
      statements.push('');
    }
  }

  // Add schema version update
  statements.push(`-- Update schema version`);
  statements.push(
    `UPDATE _superfunctions_schema_versions SET version = ${plan.toVersion}, updated_at = CURRENT_TIMESTAMP WHERE namespace = '${plan.namespace}';`
  );
  statements.push(
    `INSERT INTO _superfunctions_schema_versions (namespace, version, updated_at) SELECT '${plan.namespace}', ${plan.toVersion}, CURRENT_TIMESTAMP WHERE NOT EXISTS (SELECT 1 FROM _superfunctions_schema_versions WHERE namespace = '${plan.namespace}');`
  );

  return {
    filename: `${filename}/migration.sql`,
    content: statements.join('\n'),
  };
}

// ============================================================================
// Kysely Migration Generator
// ============================================================================

export interface KyselyMigrationFile {
  filename: string;
  content: string;
}

/**
 * Generate Kysely TypeScript migration file from migration plan
 */
export function generateKyselyMigration(
  plan: MigrationPlan,
  schemas: TableSchema[],
  dialect: Dialect
): KyselyMigrationFile {
  const timestamp = Date.now();
  const filename = `${timestamp}_${plan.namespace}_v${plan.toVersion}.ts`;

  const upStatements: string[] = [];
  const downStatements: string[] = [];

  for (const diff of plan.changes) {
    if (diff.action === 'create') {
      const schema = findSchemaForTable(schemas, plan.namespace, diff.tableName);
      if (schema) {
        // Up: create table
        upStatements.push(
          `  await db.schema.createTable('${diff.tableName}')`,
        );

        for (const [fieldName, field] of Object.entries(schema.fields)) {
          const colName = field.fieldName ?? fieldName;
          const sqlType = fieldTypeToSQL(field, dialect);

          let chainBuilder = `    .addColumn('${colName}', '${sqlType.toLowerCase()}'`;
          if (field.required) chainBuilder += `, (col) => col.notNull()`;
          chainBuilder += `)`;
          upStatements.push(chainBuilder);
        }

        upStatements.push(`    .execute();`);

        for (const index of schemaIndexes(schema)) {
          upStatements.push(generateKyselyCreateIndex(
            diff.tableName,
            index,
            dialect,
            schema,
          ));
        }

        // Down: drop table
        downStatements.push(`  await db.schema.dropTable('${diff.tableName}').execute();`);
      }
    } else if (diff.action === 'alter') {
      const schema = findSchemaForTable(schemas, plan.namespace, diff.tableName);
      const dropAddedColumns: string[] = [];
      const revertChangedColumns: string[] = [];
      if (schema && diff.missingColumns) {
        for (const colName of diff.missingColumns) {
          const field = Object.entries(schema.fields).find(
            ([name, f]) => (f.fieldName ?? name) === colName
          )?.[1];
          if (!field) continue;

          const sqlType = fieldTypeToSQL(field, dialect);
          upStatements.push(
            `  await db.schema.alterTable('${diff.tableName}').addColumn('${colName}', '${sqlType.toLowerCase()}', (col) => ${field.required ? 'col.notNull()' : 'col'}).execute();`
          );
          dropAddedColumns.push(
            `  await db.schema.alterTable('${diff.tableName}').dropColumn('${colName}').execute();`
          );
        }
      }
      for (const change of diff.columnChanges ?? []) {
        if (!schema) continue;
        const field = Object.entries(schema.fields).find(
          ([name, candidate]) => (candidate.fieldName ?? name) === change.column,
        )?.[1];
        if (dialect === 'mysql' && field && change.current) {
          const upSql = `ALTER TABLE ${diff.tableName} MODIFY COLUMN ${change.column} ${mysqlChangedColumnDefinition(field, change.current)}`;
          const downSql = `ALTER TABLE ${diff.tableName} MODIFY COLUMN ${change.column} ${mysqlCurrentColumnDefinition(change.current)}`;
          upStatements.push(
            `  await sql\`${escapeJavaScriptTemplateLiteral(upSql)}\`.execute(db);`,
          );
          revertChangedColumns.push(
            `  await sql\`${escapeJavaScriptTemplateLiteral(downSql)}\`.execute(db);`,
          );
        }
      }
      for (const index of diff.missingIndexes ?? []) {
        if (!schema) continue;
        upStatements.push(generateKyselyCreateIndex(
          diff.tableName,
          index,
          dialect,
          schema,
        ));
        downStatements.push(
          dialect === 'mysql'
            ? `  await db.schema.dropIndex('${index.name}').on('${diff.tableName}').execute();`
            : `  await db.schema.dropIndex('${index.name}').execute();`,
        );
      }
      for (const index of diff.changedIndexes ?? []) {
        if (!schema) continue;
        const drop = dialect === 'mysql'
          ? `  await db.schema.dropIndex('${index.name}').on('${diff.tableName}').execute();`
          : `  await db.schema.dropIndex('${index.name}').execute();`;
        upStatements.push(drop);
        upStatements.push(generateKyselyCreateIndex(
          diff.tableName,
          { name: index.name, ...index.required },
          dialect,
          schema,
        ));
        downStatements.push(drop);
        downStatements.push(generateKyselyCreateIndex(
          diff.tableName,
          { name: index.name, ...index.current },
          dialect,
          schema,
          index.current.textColumns,
        ));
      }
      downStatements.push(...revertChangedColumns);
      // Rollbacks must remove dependent indexes before their newly added
      // columns. PostgreSQL may auto-drop the index with the column, while
      // other dialects can reject the column drop outright.
      downStatements.push(...dropAddedColumns);
    } else if (diff.action === 'drop') {
      upStatements.push(`  // await db.schema.dropTable('${diff.tableName}').execute();`);
      downStatements.push(`  // Recreate ${diff.tableName} if needed`);
    }
  }

  // Add schema version updates
  upStatements.push(``);
  upStatements.push(`  // Update schema version`);
  upStatements.push(
    `  await db.insertInto('_superfunctions_schema_versions')`
  );
  upStatements.push(`    .values({`);
  upStatements.push(`      namespace: '${plan.namespace}',`);
  upStatements.push(`      version: ${plan.toVersion},`);
  upStatements.push(`      updated_at: new Date(),`);
  upStatements.push(`    })`);
  upStatements.push(`    .onConflict((oc) => oc.column('namespace').doUpdateSet({`);
  upStatements.push(`      version: ${plan.toVersion},`);
  upStatements.push(`      updated_at: new Date(),`);
  upStatements.push(`    }))`);
  upStatements.push(`    .execute();`);

  downStatements.push(``);
  downStatements.push(`  // Revert schema version`);
  downStatements.push(
    `  await db.updateTable('_superfunctions_schema_versions')`
  );
  downStatements.push(`    .set({ version: ${plan.fromVersion}, updated_at: new Date() })`);
  downStatements.push(`    .where('namespace', '=', '${plan.namespace}')`);
  downStatements.push(`    .execute();`);

  const content = `import { Kysely${dialect === 'mysql' ? ', sql' : ''} } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
${upStatements.join('\n')}
}

export async function down(db: Kysely<any>): Promise<void> {
${downStatements.join('\n')}
}
`;

  return {
    filename,
    content,
  };
}
