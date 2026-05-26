import type { Adapter as DbAdapter, WhereClause } from '@superfunctions/db';
import type { Connection } from '../../types/connection.js';
import type {
  PlugFnConnectionGrant,
  PlugFnProviderEvent,
  PlugFnProviderInstallation,
  PlugFnSecretRef,
  PlugFnSyncCheckpoint,
  PlugFnSyncJob,
  PlugFnWebhookDelivery,
  PlugFnWebhookReceipt,
} from '../../types/runtime.js';
import type { Workflow, WorkflowExecution } from '../../types/workflow.js';
import type { WebhookRecord } from '../webhook-storage.js';

export interface PlugFnStorageModelMapping {
  connections: string;
  oauthStates: string;
  oauthTokens: string;
  workflows: string;
  workflowExecutions: string;
  webhooks: string;
  actionLogs: string;
  providerInstallations: string;
  connectionGrants: string;
  webhookReceipts: string;
  webhookDeliveries: string;
  syncJobs: string;
  syncCheckpoints: string;
  providerEvents: string;
  secretRefs: string;
}

export const DEFAULT_PLUGFN_STORAGE_MODELS: PlugFnStorageModelMapping = {
  connections: 'plugfn_connections',
  oauthStates: 'plugfn_oauth_states',
  oauthTokens: 'plugfn_oauth_tokens',
  workflows: 'plugfn_workflows',
  workflowExecutions: 'plugfn_workflow_executions',
  webhooks: 'plugfn_webhooks',
  actionLogs: 'plugfn_action_logs',
  providerInstallations: 'plugfn_provider_installations',
  connectionGrants: 'plugfn_connection_grants',
  webhookReceipts: 'plugfn_webhook_receipts',
  webhookDeliveries: 'plugfn_webhook_deliveries',
  syncJobs: 'plugfn_sync_jobs',
  syncCheckpoints: 'plugfn_sync_checkpoints',
  providerEvents: 'plugfn_provider_events',
  secretRefs: 'plugfn_secret_refs',
};

export type PlugFnRequiredModelName =
  | 'plugfn_connections'
  | 'plugfn_oauth_states'
  | 'plugfn_oauth_tokens'
  | 'plugfn_workflows'
  | 'plugfn_workflow_executions'
  | 'plugfn_webhooks'
  | 'plugfn_action_logs'
  | 'plugfn_provider_installations'
  | 'plugfn_connection_grants'
  | 'plugfn_webhook_receipts'
  | 'plugfn_webhook_deliveries'
  | 'plugfn_sync_jobs'
  | 'plugfn_sync_checkpoints'
  | 'plugfn_provider_events'
  | 'plugfn_secret_refs';

export const PLUGFN_REQUIRED_MODEL_NAMES: PlugFnRequiredModelName[] = [
  'plugfn_connections',
  'plugfn_oauth_states',
  'plugfn_oauth_tokens',
  'plugfn_workflows',
  'plugfn_workflow_executions',
  'plugfn_webhooks',
  'plugfn_action_logs',
  'plugfn_provider_installations',
  'plugfn_connection_grants',
  'plugfn_webhook_receipts',
  'plugfn_webhook_deliveries',
  'plugfn_sync_jobs',
  'plugfn_sync_checkpoints',
  'plugfn_provider_events',
  'plugfn_secret_refs',
];

