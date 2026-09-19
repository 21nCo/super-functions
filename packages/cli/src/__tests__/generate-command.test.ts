import { describe, expect, it } from 'vitest';
import type { TableSchema } from '@superfunctions/db';
import { createPendingMigration } from '../commands/generate.js';
import type { DatabaseTable } from '../utils/introspection.js';

const authFnTables = [
  {
    modelName: 'users',
    fields: {
      id: { type: 'string', required: true, fieldName: 'id', maxLength: 255 },
    },
  },
  {
    modelName: 'sessions',
    fields: {
      id: { type: 'string', required: true, fieldName: 'id', maxLength: 255 },
      userId: { type: 'string', required: true, fieldName: 'user_id', maxLength: 255 },
    },
  },
] as unknown as TableSchema[];

function column(
  dialect: 'postgres' | 'mysql' | 'sqlite',
  tableName: string,
  columnName: string,
  primary = false,
) {
  return {
    dialect,
    tableName,
    columnName,
    dataType: 'text',
    maxLength: dialect === 'mysql' ? 65_535 : null,
    isNullable: false,
    defaultValue: null,
    isPrimaryKey: primary,
    isUnique: primary,
  };
}

function currentAuthFnTables(dialect: 'postgres' | 'mysql' | 'sqlite'): DatabaseTable[] {
  const foreignKey = {
    name: 'authfn_sessions_user_id_fk',
    type: 'FOREIGN KEY' as const,
    tableName: 'authfn_sessions',
    columns: ['user_id'],
    referencedTable: 'authfn_users',
    referencedColumns: ['id'],
  };
  return [
    {
      name: 'authfn_users',
      columns: [column(dialect, 'authfn_users', 'id', true)],
      indexes: [{
        name: 'PRIMARY',
        tableName: 'authfn_users',
        columns: ['id'],
        isUnique: true,
      }],
      constraints: [
        {
          name: 'PRIMARY',
          type: 'PRIMARY KEY',
          tableName: 'authfn_users',
          columns: ['id'],
        },
        foreignKey,
      ],
    },
    {
      name: 'authfn_sessions',
      columns: [
        column(dialect, 'authfn_sessions', 'id', true),
        column(dialect, 'authfn_sessions', 'user_id'),
      ],
      indexes: [{
        name: 'PRIMARY',
        tableName: 'authfn_sessions',
        columns: ['id'],
        isUnique: true,
      }],
      constraints: [
        {
          name: 'PRIMARY',
          type: 'PRIMARY KEY',
          tableName: 'authfn_sessions',
          columns: ['id'],
        },
        foreignKey,
      ],
    },
  ];
}

describe('generate command migration planning', () => {
  it('returns a version-only file for outdated PostgreSQL and SQLite namespaces', () => {
    for (const dialect of ['postgres', 'sqlite'] as const) {
      const pending = createPendingMigration({
        adapterType: 'drizzle',
        dialect,
        library: { namespace: 'authfn', version: 2, tables: authFnTables },
        currentVersion: 1,
        currentTables: currentAuthFnTables(dialect),
      });

      expect(pending).not.toBeNull();
      expect(pending?.tableDiffs).toEqual([]);
      expect(pending?.migrationFile.content).toContain('From version 1 to 2');
      expect(pending?.migrationFile.content).toContain(
        'UPDATE _superfunctions_schema_versions SET version = 2',
      );
    }
  });

  it('keeps AuthFn v1 MySQL TEXT keys in place around primary and foreign keys', () => {
    const pending = createPendingMigration({
      adapterType: 'drizzle',
      dialect: 'mysql',
      library: { namespace: 'authfn', version: 2, tables: authFnTables },
      currentVersion: 1,
      currentTables: currentAuthFnTables('mysql'),
    });

    expect(pending).not.toBeNull();
    expect(pending?.tableDiffs).toEqual([]);
    expect(pending?.migrationFile.content).toContain('From version 1 to 2');
    expect(pending?.migrationFile.content).not.toContain('ALTER TABLE');
    expect(pending?.migrationFile.content).not.toContain('DROP INDEX');

    const sequential = createPendingMigration({
      adapterType: 'drizzle',
      dialect: 'mysql',
      library: { namespace: 'authfn', version: 3, tables: authFnTables },
      currentVersion: 2,
      currentTables: currentAuthFnTables('mysql'),
    });
    expect(sequential?.tableDiffs).toEqual([]);
    expect(sequential?.migrationFile.content).toContain('From version 2 to 3');
    expect(sequential?.migrationFile.content).not.toContain('ALTER TABLE');

    const v3Tables = authFnTables.map((table) => table.modelName === 'users'
      ? {
          ...table,
          fields: {
            ...table.fields,
            displayName: {
              type: 'string' as const,
              required: false,
              fieldName: 'display_name',
              maxLength: 100,
            },
          },
        }
      : table);
    const v3CurrentTables = currentAuthFnTables('mysql');
    const legacyDisplayName = column(
      'mysql',
      'authfn_users',
      'display_name',
    );
    legacyDisplayName.isNullable = true;
    v3CurrentTables[0].columns.push(legacyDisplayName);
    const intentionalV3Bound = createPendingMigration({
      adapterType: 'drizzle',
      dialect: 'mysql',
      library: { namespace: 'authfn', version: 3, tables: v3Tables },
      currentVersion: 2,
      currentTables: v3CurrentTables,
    });
    expect(intentionalV3Bound?.tableDiffs).toEqual([
      expect.objectContaining({
        tableName: 'authfn_users',
        columnChanges: [expect.objectContaining({
          column: 'display_name',
          change: 'maxLength changed from 65535 to 100',
        })],
      }),
    ]);
    expect(intentionalV3Bound?.migrationFile.content).toContain(
      'ALTER TABLE authfn_users MODIFY COLUMN display_name VARCHAR(100) NULL;',
    );

    const kysely = createPendingMigration({
      adapterType: 'kysely',
      dialect: 'mysql',
      library: { namespace: 'authfn', version: 2, tables: authFnTables },
      currentVersion: 1,
      currentTables: currentAuthFnTables('mysql'),
    });
    expect(kysely?.migrationFile.content).toContain('.onDuplicateKeyUpdate({');
    expect(kysely?.migrationFile.content).not.toContain('.onConflict(');
  });
});
