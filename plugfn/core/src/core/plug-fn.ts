import type { PlugFnConfig, MetricsOptions, PlugFnPrincipal } from '../types/config.js';
import type { AuthSession } from '@superfunctions/auth';
import { wrapWithSchema } from '@superfunctions/db';
import type {
  ActionOptions,

  BatchAction,
  BatchResult,
  Logger,
} from '../types/action.js';
import type {
  GetAuthUrlOptions,
  HandleCallbackOptions,
  HandleCallbackResult,
  ListConnectionsOptions,
  DisconnectOptions,
  DisconnectResult,
  Connection,
  StartConnectionOptions,
} from '../types/connection.js';
import type { PlugFnSyncFetchResult, Provider } from '../types/provider.js';
import type {
  PlugFnConnectionGrant,
  PlugFnConnectionOwner,
  PlugFnActor,
  PlugFnProviderEvent,
  PlugFnProviderInstallation,
  PlugFnPersistenceSink,
  PlugFnSecretRef,
  PlugFnSinkContext,
  PlugFnSyncCheckpoint,
  PlugFnSyncJob,
  PlugFnWebhookDelivery,
  PlugFnWebhookReceipt,
} from '../types/runtime.js';
import type { TriggerHandler } from '../types/trigger.js';
import type { Workflow, WorkflowStats, ListWorkflowsOptions } from '../types/workflow.js';

import { ProviderRegistry } from './provider-registry.js';
import {
  ConnectionManager,
  createConnectionManagerOAuthDependencies,
} from './connection-manager.js';
import { ActionExecutor } from './action-executor.js';
import { WorkflowEngine } from './workflow-engine.js';
import { WebhookHandler } from '../webhooks/webhook-handler.js';
import { AdapterConnectionStorage } from '../storage/connection-storage.js';
import {
  AdapterRuntimeStorage,
  type CreateConnectionGrantInput,
  type CreateProviderInstallationInput,
  type CreateSyncJobInput,
  type CreateWebhookDeliveryInput,
  type CreateWebhookReceiptInput,
  type UpdateSyncJobProgressInput,
} from '../storage/runtime-storage.js';
import { AdapterWorkflowStorage } from '../storage/workflow-storage.js';
import { ConsoleLogger } from '../utils/logger.js';
import { validateEncryptionKey } from '../utils/crypto.js';
import { getSchema } from '../schema.js';
import { hasAny, tenantMatches } from '../security/tenancy.js';

/**
 * Main PlugFn SDK interface
 */
export interface PlugFn {
  config: {
    auth: {
      authenticate(request: Request): Promise<PlugFnPrincipal | null>;
    };
    baseUrl: string;
    integrations: Record<string, PlugFnConfig['integrations'][string]>;
    authorization?: PlugFnConfig['authorization'];
    webhooks?: PlugFnConfig['webhooks'];
  };

  // Connection management
  connections: {
    start(options: StartConnectionOptions): Promise<{ authUrl: string }>;
    getAuthUrl(options: GetAuthUrlOptions): Promise<string>;
    handleCallback(options: HandleCallbackOptions): Promise<HandleCallbackResult>;
    list(options: ListConnectionsOptions): Promise<Connection[]>;
    get(id: string): Promise<Connection>;
    disconnect(options: DisconnectOptions): Promise<DisconnectResult>;
    refresh(id: string): Promise<Connection>;
  };

  runtime: {
    installations: {
      create(input: CreateProviderInstallationInput): Promise<PlugFnProviderInstallation>;
      list(filters?: Record<string, unknown>): Promise<PlugFnProviderInstallation[]>;
      update(id: string, updates: Partial<PlugFnProviderInstallation>): Promise<PlugFnProviderInstallation>;
    };
    grants: {
      create(input: CreateConnectionGrantInput): Promise<PlugFnConnectionGrant>;
      list(connectionId: string): Promise<PlugFnConnectionGrant[]>;
      delete(id: string): Promise<void>;
    };
    webhooks: {
      createReceipt(input: CreateWebhookReceiptInput): Promise<PlugFnWebhookReceipt>;
      getReceipt(id: string): Promise<PlugFnWebhookReceipt | null>;
      findReceiptByIdempotencyKey(provider: string, idempotencyKey: string): Promise<PlugFnWebhookReceipt | null>;
      updateReceipt(id: string, updates: Partial<PlugFnWebhookReceipt>): Promise<PlugFnWebhookReceipt>;
      createDelivery(input: CreateWebhookDeliveryInput): Promise<PlugFnWebhookDelivery>;
      updateDelivery(id: string, updates: Partial<PlugFnWebhookDelivery>): Promise<PlugFnWebhookDelivery>;
      listDeliveries(receiptId: string): Promise<PlugFnWebhookDelivery[]>;
      processDueDeliveries(
        handler: PlugFnWebhookDeliveryHandler,
        options?: PlugFnWebhookDeliveryWorkerOptions
      ): Promise<PlugFnWebhookDeliveryWorkerResult>;
    };
    sync: {
      createJob(input: CreateSyncJobInput): Promise<PlugFnSyncJob>;
      getJob(id: string): Promise<PlugFnSyncJob | null>;
      listJobs(filters?: Record<string, unknown>, limit?: number): Promise<PlugFnSyncJob[]>;
      updateJob(id: string, updates: UpdateSyncJobProgressInput): Promise<PlugFnSyncJob>;
      cancelJob(id: string): Promise<PlugFnSyncJob>;
      completeJob(id: string, updates?: Omit<UpdateSyncJobProgressInput, 'status' | 'error'>): Promise<PlugFnSyncJob>;
      failJob(id: string, error: string): Promise<PlugFnSyncJob>;
      processQueued(options?: PlugFnSyncWorkerOptions): Promise<PlugFnSyncWorkerResult>;
      upsertCheckpoint(input: {
        provider: string;
        connectionId: string;
        resource: string;
        checkpoint: unknown;
      }): Promise<PlugFnSyncCheckpoint>;
      getCheckpoint(connectionId: string, resource: string): Promise<PlugFnSyncCheckpoint | null>;
    };
    events: {
      create(input: Omit<PlugFnProviderEvent, 'id' | 'createdAt'>): Promise<PlugFnProviderEvent>;
      list(filters?: Record<string, unknown>, limit?: number): Promise<PlugFnProviderEvent[]>;
    };
    secrets: {
      upsert(input: Omit<PlugFnSecretRef, 'createdAt' | 'updatedAt'>): Promise<PlugFnSecretRef>;
      list(filters?: Record<string, unknown>): Promise<PlugFnSecretRef[]>;
    };
    sinks: {
      register<Raw = unknown, RecordValue = unknown>(
        sink: PlugFnPersistenceSink<Raw, RecordValue>
      ): void;
      list(): PlugFnPersistenceSink[];
      get(id: string): PlugFnPersistenceSink | undefined;
      persist<Raw = unknown>(input: {
        sinkId?: string;
        provider: string;
        resource: string;
        raw: Raw;
        context?: Partial<PlugFnSinkContext>;
      }): Promise<{ sinkId: string; idempotencyKey: string }>;
    };
  };