export interface PlugFnDatabaseStorageAdapter {
  readonly database: DbAdapter;
  readonly models: PlugFnStorageModelMapping;
  createConnection(connection: Connection): Promise<Connection>;
  getConnection(id: string): Promise<Connection | null>;
  listConnections(userId: string, provider?: string): Promise<Connection[]>;
  updateConnection(id: string, updates: Partial<Connection>): Promise<Connection>;
  deleteConnection(id: string): Promise<void>;
  createWebhook(webhook: WebhookRecord): Promise<WebhookRecord>;
  getWebhook(id: string): Promise<WebhookRecord | null>;
  listWebhooks(provider?: string): Promise<WebhookRecord[]>;
  updateWebhook(id: string, updates: Partial<WebhookRecord>): Promise<WebhookRecord>;
  deleteWebhook(id: string): Promise<void>;
  createWorkflow(workflow: Workflow): Promise<Workflow>;
  getWorkflow(id: string): Promise<Workflow | null>;
  listWorkflows(userId?: string, status?: string): Promise<Workflow[]>;
  updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  createWorkflowExecution(execution: WorkflowExecution): Promise<WorkflowExecution>;
  updateWorkflowExecution(id: string, updates: Partial<WorkflowExecution>): Promise<WorkflowExecution>;
  listWorkflowExecutions(workflowId: string, limit?: number): Promise<WorkflowExecution[]>;
  createActionLog(log: Record<string, unknown>): Promise<Record<string, unknown>>;
  listActionLogs(filters: Record<string, unknown>, limit?: number): Promise<Record<string, unknown>[]>;
  createProviderInstallation(installation: PlugFnProviderInstallation): Promise<PlugFnProviderInstallation>;
  getProviderInstallation(id: string): Promise<PlugFnProviderInstallation | null>;
  listProviderInstallations(filters?: Record<string, unknown>): Promise<PlugFnProviderInstallation[]>;
  updateProviderInstallation(id: string, updates: Partial<PlugFnProviderInstallation>): Promise<PlugFnProviderInstallation>;
  createConnectionGrant(grant: PlugFnConnectionGrant): Promise<PlugFnConnectionGrant>;
  listConnectionGrants(connectionId: string): Promise<PlugFnConnectionGrant[]>;
  deleteConnectionGrant(id: string): Promise<void>;
  createWebhookReceipt(receipt: PlugFnWebhookReceipt): Promise<PlugFnWebhookReceipt>;
  getWebhookReceipt(id: string): Promise<PlugFnWebhookReceipt | null>;
  findWebhookReceiptByIdempotencyKey(provider: string, idempotencyKey: string): Promise<PlugFnWebhookReceipt | null>;
  updateWebhookReceipt(id: string, updates: Partial<PlugFnWebhookReceipt>): Promise<PlugFnWebhookReceipt>;
  createWebhookDelivery(delivery: PlugFnWebhookDelivery): Promise<PlugFnWebhookDelivery>;
  updateWebhookDelivery(id: string, updates: Partial<PlugFnWebhookDelivery>): Promise<PlugFnWebhookDelivery>;
  listWebhookDeliveries(receiptId: string): Promise<PlugFnWebhookDelivery[]>;
  listWebhookDeliveriesForRetry(now: Date, limit?: number): Promise<PlugFnWebhookDelivery[]>;
  claimWebhookDeliveriesForRetry(now: Date, limit: number, workerId: string): Promise<PlugFnWebhookDelivery[]>;
  createSyncJob(job: PlugFnSyncJob): Promise<PlugFnSyncJob>;
  getSyncJob(id: string): Promise<PlugFnSyncJob | null>;
  listSyncJobs(filters?: Record<string, unknown>, limit?: number): Promise<PlugFnSyncJob[]>;
  claimQueuedSyncJobs(limit: number, workerId: string): Promise<PlugFnSyncJob[]>;
  updateSyncJob(id: string, updates: Partial<PlugFnSyncJob>): Promise<PlugFnSyncJob>;
  upsertSyncCheckpoint(checkpoint: PlugFnSyncCheckpoint): Promise<PlugFnSyncCheckpoint>;
  getSyncCheckpoint(connectionId: string, resource: string): Promise<PlugFnSyncCheckpoint | null>;
  createProviderEvent(event: PlugFnProviderEvent): Promise<PlugFnProviderEvent>;
  listProviderEvents(filters?: Record<string, unknown>, limit?: number): Promise<PlugFnProviderEvent[]>;
  upsertSecretRef(secretRef: PlugFnSecretRef): Promise<PlugFnSecretRef>;
  listSecretRefs(filters?: Record<string, unknown>): Promise<PlugFnSecretRef[]>;
}

export interface PlugFnDatabaseAdapterOptions {
  database: DbAdapter;
  models?: Partial<PlugFnStorageModelMapping>;
}

export function createPlugFnDatabaseAdapter(
  options: PlugFnDatabaseAdapterOptions
): PlugFnDatabaseStorageAdapter {
  return new DbBackedPlugFnDatabaseAdapter(options.database, resolvePlugFnStorageModels(options.models));
}

export function ensurePlugFnDatabaseAdapter(
  value: DbAdapter | PlugFnDatabaseStorageAdapter,
  models?: Partial<PlugFnStorageModelMapping>
): PlugFnDatabaseStorageAdapter {
  if (isPlugFnDatabaseStorageAdapter(value)) {
    return value;
  }

  return createPlugFnDatabaseAdapter({
    database: value,
    models,
  });
}

function isPlugFnDatabaseStorageAdapter(
  value: DbAdapter | PlugFnDatabaseStorageAdapter
): value is PlugFnDatabaseStorageAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'database' in value &&
    'models' in value &&
    typeof (value as PlugFnDatabaseStorageAdapter).getConnection === 'function'
  );
}

