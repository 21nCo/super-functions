/**
 * Schema definition for authfn
 * Used by @superfunctions/cli to generate migrations
 */

import type { TableSchema } from '@superfunctions/db';

export function getSchema(config?: { namespace?: string }): {
  version: number;
  schemas: TableSchema[];
} {
  const namespace = config?.namespace || 'authfn';

  return {
    version: 1,
    schemas: [
      // API Keys table
      {
        modelName: 'apiKeys',
        fields: {
          id: {
            type: 'string',
            required: true,
            fieldName: 'id',
          },
          key: {
            type: 'string',
            required: true,
            unique: true,
            fieldName: 'key',
          },
          name: {
            type: 'string',
            required: true,
            fieldName: 'name',
          },
          resourceIds: {
            type: 'json',
            required: true,
            fieldName: 'resource_ids',
          },
          scopes: {
            type: 'json',
            required: false,
            fieldName: 'scopes',
          },
          metadata: {
            type: 'json',
            required: false,
            fieldName: 'metadata',
          },
          expiresAt: {
            type: 'date',
            required: false,
            fieldName: 'expires_at',
          },
          lastUsedAt: {
            type: 'date',
            required: false,
            fieldName: 'last_used_at',
          },
          revokedAt: {
            type: 'date',
            required: false,
            fieldName: 'revoked_at',
          },
          createdAt: {
            type: 'date',
            required: true,
            fieldName: 'created_at',
          },
        },
        indexes: [
          {
            name: `idx_${namespace}_api_keys_key`,
            fields: ['key'],
            unique: true,
          },
        ],
      },
    ],
  };
}