  // Workflow management
  workflows: {
    list(options?: ListWorkflowsOptions): Promise<Workflow[]>;
    get(id: string): Promise<Workflow | null>;
    rehydrateTriggers(): Promise<{ registered: number; failed: number }>;
    enable(id: string): Promise<void>;
    disable(id: string): Promise<void>;
    delete(id: string): Promise<void>;
    getStats(id: string): Promise<WorkflowStats>;
  };

  // Webhook management
  webhooks: {
    on(provider: string, event: string, handler: TriggerHandler): void;
    off(provider: string, event: string, handler: TriggerHandler): void;
    handle(
      provider: string,
      event: string,
      payload: any,
      headers: Record<string, string>,
      secret?: string,
      options?: {
        rawBody?: Uint8Array;
      }
    ): Promise<any>;
    verify(
      provider: string,
      event: string,
      payload: any,
      headers: Record<string, string>,
      secret?: string,
      options?: {
        rawBody?: Uint8Array;
      }
    ): Promise<any>;
  };

  // Provider management
  providers: {
    list(): Provider[];
    get(name: string): Provider | undefined;
    register(provider: Provider): void;
  };

  use<P extends Provider>(provider: P): PlugFn;

  action<T = unknown>(
    provider: string,
    action: string,
    options: ActionOptions
  ): Promise<T>;

  sync: {
    backfill(options: PlugFnSyncRunOptions): Promise<PlugFnSyncJob>;
    incremental(options: PlugFnSyncRunOptions): Promise<PlugFnSyncJob>;
    enqueue(options: PlugFnSyncQueueOptions): Promise<PlugFnSyncJob>;
    processQueued(options?: PlugFnSyncWorkerOptions): Promise<PlugFnSyncWorkerResult>;
  };

  // Action execution
  batch(actions: BatchAction[]): Promise<BatchResult[]>;
  getMetrics(options: MetricsOptions): Promise<any>;
  on(event: string, handler: (event: any) => void): void;
  off(event: string, handler: (event: any) => void): void;

  // Dynamic provider access
  [provider: string]: any;
}

export interface PlugFnSyncRunOptions {
  provider: string;
  connectionId: string;
  resource: string;
  sinkId?: string;
  cursor?: string;
  checkpoint?: unknown;
  maxPages?: number;
  metadata?: Record<string, unknown>;
  actor?: PlugFnActor;
}

export interface PlugFnSyncQueueOptions extends PlugFnSyncRunOptions {
  mode: PlugFnSyncJob['mode'];
}

export interface PlugFnSyncWorkerOptions {
  limit?: number;
}

export interface PlugFnSyncWorkerResult {
  processed: number;
  completed: number;
  cancelled: number;
  failed: number;
  jobs: PlugFnSyncJob[];
}

