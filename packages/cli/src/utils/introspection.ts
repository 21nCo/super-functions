/**
 * Schema introspection utilities for different database types
 * Queries information_schema or equivalent to discover current database structure
 */

import type { TableSchema, FieldSchema } from '@superfunctions/db';

export interface DatabaseColumn {
  dialect?: 'postgres' | 'mysql' | 'sqlite';
  tableName: string;
  columnName: string;
  dataType: string;
  /** Complete dialect-native type, for example `decimal(10,2) unsigned`. */
  columnType?: string;
  maxLength?: number | null;
  extra?: string | null;
  generationExpression?: string | null;
  isVisible?: boolean;
  characterSet?: string | null;
  collation?: string | null;
  comment?: string | null;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isUnique: boolean;
}

export interface DatabaseTable {
  name: string;
  schema?: string;
  columns: DatabaseColumn[];
  indexes: DatabaseIndex[];
  constraints: DatabaseConstraint[];
}

export interface DatabaseIndex {
  name: string;
  tableName: string;
  columns: string[];
  /** MySQL prefix length for each corresponding column, or null for full width. */
  prefixLengths?: Array<number | null>;
  /** Dialect-native MySQL index method, for example BTREE or FULLTEXT. */
  indexType?: string;
  isUnique: boolean;
}

export interface DatabaseConstraint {
  name: string;
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK';
  tableName: string;
  tableSchema?: string;
  columns: string[];
  referencedTable?: string;
  referencedTableSchema?: string;
  referencedColumns?: string[];
}

/**
 * Introspect PostgreSQL database schema
 */
