import { describe, expect, it, vi } from 'vitest';
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

    await expect(plug.runtime.sync.cancelJob(job.id)).rejects.toMatchObject({
      code: 'SYNC_JOB_TERMINAL',
      status: 409,
      details: { status: 'completed' },
    });
    await expect(plug.runtime.sync.getJob(job.id)).resolves.toMatchObject({
      status: 'completed',
    });
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

  it('reclaims sync jobs abandoned after their worker lease expires', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    plug.use(testSyncProvider);
    const now = new Date();
    await database.createConnection({
      id: 'conn_sync_abandoned',
      userId: 'user_1',
      provider: 'test-sync',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const job = await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync',
      connectionId: 'conn_sync_abandoned',
      resource: 'records',
      actor: { userId: 'user_1' },
    });
    const activeJob = await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync',
      connectionId: 'conn_sync_abandoned',
      resource: 'records',
      actor: { userId: 'user_1' },
    });
    await database.updateSyncJob(job.id, {
      status: 'running',
      updatedAt: new Date(Date.now() - 60_000),
    });
    await database.updateSyncJob(activeJob.id, {
      status: 'running',
      updatedAt: new Date(),
    });

    const result = await plug.sync.processQueued({ leaseMs: 30_000 });

    expect(result).toMatchObject({
      processed: 1,
      completed: 1,
      failed: 0,
      jobs: [{ id: job.id, status: 'completed' }],
    });
    await expect(plug.runtime.sync.getJob(activeJob.id)).resolves.toMatchObject({
      status: 'running',
    });
  });

  it('heartbeats active sync claims so another worker cannot reclaim a slow job', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({ database, auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', integrations: {} });
    let releaseFetch!: () => void;
    const fetchReleased = new Promise<void>((resolve) => { releaseFetch = resolve; });
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => { markFetchStarted = resolve; });
    const fetch = vi.fn(async () => {
      markFetchStarted(); await fetchReleased;
      return { items: [], checkpoint: { page: 1 }, done: true };
    });
    plug.use({ ...testSyncProvider, name: 'test-sync-heartbeat',
      sync: { records: { resource: 'records', fetch } } });
    const now = new Date();
    await database.createConnection({ id: 'conn_sync_heartbeat', userId: 'user_1',
      provider: 'test-sync-heartbeat', ownerKind: 'user', ownerId: 'user_1',
      status: ConnectionStatus.Active, credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now, createdAt: now, updatedAt: now });
    await plug.sync.enqueue({ mode: 'full', provider: 'test-sync-heartbeat',
      connectionId: 'conn_sync_heartbeat', resource: 'records', actor: { userId: 'user_1' } });
    const workerA = plug.sync.processQueued({ leaseMs: 30 });
    await fetchStarted;
    await new Promise((resolve) => setTimeout(resolve, 80));
    const workerB = await plug.sync.processQueued({ leaseMs: 30 });
    expect(workerB.processed).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    releaseFetch();
    await expect(workerA).resolves.toMatchObject({ completed: 1, failed: 0 });
  });

  it('fences progress writes from a worker whose sync claim was reclaimed', async () => {
    const database = new MemoryAdapter();
    const now = new Date();
    const job = await database.createSyncJob({ id: 'sync_fenced_claim', provider: 'test-sync',
      connectionId: 'conn_sync_fenced_claim', resource: 'records', mode: 'full', status: 'queued',
      fetchedCount: 0, persistedCount: 0, skippedCount: 0, createdAt: now, updatedAt: now });
    const [workerA] = await database.claimQueuedSyncJobs(1, 'worker-a', 30);
    await database.updateSyncJob(job.id, { updatedAt: new Date(Date.now() - 1_000) });
    const [workerB] = await database.claimQueuedSyncJobs(1, 'worker-b', 30);
    expect(workerA.claimToken).not.toBe(workerB.claimToken);
    await expect(database.updateClaimedSyncJob(job.id, workerA.claimToken!, { fetchedCount: 1 })).resolves.toBeNull();
    await expect(database.updateClaimedSyncJob(job.id, workerB.claimToken!, { fetchedCount: 2 }))
      .resolves.toMatchObject({ fetchedCount: 2, claimToken: workerB.claimToken });
  });

  it('rejects an explicit unknown sink before fetching or advancing checkpoints', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const fetch = vi.fn(async () => ({
      items: [{ id: 'r1' }],
      checkpoint: { page: 1 },
      done: true,
    }));
    plug.use({
      ...testSyncProvider,
      name: 'test-sync-missing-sink',
      sync: { records: { resource: 'records', fetch } },
    });
    const now = new Date();
    await database.createConnection({
      id: 'conn_sync_missing_sink',
      userId: 'user_1',
      provider: 'test-sync-missing-sink',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await expect(
      plug.sync.backfill({
        provider: 'test-sync-missing-sink',
        connectionId: 'conn_sync_missing_sink',
        resource: 'records',
        sinkId: 'missing-sink',
        actor: { userId: 'user_1' },
      })
    ).rejects.toMatchObject({ code: 'SYNC_SINK_NOT_FOUND' });

    expect(fetch).not.toHaveBeenCalled();
    await expect(
      plug.runtime.sync.getCheckpoint('conn_sync_missing_sink', 'records')
    ).resolves.toBeNull();
  });

  it.each([
    ['provider result', { resultSinkId: 'missing-provider-sink', defaultSinkId: undefined }],
    ['provider default', { resultSinkId: undefined, defaultSinkId: 'missing-default-sink' }],
  ])('rejects an unknown %s sink before advancing checkpoints', async (_source, sinkConfig) => {
    const database = new MemoryAdapter();
    const plug = plugFn({ database, auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', integrations: {} });
    plug.use({ ...testSyncProvider, name: 'test-sync-resolved-missing-sink', sync: { records: {
      resource: 'records', defaultSinkId: sinkConfig.defaultSinkId,
      fetch: async () => ({ items: [{ id: 'r1' }], checkpoint: { page: 1 },
        sinkId: sinkConfig.resultSinkId, done: true }),
    } } });
    const now = new Date();
    await database.createConnection({ id: 'conn_sync_resolved_missing_sink', userId: 'user_1',
      provider: 'test-sync-resolved-missing-sink', ownerKind: 'user', ownerId: 'user_1',
      status: ConnectionStatus.Active, credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now, createdAt: now, updatedAt: now });
    await expect(plug.sync.backfill({ provider: 'test-sync-resolved-missing-sink',
      connectionId: 'conn_sync_resolved_missing_sink', resource: 'records', actor: { userId: 'user_1' } }))
      .rejects.toMatchObject({ code: 'SYNC_SINK_NOT_FOUND' });
    await expect(plug.runtime.sync.getCheckpoint('conn_sync_resolved_missing_sink', 'records'))
      .resolves.toBeNull();
  });

  it('uses custom connection authorization for enqueue and worker revalidation', async () => {
    const database = new MemoryAdapter();
    let allowed = true;
    const authorizeConnection = vi.fn(async () => allowed);
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'custom-admin', tenantId: 'tenant-admin' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
      authorization: { authorizeConnection },
    });
    plug.use(testSyncProvider);
    const now = new Date();
    await database.createConnection({
      id: 'conn_sync_custom_auth',
      userId: 'owner',
      provider: 'test-sync',
      tenantId: 'tenant-owner',
      ownerKind: 'user',
      ownerId: 'owner',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const queued = await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync',
      connectionId: 'conn_sync_custom_auth',
      resource: 'records',
      actor: { userId: 'custom-admin', tenantId: 'tenant-admin' },
    });
    allowed = false;

    await expect(plug.sync.processQueued()).resolves.toMatchObject({
      processed: 1,
      completed: 0,
      failed: 1,
      jobs: [{ id: queued.id, status: 'failed' }],
    });
    expect(authorizeConnection).toHaveBeenCalledTimes(2);
    expect(authorizeConnection).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ operation: 'sync' })
    );
    expect(authorizeConnection).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ operation: 'sync' })
    );
  });

  it('allows an organization admin to enqueue and run organization sync work', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: {
        async authenticate() {
          return { userId: 'admin', tenantId: 'tenant_1' };
        },
      },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    plug.use(testSyncProvider);
    const now = new Date();
    await database.createConnection({
      id: 'conn_sync_org',
      userId: 'installer',
      provider: 'test-sync',
      tenantId: 'tenant_1',
      ownerKind: 'organization',
      ownerId: 'org_1',
      organizationId: 'org_1',
      installedByUserId: 'installer',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    plug.runtime.sinks.register(
      createDbSink({
        adapter: database,
        id: 'test.org.records',
        provider: 'test-sync',
        resource: 'records',
        model: 'test_external_org_records',
        uniqueBy: ['provider', 'externalId'],
        transform: (record: any) => ({
          provider: 'test-sync',
          externalId: record.id,
          value: record.value,
        }),
      })
    );

    const job = await plug.sync.backfill({
      provider: 'test-sync',
      connectionId: 'conn_sync_org',
      resource: 'records',
      actor: {
        userId: 'admin',
        tenantId: 'tenant_1',
        organizationId: 'org_1',
        roles: ['org:admin'],
      },
    });

    expect(job).toMatchObject({ status: 'completed', fetchedCount: 2 });
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

  it.each([
    { outcome: 'successful completion', shouldFail: false },
    { outcome: 'execution failure', shouldFail: true },
  ])('preserves cancellation across concurrent $outcome', async ({ shouldFail }) => {
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

    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    let releaseFetch!: () => void;
    const fetchReleased = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    plug.use({
      ...testSyncProvider,
      name: 'test-sync-cancel-race',
      sync: {
        records: {
          resource: 'records',
          fetch: async () => {
            markFetchStarted();
            await fetchReleased;
            if (shouldFail) {
              throw new Error('sync failed after cancellation');
            }
            return { items: [], done: true };
          },
        },
      },
    });
    const now = new Date();
    await database.createConnection({
      id: 'conn_sync_cancel_race',
      userId: 'user_1',
      provider: 'test-sync-cancel-race',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync-cancel-race',
      connectionId: 'conn_sync_cancel_race',
      resource: 'records',
      actor: { userId: 'user_1' },
    });
    const running = plug.sync.processQueued();
    await fetchStarted;
    const [job] = await plug.runtime.sync.listJobs({
      connectionId: 'conn_sync_cancel_race',
    });
    expect(job?.status).toBe('running');

    await plug.runtime.sync.cancelJob(job!.id);
    releaseFetch();

    await expect(running).resolves.toMatchObject({
      processed: 1,
      completed: 0,
      cancelled: 1,
      failed: 0,
      jobs: [{ status: 'cancelled' }],
    });
    await expect(plug.runtime.sync.getJob(job!.id)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('fails a claimed job when its connection was deleted after enqueue', async () => {
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
    const now = new Date();
    await database.createConnection({
      id: 'conn_deleted_after_enqueue',
      userId: 'user_1',
      provider: 'test-sync',
      ownerKind: 'user',
      ownerId: 'user_1',
      status: ConnectionStatus.Active,
      credentials: { encrypted: '{}', algorithm: 'none' },
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const queued = await plug.sync.enqueue({
      mode: 'full',
      provider: 'test-sync',
      connectionId: 'conn_deleted_after_enqueue',
      resource: 'records',
      actor: { userId: 'user_1' },
    });
    await database.deleteConnection('conn_deleted_after_enqueue');

    await expect(plug.sync.processQueued()).resolves.toMatchObject({
      processed: 1,
      completed: 0,
      cancelled: 0,
      failed: 1,
      jobs: [{ id: queued.id, status: 'failed' }],
    });
    await expect(plug.runtime.sync.getJob(queued.id)).resolves.toMatchObject({
      status: 'failed',
      error: expect.stringContaining('not found'),
    });
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

  it('persists fallback sync records and reuses the durable checkpoint', async () => {
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
    const receivedCheckpoints: unknown[] = [];
    let invocation = 0;
    plug.use({
      ...testSyncProvider,
      name: 'fallback-sync-persisted',
      sync: undefined,
      actions: {
        'mail.sync': {
          name: 'mail.sync',
          displayName: 'Mail sync',
          description: 'Fallback mail sync with returned records',
          parameters: z.object({
            tenantId: z.string(),
            mode: z.enum(['full', 'incremental']),
            checkpoint: z.unknown().optional(),
            cursor: z.string().optional(),
          }),
          returns: z.object({
            count: z.number(),
            upserted: z.number(),
            skipped: z.number(),
            checkpoint: z.string(),
            messages: z.array(z.object({ id: z.string(), value: z.string() })),
          }),
          execute: async (params) => {
            invocation += 1;
            receivedCheckpoints.push(params.checkpoint);
            return {
              count: 1,
              upserted: 1,
              skipped: 0,
              checkpoint: `checkpoint-${invocation}`,
              messages: [{ id: 'message-1', value: `value-${invocation}` }],
            };
          },
        },
      },
    });

    const now = new Date();
    await database.createConnection({
      id: 'conn_fallback_persisted',
      userId: 'user_1',
      provider: 'fallback-sync-persisted',
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

    plug.runtime.sinks.register(
      createDbSink({
        adapter: database,
        id: 'fallback.messages',
        provider: 'fallback-sync-persisted',
        resource: 'messages',
        model: 'test_fallback_messages',
        uniqueBy: ['provider', 'externalId'],
        transform: (record: any) => ({
          provider: 'fallback-sync-persisted',
          externalId: record.id,
          value: record.value,
        }),
      })
    );

    const backfill = await plug.sync.backfill({
      provider: 'fallback-sync-persisted',
      connectionId: 'conn_fallback_persisted',
      resource: 'messages',
      sinkId: 'fallback.messages',
      actor: { userId: 'user_1', tenantId: 'tenant_1' },
    });
    const incremental = await plug.sync.incremental({
      provider: 'fallback-sync-persisted',
      connectionId: 'conn_fallback_persisted',
      resource: 'messages',
      sinkId: 'fallback.messages',
      actor: { userId: 'user_1', tenantId: 'tenant_1' },
    });
    const reset = await plug.sync.incremental({
      provider: 'fallback-sync-persisted',
      connectionId: 'conn_fallback_persisted',
      resource: 'messages',
      checkpoint: null,
      sinkId: 'fallback.messages',
      actor: { userId: 'user_1', tenantId: 'tenant_1' },
    });

    expect(backfill).toMatchObject({
      checkpoint: 'checkpoint-1',
      fetchedCount: 1,
      persistedCount: 1,
    });
    expect(incremental).toMatchObject({
      checkpoint: 'checkpoint-2',
      fetchedCount: 1,
      persistedCount: 1,
    });
    expect(reset).toMatchObject({
      checkpoint: 'checkpoint-3',
      fetchedCount: 1,
      persistedCount: 1,
    });
    expect(receivedCheckpoints).toEqual([undefined, 'checkpoint-1', null]);
    expect(
      await database.findMany<any>({ model: 'test_fallback_messages', where: [] })
    ).toMatchObject([
      {
        provider: 'fallback-sync-persisted',
        externalId: 'message-1',
        value: 'value-3',
      },
    ]);
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

  it('replaces receipt metadata without a cross-instance read/merge/write race', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_metadata_merge',
      verificationStatus: 'verified',
    });

    await plug.runtime.webhooks.updateReceipt(receipt.id, {
      metadata: { first: true, updatedAt: undefined },
    });

    await expect(plug.runtime.webhooks.getReceipt(receipt.id)).resolves.toMatchObject({
      metadata: { first: true, updatedAt: expect.any(String) },
    });
  });

  it('dead-letters expired webhook replay payloads without dispatching them', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_expired_payload',
      verificationStatus: 'verified',
    });
    const delivery = await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      handlerName: 'github.issues',
      status: 'pending',
      metadata: {
        rawBodyBase64: Buffer.from('{"action":"opened"}').toString('base64'),
        rawBodyExpiresAt: new Date(0).toISOString(),
      },
    });
    const handler = vi.fn();

    const result = await plug.runtime.webhooks.processDueDeliveries(handler);

    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 1, deadLettered: 1 });
    await expect(plug.runtime.webhooks.listDeliveries(receipt.id)).resolves.toEqual([
      expect.objectContaining({
        id: delivery.id,
        status: 'dead-lettered',
        metadata: expect.not.objectContaining({ rawBodyBase64: expect.anything() }),
      }),
    ]);
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

  it('renews webhook delivery leases while a handler is still running', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_long_running',
      verificationStatus: 'verified',
    });
    await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      handlerName: 'github.issues',
      status: 'pending',
    });

    let releaseHandler!: () => void;
    let markStarted!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const handlerRelease = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const handler = vi.fn(async () => {
      markStarted();
      await handlerRelease;
    });

    const firstRunPromise = plug.runtime.webhooks.processDueDeliveries(handler, { leaseMs: 60 });
    await handlerStarted;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const secondRun = await plug.runtime.webhooks.processDueDeliveries(handler, { leaseMs: 60 });
    releaseHandler();
    const firstRun = await firstRunPromise;

    expect(handler).toHaveBeenCalledTimes(1);
    expect(firstRun).toMatchObject({ processed: 1, succeeded: 1 });
    expect(secondRun).toMatchObject({ processed: 0, succeeded: 0 });
  });

  it('does not suppress a distinct delivery target after a sibling succeeds', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_distinct_targets',
      verificationStatus: 'verified',
    });
    await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      sinkId: 'sink-a',
      handlerName: 'handler-a',
      status: 'success',
    });
    await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      sinkId: 'sink-b',
      handlerName: 'handler-b',
      status: 'pending',
    });
    const handler = vi.fn();

    const result = await plug.runtime.webhooks.processDueDeliveries(handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ processed: 1, succeeded: 1, deadLettered: 0 });
  });

  it('clears replay payloads when a delivery is superseded by a successful sibling', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_superseded_target',
      verificationStatus: 'verified',
    });
    await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      sinkId: 'sink-a',
      handlerName: 'handler-a',
      status: 'success',
    });
    const pending = await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      sinkId: 'sink-a',
      handlerName: 'handler-a',
      status: 'pending',
      metadata: {
        rawBodyBase64: Buffer.from('{"action":"opened"}').toString('base64'),
        rawBodyExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const handler = vi.fn();

    const result = await plug.runtime.webhooks.processDueDeliveries(handler);

    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 1, succeeded: 0, deadLettered: 1 });
    await expect(plug.runtime.webhooks.listDeliveries(receipt.id)).resolves.toContainEqual(
      expect.objectContaining({
        id: pending.id,
        status: 'dead-lettered',
        metadata: expect.not.objectContaining({ rawBodyBase64: expect.anything() }),
      })
    );
  });

  it('reclaims stale running webhook deliveries after the worker lease expires', async () => {
    const database = new MemoryAdapter();
    const plug = plugFn({
      database,
      auth: { async authenticate() { return { userId: 'user_1' }; } },
      baseUrl: 'https://app.example.com',
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      integrations: {},
    });
    const receipt = await plug.runtime.webhooks.createReceipt({
      provider: 'github',
      event: 'issues',
      payloadHash: 'hash_stale_running',
      verificationStatus: 'verified',
    });
    const delivery = await plug.runtime.webhooks.createDelivery({
      receiptId: receipt.id,
      handlerName: 'github.issues',
      status: 'running',
    });
    await database.updateWebhookDelivery(delivery.id, {
      updatedAt: new Date(Date.now() - 6 * 60 * 1000),
    });

    const handler = vi.fn();
    const result = await plug.runtime.webhooks.processDueDeliveries(handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ processed: 1, succeeded: 1 });
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