export interface PlugFnWebhookDeliveryWorkerOptions {
  limit?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface PlugFnWebhookDeliveryWorkerResult {
  processed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
  deliveries: PlugFnWebhookDelivery[];
}

export type PlugFnWebhookDeliveryHandler = (input: {
  delivery: PlugFnWebhookDelivery;
  receipt: PlugFnWebhookReceipt;
}) => Promise<void> | void;

/**
 * Create PlugFn instance
 */
export function plugFn(config: PlugFnConfig): PlugFn {
  // Initialize logger
  const logger: Logger = config.logger || new ConsoleLogger('[PlugFn]');
  validateEncryptionKey(config.encryptionKey);
  const normalizedAuthProvider = normalizeAuthProvider(config.auth);
  const database = wrapWithSchema(config.database, getSchema());

  // Initialize storage
  const connectionStorage = new AdapterConnectionStorage(database);
  // const _webhookStorage = new AdapterWebhookStorage(database);
  const runtimeStorage = new AdapterRuntimeStorage(database);
  const workflowStorage = new AdapterWorkflowStorage(database);

  // Initialize provider registry
  const providerRegistry = new ProviderRegistry(logger);

  // Convert integration configs to Map
  const integrationConfigs = new Map(Object.entries(config.integrations));

  // Mark configured providers
  for (const providerName of integrationConfigs.keys()) {
    providerRegistry.markConfigured(providerName);
  }

  const oauthFlowDependencies = createConnectionManagerOAuthDependencies({
    database,
    providers: providerRegistry,
    integrationConfigs,
    baseUrl: config.baseUrl,
    encryptionKey: config.encryptionKey,
    logger,
  });

  // Initialize managers
  const connectionManager = new ConnectionManager(
    connectionStorage,
    providerRegistry,
    integrationConfigs,
    config.baseUrl,
    config.encryptionKey,
    logger,
    oauthFlowDependencies
  );

  const actionExecutor = new ActionExecutor(
    connectionManager,
    providerRegistry,
    logger,
    {
      enableRetry: config.retry?.enabled !== false,
      enableRateLimit: config.rateLimit?.enabled !== false,
      enableCache: config.cache?.enabled !== false,
      enableLogging: true,
      enableMetrics: true,
      database,
      cacheStore: config.cache?.store ?? config.cacheStore,
      cacheTtl: config.cache?.ttl ?? config.cache?.defaultTTL,
      cacheKeyPrefix: config.cache?.keyPrefix,
      respectProviderLimits: config.rateLimit?.respectProviderLimits,
      globalRateLimit: config.rateLimit?.global,
    }
  );

  const webhookHandler = new WebhookHandler(providerRegistry, logger, {
    verifySignatures: config.webhooks?.verifySignatures,
  });

  const workflowEngine = new WorkflowEngine(workflowStorage, webhookHandler, logger);
  void workflowEngine.rehydrateEnabledTriggers().catch((error) => {
    logger.error('PlugFn workflow trigger rehydration failed', { error });
  });

  // Event handlers
  const eventHandlers = new Map<string, Set<(event: any) => void>>();
  const persistenceSinks = new Map<string, PlugFnPersistenceSink>();
  let proxyApi!: PlugFn;

  // Create the main API
  const api: PlugFn = {
    config: {
      auth: normalizedAuthProvider,
      baseUrl: config.baseUrl,
      integrations: config.integrations,
      authorization: config.authorization,
      webhooks: config.webhooks,
    },

    // Connection management
    connections: {
      start: async (options) => ({ authUrl: await connectionManager.getAuthUrl(options) }),
      getAuthUrl: (options) => connectionManager.getAuthUrl(options),
      handleCallback: (options) => connectionManager.handleCallback(options),
      list: (options) => connectionManager.list(options),
      get: (id) => connectionManager.get(id),
      disconnect: (options) => connectionManager.disconnect(options),
      refresh: (id) => connectionManager.refresh(id),
    },

    runtime: {
      installations: {
        create: (input) => runtimeStorage.createProviderInstallation(input),
        list: (filters) => runtimeStorage.listProviderInstallations(filters),
        update: (id, updates) => runtimeStorage.updateProviderInstallation(id, updates),
      },
      grants: {
        create: (input) => runtimeStorage.createConnectionGrant(input),
        list: (connectionId) => runtimeStorage.listConnectionGrants(connectionId),
        delete: (id) => runtimeStorage.deleteConnectionGrant(id),
      },
      webhooks: {
        createReceipt: (input) => runtimeStorage.createWebhookReceipt(input),
        getReceipt: (id) => runtimeStorage.getWebhookReceipt(id),
        findReceiptByIdempotencyKey: (provider, idempotencyKey) =>
          runtimeStorage.findWebhookReceiptByIdempotencyKey(provider, idempotencyKey),
        updateReceipt: (id, updates) => runtimeStorage.updateWebhookReceipt(id, updates),
        createDelivery: (input) => runtimeStorage.createWebhookDelivery(input),
        updateDelivery: (id, updates) => runtimeStorage.updateWebhookDelivery(id, updates),
        listDeliveries: (receiptId) => runtimeStorage.listWebhookDeliveries(receiptId),
        processDueDeliveries: (handler, options) => processDueWebhookDeliveries(handler, options),
      },
      sync: {
        createJob: (input) => runtimeStorage.createSyncJob(input),
        getJob: (id) => runtimeStorage.getSyncJob(id),
        listJobs: (filters, limit) => runtimeStorage.listSyncJobs(filters, limit),
        updateJob: (id, updates) => runtimeStorage.updateSyncJob(id, updates),
        cancelJob: (id) => runtimeStorage.cancelSyncJob(id),
        completeJob: (id, updates) => runtimeStorage.completeSyncJob(id, updates),
        failJob: (id, error) => runtimeStorage.failSyncJob(id, error),
        processQueued: (options) => processQueuedSyncJobs(options),
        upsertCheckpoint: (input) => runtimeStorage.upsertSyncCheckpoint(input),
        getCheckpoint: (connectionId, resource) =>
          runtimeStorage.getSyncCheckpoint(connectionId, resource),
      },
      events: {
        create: (input) => runtimeStorage.createProviderEvent(input),
        list: (filters, limit) => runtimeStorage.listProviderEvents(filters, limit),
      },
      secrets: {
        upsert: (input) => runtimeStorage.upsertSecretRef(input),
        list: (filters) => runtimeStorage.listSecretRefs(filters),
      },
      sinks: {
        register: (sink) => {
          persistenceSinks.set(sink.id, sink as PlugFnPersistenceSink);
        },
        list: () => [...persistenceSinks.values()],
        get: (id) => persistenceSinks.get(id),
        persist: async (input) => {
          const sink = resolvePersistenceSink(persistenceSinks, input);
          const context: PlugFnSinkContext = {
            provider: input.provider,
            resource: input.resource,
            ...input.context,
          };
          const { idempotencyKey } = await persistSinkItem(sink, input.raw, context);
          return {
            sinkId: sink.id,
            idempotencyKey,
          };
        },
      },
    },

    // Workflow management
    workflows: {
      list: (options) => workflowEngine.list(options),
      get: (id) => workflowEngine.get(id),
      rehydrateTriggers: () => workflowEngine.rehydrateEnabledTriggers(),
      enable: (id) => workflowEngine.enable(id),
      disable: (id) => workflowEngine.disable(id),
      delete: (id) => workflowEngine.delete(id),
      getStats: (id) => workflowEngine.getStats(id),
    },

    // Webhook management
    webhooks: {
      on: (provider, event, handler) => webhookHandler.on(provider, event, handler),
      off: (provider, event, handler) => webhookHandler.off(provider, event, handler),
      handle: (provider, event, payload, headers, secret, options) =>
        webhookHandler.handleWebhook(provider, event, payload, headers, secret, options),
      verify: (provider, event, payload, headers, secret, options) =>
        webhookHandler.verifyWebhook(provider, event, payload, headers, secret, options),
    },

    // Provider management
    providers: {
      list: () => providerRegistry.list(),
      get: (name) => providerRegistry.get(name),
      register: (provider) => {
        providerRegistry.register(provider);
      },
    },

    use: (provider) => {
      providerRegistry.register(provider);
      return proxyApi;
    },

    action: async (provider, action, options) => {
      const result = await actionExecutor.execute(provider, action, options);
      if (!result.success) {
        throw result.error;
      }
      return result.data as any;
    },

    sync: {
      backfill: (options) => runSyncJob('full', options),
      incremental: (options) => runSyncJob('incremental', options),
      enqueue: (options) => enqueueSyncJob(options.mode, options),
      processQueued: (options) => processQueuedSyncJobs(options),
    },

    // Batch execution
    batch: (actions) => actionExecutor.batch(actions),

    // Metrics
    getMetrics: async (options) => actionExecutor.getMetrics(options),

    // Event handling
    on: (event: string, handler: (event: any) => void) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler);
    },

