import { describe, expect, it } from 'vitest';
import type { TableSchema } from '@superfunctions/db';
import { createPendingMigration } from '../commands/generate.js';
import type { DatabaseTable } from '../utils/introspection.js';

const authFnTables = [
  {
    modelName: 'users',
    fields: {
      id: { type: 'string', required: true, fieldName: 'id', maxLength: 767 },
      primaryEmail: { type: 'string', required: false, fieldName: 'primary_email', maxLength: 255 },
    },
  },
  {
    modelName: 'sessions',
    fields: {
      id: { type: 'string', required: true, fieldName: 'id', maxLength: 255 },
      userId: { type: 'string', required: true, fieldName: 'user_id', maxLength: 767 },
    },
  },
] as unknown as TableSchema[];

const authFnApiKeyTable = {
  modelName: 'api_keys',
  fields: {
    id: { type: 'string', required: true, fieldName: 'id', maxLength: 255 },
    userId: { type: 'string', required: false, fieldName: 'user_id', maxLength: 767 },
    secretHash: { type: 'string', required: true, fieldName: 'secret_hash', maxLength: 255 },
    createdAt: {
      type: 'date',
      required: true,
      fieldName: 'created_at',
      dateStorageType: 'timestamptz',
    },
  },
  indexes: [{
    name: 'idx_authfn_api_keys_user_id_created_at',
    fields: ['userId', 'createdAt'],
  }],
} as unknown as TableSchema;

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

function currentAuthFnTables(
  dialect: 'postgres' | 'mysql' | 'sqlite',
  namespace = 'authfn',
): DatabaseTable[] {
  const usersTable = `${namespace}_users`;
  const sessionsTable = `${namespace}_sessions`;
  const primaryEmail = column(dialect, usersTable, 'primary_email');
  primaryEmail.isNullable = true;
  const foreignKey = {
    name: `${sessionsTable}_user_id_fk`,
    type: 'FOREIGN KEY' as const,
    tableName: sessionsTable,
    columns: ['user_id'],
    referencedTable: usersTable,
    referencedColumns: ['id'],
  };
  return [
    {
      name: usersTable,
      columns: [column(dialect, usersTable, 'id', true), primaryEmail],
      indexes: [{
        name: 'PRIMARY',
        tableName: usersTable,
        columns: ['id'],
        isUnique: true,
      }],
      constraints: [
        {
          name: 'PRIMARY',
          type: 'PRIMARY KEY',
          tableName: usersTable,
          columns: ['id'],
        },
        foreignKey,
      ],
    },
    {
      name: sessionsTable,
      columns: [
        column(dialect, sessionsTable, 'id', true),
        column(dialect, sessionsTable, 'user_id'),
      ],
      indexes: [{
        name: 'PRIMARY',
        tableName: sessionsTable,
        columns: ['id'],
        isUnique: true,
      }],
      constraints: [
        {
          name: 'PRIMARY',
          type: 'PRIMARY KEY',
          tableName: sessionsTable,
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

    const v3ChangedLegacyBound = authFnTables.map((table) => table.modelName === 'users'
      ? {
          ...table,
          fields: {
            ...table.fields,
            primaryEmail: { ...table.fields.primaryEmail, maxLength: 128 },
          },
        }
      : table);
    const intentionalLegacyV3Bound = createPendingMigration({
      adapterType: 'drizzle',
      dialect: 'mysql',
      library: { namespace: 'authfn', version: 3, tables: v3ChangedLegacyBound },
      currentVersion: 2,
      currentTables: currentAuthFnTables('mysql'),
    });
    expect(intentionalLegacyV3Bound?.tableDiffs).toEqual([
      expect.objectContaining({
        tableName: 'authfn_users',
        columnChanges: [expect.objectContaining({
          column: 'primary_email',
          change: 'maxLength changed from 65535 to 128',
        })],
      }),
    ]);
    expect(intentionalLegacyV3Bound?.migrationFile.content).toContain(
      'ALTER TABLE authfn_users MODIFY COLUMN primary_email VARCHAR(128) NULL;',
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

  it('preserves AuthFn v1 MySQL TEXT keys in a custom namespace', () => {
    const pending = createPendingMigration({
      adapterType: 'drizzle',
      dialect: 'mysql',
      library: {
        libraryName: 'authfn',
        namespace: 'authfn_tenant',
        version: 2,
        tables: authFnTables,
      },
      currentVersion: 1,
      currentTables: currentAuthFnTables('mysql', 'authfn_tenant'),
    });

    expect(pending?.tableDiffs).toEqual([]);
    expect(pending?.migrationFile.content).toContain('From version 1 to 2');
    expect(pending?.migrationFile.content).not.toContain('ALTER TABLE');
  });

  it('creates newly enabled AuthFn plugin references wide enough for legacy users', () => {
    const pending = createPendingMigration({
      adapterType: 'drizzle',
      dialect: 'mysql',
      library: {
        libraryName: 'authfn',
        namespace: 'authfn',
        version: 2,
        tables: [...authFnTables, authFnApiKeyTable],
      },
      currentVersion: 1,
      currentTables: currentAuthFnTables('mysql'),
    });

    expect(pending?.tableDiffs).toContainEqual(expect.objectContaining({
      tableName: 'authfn_api_keys',
      action: 'create',
    }));
    expect(pending?.migrationFile.content).toContain('user_id VARCHAR(767)');
    expect(pending?.migrationFile.content).toContain(
      'idx_authfn_api_keys_user_id_created_at',
    );
  });
});
