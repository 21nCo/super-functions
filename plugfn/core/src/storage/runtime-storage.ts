import type { Adapter as DbAdapter } from '@superfunctions/db';
import type {
  PlugFnConnectionGrant,
  PlugFnConnectionOwner,
  PlugFnProviderEvent,
  PlugFnProviderInstallation,
  PlugFnSecretRef,
  PlugFnSyncCheckpoint,
  PlugFnSyncJob,
  PlugFnWebhookDelivery,
  PlugFnWebhookReceipt,
} from '../types/runtime.js';
import {
  ensurePlugFnDatabaseAdapter,
  type PlugFnDatabaseStorageAdapter,
} from './adapters/database.js';

export interface CreateProviderInstallationInput {
  provider: string;
  owner: PlugFnConnectionOwner;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateConnectionGrantInput {
  connectionId: string;
  granteeUserId: string;
  grant: string;
  expiresAt?: Date;
}

export interface CreateWebhookReceiptInput {
  provider: string;
  event: string;
  payloadHash: string;
  idempotencyKey?: string;
  connectionId?: string;
  owner?: PlugFnConnectionOwner;
  headersRedacted?: Record<string, string>;
  verificationStatus?: PlugFnWebhookReceipt['verificationStatus'];
  metadata?: Record<string, unknown>;
}

export interface CreateWebhookDeliveryInput {
  receiptId: string;
  sinkId?: string;
  handlerName?: string;
  status?: PlugFnWebhookDelivery['status'];
  nextAttemptAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CreateSyncJobInput {
  provider: string;
  connectionId: string;
  resource: string;
  mode: PlugFnSyncJob['mode'];
  owner?: PlugFnConnectionOwner;
  cursor?: string;
  checkpoint?: unknown;
  metadata?: Record<string, unknown>;
}

export interface UpdateSyncJobProgressInput {
  status?: PlugFnSyncJob['status'];
  cursor?: string;
  checkpoint?: unknown;
  fetchedCount?: number;
  persistedCount?: number;
  skippedCount?: number;
  error?: string;
}

export class AdapterRuntimeStorage {
  private readonly adapter: PlugFnDatabaseStorageAdapter;
  private readonly webhookReceiptClaimLocks = new Map<string, Promise<void>>();

  constructor(adapter: DbAdapter | PlugFnDatabaseStorageAdapter) {
    this.adapter = ensurePlugFnDatabaseAdapter(adapter);
  }