    off: (event: string, handler: (event: any) => void) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    },
  };

  async function runSyncJob(
    mode: PlugFnSyncJob['mode'],
    options: PlugFnSyncRunOptions
  ): Promise<PlugFnSyncJob> {
    const job = await enqueueSyncJob(mode, options);
    return executeQueuedSyncJob(job);
  }

  async function enqueueSyncJob(
    mode: PlugFnSyncJob['mode'],
    options: PlugFnSyncRunOptions
  ): Promise<PlugFnSyncJob> {
    const connection = await connectionManager.get(options.connectionId);
    if (connection.provider !== options.provider) {
      throw new PlugFnRuntimeError(
        'VALIDATION_ERROR',
        'connection provider mismatch',
        400
      );
    }

    if (options.actor && !connectionMatchesActor(connection, options.actor)) {
      throw new PlugFnRuntimeError(
        'TENANT_ACCESS_DENIED',
        'connection owner mismatch',
        403
      );
    }
    if (options.actor && !connectionTenantMatchesActor(connection, options.actor.tenantId)) {
      throw new PlugFnRuntimeError(
        'TENANT_ACCESS_DENIED',
        'connection tenant mismatch',
        403
      );
    }

    const persistedCheckpoint =
      mode === 'incremental' && options.checkpoint === undefined
        ? await runtimeStorage.getSyncCheckpoint(options.connectionId, options.resource)
        : null;

    return runtimeStorage.createSyncJob({
      provider: options.provider,
      connectionId: options.connectionId,
      resource: options.resource,
      mode,
      owner: connectionToOwner(connection),
      cursor: options.cursor,
      checkpoint:
        options.checkpoint !== undefined
          ? options.checkpoint
          : persistedCheckpoint?.checkpoint,
      metadata: {
        ...(options.metadata ?? {}),
        plugfnSync: {
          sinkId: options.sinkId,
          maxPages: options.maxPages,
          actor: options.actor,
        },
      },
    });
  }

  async function processQueuedSyncJobs(
    options: PlugFnSyncWorkerOptions = {}
  ): Promise<PlugFnSyncWorkerResult> {
    const queued = await runtimeStorage.claimQueuedSyncJobs(options.limit ?? 25);
    const jobs: PlugFnSyncJob[] = [];
    let completed = 0;
    let cancelled = 0;
    let failed = 0;

    for (const job of queued) {
      try {
        const processedJob = await executeSyncJob(job, { claimed: true });
        if (processedJob.status === 'completed') {
          completed += 1;
        } else if (processedJob.status === 'cancelled') {
          cancelled += 1;
        } else if (processedJob.status === 'failed') {
          failed += 1;
        } else {
          throw new Error(`Sync job ${processedJob.id} ended in ${processedJob.status}`);
        }
        jobs.push(processedJob);
      } catch {
        const updated = await runtimeStorage.getSyncJob(job.id);
        if (updated) {
          jobs.push(updated);
        }
        failed += 1;
      }
    }

    return {
      processed: queued.length,
      completed,
      cancelled,
      failed,
      jobs,
    };
  }

  async function executeQueuedSyncJob(job: PlugFnSyncJob): Promise<PlugFnSyncJob> {
    return executeSyncJob(job, { claimed: false });
  }

  async function executeSyncJob(
    job: PlugFnSyncJob,
    options: { claimed: boolean }
  ): Promise<PlugFnSyncJob> {
    if (!options.claimed) {
      await runtimeStorage.updateSyncJob(job.id, { status: 'running' });
    }

    const connection = await connectionManager.get(job.connectionId);
    if (connection.provider !== job.provider) {
      await runtimeStorage.failSyncJob(job.id, 'connection provider mismatch');
      throw {
        code: 'VALIDATION_ERROR',
        message: 'connection provider mismatch',
        status: 400,
      };
    }

    const workerOptions = readSyncJobWorkerMetadata(job);
    if (workerOptions.actor && !connectionMatchesActor(connection, workerOptions.actor)) {
      await runtimeStorage.failSyncJob(job.id, 'connection owner mismatch');
      throw new PlugFnRuntimeError(
        'TENANT_ACCESS_DENIED',
        'connection owner mismatch',
        403
      );
    }
    if (
      workerOptions.actor &&
      !connectionTenantMatchesActor(connection, workerOptions.actor.tenantId)
    ) {
      await runtimeStorage.failSyncJob(job.id, 'connection tenant mismatch');
      throw new PlugFnRuntimeError(
        'TENANT_ACCESS_DENIED',
        'connection tenant mismatch',
        403
      );
    }

    try {
      const result = await executeSyncResource({
        providerRegistry,
        actionExecutor,
        persistenceSinks,
        provider: job.provider,
        connectionId: job.connectionId,
        resource: job.resource,
        mode: job.mode,
        userId: connection.userId,
        tenantId: connection.tenantId ?? workerOptions.actor?.tenantId,
        sinkId: workerOptions.sinkId,
        cursor: job.cursor,
        checkpoint: job.checkpoint,
        maxPages: workerOptions.maxPages ?? 50,
        shouldContinue: async () => {
          const currentJob = await runtimeStorage.getSyncJob(job.id);
          return currentJob?.status !== 'cancelled';
        },
        onPage: async (progress) => {
          await runtimeStorage.updateSyncJob(job.id, {
            cursor: progress.cursor,
            checkpoint: progress.checkpoint,
            fetchedCount: progress.fetchedCount,
            persistedCount: progress.persistedCount,
            skippedCount: progress.skippedCount,
          });
          if (progress.checkpoint !== undefined) {
            await runtimeStorage.upsertSyncCheckpoint({
              provider: job.provider,
              connectionId: job.connectionId,
              resource: job.resource,
              checkpoint: progress.checkpoint,
            });
          }
        },
      });

      if (result.checkpoint !== undefined) {
        await runtimeStorage.upsertSyncCheckpoint({
          provider: job.provider,
          connectionId: job.connectionId,
          resource: job.resource,
          checkpoint: result.checkpoint,
        });
      }

      return runtimeStorage.completeSyncJob(job.id, {
        cursor: result.cursor,
        checkpoint: result.checkpoint,
        fetchedCount: result.fetchedCount,
        persistedCount: result.persistedCount,
        skippedCount: result.skippedCount,
      });
    } catch (error) {
      if (isSyncCancelledError(error)) {
        return runtimeStorage.updateSyncJob(job.id, {
          status: 'cancelled',
          error: undefined,
        });
      }
      const failedJob = await runtimeStorage.failSyncJob(
        job.id,
        error instanceof Error ? error.message : 'sync failed'
      );
      if (failedJob.status === 'cancelled') {
        return failedJob;
      }
      throw error;
    }
  }

  async function processDueWebhookDeliveries(
    handler: PlugFnWebhookDeliveryHandler,
    options: PlugFnWebhookDeliveryWorkerOptions = {}
  ): Promise<PlugFnWebhookDeliveryWorkerResult> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
    const baseDelayMs = Math.max(1000, options.baseDelayMs ?? 30_000);
    const dueDeliveries = await runtimeStorage.claimWebhookDeliveriesForRetry(
      new Date(),
      options.limit ?? 100
    );
    const deliveries: PlugFnWebhookDelivery[] = [];
    let succeeded = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const delivery of dueDeliveries) {
      const attempt = delivery.attempts;
      const receipt = await runtimeStorage.getWebhookReceipt(delivery.receiptId);
      if (!receipt) {
        const deadLetter = await runtimeStorage.updateWebhookDelivery(delivery.id, {
          status: 'dead-lettered',
          attempts: attempt,
          error: 'webhook receipt not found',
        });
        deliveries.push(deadLetter);
        deadLettered += 1;
        continue;
      }

      try {
        await handler({ delivery, receipt });
        const updated = await runtimeStorage.updateWebhookDelivery(delivery.id, {
          status: 'success',
          attempts: attempt,
        });
        deliveries.push(updated);
        succeeded += 1;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'webhook delivery failed';
        const status = attempt >= maxAttempts ? 'dead-lettered' : 'failed';
        const nextAttemptAt =
          status === 'failed'
            ? new Date(Date.now() + baseDelayMs * 2 ** Math.max(0, attempt - 1))
            : undefined;
        const updated = await runtimeStorage.updateWebhookDelivery(delivery.id, {
          status,
          attempts: attempt,
          error: errorMessage,
          nextAttemptAt,
        });
        deliveries.push(updated);
        if (status === 'dead-lettered') {
          deadLettered += 1;
        } else {
          failed += 1;
        }
      }
    }

    return {
      processed: dueDeliveries.length,
      succeeded,
      failed,
      deadLettered,
      deliveries,
    };
  }

  // Create dynamic provider proxies
  proxyApi = new Proxy(api, {
    get(target, prop: string) {
      // If property exists on target, return it
      if (prop in target) {
        return target[prop as keyof typeof target];
      }

      // Check if it's a provider
      const provider = providerRegistry.get(prop);
      if (!provider) {
        return undefined;
      }

      // Create provider action proxy
      const providerProxy: any = {
        on: (event: string, handler: TriggerHandler) => {
          webhookHandler.on(prop, event, handler);
        },
      };

      // Add all actions
      for (const [actionName, _action] of Object.entries(provider.actions)) {
        providerProxy[actionName] = async (options: ActionOptions) => {
          const result = await actionExecutor.execute(prop, actionName, options);
          if (!result.success) {
            throw result.error;
          }
          return result.data;
        };
      }

      return providerProxy;
    },
  }) as PlugFn;

  return proxyApi;
}

