import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { plugFn } from '../src/core/plug-fn.js';
import { createDbSink } from '../src/storage/db-sink.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { AuthType, type Provider } from '../src/types/provider.js';
import { ConnectionStatus } from '../src/types/connection.js';
import { encrypt } from '../src/utils/crypto.js';

describe('PlugFn sync runtime', () => {
  it('runs a provider sync resource, persists through a DB sink, and advances checkpoint', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });

    plug.use(testSyncProvider);
    await database.createConnection({
      id: 'conn_sync_1',
      userId: 'user_1',
      provider: 'test-sync',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let transformCount = 0;
    plug.runtime.sinks.register(
      createDbSink({
        adapter: database,
        id: 'test.records',
        provider: 'test-sync',
        resource: 'records',
        model: 'test_external_records',
        uniqueBy: ['provider', 'externalId'],
        transform: (record: any) => {
          transformCount += 1;
          return {
            provider: 'test-sync',
            externalId: record.id,
            value: record.value,
          };
        },
      })
    );

    const job = await plug.sync.backfill({
      provider: 'test-sync',
      connectionId: 'conn_sync_1',
      resource: 'records',
      actor: { userId: 'user_1' },
    });

    expect(job.status).toBe('completed');
    expect(job.fetchedCount).toBe(2);
    expect(job.persistedCount).toBe(2);
    expect(job.skippedCount).toBe(0);
    expect(job.checkpoint).toEqual({ page: 1 });
    expect(transformCount).toBe(2);

    const checkpoint = await plug.runtime.sync.getCheckpoint('conn_sync_1', 'records');
    expect(checkpoint?.checkpoint).toEqual({ page: 1 });

    const records = await database.findMany<any>({
      model: 'test_external_records',
      where: [],
    });
    expect(records).toMatchObject([
      { provider: 'test-sync', externalId: 'r1', value: 'first' },
      { provider: 'test-sync', externalId: 'r2', value: 'second' },
    ]);
  });

  it('rejects sync runs when the actor does not own the connection', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    plug.use(testSyncProvider);
    await database.createConnection({
      id: 'conn_sync_other',
      userId: 'user_2',
      provider: 'test-sync',
      ownerKind: 'user',
      ownerId: 'user_2',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      plug.sync.backfill({
        provider: 'test-sync',
        connectionId: 'conn_sync_other',
        resource: 'records',
        actor: { userId: 'user_1' },
      })
    ).rejects.toMatchObject({
      code: 'TENANT_ACCESS_DENIED',
    });
  });

  it('can enqueue sync work and drain it from a worker', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });

    plug.use(testSyncProvider);
    await database.createConnection({
      id: 'conn_sync_queue',
      userId: 'user_1',
      provider: 'test-sync',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    plug.runtime.sinks.register(
      createDbSink({
        adapter: database,
        id: 'test.queue.records',
        provider: 'test-sync',
        resource: 'records',
        model: 'test_external_queue_records',
        uniqueBy: ['provider', 'externalId'],
        transform: (record: any) => ({
          provider: 'test-sync',
          externalId: record.id,
          value: record.value,
        }),
      })
    );

    const queued = await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync',
      connectionId: 'conn_sync_queue',
      resource: 'records',
      actor: { userId: 'user_1' },
    });

    expect(queued.status).toBe('queued');

    const result = await plug.sync.processQueued();

    expect(result.processed).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.jobs[0]?.status).toBe('completed');
    expect(result.jobs[0]?.fetchedCount).toBe(2);
  });

  it('rejects tenant mismatches during enqueue and worker execution', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1', tenantId: 'tenant_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    plug.use(testSyncProvider);
    const now = new Date();
    await database.createConnection({
      id: 'conn_sync_tenant',
      userId: 'user_1',
      provider: 'test-sync',
      tenantId: 'tenant_2',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      plug.sync.enqueue({
        mode: 'full',
        provider: 'test-sync',
        connectionId: 'conn_sync_tenant',
        resource: 'records',
        actor: { userId: 'user_1', tenantId: 'tenant_1' },
      })
    ).rejects.toMatchObject({
      code: 'TENANT_ACCESS_DENIED',
      message: 'connection tenant mismatch',
    });

    await database.updateConnection('conn_sync_tenant', { tenantId: 'tenant_1' });
    const queued = await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync',
      connectionId: 'conn_sync_tenant',
      resource: 'records',
      actor: { userId: 'user_1', tenantId: 'tenant_1' },
    });
    await database.updateConnection('conn_sync_tenant', { tenantId: 'tenant_2' });

    const result = await plug.sync.processQueued();
    expect(result).toMatchObject({ processed: 1, completed: 0, failed: 1 });
    expect(await plug.runtime.sync.getJob(queued.id)).toMatchObject({
      status: 'failed',
      error: 'connection tenant mismatch',
    });
  });

  it('persists sync checkpoints after each fetched page', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const checkpointSeenDuringSecondFetch: unknown[] = [];
    let fetchCount = 0;
    const pagedProvider: Provider = {
      ...testSyncProvider,
      name: 'test-sync-paged',
      sync: {
        records: {
          resource: 'records',
          fetch: async () => {
            fetchCount += 1;
            if (fetchCount === 1) {
              return {
                items: [{ id: 'r1', value: 'first' }],
                checkpoint: { page: 1 },
                cursor: 'next',
                done: false,
              };
            }

            const checkpoint = await plug.runtime.sync.getCheckpoint('conn_sync_paged', 'records');
            checkpointSeenDuringSecondFetch.push(checkpoint?.checkpoint);
            return {
              items: [{ id: 'r2', value: 'second' }],
              checkpoint: { page: 2 },
              done: true,
            };
          },
        },
      },
    };
    plug.use(pagedProvider);
    await database.createConnection({
      id: 'conn_sync_paged',
      userId: 'user_1',
      provider: 'test-sync-paged',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    plug.runtime.sinks.register(
      createDbSink({
        adapter: database,
        id: 'test.paged.records',
        provider: 'test-sync-paged',
        resource: 'records',
        model: 'test_external_paged_records',
        uniqueBy: ['provider', 'externalId'],
        transform: (record: any) => ({
          provider: 'test-sync-paged',
          externalId: record.id,
          value: record.value,
        }),
      })
    );

    const job = await plug.sync.backfill({
      provider: 'test-sync-paged',
      connectionId: 'conn_sync_paged',
      resource: 'records',
      actor: { userId: 'user_1' },
    });

    expect(job.status).toBe('completed');
    expect(job.fetchedCount).toBe(2);
    expect(checkpointSeenDuringSecondFetch).toEqual([{ page: 1 }]);
  });

  it('passes the connection tenant to fallback sync actions', async () => {
    const database = new MemoryAdapter();
    const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1', tenantId: 'tenant_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey,
      integrations: {},
    });
    let receivedTenantId: string | undefined;
    plug.use({
      ...testSyncProvider,
      name: 'fallback-sync',
      sync: undefined,
      actions: {
        'mail.sync': {
          name: 'mail.sync',
          displayName: 'Mail sync',
          description: 'Fallback mail sync',
          parameters: z.object({
            tenantId: z.string(),
            mode: z.enum(['full', 'incremental']),
            checkpoint: z.unknown().optional(),
            cursor: z.string().optional(),
          }),
          returns: z.object({
            fetched: z.number(),
            upserted: z.number(),
            skipped: z.number(),
          }),
          execute: async (params) => {
            receivedTenantId = params.tenantId;
            return { fetched: 0, upserted: 0, skipped: 0 };
          },
        },
      },
    });
    const now = new Date();
    await database.createConnection({
      id: 'conn_fallback',
      userId: 'user_1',
      provider: 'fallback-sync',
      tenantId: 'tenant_1',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: {
        encrypted: encrypt(JSON.stringify({ type: 'api-key', apiKey: 'test' }), encryptionKey),
        algorithm: 'aes-256-gcm',
      },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await plug.sync.backfill({
      provider: 'fallback-sync',
      connectionId: 'conn_fallback',
      resource: 'messages',
      actor: { userId: 'user_1', tenantId: 'tenant_1' },
    });

    expect(receivedTenantId).toBe('tenant_1');
  });

  it('retries persisted webhook deliveries and dead-letters after max attempts', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });

    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_1',
      verificationStatus: 'verified',
    });
    const delivery = await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      handlerName: 'github.issues',
      status: 'pending',
    });

    const firstRun = await plug.runtime.webhooks.processDueDeliveries(
      async () => {
        throw new Error('sink unavailable');
      },
      { maxAttempts: 2, baseDelayMs: 1000 }
    );

    expect(firstRun.failed).toBe(1);
    expect(firstRun.deliveries[0]?.attempts).toBe(1);
    expect(firstRun.deliveries[0]?.status).toBe('failed');

    await plug.runtime.webhooks.updateDelivery(delivery.id, { nextAttemptAt: new Date(0) });
    const secondRun = await plug.runtime.webhooks.processDueDeliveries(
      async () => {
        throw new Error('sink unavailable');
      },
      { maxAttempts: 2, baseDelayMs: 1000 }
    );

    expect(secondRun.deadLettered).toBe(1);
    expect(secondRun.deliveries[0]?.attempts).toBe(2);
    expect(secondRun.deliveries[0]?.status).toBe('dead-lettered');
  });

  it('claims webhook deliveries so concurrent workers do not run the same delivery', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'user_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });

    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_concurrent',
      verificationStatus: 'verified',
    });
    await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      handlerName: 'github.issues',
      status: 'pending',
    });

    let handlerCalls = 0;
    const [firstRun, secondRun] = await Promise.all([
      plug.runtime.webhooks.processDueDeliveries(async () => {
        handlerCalls += 1;
        await Promise.resolve();
      }),
      plug.runtime.webhooks.processDueDeliveries(async () => {
        handlerCalls += 1;
        await Promise.resolve();
      }),
    ]);

    expect(handlerCalls).toBe(1);
    expect(firstRun.succeeded + secondRun.succeeded).toBe(1);
    expect(firstRun.processed + secondRun.processed).toBe(1);
  });
});

const testSyncProvider: Provider = {
  name: 'test-sync',
  displayName: 'Test Sync',
  version: '1.0.0',
  description: 'Test provider with a core sync resource',
  baseUrl: 'https://provider.example.com',
  auth: { type: AuthType.None },
  actions: {
    noop: {
      name: 'noop',
      displayName: 'Noop',
      description: 'Noop action',
      parameters: z.object({}),
      returns: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    },
  },
  sync: {
    records: {
      resource: 'records',
      fetch: async () => ({
        items: [
          { id: 'r1', value: 'first' },
          { id: 'r2', value: 'second' },
        ],
        checkpoint: { page: 1 },
        done: true,
      }),
    },
  },
};