export function resolvePlugFnStorageModels(
  models?: Partial<PlugFnStorageModelMapping>
): PlugFnStorageModelMapping {
  return {
    connections: models?.connections ?? DEFAULT_PLUGFN_STORAGE_MODELS.connections,
    oauthStates: models?.oauthStates ?? DEFAULT_PLUGFN_STORAGE_MODELS.oauthStates,
    oauthTokens: models?.oauthTokens ?? DEFAULT_PLUGFN_STORAGE_MODELS.oauthTokens,
    workflows: models?.workflows ?? DEFAULT_PLUGFN_STORAGE_MODELS.workflows,
    workflowExecutions: models?.workflowExecutions ?? DEFAULT_PLUGFN_STORAGE_MODELS.workflowExecutions,
    webhooks: models?.webhooks ?? DEFAULT_PLUGFN_STORAGE_MODELS.webhooks,
    actionLogs: models?.actionLogs ?? DEFAULT_PLUGFN_STORAGE_MODELS.actionLogs,
    providerInstallations:
      models?.providerInstallations ?? DEFAULT_PLUGFN_STORAGE_MODELS.providerInstallations,
    connectionGrants: models?.connectionGrants ?? DEFAULT_PLUGFN_STORAGE_MODELS.connectionGrants,
    webhookReceipts: models?.webhookReceipts ?? DEFAULT_PLUGFN_STORAGE_MODELS.webhookReceipts,
    webhookDeliveries: models?.webhookDeliveries ?? DEFAULT_PLUGFN_STORAGE_MODELS.webhookDeliveries,
    syncJobs: models?.syncJobs ?? DEFAULT_PLUGFN_STORAGE_MODELS.syncJobs,
    syncCheckpoints: models?.syncCheckpoints ?? DEFAULT_PLUGFN_STORAGE_MODELS.syncCheckpoints,
    providerEvents: models?.providerEvents ?? DEFAULT_PLUGFN_STORAGE_MODELS.providerEvents,
    secretRefs: models?.secretRefs ?? DEFAULT_PLUGFN_STORAGE_MODELS.secretRefs,
  };
}

class DbBackedPlugFnDatabaseAdapter implements PlugFnDatabaseStorageAdapter {
  readonly database: DbAdapter;
  readonly models: PlugFnStorageModelMapping;

  constructor(database: DbAdapter, models: PlugFnStorageModelMapping) {
    this.database = database;
    this.models = models;
  }

  async createConnection(connection: Connection): Promise<Connection> {
    return this.database.create<Connection>({
      model: this.models.connections,
      data: cloneRecord(connection),
    });
  }