function resolvePersistenceSink(
  sinks: Map<string, PlugFnPersistenceSink>,
  input: {
    sinkId?: string;
    provider: string;
    resource: string;
  }
): PlugFnPersistenceSink {
  if (input.sinkId) {
    const sink = sinks.get(input.sinkId);
    if (!sink) {
      throw new Error(`Persistence sink ${input.sinkId} not found`);
    }
    return sink;
  }

  const sink = [...sinks.values()].find((candidate) => {
    return candidate.provider === input.provider && candidate.resource === input.resource;
  });
  if (!sink) {
    throw new Error(`Persistence sink not found for ${input.provider}.${input.resource}`);
  }
  return sink;
}

async function persistSinkItem(
  sink: PlugFnPersistenceSink,
  raw: unknown,
  context: PlugFnSinkContext
): Promise<{ idempotencyKey: string }> {
  if (sink.idempotencyKeyForRecord) {
    const record = await sink.transform(raw, context);
    const idempotencyKey = sink.idempotencyKeyForRecord(record, context);
    await sink.upsert(record, {
      ...context,
      metadata: {
        ...(context.metadata ?? {}),
        idempotencyKey,
      },
    });
    return { idempotencyKey };
  }

  const idempotencyKey = sink.idempotencyKey(raw, context);
  const record = await sink.transform(raw, {
    ...context,
    metadata: {
      ...(context.metadata ?? {}),
      idempotencyKey,
    },
  });
  await sink.upsert(record, context);
  return { idempotencyKey };
}