export async function introspectPostgres(
  db: any,
  schema: string = 'public',
  tablePrefix?: string
): Promise<DatabaseTable[]> {
  // Query tables
  const tablesQuery = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = $1 
      AND table_type = 'BASE TABLE'
      ${tablePrefix ? `AND table_name LIKE $2` : ''}
    ORDER BY table_name
  `;
  const tables = await db.query(
    tablesQuery,
    tablePrefix ? [schema, `${tablePrefix}%`] : [schema]
  );

  const result: DatabaseTable[] = [];

  for (const { table_name } of tables.rows) {
    // Query columns
    const columnsQuery = `
      SELECT 
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
        CASE WHEN uq.column_name IS NOT NULL THEN true ELSE false END as is_unique
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku 
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_schema = $1 
          AND tc.table_name = $2
          AND tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.column_name = pk.column_name
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku 
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.table_schema = $1 
          AND tc.table_name = $2
          AND tc.constraint_type = 'UNIQUE'
      ) uq ON c.column_name = uq.column_name
      WHERE c.table_schema = $1 
        AND c.table_name = $2
      ORDER BY c.ordinal_position
    `;
    const columns = await db.query(columnsQuery, [schema, table_name]);

    // Query indexes
    const indexesQuery = `
      SELECT 
        i.indexname as name,
        i.tablename,
        ARRAY_AGG(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
        ix.indisunique as is_unique
      FROM pg_indexes i
      JOIN pg_class c ON c.relname = i.indexname
      JOIN pg_namespace index_ns ON index_ns.oid = c.relnamespace
      JOIN pg_index ix ON ix.indexrelid = c.oid
      JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = ANY(ix.indkey)
      WHERE i.schemaname = $1 
        AND index_ns.nspname = $1
        AND i.tablename = $2
      GROUP BY i.indexname, i.tablename, ix.indisunique
    `;
    const indexes = await db.query(indexesQuery, [schema, table_name]);

    result.push({
      name: table_name,
      columns: columns.rows.map((c: any) => ({
        dialect: 'postgres' as const,
        tableName: table_name,
        columnName: c.column_name,
        dataType: c.data_type,
        maxLength: c.character_maximum_length == null
          ? null
          : Number(c.character_maximum_length),
        isNullable: c.is_nullable === 'YES',
        defaultValue: c.column_default,
        isPrimaryKey: c.is_primary_key,
        isUnique: c.is_unique,
      })),
      indexes: indexes.rows.map((idx: any) => ({
        name: idx.name,
        tableName: idx.tablename,
        columns: idx.columns,
        isUnique: idx.is_unique,
      })),
      constraints: [],
    });
  }

  return result;
}

/**
 * Introspect MySQL database schema
 */
export async function introspectMySQL(
  db: any,
  database: string,
  tablePrefix?: string
): Promise<DatabaseTable[]> {
  // Query tables
  const tablesQuery = `
    SELECT TABLE_NAME as table_name
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = ?
      AND TABLE_TYPE = 'BASE TABLE'
      ${tablePrefix ? `AND TABLE_NAME LIKE ?` : ''}
    ORDER BY TABLE_NAME
  `;
  const [tables] = await db.query(
    tablesQuery,
    tablePrefix ? [database, `${tablePrefix}%`] : [database]
  );

  const result: DatabaseTable[] = [];

  for (const { table_name } of tables) {
    // Query columns
    const columnsQuery = `
      SELECT 
        COLUMN_NAME as column_name,
        DATA_TYPE as data_type,
        COLUMN_TYPE as column_type,
        CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
        EXTRA as extra,
        GENERATION_EXPRESSION as generation_expression,
        CHARACTER_SET_NAME as character_set_name,
        COLLATION_NAME as collation_name,
        COLUMN_COMMENT as column_comment,
        IS_NULLABLE as is_nullable,
        COLUMN_DEFAULT as column_default,
        COLUMN_KEY as column_key
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `;
    const [columns] = await db.query(columnsQuery, [database, table_name]);

    // Query indexes
    const indexesQuery = `
      SELECT 
        INDEX_NAME as name,
        TABLE_NAME as table_name,
        NON_UNIQUE as non_unique,
        COLUMN_NAME as column_name,
        SUB_PART as sub_part,
        INDEX_TYPE as index_type
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;
    const [indexRows] = await db.query(indexesQuery, [database, table_name]);

    // Query both foreign keys declared by this table and inbound foreign keys
    // that reference it. MySQL can reject a column type/width change while
    // either dependency remains active, so migration planning must be able to
    // refuse changes it cannot safely sequence.
    const constraintsQuery = `
      SELECT
        CONSTRAINT_NAME as name,
        TABLE_SCHEMA as table_schema,
        TABLE_NAME as table_name,
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_SCHEMA as referenced_table_schema,
        REFERENCED_TABLE_NAME as referenced_table,
        REFERENCED_COLUMN_NAME as referenced_column
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE REFERENCED_TABLE_NAME IS NOT NULL
        AND (
          (TABLE_SCHEMA = ? AND TABLE_NAME = ?)
          OR
          (REFERENCED_TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME = ?)
        )
      ORDER BY TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
    `;
    const [constraintRows] = await db.query(
      constraintsQuery,
      [database, table_name, database, table_name],
    );

    // Group indexes by name
    const indexMap = new Map<string, DatabaseIndex>();
    for (const row of indexRows as any[]) {
      if (!indexMap.has(row.name)) {
        indexMap.set(row.name, {
          name: row.name,
          tableName: row.table_name,
          columns: [],
          prefixLengths: [],
          indexType: row.index_type,
          isUnique: row.non_unique === 0,
        });
      }
      indexMap.get(row.name)!.columns.push(row.column_name);
      indexMap.get(row.name)!.prefixLengths!.push(
        row.sub_part == null ? null : Number(row.sub_part),
      );
    }

    const constraintMap = new Map<string, DatabaseConstraint>();
    for (const row of constraintRows as any[]) {
      const key = `${row.table_schema}:${row.table_name}:${row.name}`;
      if (!constraintMap.has(key)) {
        constraintMap.set(key, {
          name: row.name,
          type: 'FOREIGN KEY',
          tableSchema: row.table_schema,
          tableName: row.table_name,
          columns: [],
          referencedTableSchema: row.referenced_table_schema,
          referencedTable: row.referenced_table,
          referencedColumns: [],
        });
      }
      const constraint = constraintMap.get(key)!;
      constraint.columns.push(row.column_name);
      constraint.referencedColumns!.push(row.referenced_column);
    }

    result.push({
      name: table_name,
      schema: database,
      columns: (columns as any[]).map((c) => ({
        dialect: 'mysql' as const,
        tableName: table_name,
        columnName: c.column_name,
        dataType: c.data_type,
        columnType: c.column_type,
        maxLength: c.character_maximum_length == null
          ? null
          : Number(c.character_maximum_length),
        extra: c.extra,
        generationExpression: c.generation_expression,
        isVisible: !/\bINVISIBLE\b/i.test(String(c.extra ?? '')),
        characterSet: c.character_set_name,
        collation: c.collation_name,
        comment: c.column_comment,
        isNullable: c.is_nullable === 'YES',
        defaultValue: c.column_default,
        isPrimaryKey: c.column_key === 'PRI',
        isUnique: c.column_key === 'UNI',
      })),
      indexes: Array.from(indexMap.values()),
      constraints: Array.from(constraintMap.values()),
    });
  }

  return result;
}

