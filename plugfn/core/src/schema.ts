import type { TableSchema } from '@superfunctions/db';
import {
  getOAuthStorageTableDefinitions,
  type OAuthStorageTableDefinition,
} from '@superfunctions/oauth-storage';
import { DEFAULT_PLUGFN_STORAGE_MODELS, resolvePlugFnStorageModels, type PlugFnStorageModelMapping } from './storage/adapters/database.js';

// Version 7 persists sync-job tenant identity so administrative list queries can
// enforce the same tenant boundary as connection-scoped get and mutation paths.
export const PLUGFN_SCHEMA_VERSION = 7;

export interface PlugFnSchemaOptions {
  namespace?: string;
  models?: Partial<PlugFnStorageModelMapping>;
}

export function getSchema(options: PlugFnSchemaOptions = {}): { version: number; schemas: TableSchema[] } {
  const models = resolvePlugFnStorageModels(options.models);

  return {
    version: PLUGFN_SCHEMA_VERSION,
    schemas: withDateDefaults([
      {
        modelName: models.connections,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          userId: { type: 'string', required: true, fieldName: 'user_id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          ownerKind: { type: 'string', required: false, fieldName: 'owner_kind' },
          ownerId: { type: 'string', required: false, fieldName: 'owner_id' },
          tenantId: { type: 'string', required: false, fieldName: 'tenant_id' },
          organizationId: { type: 'string', required: false, fieldName: 'organization_id' },
          installedByUserId: { type: 'string', required: false, fieldName: 'installed_by_user_id' },
          delegatedToUserId: { type: 'string', required: false, fieldName: 'delegated_to_user_id' },
          grants: { type: 'json', required: false, fieldName: 'grants' },
          name: { type: 'string', required: false, fieldName: 'name' },
          status: { type: 'string', required: true, fieldName: 'status' },
          credentials: { type: 'json', required: true, fieldName: 'credentials' },
          scopes: { type: 'json', required: false, fieldName: 'scopes' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          expiresAt: { type: 'date', required: false, fieldName: 'expires_at' },
          connectedAt: { type: 'date', required: true, fieldName: 'connected_at' },
          lastUsedAt: { type: 'date', required: false, fieldName: 'last_used_at' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_connections_user_provider', fields: ['userId', 'provider'] },
          { name: 'idx_plugfn_connections_owner', fields: ['ownerKind', 'ownerId'] },
          { name: 'idx_plugfn_connections_status', fields: ['status'] }
        ]
      },
      ...createPlugFnOAuthStorageSchemas(models),
      {
        modelName: models.workflows,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          userId: { type: 'string', required: true, fieldName: 'user_id' },
          name: { type: 'string', required: true, fieldName: 'name' },
          description: { type: 'string', required: false, fieldName: 'description' },
          definition: { type: 'json', required: true, fieldName: 'definition' },
          status: { type: 'string', required: true, fieldName: 'status' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_workflows_user_id', fields: ['userId'] },
          { name: 'idx_plugfn_workflows_status', fields: ['status'] }
        ]
      },
      {
        modelName: models.workflowExecutions,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          workflowId: { type: 'string', required: true, fieldName: 'workflow_id' },
          status: { type: 'string', required: true, fieldName: 'status' },
          input: { type: 'json', required: false, fieldName: 'input' },
          output: { type: 'json', required: false, fieldName: 'output' },
          error: { type: 'string', required: false, fieldName: 'error' },
          durationMs: { type: 'number', required: false, fieldName: 'duration_ms' },
          startedAt: { type: 'date', required: true, fieldName: 'started_at' },
          completedAt: { type: 'date', required: false, fieldName: 'completed_at' }
        },
        indexes: [
          { name: 'idx_plugfn_workflow_executions_workflow_id', fields: ['workflowId'] },
          { name: 'idx_plugfn_workflow_executions_status', fields: ['status'] }
        ]
      },
      {
        modelName: models.webhooks ?? DEFAULT_PLUGFN_STORAGE_MODELS.webhooks,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          connectionId: { type: 'string', required: false, fieldName: 'connection_id' },
          events: { type: 'json', required: true, fieldName: 'events' },
          webhookUrl: { type: 'string', required: true, fieldName: 'webhook_url' },
          secret: { type: 'string', required: true, fieldName: 'secret' },
          status: { type: 'string', required: true, fieldName: 'status' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_webhooks_provider', fields: ['provider'] },
          { name: 'idx_plugfn_webhooks_connection_id', fields: ['connectionId'] }
        ]
      },
      {
        modelName: models.actionLogs ?? DEFAULT_PLUGFN_STORAGE_MODELS.actionLogs,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          userId: { type: 'string', required: false, fieldName: 'user_id' },
          provider: { type: 'string', required: false, fieldName: 'provider' },
          action: { type: 'string', required: false, fieldName: 'action' },
          connectionId: { type: 'string', required: false, fieldName: 'connection_id' },
          status: { type: 'string', required: false, fieldName: 'status' },
          input: { type: 'json', required: false, fieldName: 'input' },
          output: { type: 'json', required: false, fieldName: 'output' },
          error: { type: 'string', required: false, fieldName: 'error' },
          durationMs: { type: 'number', required: false, fieldName: 'duration_ms' },
          retries: { type: 'number', required: false, fieldName: 'retries' },
          cached: { type: 'boolean', required: false, fieldName: 'cached' },
          executedAt: { type: 'date', required: true, fieldName: 'executed_at' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' }
        },
        indexes: [
          { name: 'idx_plugfn_action_logs_provider_action', fields: ['provider', 'action'] },
          { name: 'idx_plugfn_action_logs_connection_id', fields: ['connectionId'] }
        ]
      },
      {
        modelName: models.providerInstallations,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          ownerKind: { type: 'string', required: true, fieldName: 'owner_kind' },
          ownerId: { type: 'string', required: true, fieldName: 'owner_id' },
          tenantId: { type: 'string', required: false, fieldName: 'tenant_id' },
          organizationId: { type: 'string', required: false, fieldName: 'organization_id' },
          installedByUserId: { type: 'string', required: false, fieldName: 'installed_by_user_id' },
          delegatedToUserId: { type: 'string', required: false, fieldName: 'delegated_to_user_id' },
          status: { type: 'string', required: true, fieldName: 'status' },
          scopes: { type: 'json', required: false, fieldName: 'scopes' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_provider_installations_owner', fields: ['ownerKind', 'ownerId'] },
          { name: 'idx_plugfn_provider_installations_provider', fields: ['provider'] }
        ]
      },
      {
        modelName: models.connectionGrants,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          connectionId: { type: 'string', required: true, fieldName: 'connection_id' },
          granteeUserId: { type: 'string', required: true, fieldName: 'grantee_user_id' },
          grant: { type: 'string', required: true, fieldName: 'grant' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          expiresAt: { type: 'date', required: false, fieldName: 'expires_at' }
        },
        indexes: [
          { name: 'idx_plugfn_connection_grants_connection', fields: ['connectionId'] },
          { name: 'idx_plugfn_connection_grants_grantee', fields: ['granteeUserId'] }
        ]
      },
      {
        modelName: models.webhookReceipts,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          event: { type: 'string', required: true, fieldName: 'event' },
          idempotencyKey: { type: 'string', required: false, fieldName: 'idempotency_key' },
          connectionId: { type: 'string', required: false, fieldName: 'connection_id' },
          ownerKind: { type: 'string', required: false, fieldName: 'owner_kind' },
          ownerId: { type: 'string', required: false, fieldName: 'owner_id' },
          headersRedacted: { type: 'json', required: false, fieldName: 'headers_redacted' },
          payloadHash: { type: 'string', required: true, fieldName: 'payload_hash' },
          verificationStatus: { type: 'string', required: true, fieldName: 'verification_status' },
          receivedAt: { type: 'date', required: true, fieldName: 'received_at' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' }
        },
        indexes: [
          { name: 'idx_plugfn_webhook_receipts_provider_event', fields: ['provider', 'event'] },
          {
            name: 'idx_plugfn_webhook_receipts_idempotency',
            fields: ['provider', 'idempotencyKey'],
            unique: true
          }
        ]
      },
      {
        modelName: models.webhookDeliveries,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          receiptId: { type: 'string', required: true, fieldName: 'receipt_id' },
          sinkId: { type: 'string', required: false, fieldName: 'sink_id' },
          handlerName: { type: 'string', required: false, fieldName: 'handler_name' },
          status: { type: 'string', required: true, fieldName: 'status' },
          claimToken: { type: 'string', required: false, fieldName: 'claim_token' },
          attempts: { type: 'number', required: true, fieldName: 'attempts' },
          nextAttemptAt: { type: 'date', required: false, fieldName: 'next_attempt_at' },
          error: { type: 'string', required: false, fieldName: 'error' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_webhook_deliveries_receipt', fields: ['receiptId'] },
          { name: 'idx_plugfn_webhook_deliveries_status', fields: ['status'] }
        ]
      },
      {
        modelName: models.syncJobs,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          connectionId: { type: 'string', required: true, fieldName: 'connection_id' },
          resource: { type: 'string', required: true, fieldName: 'resource' },
          mode: { type: 'string', required: true, fieldName: 'mode' },
          status: { type: 'string', required: true, fieldName: 'status' },
          claimToken: { type: 'string', required: false, fieldName: 'claim_token', maxLength: 64 },
          ownerKind: { type: 'string', required: false, fieldName: 'owner_kind' },
          ownerId: { type: 'string', required: false, fieldName: 'owner_id' },
          tenantId: { type: 'string', required: false, fieldName: 'tenant_id' },
          cursor: { type: 'string', required: false, fieldName: 'cursor' },
          checkpoint: { type: 'json', required: false, fieldName: 'checkpoint' },
          fetchedCount: { type: 'number', required: true, fieldName: 'fetched_count' },
          persistedCount: { type: 'number', required: true, fieldName: 'persisted_count' },
          skippedCount: { type: 'number', required: true, fieldName: 'skipped_count' },
          error: { type: 'string', required: false, fieldName: 'error' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_sync_jobs_connection_resource', fields: ['connectionId', 'resource'] },
          { name: 'idx_plugfn_sync_jobs_status', fields: ['status'] },
          { name: 'idx_plugfn_sync_jobs_provider', fields: ['provider'] },
          { name: 'idx_plugfn_sync_jobs_owner_tenant', fields: ['ownerKind', 'ownerId', 'tenantId'] },
          { name: 'idx_plugfn_sync_jobs_claim_token', fields: ['claimToken'], unique: true }
        ]
      },
      {
        modelName: models.syncCheckpoints,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          connectionId: { type: 'string', required: true, fieldName: 'connection_id' },
          resource: { type: 'string', required: true, fieldName: 'resource' },
          checkpoint: { type: 'json', required: true, fieldName: 'checkpoint' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_sync_checkpoints_connection_resource', fields: ['connectionId', 'resource'], unique: true }
        ]
      },
      {
        modelName: models.providerEvents,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          event: { type: 'string', required: true, fieldName: 'event' },
          connectionId: { type: 'string', required: false, fieldName: 'connection_id' },
          ownerKind: { type: 'string', required: false, fieldName: 'owner_kind' },
          ownerId: { type: 'string', required: false, fieldName: 'owner_id' },
          payload: { type: 'json', required: false, fieldName: 'payload' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' }
        },
        indexes: [
          { name: 'idx_plugfn_provider_events_provider_event', fields: ['provider', 'event'] },
          { name: 'idx_plugfn_provider_events_connection', fields: ['connectionId'] }
        ]
      },
      {
        modelName: models.secretRefs,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          provider: { type: 'string', required: true, fieldName: 'provider' },
          ownerKind: { type: 'string', required: false, fieldName: 'owner_kind' },
          ownerId: { type: 'string', required: false, fieldName: 'owner_id' },
          keyRef: { type: 'string', required: true, fieldName: 'key_ref' },
          purpose: { type: 'string', required: true, fieldName: 'purpose' },
          metadata: { type: 'json', required: false, fieldName: 'metadata' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
          updatedAt: { type: 'date', required: true, fieldName: 'updated_at' }
        },
        indexes: [
          { name: 'idx_plugfn_secret_refs_provider_owner', fields: ['provider', 'ownerKind', 'ownerId'] },
          { name: 'idx_plugfn_secret_refs_purpose', fields: ['purpose'] }
        ]
      }
    ])
  };
}

const PLUGFN_OAUTH_STORAGE_MODELS: Record<'oauth_states' | 'oauth_tokens', keyof PlugFnStorageModelMapping> = {
  oauth_states: 'oauthStates',
  oauth_tokens: 'oauthTokens',
};

function createPlugFnOAuthStorageSchemas(models: PlugFnStorageModelMapping): TableSchema[] {
  return getOAuthStorageTableDefinitions()
    .filter((table): table is OAuthStorageTableDefinition & { name: 'oauth_states' | 'oauth_tokens' } =>
      table.name === 'oauth_states' || table.name === 'oauth_tokens'
    )
    .map((table) => mapOAuthStorageTableDefinition(table, models[PLUGFN_OAUTH_STORAGE_MODELS[table.name]]));
}

function mapOAuthStorageTableDefinition(
  table: OAuthStorageTableDefinition,
  modelName: string
): TableSchema {
  return {
    modelName,
    fields: Object.fromEntries(
      table.fields.map((field) => [
        field.name,
        {
          type: mapOAuthFieldType(field.type),
          required: field.primaryKey ? true : !field.nullable,
          unique: field.primaryKey || field.unique,
          fieldName: field.name,
        },
      ])
    ),
    indexes: table.indexes?.map((index) => ({
      name: index.name.replace(/^idx_oauth_/, 'idx_plugfn_oauth_'),
      fields: [...index.fields],
      unique: index.unique,
    })),
  };
}

function mapOAuthFieldType(type: 'text' | 'json' | 'boolean'): 'string' | 'json' | 'boolean' {
  switch (type) {
    case 'json':
      return 'json';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function withDateDefaults(tables: TableSchema[]): TableSchema[] {
  return tables.map((table) => ({
    ...table,
    fields: Object.fromEntries(
      Object.entries(table.fields).map(([name, field]) => [
        name,
        field.type === 'date' || field.type === 'datetime'
          ? {
              dateValueType: 'date',
              dateStorageType: 'timestamptz',
              ...field,
            }
          : field,
      ])
    ),
  }));
}