async function executeSyncResource(input: {
  providerRegistry: ProviderRegistry;
  actionExecutor: ActionExecutor;
  persistenceSinks: Map<string, PlugFnPersistenceSink>;
  provider: string;
  connectionId: string;
  resource: string;
  mode: PlugFnSyncJob['mode'];
  userId: string;
  tenantId?: string;
  sinkId?: string;
  cursor?: string;
  checkpoint?: unknown;
  maxPages: number;
  onPage?: (progress: {
    fetchedCount: number;
    persistedCount: number;
    skippedCount: number;
    cursor?: string;
    checkpoint?: unknown;
  }) => Promise<void> | void;
  shouldContinue?: () => Promise<boolean> | boolean;
}): Promise<{
  fetchedCount: number;
  persistedCount: number;
  skippedCount: number;
  cursor?: string;
  checkpoint?: unknown;
}> {
  const provider = input.providerRegistry.get(input.provider);
  if (!provider) {
    throw {
      code: 'PROVIDER_NOT_REGISTERED',
      message: `provider ${input.provider} is not registered`,
      status: 404,
    };
  }

  const syncDefinition = provider.sync?.[input.resource];
  if (syncDefinition) {
    return executeProviderSyncDefinition({ ...input, syncDefinition });
  }

  const fallbackAction = resolveSyncActionName(provider, input.resource);
  if (!fallbackAction) {
    throw {
      code: 'SYNC_RESOURCE_NOT_FOUND',
      message: `sync resource ${input.provider}.${input.resource} is not registered`,
      status: 404,
    };
  }

  if (input.shouldContinue && !(await input.shouldContinue())) {
    throw syncCancelledError();
  }

  const result = await input.actionExecutor.execute(input.provider, fallbackAction, {
    userId: input.userId,
    connectionId: input.connectionId,
    params: {
      tenantId: input.tenantId,
      mode: input.mode,
      checkpoint: input.checkpoint,
      cursor: input.cursor,
    },
    cache: false,
  });

  if (!result.success) {
    throw result.error;
  }

  const data = (result.data ?? {}) as Record<string, unknown>;
  const fallbackItems = resolveFallbackSyncItems(data);
  const fallbackSink = resolveFallbackSyncSink(input);
  const persistedCount = fallbackSink
    ? await persistFallbackSyncItems(fallbackSink, fallbackItems, input, fallbackAction)
    : asNumber(data.upserted) ?? asNumber(data.persistedCount) ?? 0;

  return {
    fetchedCount:
      asNumber(data.fetched) ??
      asNumber(data.fetchedCount) ??
      asNumber(data.count) ??
      fallbackItems?.length ??
      0,
    persistedCount,
    skippedCount: asNumber(data.skipped) ?? asNumber(data.skippedCount) ?? 0,
    checkpoint: data.checkpoint,
    cursor: typeof data.cursor === 'string' ? data.cursor : undefined,
  };
}

