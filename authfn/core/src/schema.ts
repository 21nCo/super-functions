import type { TableSchema } from '@superfunctions/db';
import { resolveSchemaPluginInputs } from './schema-plugin-descriptors.js';
import { AuthFnConfigError, AuthFnConflictError } from './types.js';
import type { AuthFnSchemaConfig, AuthFnSchemaDefinition } from './types.js';

export const AUTHFN_SCHEMA_VERSION = 1;

export function getSchema(config: AuthFnSchemaConfig): AuthFnSchemaDefinition {
  if (!Array.isArray(config.plugins)) {
    throw new AuthFnConfigError('authfn plugins must be provided as an array');
  }

  const baseTables = createCoreTables();
  const resolvedPlugins = resolveSchemaPluginInputs(config.plugins);
  const resolvedConfig = {
    ...config,
    plugins: resolvedPlugins
  };
  const pluginTables = resolvedPlugins.flatMap((plugin) => plugin.schema?.(resolvedConfig) ?? []);
  const orderedTables = [...baseTables, ...pluginTables].map((table) => normalizeTableSchema(table));

  assertNoTableConflicts(orderedTables);

  return {
    version: AUTHFN_SCHEMA_VERSION,
    schemas: orderedTables
  };
}

export function createCoreTables(): TableSchema[] {
  return [
    {
      modelName: 'users',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        primaryEmail: { type: 'string', required: false, fieldName: 'primary_email' },
        emailVerifiedAt: { type: 'date', required: false, fieldName: 'email_verified_at' },
        metadata: { type: 'json', required: false, fieldName: 'metadata' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_users_primary_email',
          fields: ['primaryEmail'],
          unique: true
        }
      ]
    },
    {
      modelName: 'sessions',
      fields: {
        id: { type: 'string', required: true, fieldName: 'id' },
        userId: {
          type: 'string',
          required: true,
          fieldName: 'user_id',
          references: { model: 'users', field: 'id', onDelete: 'cascade' }
        },
        tokenHash: { type: 'string', required: true, fieldName: 'token_hash' },
        csrfHash: { type: 'string', required: false, fieldName: 'csrf_hash' },
        methods: { type: 'json', required: true, fieldName: 'methods' },
        metadata: { type: 'json', required: false, fieldName: 'metadata' },
        expiresAt: { type: 'date', required: true, fieldName: 'expires_at' },
        revokedAt: { type: 'date', required: false, fieldName: 'revoked_at' },
        createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        updatedAt: { type: 'date', required: true, fieldName: 'updated_at' },
        lastAuthenticatedAt: { type: 'date', required: false, fieldName: 'last_authenticated_at' }
      },
      indexes: [
        {
          name: 'idx_authfn_sessions_expires_at',
          fields: ['expiresAt']
        },
        {
          name: 'idx_authfn_sessions_token_hash',
          fields: ['tokenHash'],
          unique: true
        },
        {
          name: 'idx_authfn_sessions_user_id_created_at',
          fields: ['userId', 'createdAt']
        }
      ]
    }
  ];
}

export function normalizeTableSchema(table: TableSchema): TableSchema {
  return {
    ...table,
    fields: Object.fromEntries(
      Object.entries(table.fields)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fieldName, field]) => [fieldName, normalizeFieldSchema(field)])
    ),
    indexes: table.indexes
      ? [...table.indexes].sort((left, right) => left.name.localeCompare(right.name))
      : undefined,
    constraints: table.constraints
      ? [...table.constraints].sort((left, right) => left.name.localeCompare(right.name))
      : undefined
  };
}

function normalizeFieldSchema(field: TableSchema['fields'][string]): TableSchema['fields'][string] {
  if (field.type !== 'date' && field.type !== 'datetime') {
    return field;
  }

  return {
    ...field,
    dateValueType: field.dateValueType ?? 'date',
    dateStorageType: field.dateStorageType ?? 'timestamptz'
  };
}

function assertNoTableConflicts(tables: readonly TableSchema[]): void {
  const seenTableNames = new Set<string>();

  for (const table of tables) {
    if (seenTableNames.has(table.modelName)) {
      throw new AuthFnConflictError(`duplicate authfn table schema: ${table.modelName}`, {
        tableName: table.modelName
      });
    }
    seenTableNames.add(table.modelName);

    const seenColumnNames = new Set<string>();
    for (const [fieldName, fieldSchema] of Object.entries(table.fields)) {
      const columnName = fieldSchema.fieldName ?? fieldName;
      if (seenColumnNames.has(columnName)) {
        throw new AuthFnConflictError(
          `duplicate authfn column mapping: ${table.modelName}.${columnName}`,
          {
            tableName: table.modelName,
            columnName
          }
        );
      }
      seenColumnNames.add(columnName);
    }
  }
}
