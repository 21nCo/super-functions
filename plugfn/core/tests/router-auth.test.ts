import { describe, it, expect, vi } from 'vitest';
import { createPlugFnRouter } from '../src/router/http-router.js';

describe('HTTP router auth boundaries', () => {
  it('exposes the canonical route inventory', () => {
    const plug = createMockPlugFn();
    const router = createPlugFnRouter(plug);

    const canonicalRoutes = router
      .getRoutes()
      .map((route) => `${route.method} ${route.path}`);

    expect(canonicalRoutes).toEqual([
      'GET /callback',
      'GET /callback/:provider',
      'POST /webhooks/:provider',
      'POST /webhooks/:provider/:event',
      'GET /healthz',
      'GET /readyz',
      'GET /providers',
      'GET /connections',
      'GET /connections/:connectionId',
      'GET /connections/:connectionId/status',
      'POST /connections/start',
      'POST /connections/disconnect',
      'GET /workflows',
      'POST /sync/jobs',
      'GET /sync/jobs',
      'GET /sync/jobs/:jobId',
      'POST /sync/jobs/:jobId/cancel',
      'POST /sync/checkpoints',
      'GET /events',
      'GET /metrics',
    ]);
  });

  it('defaults to plugFn.config.auth.authenticate and rejects mismatched query identity', async () => {
    const listConnections = vi.fn(async () => []);
    const authenticate = vi.fn(async () => ({ userId: 'u1', tenantId: 'tenant_1' }));
    const plug = createMockPlugFn({ listConnections, authenticate });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections?userId=spoofed&provider=gmail', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(listConnections).not.toHaveBeenCalled();
  });

  it('prefers an explicit auth override when supplied', async () => {
    const listConnections = vi.fn(async () => []);
    const configuredAuthenticate = vi.fn(async () => ({ userId: 'config-user' }));
    const overrideAuthenticate = vi.fn(async () => ({ userId: 'override-user' }));
    const plug = createMockPlugFn({
      listConnections,
      authenticate: configuredAuthenticate,
    });
    const router = createPlugFnRouter(plug, {
      authenticate: overrideAuthenticate,
    });

    const response = await router.handle(
      new Request('http://localhost/connections?provider=gmail', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data.userId).toBe('override-user');
    expect(configuredAuthenticate).not.toHaveBeenCalled();
    expect(overrideAuthenticate).toHaveBeenCalledTimes(1);
    expect(listConnections).toHaveBeenCalledWith({
      userId: 'override-user',
      provider: 'gmail',
    });
  });

  it('rejects unauthenticated access with PLUGFN_AUTH_REQUIRED', async () => {
    const listConnections = vi.fn(async () => []);
    const plug = createMockPlugFn({
      listConnections,
      authenticate: vi.fn(async () => null),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('PLUGFN_AUTH_REQUIRED');
    expect(body.error.status).toBe(401);
    expect(body.error.retryable).toBe(false);
    expect(body.error.details).toEqual({});
    expect(body.meta.requestId).toMatch(/^req_[a-f0-9]+$/);
    expect(listConnections).not.toHaveBeenCalled();
  });

  it('rejects identity spoofing in body payloads', async () => {
    const disconnect = vi.fn(async () => {});
    const plug = createMockPlugFn({
      disconnect,
      authenticate: vi.fn(async () => ({ userId: 'u1', tenantId: 'tenant-1' })),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections/disconnect', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'spoofed-user',
          tenantId: 'tenant-2',
          provider: 'gmail',
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
    expect(body.error.status).toBe(403);
    expect(body.error.retryable).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('rejects oversized webhook payloads with deterministic error details', async () => {
    const handleWebhook = vi.fn(async () => ({}));
    const plug = createMockPlugFn({ handleWebhook });
    const router = createPlugFnRouter(plug, { maxWebhookPayloadBytes: 32 });

    const response = await router.handle(
      new Request('http://localhost/webhooks/gmail/mail.update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ payload: 'x'.repeat(64) }),
      })
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.status).toBe(413);
    expect(body.error.retryable).toBe(false);
    expect(body.error.details).toEqual({ maxBytes: 32 });
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it('rejects reading a connection owned by another user', async () => {
    const plug = createMockPlugFn({
      authenticate: vi.fn(async () => ({ userId: 'u1', tenantId: 'tenant_1' })),
      getConnection: vi.fn(async () => ({
        id: 'conn_other',
        userId: 'u2',
        provider: 'gmail',
        tenantId: 'tenant_1',
        status: 'active',
      })),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections/conn_other', {
        method: 'GET',
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('rejects sync job creation for a connection owned by another user', async () => {
    const createJob = vi.fn(async () => ({ id: 'job_1' }));
    const plug = createMockPlugFn({
      authenticate: vi.fn(async () => ({ userId: 'u1', tenantId: 'tenant_1' })),
      getConnection: vi.fn(async () => ({
        id: 'conn_other',
        userId: 'u2',
        provider: 'gmail',
        tenantId: 'tenant_1',
        status: 'active',
      })),
      createJob,
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/sync/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'gmail',
          connectionId: 'conn_other',
          resource: 'messages',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('rejects org admins from a different organization in the same tenant', async () => {
    const plug = createMockPlugFn({
      authenticate: vi.fn(async () => ({
        userId: 'org-admin',
        tenantId: 'tenant_1',
        organizationId: 'org_1',
        roles: ['org:admin'],
      })),
      getConnection: vi.fn(async () => ({
        id: 'conn_org_2',
        userId: 'installer_2',
        provider: 'gmail',
        ownerKind: 'organization',
        organizationId: 'org_2',
        installedByUserId: 'installer_2',
        tenantId: 'tenant_1',
        status: 'active',
      })),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections/conn_org_2', { method: 'GET' })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TENANT_ACCESS_DENIED' },
    });
  });

  it('requires authenticated organization context for organization-owned starts', async () => {
    const plug = createMockPlugFn({
      authenticate: vi.fn(async () => ({ userId: 'installer', tenantId: 'tenant_1' })),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: 'gmail',
          redirectUri: 'https://app.example.com/callback',
          owner: {
            kind: 'organization',
            organizationId: 'org_arbitrary',
            installedByUserId: 'installer',
            tenantId: 'tenant_1',
          },
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TENANT_ACCESS_DENIED' },
    });
    expect(plug.connections.start).not.toHaveBeenCalled();
  });

  it('includes authorized organization-owned connections in admin listings', async () => {
    const personal = {
      id: 'conn_personal',
      userId: 'admin',
      provider: 'gmail',
      tenantId: 'tenant_1',
    };
    const organization = {
      id: 'conn_org',
      userId: 'installer',
      provider: 'gmail',
      ownerKind: 'organization',
      ownerId: 'org_1',
      organizationId: 'org_1',
      installedByUserId: 'installer',
      tenantId: 'tenant_1',
    };
    const listConnections = vi.fn(async (options) =>
      options.owner ? [organization] : [personal]
    );
    const plug = createMockPlugFn({
      listConnections,
      authenticate: vi.fn(async () => ({
        userId: 'admin',
        tenantId: 'tenant_1',
        organizationId: 'org_1',
        roles: ['org:admin'],
      })),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/connections?provider=gmail', { method: 'GET' })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { connections: [personal, organization] },
    });
    expect(listConnections).toHaveBeenCalledTimes(2);
    expect(listConnections).toHaveBeenLastCalledWith({
      userId: 'admin',
      provider: 'gmail',
      owner: {
        kind: 'organization',
        organizationId: 'org_1',
        installedByUserId: 'admin',
        tenantId: 'tenant_1',
      },
    });
  });

  it('includes authorized organization-owned jobs in sync listings', async () => {
    const personalJob = {
      id: 'job_personal',
      connectionId: 'conn_personal',
      ownerKind: 'user',
      ownerId: 'admin',
    };
    const organizationJob = {
      id: 'job_org',
      connectionId: 'conn_org',
      ownerKind: 'organization',
      ownerId: 'org_1',
    };
    const listSyncJobs = vi.fn(async (filters) =>
      filters.ownerKind === 'organization' ? [organizationJob] : [personalJob]
    );
    const plug = createMockPlugFn({
      listSyncJobs,
      getSyncJob: vi.fn(async () => organizationJob),
      getConnection: vi.fn(async () => ({
        id: 'conn_org',
        userId: 'installer',
        provider: 'gmail',
        ownerKind: 'organization',
        ownerId: 'org_1',
        organizationId: 'org_1',
        installedByUserId: 'installer',
        tenantId: 'tenant_1',
      })),
      authenticate: vi.fn(async () => ({
        userId: 'admin',
        tenantId: 'tenant_1',
        organizationId: 'org_1',
        roles: ['org:admin'],
      })),
    });
    const router = createPlugFnRouter(plug);

    const response = await router.handle(
      new Request('http://localhost/sync/jobs?provider=gmail', { method: 'GET' })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { jobs: [personalJob, organizationJob] },
    });
    expect(listSyncJobs).toHaveBeenNthCalledWith(1, {
      provider: 'gmail',
      ownerKind: 'user',
      ownerId: 'admin',
    });
    expect(listSyncJobs).toHaveBeenNthCalledWith(2, {
      provider: 'gmail',
      ownerKind: 'organization',
      ownerId: 'org_1',
    });
  });
});

function createMockPlugFn(overrides: {
  listConnections?: ReturnType<typeof vi.fn>;
  getConnection?: ReturnType<typeof vi.fn>;
  disconnect?: ReturnType<typeof vi.fn>;
  handleWebhook?: ReturnType<typeof vi.fn>;
  authenticate?: ReturnType<typeof vi.fn>;
  createJob?: ReturnType<typeof vi.fn>;
  listSyncJobs?: ReturnType<typeof vi.fn>;
  getSyncJob?: ReturnType<typeof vi.fn>;
} = {}) {
  const listConnections = overrides.listConnections ?? vi.fn(async () => []);
  const getConnection = overrides.getConnection ?? vi.fn(async () => ({ id: 'conn_1', userId: 'u1' }));
  const disconnect = overrides.disconnect ?? vi.fn(async () => {});
  const handleWebhook = overrides.handleWebhook ?? vi.fn(async () => ({}));
  const authenticate = overrides.authenticate ?? vi.fn(async () => ({ userId: 'u1' }));
  const createJob = overrides.createJob ?? vi.fn(async () => ({ id: 'job_1' }));

  return {
    config: {
      auth: {
        authenticate,
      },
      baseUrl: 'https://app.example.com',
      integrations: {},
      authorization: undefined,
    },
    connections: {
      start: vi.fn(async () => ({ authUrl: 'https://example.com/auth' })),
      getAuthUrl: vi.fn(async () => 'https://example.com/auth'),
      handleCallback: vi.fn(async () => ({ id: 'conn_1', provider: 'gmail', status: 'active' })),
      list: listConnections,
      get: getConnection,
      disconnect,
      refresh: vi.fn(async () => ({ id: 'conn_1' })),
    },
    sync: {
      backfill: createJob,
      incremental: createJob,
    },
    workflows: {
      list: vi.fn(async () => []),
      get: vi.fn(async () => null),
      enable: vi.fn(async () => {}),
      disable: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      getStats: vi.fn(async () => ({})),
    },
    webhooks: {
      on: vi.fn(),
      off: vi.fn(),
      handle: handleWebhook,
      verify: vi.fn(async () => ({ verified: true })),
    },
    runtime: createMockRuntime({
      listSyncJobs: overrides.listSyncJobs,
      getSyncJob: overrides.getSyncJob,
    }),
    providers: {
      list: vi.fn(() => []),
      get: vi.fn(() => undefined),
      register: vi.fn(),
    },
    batch: vi.fn(async () => []),
    getMetrics: vi.fn(async () => ({})),
    on: vi.fn(),
    off: vi.fn(),
  } as any;
}

function createMockRuntime(overrides: {
  listSyncJobs?: ReturnType<typeof vi.fn>;
  getSyncJob?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    installations: {
      create: vi.fn(),
      list: vi.fn(async () => []),
      update: vi.fn(),
    },
    grants: {
      create: vi.fn(),
      list: vi.fn(async () => []),
      delete: vi.fn(),
    },
    webhooks: {
      createReceipt: vi.fn(async () => ({ id: 'receipt_1' })),
      getReceipt: vi.fn(async () => null),
      findReceiptByIdempotencyKey: vi.fn(async () => null),
      updateReceipt: vi.fn(async () => ({ id: 'receipt_1' })),
      createDelivery: vi.fn(async () => ({ id: 'delivery_1', attempts: 0 })),
      updateDelivery: vi.fn(async () => ({ id: 'delivery_1', attempts: 1 })),
      listDeliveries: vi.fn(async () => []),
      processDueDeliveries: vi.fn(async () => ({
        processed: 0,
        succeeded: 0,
        failed: 0,
        deadLettered: 0,
        deliveries: [],
      })),
    },
    sync: {
      createJob: vi.fn(async () => ({ id: 'job_1' })),
      getJob: overrides.getSyncJob ?? vi.fn(async () => ({ id: 'job_1' })),
      listJobs: overrides.listSyncJobs ?? vi.fn(async () => []),
      updateJob: vi.fn(async () => ({ id: 'job_1' })),
      completeJob: vi.fn(async () => ({ id: 'job_1' })),
      failJob: vi.fn(async () => ({ id: 'job_1' })),
      processQueued: vi.fn(async () => ({ processed: 0, completed: 0, failed: 0, jobs: [] })),
      upsertCheckpoint: vi.fn(async () => ({ id: 'checkpoint_1' })),
      getCheckpoint: vi.fn(async () => null),
    },
    events: {
      create: vi.fn(async () => ({ id: 'event_1' })),
      list: vi.fn(async () => []),
    },
    secrets: {
      upsert: vi.fn(async () => ({ id: 'secret_1' })),
      list: vi.fn(async () => []),
    },
  };
}