  async getConnection(id: string): Promise<Connection | null> {
    return this.database.findOne<Connection>({
      model: this.models.connections,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async listConnections(userId: string, provider?: string): Promise<Connection[]> {
    const where: WhereClause[] = [{ field: 'userId', operator: 'eq', value: userId }];
    if (provider) {
      where.push({ field: 'provider', operator: 'eq', value: provider });
    }

    return this.database.findMany<Connection>({
      model: this.models.connections,
      where,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async updateConnection(id: string, updates: Partial<Connection>): Promise<Connection> {
    return this.database.update<Connection>({
      model: this.models.connections,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async deleteConnection(id: string): Promise<void> {
    await this.database.delete({
      model: this.models.connections,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async createWebhook(webhook: WebhookRecord): Promise<WebhookRecord> {
    return this.database.create<WebhookRecord>({
      model: this.models.webhooks,
      data: cloneRecord(webhook),
    });
  }

  async getWebhook(id: string): Promise<WebhookRecord | null> {
    return this.database.findOne<WebhookRecord>({
      model: this.models.webhooks,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async listWebhooks(provider?: string): Promise<WebhookRecord[]> {
    const where: WhereClause[] = [];
    if (provider) {
      where.push({ field: 'provider', operator: 'eq', value: provider });
    }

    return this.database.findMany<WebhookRecord>({
      model: this.models.webhooks,
      where,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async updateWebhook(id: string, updates: Partial<WebhookRecord>): Promise<WebhookRecord> {
    return this.database.update<WebhookRecord>({
      model: this.models.webhooks,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async deleteWebhook(id: string): Promise<void> {
    await this.database.delete({
      model: this.models.webhooks,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async createWorkflow(workflow: Workflow): Promise<Workflow> {
    return this.database.create<Workflow>({
      model: this.models.workflows,
      data: cloneRecord(workflow),
    });
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.database.findOne<Workflow>({
      model: this.models.workflows,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async listWorkflows(userId?: string, status?: string): Promise<Workflow[]> {
    const where: WhereClause[] = [];
    if (userId) {
      where.push({ field: 'userId', operator: 'eq', value: userId });
    }
    if (status) {
      where.push({ field: 'status', operator: 'eq', value: status });
    }

    return this.database.findMany<Workflow>({
      model: this.models.workflows,
      where,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    return this.database.update<Workflow>({
      model: this.models.workflows,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.database.delete({
      model: this.models.workflows,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async createWorkflowExecution(execution: WorkflowExecution): Promise<WorkflowExecution> {
    return this.database.create<WorkflowExecution>({
      model: this.models.workflowExecutions,
      data: cloneRecord(execution),
    });
  }

  async updateWorkflowExecution(
    id: string,
    updates: Partial<WorkflowExecution>
  ): Promise<WorkflowExecution> {
    return this.database.update<WorkflowExecution>({
      model: this.models.workflowExecutions,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async listWorkflowExecutions(workflowId: string, limit = 50): Promise<WorkflowExecution[]> {
    return this.database.findMany<WorkflowExecution>({
      model: this.models.workflowExecutions,
      where: [{ field: 'workflowId', operator: 'eq', value: workflowId }],
      orderBy: [{ field: 'startedAt', direction: 'desc' }],
      limit,
    });
  }

  async createActionLog(log: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.database.create<Record<string, unknown>>({
      model: this.models.actionLogs,
      data: cloneRecord(log),
    });
  }

  async listActionLogs(
    filters: Record<string, unknown>,
    limit = 100
  ): Promise<Record<string, unknown>[]> {
    const where: WhereClause[] = [];

    for (const [field, value] of Object.entries(filters)) {
      if (value === undefined) {
        continue;
      }
      where.push({ field, operator: 'eq', value });
    }

    return this.database.findMany<Record<string, unknown>>({
      model: this.models.actionLogs,
      where,
      orderBy: [{ field: 'executedAt', direction: 'desc' }],
      limit,
    });
  }

  async createProviderInstallation(
    installation: PlugFnProviderInstallation
  ): Promise<PlugFnProviderInstallation> {
    return this.database.create<PlugFnProviderInstallation>({
      model: this.models.providerInstallations,
      data: cloneRecord(installation),
    });
  }

  async getProviderInstallation(id: string): Promise<PlugFnProviderInstallation | null> {
    return this.database.findOne<PlugFnProviderInstallation>({
      model: this.models.providerInstallations,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async listProviderInstallations(
    filters: Record<string, unknown> = {}
  ): Promise<PlugFnProviderInstallation[]> {
    return this.database.findMany<PlugFnProviderInstallation>({
      model: this.models.providerInstallations,
      where: toWhereClauses(filters),
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async updateProviderInstallation(
    id: string,
    updates: Partial<PlugFnProviderInstallation>
  ): Promise<PlugFnProviderInstallation> {
    return this.database.update<PlugFnProviderInstallation>({
      model: this.models.providerInstallations,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async createConnectionGrant(grant: PlugFnConnectionGrant): Promise<PlugFnConnectionGrant> {
    return this.database.create<PlugFnConnectionGrant>({
      model: this.models.connectionGrants,
      data: cloneRecord(grant),
    });
  }

  async listConnectionGrants(connectionId: string): Promise<PlugFnConnectionGrant[]> {
    return this.database.findMany<PlugFnConnectionGrant>({
      model: this.models.connectionGrants,
      where: [{ field: 'connectionId', operator: 'eq', value: connectionId }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async deleteConnectionGrant(id: string): Promise<void> {
    await this.database.delete({
      model: this.models.connectionGrants,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async createWebhookReceipt(receipt: PlugFnWebhookReceipt): Promise<PlugFnWebhookReceipt> {
    return this.database.create<PlugFnWebhookReceipt>({
      model: this.models.webhookReceipts,
      data: cloneRecord(receipt),
    });
  }

  async getWebhookReceipt(id: string): Promise<PlugFnWebhookReceipt | null> {
    return this.database.findOne<PlugFnWebhookReceipt>({
      model: this.models.webhookReceipts,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async findWebhookReceiptByIdempotencyKey(
    provider: string,
    idempotencyKey: string
  ): Promise<PlugFnWebhookReceipt | null> {
    return this.database.findOne<PlugFnWebhookReceipt>({
      model: this.models.webhookReceipts,
      where: [
        { field: 'provider', operator: 'eq', value: provider },
        { field: 'idempotencyKey', operator: 'eq', value: idempotencyKey },
      ],
    });
  }

  async updateWebhookReceipt(
    id: string,
    updates: Partial<PlugFnWebhookReceipt>
  ): Promise<PlugFnWebhookReceipt> {
    return this.database.update<PlugFnWebhookReceipt>({
      model: this.models.webhookReceipts,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async createWebhookDelivery(delivery: PlugFnWebhookDelivery): Promise<PlugFnWebhookDelivery> {
    return this.database.create<PlugFnWebhookDelivery>({
      model: this.models.webhookDeliveries,
      data: cloneRecord(delivery),
    });
  }

  async updateWebhookDelivery(
    id: string,
    updates: Partial<PlugFnWebhookDelivery>
  ): Promise<PlugFnWebhookDelivery> {
    return this.database.update<PlugFnWebhookDelivery>({
      model: this.models.webhookDeliveries,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async listWebhookDeliveries(receiptId: string): Promise<PlugFnWebhookDelivery[]> {
    return this.database.findMany<PlugFnWebhookDelivery>({
      model: this.models.webhookDeliveries,
      where: [{ field: 'receiptId', operator: 'eq', value: receiptId }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }

  async listWebhookDeliveriesForRetry(
    now: Date,
    limit = 100
  ): Promise<PlugFnWebhookDelivery[]> {
    const pending = await this.database.findMany<PlugFnWebhookDelivery>({
      model: this.models.webhookDeliveries,
      where: [{ field: 'status', operator: 'eq', value: 'pending' }],
      orderBy: [{ field: 'createdAt', direction: 'asc' }],
      limit,
    });

    const failed = await this.database.findMany<PlugFnWebhookDelivery>({
      model: this.models.webhookDeliveries,
      where: [
        { field: 'status', operator: 'eq', value: 'failed' },
        { field: 'nextAttemptAt', operator: 'lte', value: now },
      ],
      orderBy: [{ field: 'updatedAt', direction: 'asc' }],
      limit,
    });

    return [...pending, ...failed]
      .filter((delivery) => !delivery.nextAttemptAt || toTime(delivery.nextAttemptAt) <= now.getTime())
      .sort((left, right) => {
        const leftTime = toTime(left.nextAttemptAt ?? left.createdAt);
        const rightTime = toTime(right.nextAttemptAt ?? right.createdAt);
        return leftTime - rightTime;
      })
      .slice(0, limit);
  }

  async claimWebhookDeliveriesForRetry(
    now: Date,
    limit: number,
    workerId: string
  ): Promise<PlugFnWebhookDelivery[]> {
    const candidates = await this.listWebhookDeliveriesForRetry(now, limit);
    const claimed: PlugFnWebhookDelivery[] = [];
    const claimedAt = new Date();

    for (const delivery of candidates) {
      const where: WhereClause[] = [
        { field: 'id', operator: 'eq', value: delivery.id },
        { field: 'status', operator: 'eq', value: delivery.status },
      ];
      if (delivery.nextAttemptAt) {
        where.push({ field: 'nextAttemptAt', operator: 'lte', value: now });
      }

      try {
        const updated = await this.database.update<PlugFnWebhookDelivery>({
          model: this.models.webhookDeliveries,
          where,
          data: cloneRecord({
            status: 'running',
            attempts: delivery.attempts + 1,
            metadata: claimMetadata(delivery.metadata, workerId, claimedAt),
            updatedAt: claimedAt,
          }),
        });
        if (updated?.status === 'running') {
          claimed.push(updated);
        }
      } catch {
        // Another worker claimed or updated the delivery first.
      }
    }

    return claimed;
  }

  async createSyncJob(job: PlugFnSyncJob): Promise<PlugFnSyncJob> {
    return this.database.create<PlugFnSyncJob>({
      model: this.models.syncJobs,
      data: cloneRecord(job),
    });
  }

  async getSyncJob(id: string): Promise<PlugFnSyncJob | null> {
    return this.database.findOne<PlugFnSyncJob>({
      model: this.models.syncJobs,
      where: [{ field: 'id', operator: 'eq', value: id }],
    });
  }

  async listSyncJobs(
    filters: Record<string, unknown> = {},
    limit = 100
  ): Promise<PlugFnSyncJob[]> {
    return this.database.findMany<PlugFnSyncJob>({
      model: this.models.syncJobs,
      where: toWhereClauses(filters),
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit,
    });
  }

  async claimQueuedSyncJobs(limit: number, workerId: string): Promise<PlugFnSyncJob[]> {
    const candidates = await this.database.findMany<PlugFnSyncJob>({
      model: this.models.syncJobs,
      where: [{ field: 'status', operator: 'eq', value: 'queued' }],
      orderBy: [{ field: 'createdAt', direction: 'asc' }],
      limit,
    });
    const claimed: PlugFnSyncJob[] = [];
    const claimedAt = new Date();

    for (const job of candidates) {
      try {
        const updated = await this.database.update<PlugFnSyncJob>({
          model: this.models.syncJobs,
          where: [
            { field: 'id', operator: 'eq', value: job.id },
            { field: 'status', operator: 'eq', value: 'queued' },
          ],
          data: cloneRecord({
            status: 'running',
            metadata: claimMetadata(job.metadata, workerId, claimedAt),
            updatedAt: claimedAt,
          }),
        });
        if (updated?.status === 'running') {
          claimed.push(updated);
        }
      } catch {
        // Another worker claimed or updated the job first.
      }
    }

    return claimed;
  }

  async updateSyncJob(id: string, updates: Partial<PlugFnSyncJob>): Promise<PlugFnSyncJob> {
    return this.database.update<PlugFnSyncJob>({
      model: this.models.syncJobs,
      where: [{ field: 'id', operator: 'eq', value: id }],
      data: cloneRecord(updates),
    });
  }

  async upsertSyncCheckpoint(
    checkpoint: PlugFnSyncCheckpoint
  ): Promise<PlugFnSyncCheckpoint> {
    return this.database.upsert<PlugFnSyncCheckpoint>({
      model: this.models.syncCheckpoints,
      where: [
        { field: 'connectionId', operator: 'eq', value: checkpoint.connectionId },
        { field: 'resource', operator: 'eq', value: checkpoint.resource },
      ],
      create: cloneRecord(checkpoint),
      update: cloneRecord({
        provider: checkpoint.provider,
        checkpoint: checkpoint.checkpoint,
        updatedAt: checkpoint.updatedAt,
      }),
      conflictTarget: ['connectionId', 'resource'],
    });
  }

  async getSyncCheckpoint(
    connectionId: string,
    resource: string
  ): Promise<PlugFnSyncCheckpoint | null> {
    return this.database.findOne<PlugFnSyncCheckpoint>({
      model: this.models.syncCheckpoints,
      where: [
        { field: 'connectionId', operator: 'eq', value: connectionId },
        { field: 'resource', operator: 'eq', value: resource },
      ],
    });
  }

  async createProviderEvent(event: PlugFnProviderEvent): Promise<PlugFnProviderEvent> {
    return this.database.create<PlugFnProviderEvent>({
      model: this.models.providerEvents,
      data: cloneRecord(event),
    });
  }

  async listProviderEvents(
    filters: Record<string, unknown> = {},
    limit = 100
  ): Promise<PlugFnProviderEvent[]> {
    return this.database.findMany<PlugFnProviderEvent>({
      model: this.models.providerEvents,
      where: toWhereClauses(filters),
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit,
    });
  }

  async upsertSecretRef(secretRef: PlugFnSecretRef): Promise<PlugFnSecretRef> {
    return this.database.upsert<PlugFnSecretRef>({
      model: this.models.secretRefs,
      where: [{ field: 'id', operator: 'eq', value: secretRef.id }],
      create: cloneRecord(secretRef),
      update: cloneRecord({
        keyRef: secretRef.keyRef,
        metadata: secretRef.metadata,
        updatedAt: secretRef.updatedAt,
      }),
      conflictTarget: 'id',
    });
  }

  async listSecretRefs(filters: Record<string, unknown> = {}): Promise<PlugFnSecretRef[]> {
    return this.database.findMany<PlugFnSecretRef>({
      model: this.models.secretRefs,
      where: toWhereClauses(filters),
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });
  }
}

function cloneRecord<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function toWhereClauses(filters: Record<string, unknown>): WhereClause[] {
  const where: WhereClause[] = [];

  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined) {
      continue;
    }
    where.push({ field, operator: 'eq', value });
  }

  return where;
}

function claimMetadata(
  metadata: Record<string, unknown> | undefined,
  workerId: string,
  claimedAt: Date
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    workerClaim: {
      workerId,
      claimedAt: claimedAt.toISOString(),
    },
  };
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