function resolveFallbackSyncSink(input: {
  persistenceSinks: Map<string, PlugFnPersistenceSink>;
  provider: string;
  resource: string;
  sinkId?: string;
}): PlugFnPersistenceSink | undefined {
  if (input.sinkId) {
    const sink = input.persistenceSinks.get(input.sinkId);
    if (!sink) {
      throw new PlugFnRuntimeError(
        'SYNC_SINK_NOT_FOUND',
        `persistence sink ${input.sinkId} is not registered`,
        404
      );
    }
    return sink;
  }

  return [...input.persistenceSinks.values()].find((candidate) => {
    return candidate.provider === input.provider && candidate.resource === input.resource;
  });
}

async function persistFallbackSyncItems(
  sink: PlugFnPersistenceSink,
  items: unknown[] | undefined,
  input: { provider: string; resource: string; connectionId: string },
  fallbackAction: string
): Promise<number> {
  if (!items) {
    throw new PlugFnRuntimeError(
      'SYNC_FALLBACK_ITEMS_REQUIRED',
      `fallback action ${input.provider}.${fallbackAction} must return items for persistence`,
      500
    );
  }

  for (const item of items) {
    await persistSinkItem(sink, item, {
      provider: input.provider,
      resource: input.resource,
      connectionId: input.connectionId,
    });
  }
  return items.length;
}

function resolveFallbackSyncItems(data: Record<string, unknown>): unknown[] | undefined {
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data.messages)) {
    return data.messages;
  }
  return undefined;
}

async function executeProviderSyncDefinition(input: {
  syncDefinition: NonNullable<Provider['sync']>[string];
  persistenceSinks: Map<string, PlugFnPersistenceSink>;
  provider: string;
  connectionId: string;
  resource: string;
  mode: PlugFnSyncJob['mode'];
  sinkId?: string;
  cursor?: string;
  checkpoint?: unknown;
  maxPages: number;
  onPage?: (progress: {
    fetchedCount: number;
    persistedCount: number;
    skippedCount: number;
    cursor?: string;
    checkpoint?: unknown;
  }) => Promise<void> | void;
  shouldContinue?: () => Promise<boolean> | boolean;
}): Promise<{
  fetchedCount: number;
  persistedCount: number;
  skippedCount: number;
  cursor?: string;
  checkpoint?: unknown;
}> {
  let fetchedCount = 0;
  let persistedCount = 0;
  let skippedCount = 0;
  let cursor = input.cursor;
  let checkpoint = input.checkpoint ?? input.syncDefinition.initialCheckpoint;
  let pages = 0;

  while (pages < input.maxPages) {
    if (input.shouldContinue && !(await input.shouldContinue())) {
      throw syncCancelledError();
    }

    pages += 1;
    const result: PlugFnSyncFetchResult = await input.syncDefinition.fetch({
      provider: input.provider,
      resource: input.resource,
      connectionId: input.connectionId,
      mode: input.mode,
      checkpoint,
      cursor,
    });

    fetchedCount += result.items.length;
    checkpoint = result.checkpoint ?? checkpoint;
    cursor = result.cursor;

    const sinkId = input.sinkId ?? result.sinkId ?? input.syncDefinition.defaultSinkId;
    if (sinkId || input.persistenceSinks.size > 0) {
      const sink = sinkId
        ? input.persistenceSinks.get(sinkId)
        : [...input.persistenceSinks.values()].find((candidate) => {
            return candidate.provider === input.provider && candidate.resource === input.resource;
          });

      if (sink) {
        for (const item of result.items) {
          const context: PlugFnSinkContext = {
            provider: input.provider,
            resource: input.resource,
            connectionId: input.connectionId,
          };
          await persistSinkItem(sink, item, context);
          persistedCount += 1;
        }
      } else {
        skippedCount += result.items.length;
      }
    } else {
      skippedCount += result.items.length;
    }

    if (result.done !== false || !cursor) {
      await input.onPage?.({
        fetchedCount,
        persistedCount,
        skippedCount,
        cursor,
        checkpoint,
      });
      break;
    }

    await input.onPage?.({
      fetchedCount,
      persistedCount,
      skippedCount,
      cursor,
      checkpoint,
    });
  }

  return {
    fetchedCount,
    persistedCount,
    skippedCount,
    cursor,
    checkpoint,
  };
}