/**
 * Introspect SQLite database schema
 */
export async function introspectSQLite(
  db: any,
  tablePrefix?: string
): Promise<DatabaseTable[]> {
  // Query tables
  const tablesQuery = `
    SELECT name as table_name
    FROM sqlite_master 
    WHERE type = 'table' 
      AND name NOT LIKE 'sqlite_%'
      ${tablePrefix ? `AND name LIKE ?` : ''}
    ORDER BY name
  `;
  const tables = await db.all(
    tablesQuery,
    tablePrefix ? [`${tablePrefix}%`] : []
  );

  const result: DatabaseTable[] = [];

  for (const { table_name } of tables) {
    // Query columns using PRAGMA
    const columns = await db.all(`PRAGMA table_info(${table_name})`);

    // Query indexes
    const indexesQuery = await db.all(
      `SELECT name, "unique" AS is_unique FROM pragma_index_list(?)`,
      [table_name]
    );

    const indexes: DatabaseIndex[] = [];
    for (const { name, is_unique } of indexesQuery) {
      const indexInfo = await db.all(
        `SELECT name, seqno FROM pragma_index_info(?) ORDER BY seqno`,
        [name],
      );
      indexes.push({
        name,
        tableName: table_name,
        columns: indexInfo.map((i: any) => i.name),
        isUnique: Number(is_unique) === 1,
      });
    }

    result.push({
      name: table_name,
      columns: columns.map((c: any) => ({
        dialect: 'sqlite' as const,
        tableName: table_name,
        columnName: c.name,
        dataType: c.type,
        isNullable: c.notnull === 0,
        defaultValue: c.dflt_value,
        isPrimaryKey: c.pk === 1,
        isUnique: false,
      })),
      indexes,
      constraints: [],
    });
  }

  return result;
}

/**
 * Convert database column type to FieldSchema type
 */
export function mapDatabaseTypeToFieldType(dbType: string): FieldSchema['type'] {
  const normalized = dbType.toLowerCase();

  if (normalized.includes('int') || normalized.includes('serial')) {
    return normalized.includes('big') ? 'bigint' : 'number';
  }
  if (
    normalized.includes('varchar') ||
    normalized.includes('text') ||
    normalized.includes('char')
  ) {
    return 'string';
  }
  if (normalized.includes('bool')) {
    return 'boolean';
  }
  if (
    normalized.includes('timestamp') ||
    normalized.includes('date') ||
    normalized.includes('time')
  ) {
    return 'date';
  }
  if (normalized.includes('json')) {
    return 'json';
  }

  // Default to string for unknown types
  return 'string';
}

/**
 * Convert DatabaseTable to TableSchema
 */
export function databaseTableToSchema(dbTable: DatabaseTable): TableSchema {
  const fields: Record<string, FieldSchema> = {};

  for (const col of dbTable.columns) {
    fields[col.columnName] = {
      type: mapDatabaseTypeToFieldType(col.dataType),
      required: !col.isNullable,
      unique: col.isUnique || col.isPrimaryKey,
      fieldName: col.columnName,
    };
  }

  return {
    modelName: dbTable.name,
    fields,
    indexes: dbTable.indexes.map((idx) => ({
      name: idx.name,
      fields: idx.columns,
      unique: idx.isUnique,
    })),
    constraints: [],
  };
}