  createProviderInstallation(
    input: CreateProviderInstallationInput
  ): Promise<PlugFnProviderInstallation> {
    const now = new Date();
    const owner = ownerFields(input.owner);
    if (!owner.ownerKind || !owner.ownerId) {
      throw new Error('provider installation owner is required');
    }
    return this.adapter.createProviderInstallation({
      id: generateId('install'),
      provider: input.provider,
      ownerKind: owner.ownerKind,
      ownerId: owner.ownerId,
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      installedByUserId: owner.installedByUserId,
      delegatedToUserId: owner.delegatedToUserId,
      status: 'active',
      scopes: input.scopes,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  listProviderInstallations(
    filters: Record<string, unknown> = {}
  ): Promise<PlugFnProviderInstallation[]> {
    return this.adapter.listProviderInstallations(filters);
  }

  updateProviderInstallation(
    id: string,
    updates: Partial<PlugFnProviderInstallation>
  ): Promise<PlugFnProviderInstallation> {
    return this.adapter.updateProviderInstallation(id, {
      ...updates,
      updatedAt: new Date(),
    });
  }

  createConnectionGrant(input: CreateConnectionGrantInput): Promise<PlugFnConnectionGrant> {
    return this.adapter.createConnectionGrant({
      id: generateId('grant'),
      connectionId: input.connectionId,
      granteeUserId: input.granteeUserId,
      grant: input.grant,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    });
  }

  listConnectionGrants(connectionId: string): Promise<PlugFnConnectionGrant[]> {
    return this.adapter.listConnectionGrants(connectionId);
  }

  deleteConnectionGrant(id: string): Promise<void> {
    return this.adapter.deleteConnectionGrant(id);
  }

  async createWebhookReceipt(input: CreateWebhookReceiptInput): Promise<PlugFnWebhookReceipt> {
    if (!input.idempotencyKey) {
      return this.persistWebhookReceipt(input);
    }

    const claimKey = `${input.provider}:${input.idempotencyKey}`;
    return this.withWebhookReceiptClaimLock(claimKey, async () => {
      const existing = await this.adapter.findWebhookReceiptByIdempotencyKey(
        input.provider,
        input.idempotencyKey!
      );
      if (existing) {
        return assertMatchingWebhookReceipt(existing, input.payloadHash);
      }

      try {
        return await this.persistWebhookReceipt(input);
      } catch (error) {
        // A unique provider/idempotency index arbitrates claims across runtime instances.
        const concurrentlyCreated = await this.adapter.findWebhookReceiptByIdempotencyKey(
          input.provider,
          input.idempotencyKey!
        );
        if (concurrentlyCreated) {
          return assertMatchingWebhookReceipt(concurrentlyCreated, input.payloadHash);
        }
        throw error;
      }
    });
  }

  private persistWebhookReceipt(input: CreateWebhookReceiptInput): Promise<PlugFnWebhookReceipt> {
    const now = new Date();
    return this.adapter.createWebhookReceipt({
      id: generateId('whrec'),
      provider: input.provider,
      event: input.event,
      idempotencyKey: input.idempotencyKey,
      connectionId: input.connectionId,
      ...ownerFields(input.owner),
      headersRedacted: input.headersRedacted,
      payloadHash: input.payloadHash,
      verificationStatus: input.verificationStatus ?? 'not-required',
      receivedAt: now,
      createdAt: now,
      metadata: input.metadata,
    });
  }

  private async withWebhookReceiptClaimLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.webhookReceiptClaimLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => {}).then(() => current);
    this.webhookReceiptClaimLocks.set(key, tail);

    await previous.catch(() => {});
    try {
      return await work();
    } finally {
      release();
      if (this.webhookReceiptClaimLocks.get(key) === tail) {
        this.webhookReceiptClaimLocks.delete(key);
      }
    }
  }

  getWebhookReceipt(id: string): Promise<PlugFnWebhookReceipt | null> {
    return this.adapter.getWebhookReceipt(id);
  }

  findWebhookReceiptByIdempotencyKey(
    provider: string,
    idempotencyKey: string
  ): Promise<PlugFnWebhookReceipt | null> {
    return this.adapter.findWebhookReceiptByIdempotencyKey(provider, idempotencyKey);
  }

  async updateWebhookReceipt(
    id: string,
    updates: Partial<PlugFnWebhookReceipt>
  ): Promise<PlugFnWebhookReceipt> {
    return this.withWebhookReceiptClaimLock(`receipt:${id}`, async () => {
      const current = await this.adapter.getWebhookReceipt(id);
      const metadata: Record<string, unknown> = {
        ...(current?.metadata ?? {}),
        ...(updates.metadata ?? {}),
        updatedAt: new Date().toISOString(),
      };
      for (const [key, value] of Object.entries(updates.metadata ?? {})) {
        if (value === undefined) {
          delete metadata[key];
        }
      }
      return this.adapter.updateWebhookReceipt(id, {
        ...updates,
        metadata,
      });
    });
  }

  createWebhookDelivery(input: CreateWebhookDeliveryInput): Promise<PlugFnWebhookDelivery> {
    const now = new Date();
    return this.adapter.createWebhookDelivery({
      id: generateId('whdel'),
      receiptId: input.receiptId,
      sinkId: input.sinkId,
      handlerName: input.handlerName,
      status: input.status ?? 'pending',
      attempts: 0,
      nextAttemptAt: input.nextAttemptAt,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  updateWebhookDelivery(
    id: string,
    updates: Partial<PlugFnWebhookDelivery>
  ): Promise<PlugFnWebhookDelivery> {
    return this.adapter.updateWebhookDelivery(id, {
      ...updates,
      updatedAt: new Date(),
    });
  }

  updateClaimedWebhookDelivery(
    id: string,
    claimToken: string,
    updates: Partial<PlugFnWebhookDelivery>
  ): Promise<PlugFnWebhookDelivery | null> {
    return this.adapter.updateClaimedWebhookDelivery(id, claimToken, {
      ...updates,
      updatedAt: new Date(),
    });
  }

  listWebhookDeliveries(receiptId: string): Promise<PlugFnWebhookDelivery[]> {
    return this.adapter.listWebhookDeliveries(receiptId);
  }

  listWebhookDeliveriesForRetry(now = new Date(), limit = 100, leaseMs?: number): Promise<PlugFnWebhookDelivery[]> {
    return this.adapter.listWebhookDeliveriesForRetry(now, limit, leaseMs);
  }

  claimWebhookDeliveriesForRetry(
    now = new Date(),
    limit = 100,
    workerId = generateId('webhook_worker'),
    leaseMs?: number
  ): Promise<PlugFnWebhookDelivery[]> {
    return this.adapter.claimWebhookDeliveriesForRetry(now, limit, workerId, leaseMs);
  }

  createSyncJob(input: CreateSyncJobInput): Promise<PlugFnSyncJob> {
    const now = new Date();
    return this.adapter.createSyncJob({
      id: generateId('sync'),
      provider: input.provider,
      connectionId: input.connectionId,
      resource: input.resource,
      mode: input.mode,
      status: 'queued',
      ...ownerFields(input.owner),
      cursor: input.cursor,
      checkpoint: input.checkpoint,
      fetchedCount: 0,
      persistedCount: 0,
      skippedCount: 0,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    });
  }

  getSyncJob(id: string): Promise<PlugFnSyncJob | null> {
    return this.adapter.getSyncJob(id);
  }

  listSyncJobs(
    filters: Record<string, unknown> = {},
    limit = 100
  ): Promise<PlugFnSyncJob[]> {
    return this.adapter.listSyncJobs(filters, limit);
  }

  claimQueuedSyncJobs(
    limit = 25,
    workerId = generateId('sync_worker')
  ): Promise<PlugFnSyncJob[]> {
    return this.adapter.claimQueuedSyncJobs(limit, workerId);
  }

  updateSyncJob(id: string, updates: UpdateSyncJobProgressInput): Promise<PlugFnSyncJob> {
    return this.adapter.updateSyncJob(id, {
      ...updates,
      updatedAt: new Date(),
    });
  }

  async completeSyncJob(
    id: string,
    updates: Omit<UpdateSyncJobProgressInput, 'status' | 'error'> = {}
  ): Promise<PlugFnSyncJob> {
    const updated = await this.adapter.database.updateMany({
      model: this.adapter.models.syncJobs,
      where: [
        { field: 'id', operator: 'eq', value: id },
        { field: 'status', operator: 'eq', value: 'running' },
      ],
      data: {
        ...updates,
        status: 'completed',
        updatedAt: new Date(),
      },
    });

    const job = await this.adapter.getSyncJob(id);
    if (!job) {
      throw new Error(`Sync job ${id} not found after completion`);
    }
    if (updated === 0 && !['completed', 'cancelled', 'failed'].includes(job.status)) {
      throw new Error(`Sync job ${id} could not transition to completed from ${job.status}`);
    }
    return job;
  }

  async cancelSyncJob(id: string): Promise<PlugFnSyncJob> {
    await this.adapter.database.updateMany({
      model: this.adapter.models.syncJobs,
      where: [
        { field: 'id', operator: 'eq', value: id },
        { field: 'status', operator: 'in', value: ['queued', 'running'] },
      ],
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
    });

    const job = await this.adapter.getSyncJob(id);
    if (!job) {
      throw {
        code: 'NOT_FOUND',
        message: 'sync job not found',
        status: 404,
        retryable: false,
      };
    }
    if (job.status !== 'cancelled') {
      throw {
        code: 'SYNC_JOB_TERMINAL',
        message: `sync job cannot be cancelled from ${job.status}`,
        status: 409,
        retryable: false,
        details: { status: job.status },
      };
    }
    return job;
  }

  async failSyncJob(id: string, error: string): Promise<PlugFnSyncJob> {
    const updated = await this.adapter.database.updateMany({
      model: this.adapter.models.syncJobs,
      where: [
        { field: 'id', operator: 'eq', value: id },
        { field: 'status', operator: 'eq', value: 'running' },
      ],
      data: {
        status: 'failed',
        error,
        updatedAt: new Date(),
      },
    });

    const job = await this.adapter.getSyncJob(id);
    if (!job) {
      throw new Error(`Sync job ${id} not found after failure`);
    }
    if (updated === 0 && !['completed', 'cancelled', 'failed'].includes(job.status)) {
      throw new Error(`Sync job ${id} could not transition to failed from ${job.status}`);
    }
    return job;
  }

  upsertSyncCheckpoint(input: {
    provider: string;
    connectionId: string;
    resource: string;
    checkpoint: unknown;
  }): Promise<PlugFnSyncCheckpoint> {
    return this.adapter.upsertSyncCheckpoint({
      id: checkpointId(input.connectionId, input.resource),
      provider: input.provider,
      connectionId: input.connectionId,
      resource: input.resource,
      checkpoint: input.checkpoint,
      updatedAt: new Date(),
    });
  }

  getSyncCheckpoint(
    connectionId: string,
    resource: string
  ): Promise<PlugFnSyncCheckpoint | null> {
    return this.adapter.getSyncCheckpoint(connectionId, resource);
  }

  createProviderEvent(input: Omit<PlugFnProviderEvent, 'id' | 'createdAt'>): Promise<PlugFnProviderEvent> {
    return this.adapter.createProviderEvent({
      ...input,
      id: generateId('event'),
      createdAt: new Date(),
    });
  }

  listProviderEvents(
    filters: Record<string, unknown> = {},
    limit = 100
  ): Promise<PlugFnProviderEvent[]> {
    return this.adapter.listProviderEvents(filters, limit);
  }

  upsertSecretRef(input: Omit<PlugFnSecretRef, 'createdAt' | 'updatedAt'>): Promise<PlugFnSecretRef> {
    const now = new Date();
    return this.adapter.upsertSecretRef({
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  }

  listSecretRefs(filters: Record<string, unknown> = {}): Promise<PlugFnSecretRef[]> {
    return this.adapter.listSecretRefs(filters);
  }
}

function assertMatchingWebhookReceipt(
  receipt: PlugFnWebhookReceipt,
  payloadHash: string
): PlugFnWebhookReceipt {
  if (receipt.payloadHash !== payloadHash) {
    throw new Error('webhook idempotency key was reused with a different payload');
  }
  return receipt;
}

export function ownerFields(owner: PlugFnConnectionOwner | undefined): {
  ownerKind?: PlugFnConnectionOwner['kind'];
  ownerId?: string;
  tenantId?: string;
  organizationId?: string;
  installedByUserId?: string;
  delegatedToUserId?: string;
  grants?: string[];
} {
  if (!owner) {
    return {};
  }

  if (owner.kind === 'user') {
    return {
      ownerKind: owner.kind,
      ownerId: owner.userId,
      tenantId: owner.tenantId,
    };
  }

  if (owner.kind === 'organization') {
    return {
      ownerKind: owner.kind,
      ownerId: owner.organizationId,
      tenantId: owner.tenantId,
      organizationId: owner.organizationId,
      installedByUserId: owner.installedByUserId,
    };
  }

  return {
    ownerKind: owner.kind,
    ownerId: owner.organizationId,
    tenantId: owner.tenantId,
    organizationId: owner.organizationId,
    installedByUserId: owner.installedByUserId,
    delegatedToUserId: owner.delegatedToUserId,
    grants: [...owner.grants],
  };
}

function generateId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function checkpointId(connectionId: string, resource: string): string {
  return `ckpt_${connectionId}_${resource}`.replace(/[^a-zA-Z0-9_:-]/g, '_');
}