function syncCancelledError(): { code: string; message: string; status: number } {
  return {
    code: 'SYNC_CANCELLED',
    message: 'sync job was cancelled',
    status: 409,
  };
}

class PlugFnRuntimeError extends Error {
  readonly retryable = false;

  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'PlugFnRuntimeError';
  }
}

function isSyncCancelledError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SYNC_CANCELLED'
  );
}

function resolveSyncActionName(provider: Provider, resource: string): string | undefined {
  const candidates = [
    `${resource}.sync`,
    `sync.${resource}`,
    resource === 'messages' ? 'mail.sync' : undefined,
  ].filter((candidate): candidate is string => typeof candidate === 'string');

  return candidates.find((candidate) => candidate in provider.actions);
}

function connectionMatchesActor(connection: Connection, actor: PlugFnActor): boolean {
  if (
    connection.userId === actor.userId ||
    (connection.ownerKind === 'user' && connection.ownerId === actor.userId)
  ) {
    return true;
  }

  if (connection.ownerKind === 'organization') {
    return (
      connection.installedByUserId === actor.userId ||
      (Boolean(connection.organizationId) &&
        Boolean(actor.organizationId) &&
        connection.organizationId === actor.organizationId &&
        hasAny(actor.roles, ['admin', 'owner', 'org:admin']))
    );
  }

  if (connection.ownerKind === 'delegated') {
    return (
      connection.delegatedToUserId === actor.userId ||
      connection.installedByUserId === actor.userId ||
      hasAny(actor.grants, connection.grants ?? [])
    );
  }

  return false;
}

function connectionTenantMatchesActor(
  connection: Connection,
  actorTenantId: string | undefined
): boolean {
  return tenantMatches(connection.tenantId, actorTenantId);
}

function readSyncJobWorkerMetadata(job: PlugFnSyncJob): {
  sinkId?: string;
  maxPages?: number;
  actor?: PlugFnSyncRunOptions['actor'];
} {
  const raw = job.metadata?.plugfnSync;
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const record = raw as Record<string, unknown>;
  return {
    sinkId: typeof record.sinkId === 'string' ? record.sinkId : undefined,
    maxPages: typeof record.maxPages === 'number' ? record.maxPages : undefined,
    actor: isSyncActor(record.actor) ? record.actor : undefined,
  };
}

function isSyncActor(value: unknown): value is PlugFnSyncRunOptions['actor'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { userId?: unknown }).userId === 'string'
  );
}

function connectionToOwner(connection: Connection): PlugFnConnectionOwner {
  if (connection.ownerKind === 'organization' && connection.organizationId && connection.installedByUserId) {
    return {
      kind: 'organization',
      organizationId: connection.organizationId,
      installedByUserId: connection.installedByUserId,
      tenantId: connection.tenantId,
    };
  }

  if (
    connection.ownerKind === 'delegated' &&
    connection.organizationId &&
    connection.installedByUserId &&
    connection.delegatedToUserId
  ) {
    return {
      kind: 'delegated',
      organizationId: connection.organizationId,
      installedByUserId: connection.installedByUserId,
      delegatedToUserId: connection.delegatedToUserId,
      grants: connection.grants ?? [],
      tenantId: connection.tenantId,
    };
  }

  return {
    kind: 'user',
    userId: connection.ownerId ?? connection.userId,
    tenantId: connection.tenantId,
  };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeAuthProvider(configuredAuth: PlugFnConfig['auth']): {
  authenticate(request: Request): Promise<PlugFnPrincipal | null>;
} {
  if (typeof configuredAuth.authenticate === 'function') {
    return {
      authenticate: async (request: Request) => {
        const principal = await configuredAuth.authenticate!(request);
        return normalizePrincipal(principal);
      },
    };
  }

  return {
    authenticate: async (request: Request) => {
      if (typeof configuredAuth.getUserId === 'function') {
        const userId = await configuredAuth.getUserId(request);
        return normalizePrincipal(userId);
      }

      if (typeof configuredAuth.requireAuth === 'function') {
        try {
          const userId = await configuredAuth.requireAuth(request);
          return normalizePrincipal(userId);
        } catch {
          return null;
        }
      }

      return null;
    },
  };
}

function normalizePrincipal(
  value: PlugFnPrincipal | AuthSession | string | null | undefined
): PlugFnPrincipal | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.length > 0 ? { userId: value } : null;
  }

  if (
    typeof value === 'object' &&
    'userId' in value &&
    typeof value.userId === 'string' &&
    value.userId.length > 0
  ) {
    return value as PlugFnPrincipal;
  }

  const subject =
    typeof value === 'object' && 'subject' in value
      ? (value as Partial<AuthSession>).subject
      : null;
  if (
    subject !== null &&
    typeof subject === 'object' &&
    typeof subject.actorId === 'string' &&
    subject.actorId.length > 0
  ) {
    const session = value as AuthSession;
    return {
      userId: session.subject.actorId,
      tenantId: session.subject.tenantId,
      roles: session.resourceIds,
      grants: session.scopes,
      metadata: session.metadata,
    };
  }

  return null;
}
