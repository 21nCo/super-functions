import { describe, expect, it, vi } from 'vitest';
import {
  MemoryAdminAuditSink,
  MemoryAdminIdempotencyStore,
  AdminClient,
  createAdminCapabilityAdapter,
  defineAdminCapability,
  validateAdminCapabilityManifest,
  type AdminCapabilityManifest,
  type AdminOperationContext,
} from '@superfunctions/admin';
import { clearSuperConsoleForTesting, createSuperConsole as createSuperConsoleBase, loadSuperConsoleInstallation, resolveSuperConsoleInstallationUrl, type SuperConsoleOperatorAuth, type SuperConsoleOptions, type SuperConsolePrincipal } from '../../src/lib/server';
import { authfn, type AuthFnRuntimeConfig } from 'authfn';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnTwoFactorPlugin } from '@authfn/two-factor';
import { confirmTwoFactorEnrollment, createTwoFactorEnrollment } from 'authfn/core/two-factor';
import { listActiveSessionsForUser } from 'authfn/core/sessions';
import { memoryAdapter } from '@superfunctions/db/testing';
import { createAuthFnOperatorAuth } from '@authfn/admin';
import { createHmac } from 'node:crypto';

const createAuthFn = (config: AuthFnRuntimeConfig) => authfn(config).createServer(config as never);

const scope = {
  organizationId: 'org_1',
  workspaceId: 'workspace_1',
  projectId: 'project_1',
  environmentId: 'environment_1',
  namespace: 'tenant_1',
  region: 'in-south',
};

const principal: SuperConsolePrincipal = {
  actor: { id: 'operator_1', permissions: ['*'] },
  displayName: 'Operator One',
  email: 'operator@example.test',
  role: 'installation administrator',
  defaultScope: scope,
};

const defaultOpenApi = {
  openApiSecuritySchemes: {
    operatorSession: { type: 'apiKey', in: 'cookie', name: 'provider.session' },
    operatorApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Operator API key' },
  },
  openApiCsrfHeader: { name: 'X-Provider-CSRF' },
} as const;

function createSuperConsole(
  options: Omit<SuperConsoleOptions, 'openApiSecuritySchemes'>
    & Partial<Pick<SuperConsoleOptions, 'openApiSecuritySchemes'>>
) {
  return createSuperConsoleBase({ ...defaultOpenApi, ...options } as SuperConsoleOptions);
}

function auth(overrides: Partial<SuperConsoleOperatorAuth> = {}): SuperConsoleOperatorAuth {
  return {
    authenticate: async () => principal,
    authorizeScope: async ({ requested }) => requested,
    authorizeMutation: async () => undefined,
    ...overrides,
  };
}

function manifest(options: { destructive?: boolean } = {}): AdminCapabilityManifest {
  const destructive = options.destructive ?? false;
  return defineAdminCapability({
    schemaVersion: '1.0',
    id: 'examplefn',
    displayName: 'ExampleFn',
    version: '1.0.0',
    description: 'Operate ExampleFn.',
    category: 'test',
    availability: 'optional-product',
    scopeLevels: ['organization', 'workspace', 'project', 'environment'],
    navigation: [{ id: 'examplefn', label: 'ExampleFn', path: '/modules/examplefn' }],
    operations: [{
      id: destructive ? 'examplefn.records.delete' : 'examplefn.records.list',
      title: destructive ? 'Delete record' : 'List records',
      description: destructive ? 'Delete one record.' : 'List records.',
      inputSchema: destructive
        ? { type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'], additionalProperties: false }
        : { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } }, additionalProperties: false },
      outputSchema: destructive
        ? { type: 'object', properties: { accepted: { type: 'boolean' } }, required: ['accepted'], additionalProperties: false }
        : { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } } }, required: ['items'], additionalProperties: false },
      route: { method: destructive ? 'DELETE' : 'GET', path: destructive ? '/resources/records/:id' : '/resources/records' },
      permission: destructive ? 'examplefn.records.delete' : 'examplefn.records.read',
      safety: destructive
        ? { classification: 'destructive', idempotent: true, requiresConfirmation: true, audit: 'required' }
        : { classification: 'read', idempotent: true, audit: 'optional' },
      target: destructive ? { resource: 'records', idInput: 'id' } : { resource: 'records', collection: true },
      mcp: { readOnlyHint: !destructive, destructiveHint: destructive, idempotentHint: true },
    }],
  });
}

function installation(options: { destructive?: boolean; permissions?: string[] } = {}) {
  const capability = manifest({ destructive: options.destructive });
  const handler = vi.fn(async ({ input }: { input: unknown; context: AdminOperationContext }) => ({
    ok: true as const,
    data: options.destructive ? { accepted: true } : { items: [{ id: 'record_1', input }] },
  }));
  const operator = {
    ...principal,
    actor: { ...principal.actor, permissions: options.permissions ?? ['*'] },
  };
  const confirmation = {
    issue: vi.fn(async () => ({ token: 'bound-token', expiresAt: '2026-08-13T10:00:00.000Z' })),
    prepareActivation: vi.fn(async () => undefined),
    cancelActivation: vi.fn(async () => undefined),
    activate: vi.fn(async () => undefined),
    revoke: vi.fn(async () => undefined),
    verify: vi.fn(async ({ token }: { token: string }) => token === 'bound-token'),
  };
  const audit = new MemoryAdminAuditSink();
  const console = createSuperConsole({
    adapters: [createAdminCapabilityAdapter(capability, { [capability.operations[0]!.id]: handler })],
    enabledModules: ['examplefn'],
    auth: auth({ authenticate: async () => operator }),
    shellPolicy: { authorize: () => true },
    audit,
    idempotency: new MemoryAdminIdempotencyStore(),
    confirmation,
  });
  return { console, handler, confirmation, audit };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://console.example.test${path}`, init);
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((cookie) => cookie.slice(0, cookie.indexOf(';'))).join('; ');
}

describe('Super Console server composition', () => {
  it('rejects non-absolute self-host installation modules before import', async () => {
    clearSuperConsoleForTesting();
    await expect(loadSuperConsoleInstallation('./installation.js')).rejects.toThrow(/absolute filesystem path or file URL/);
    clearSuperConsoleForTesting();
    expect(resolveSuperConsoleInstallationUrl('/srv/app/installation.js')).toBe('file:///srv/app/installation.js');
    expect(resolveSuperConsoleInstallationUrl('file:///srv/app/installation.js')).toBe('file:///srv/app/installation.js');
    expect(resolveSuperConsoleInstallationUrl('FILE:///srv/app/installation.js')).toBe('file:///srv/app/installation.js');
    expect(() => resolveSuperConsoleInstallationUrl('https://example.test/installation.js')).toThrow(/absolute filesystem path or file URL/);
  });

  it('rejects an API base path that the bundled UI and SvelteKit transport cannot mount', () => {
    expect(() => createSuperConsole({
      adapters: [],
      enabledModules: [],
      apiBasePath: '/internal/admin',
      auth: auth(),
      shellPolicy: { authorize: () => true },
    })).toThrow(/requires apiBasePath to be \/api\/admin\/v1/);
  });

  it('rejects a safe-method route classified as a mutation before registration', () => {
    const base = manifest();
    const operation = {
      ...base.operations[0]!,
      id: 'examplefn.records.refresh',
      route: { method: 'GET' as const, path: '/resources/refresh' },
      permission: 'examplefn.records.refresh',
      safety: {
        classification: 'write' as const,
        idempotent: false,
        requiresConfirmation: false,
        audit: 'optional' as const,
      },
    };
    const capability = { ...base, operations: [operation] };
    const authorizeMutation = vi.fn(async () => undefined);
    expect(() => createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, {
        [operation.id]: async () => ({ ok: true as const, data: { items: [] } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth({ authorizeMutation }),
      shellPolicy: { authorize: () => true },
    })).toThrow(/Invalid admin capability manifest/);
    expect(authorizeMutation).not.toHaveBeenCalled();
  });

  it('exposes only explicitly enabled module registry, OpenAPI, navigation and MCP tools', async () => {
    const { console } = installation();
    const registry = await console.handle(request('/api/admin/v1/registry'));
    expect(registry.status).toBe(200);
    expect(await registry.json()).toMatchObject({
      data: {
        modules: [{ id: 'examplefn', enabled: true }],
        enabledModules: [{ id: 'examplefn' }],
        surfaces: { overview: true, api: true, mcp: true, settings: true, audit: false, search: false },
      },
    });
    const client = new AdminClient({
      baseUrl: 'https://console.example.test/api/admin/v1',
      fetch: (input, init) => console.handle(new Request(input, init)),
    });
    expect((await client.registry()).map((capability) => capability.id)).toEqual(['examplefn']);
    expect(JSON.stringify(console.openApi)).toContain('examplefn.records.list');
    const genericInvoke = console.openApi.paths['/api/admin/v1/operations/{operationId}']?.post as { security?: unknown[]; parameters?: Array<{ name: string }> };
    expect(genericInvoke.security).toHaveLength(2);
    expect(genericInvoke.parameters?.map(({ name }) => name)).toEqual(expect.arrayContaining(['operationId', 'organizationId', 'workspaceId', 'projectId', 'environmentId', 'namespace', 'region']));
    expect(console.openApi.components.securitySchemes).toMatchObject({ operatorSession: { name: 'provider.session' } });
    expect(console.mcpTools.map((tool) => tool.name)).toEqual(['superconsole_examplefn_records_list']);
    expect((await console.handle(request('/api/admin/v1/modules/disabledfn'))).status).toBe(404);
  });

  it('projects an installation-specific operator-auth policy into OpenAPI', () => {
    const capability = manifest();
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, {
        'examplefn.records.list': async () => ({ ok: true as const, data: { items: [] } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      openApiSecuritySchemes: {
        operatorSession: { type: 'apiKey', in: 'cookie', name: 'custom-operator.session' },
        operatorApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Operator API key' },
      },
      openApiCsrfHeader: { name: 'X-Custom-CSRF' },
    });

    expect(console.openApi.components.securitySchemes).toEqual({
      operatorSession: { type: 'apiKey', in: 'cookie', name: 'custom-operator.session' },
      operatorApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Operator API key' },
    });
    const generic = console.openApi.paths['/api/admin/v1/operations/{operationId}']?.post as { parameters: Array<{ name: string }> };
    expect(generic.parameters.map(({ name }) => name)).toContain('X-Custom-CSRF');
    expect(generic.parameters.map(({ name }) => name)).not.toContain('X-Operator-CSRF');
    const protectedMutations = [
      console.openApi.paths['/api/admin/v1/mcp/transport']?.post,
      console.openApi.paths['/api/admin/v1/mcp/transport']?.delete,
      console.openApi.paths['/api/admin/v1/confirmations']?.post,
      console.openApi.paths['/api/admin/v1/settings/policies/{policyId}']?.patch,
      console.openApi.paths['/api/admin/v1/auth/sign-out']?.post,
    ] as Array<{ parameters?: Array<{ name: string }> } | undefined>;
    for (const operation of protectedMutations) {
      expect(operation?.parameters?.map(({ name }) => name)).toContain('X-Custom-CSRF');
    }
    expect((console.openApi.paths['/api/admin/v1/auth/sign-in']?.post as { parameters?: unknown[] }).parameters).toBeUndefined();
    expect(() => createSuperConsole({
      adapters: [],
      enabledModules: [],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      openApiSecuritySchemes: { operatorSession: { type: 'apiKey' } } as never,
    })).toThrow(/operatorSession and operatorApiKey/);
  });

  it('extracts all scope levels and routes a generic module call through the dispatcher', async () => {
    const { console, handler } = installation();
    const result = await console.handle(request('/api/admin/v1/modules/examplefn/records?limit=20&organizationId=org_2&workspaceId=workspace_2&projectId=project_2&environmentId=environment_2'));
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      input: { limit: 20 },
      context: expect.objectContaining({ scope: expect.objectContaining({ installationId: 'org_2', workspaceId: 'workspace_2', projectId: 'project_2', environmentId: 'environment_2' }) }),
    }));
  });

  it('does not restore default namespace or region after switching the scope hierarchy', async () => {
    const { console, handler } = installation();
    const switched = await console.handle(request('/api/admin/v1/modules/examplefn/records?organizationId=org_2&workspaceId=workspace_2&projectId=project_2&environmentId=environment_2'));
    expect(switched.status).toBe(200);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        scope: {
          installationId: 'org_2',
          workspaceId: 'workspace_2',
          projectId: 'project_2',
          environmentId: 'environment_2',
        },
      }),
    }));

    const unchanged = await console.handle(request('/api/admin/v1/modules/examplefn/records'));
    expect(unchanged.status).toBe(200);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        scope: {
          installationId: 'org_1',
          workspaceId: 'workspace_1',
          projectId: 'project_1',
          environmentId: 'environment_1',
          namespace: 'tenant_1',
          region: 'in-south',
        },
      }),
    }));
  });

  it('rejects malformed generic-operation JSON without dispatching the operation', async () => {
    const { console, handler } = installation();
    const result = await console.handle(request('/api/admin/v1/operations/examplefn.records.list', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{broken',
    }));

    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('projects the actively authorized scope instead of stale singleton context labels', async () => {
    const switchedPrincipal: SuperConsolePrincipal = {
      ...principal,
      contextOptions: {
        organization: { id: 'org_1', name: 'Primary org' },
        organizations: [{ id: 'org_1', name: 'Primary org' }, { id: 'org_2', name: 'Switched org' }],
        workspace: { id: 'workspace_1', name: 'Primary workspace' },
        workspaces: [{ id: 'workspace_2', name: 'Switched workspace' }],
      },
    };
    const capability = manifest();
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, { 'examplefn.records.list': async () => ({ ok: true as const, data: { items: [] } }) })],
      enabledModules: ['examplefn'],
      auth: auth({ authenticate: async () => switchedPrincipal }),
      shellPolicy: { authorize: () => true },
    });
    const registry = await (await console.handle(request('/api/admin/v1/registry?organizationId=org_2&workspaceId=workspace_2'))).json();
    expect(registry.data.context.organization).toEqual({ id: 'org_2', name: 'Switched org' });
    expect(registry.data.context.workspace).toEqual({ id: 'workspace_2', name: 'Switched workspace' });
    expect(registry.data.context.project).toBeUndefined();
    expect(registry.data.context.environment).toBeUndefined();
  });

  it('supports installation-scoped operations without fabricating descendant scope IDs', async () => {
    const base = manifest().operations[0]!;
    const installationManifest = defineAdminCapability({
      ...manifest(),
      scopeLevels: ['installation', 'workspace', 'project', 'environment'],
      operations: [{ ...base, minimumScope: 'installation' }],
    });
    const installationPrincipal: SuperConsolePrincipal = {
      ...principal,
      defaultScope: { installationId: 'installation_1' },
    };
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(installationManifest, { 'examplefn.records.list': handler })],
      enabledModules: ['examplefn'],
      auth: auth({ authenticate: async () => installationPrincipal }),
      shellPolicy: { authorize: () => true },
    });

    const registry = await (await console.handle(request('/api/admin/v1/registry'))).json();
    expect(registry.data.enabledModules).toHaveLength(1);
    expect(registry.data.context).toMatchObject({ installation: { id: 'installation_1' } });
    expect(registry.data.context.workspace).toBeUndefined();
    expect((await console.handle(request('/api/admin/v1/modules/examplefn/records'))).status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ scope: { installationId: 'installation_1' } }),
    }));
  });

  it.each([
    '/api/admin/v1/modules/examplefn//records',
    '/api/admin/v1/modules/examplefn/%252e%252e/records',
    '/api/admin/v1/modules/examplefn/records%252fother',
    '/api/admin/v1/modules/examplefn/resources/records/team%2Fsupport%252Fother',
    '/api/admin/v1/modules/examplefn/records%5cother',
    '/api/admin/v1/modules/examplefn/records%255cother',
  ])('rejects ambiguous administration path %s', async (path) => {
    const { console } = installation();
    const result = await console.handle(request(path));
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ error: { code: 'INVALID_ADMIN_PATH' } });
  });

  it('preserves an encoded separator inside a route parameter value', async () => {
    const { console, handler } = installation({ destructive: true });
    const result = await console.handle(request('/api/admin/v1/modules/examplefn/resources/records/team%2Fsupport', {
      method: 'DELETE',
      headers: { 'idempotency-key': 'encoded-id', 'x-admin-confirmation': 'bound-token' },
    }));
    expect(result.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ input: { id: 'team/support' } }));
  });

  it('does not route an encoded separator embedded in a literal segment', async () => {
    const { console, handler } = installation();
    const result = await console.handle(request('/api/admin/v1/modules/examplefn/records%2fother'));
    expect(result.status).toBe(404);
    expect(await result.json()).toMatchObject({ error: { code: 'OPERATION_NOT_ENABLED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not claim the URL parser preserved a single-encoded dot segment', async () => {
    const { console } = installation();
    const result = await console.handle(request('/api/admin/v1/modules/examplefn/%2e%2e/records'));
    expect(result.status).toBe(404);
  });

  it('exposes only safely bound target actions and collection action schemas', async () => {
    const targeted = installation({ destructive: true }).console;
    const targetedView = await (await targeted.handle(request('/api/admin/v1/modules/examplefn'))).json();
    expect(targetedView.data.module.actions[0]).toMatchObject({
      id: 'examplefn.records.delete',
      collection: false,
      inputSchema: { required: ['id'] },
    });
    expect(targetedView.data.module.actions[0]).not.toHaveProperty('targetIdInput');
    expect(targetedView.data.module.resources[0].actions[0]).toMatchObject({
      id: 'examplefn.records.delete',
      targetIdInput: 'id',
      collection: false,
      inputSchema: { required: ['id'] },
    });

    const base = manifest().operations[0]!;
    const collectionManifest = defineAdminCapability({
      ...manifest(),
      operations: [{
        ...base,
        id: 'examplefn.records.create',
        title: 'Create record',
        inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1 } }, required: ['name'], additionalProperties: false },
        outputSchema: { type: 'object', properties: { accepted: { type: 'boolean' } }, required: ['accepted'], additionalProperties: false },
        route: { method: 'POST', path: '/resources/records' },
        permission: 'examplefn.records.create',
        safety: { classification: 'write', idempotent: true, audit: 'required' },
        target: { resource: 'records', collection: true },
        mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      }],
    });
    const collection = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(collectionManifest, { 'examplefn.records.create': async () => ({ ok: true as const, data: { accepted: true } }) })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
    });
    const collectionView = await (await collection.handle(request('/api/admin/v1/modules/examplefn'))).json();
    expect(collectionView.data.module.resources[0].actions).toEqual([]);
    expect(collectionView.data.module.actions[0]).toMatchObject({
      id: 'examplefn.records.create',
      collection: true,
      inputSchema: { required: ['name'] },
    });

    const list = manifest().operations[0]!;
    const get = {
      ...list,
      id: 'examplefn.records.get',
      title: 'Get record',
      inputSchema: { type: 'object' as const, properties: { id: { type: 'string' as const } }, required: ['id'], additionalProperties: false },
      outputSchema: { type: 'object' as const, properties: { item: { type: 'object' as const } }, required: ['item'], additionalProperties: false },
      route: { method: 'GET' as const, path: '/resources/records/:id' },
      target: { resource: 'records', idInput: 'id' },
    };
    const download = {
      ...get,
      id: 'examplefn.records.download',
      title: 'Download record',
      route: { method: 'GET' as const, path: '/resources/records/:id/download' },
    };
    const readActionManifest = defineAdminCapability({
      ...manifest(),
      operations: [list, get, download],
    });
    const readActionConsole = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(readActionManifest, {
        [list.id]: async () => ({ ok: true as const, data: { items: [] } }),
        [get.id]: async () => ({ ok: true as const, data: { item: {} } }),
        [download.id]: async () => ({ ok: true as const, data: { item: {} } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
    });
    const readActionView = await (await readActionConsole.handle(request('/api/admin/v1/modules/examplefn'))).json();
    expect(readActionView.data.module.resources[0].actions).toEqual([
      expect.objectContaining({ id: 'examplefn.records.download', targetIdInput: 'id' }),
    ]);
  });

  it('models get-only resources with a detail URL and no collection endpoint', async () => {
    const base = manifest().operations[0]!;
    const getOnly = defineAdminCapability({
      ...manifest(),
      resources: [{
        id: 'records', label: 'Records', description: 'Get one record by ID.', risk: 'standard',
        minimumScope: 'environment', idField: 'id', displayFields: ['id'], searchableFields: ['id'],
        filterableFields: [], sortableFields: [], sensitiveFields: [],
      }],
      operations: [{
        ...base,
        id: 'examplefn.records.get',
        title: 'Get record',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
        outputSchema: { type: 'object', properties: { item: { type: 'object' } }, required: ['item'], additionalProperties: false },
        route: { method: 'GET', path: '/resources/records/:id' },
        permission: 'examplefn.records.read',
        target: { resource: 'records', idInput: 'id' },
      }],
    });
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(getOnly, {
        'examplefn.records.get': async () => ({ ok: true as const, data: { item: { id: 'record_1' } } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
    });

    const view = await (await console.handle(request('/api/admin/v1/modules/examplefn'))).json();
    expect(view.data.module.resources[0]).toMatchObject({
      id: 'records',
      idField: 'id',
      listable: false,
      detailIdInput: 'id',
      detailApiHref: '/api/admin/v1/modules/examplefn/resources/records/:id',
      detailInputSchema: expect.objectContaining({ required: ['id'] }),
    });
    expect(view.data.module.resources[0]).not.toHaveProperty('apiHref');
    expect(view.data.module.resources[0]).not.toHaveProperty('listApiHref');
  });

  it('maps the settings policy alias into the function-owned generic action schema', async () => {
    const base = manifest().operations[0]!;
    const policyManifest = defineAdminCapability({
      ...manifest(),
      operations: [{
        ...base,
        id: 'examplefn.policies.update',
        title: 'Update policy',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, payload: { type: 'object', additionalProperties: true }, reason: { type: 'string' } },
          required: ['id', 'payload'],
          additionalProperties: false,
        },
        outputSchema: { type: 'object', properties: { accepted: { type: 'boolean' } }, required: ['accepted'], additionalProperties: false },
        route: { method: 'PATCH', path: '/resources/policies/:id' },
        permission: 'examplefn.policies.update',
        safety: { classification: 'write', idempotent: true, audit: 'required' },
        target: { resource: 'policies', idInput: 'id' },
        mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      }],
    });
    const update = vi.fn(async () => ({ ok: true as const, data: { accepted: true } }));
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(policyManifest, { 'examplefn.policies.update': update })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
      settings: { read: async () => ({}), updatePolicyOperationId: 'examplefn.policies.update' },
    });
    const result = await console.handle(request('/api/admin/v1/settings/policies/policy%2F1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'policy-idem' },
      body: JSON.stringify({ enabled: true }),
    }));
    expect(result.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ input: { id: 'policy/1', payload: { enabled: true } } }));
  });

  it('uses manifest presentation metadata for non-conventional generic operations', async () => {
    const base = manifest().operations[0]!;
    const recordSchema = {
      type: 'object' as const,
      properties: { recordId: { type: 'string' }, name: { type: 'string' }, state: { type: 'string' }, createdAt: { type: 'string' } },
      required: ['recordId', 'name', 'state', 'createdAt'],
      additionalProperties: false,
    };
    const presentedManifest = defineAdminCapability({
      ...manifest(),
      resources: [{
        id: 'records', label: 'Records', description: 'Presented records.', risk: 'standard', idField: 'recordId',
        sortableFields: ['createdAt'],
        presentation: {
          listOperationId: 'examplefn.enumerate',
          detailOperationId: 'examplefn.inspect',
          titleField: 'name',
          statusField: 'state',
          columns: [{ field: 'recordId', label: 'Record', format: 'code' }, { field: 'state', label: 'State', format: 'status' }],
          defaultSort: { field: 'createdAt', direction: 'desc' },
        },
      }],
      operations: [
        {
          ...base,
          id: 'examplefn.enumerate',
          outputSchema: { type: 'object', properties: { items: { type: 'array', items: recordSchema } }, required: ['items'], additionalProperties: false },
          route: { method: 'GET', path: '/resources/records' },
          target: { resource: 'records', collection: true },
        },
        {
          ...base,
          id: 'examplefn.inspect',
          inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
          outputSchema: { type: 'object', properties: { item: recordSchema }, required: ['item'], additionalProperties: false },
          route: { method: 'GET', path: '/resources/records/:id' },
          target: { resource: 'records', idInput: 'id' },
        },
      ],
    });
    const adapter = createAdminCapabilityAdapter(presentedManifest, Object.fromEntries(presentedManifest.operations.map((operation) => [
      operation.id,
      async () => ({ ok: true as const, data: { items: [] } }),
    ])));
    expect(validateAdminCapabilityManifest(presentedManifest)).toEqual([]);
    const console = createSuperConsole({ adapters: [adapter], enabledModules: ['examplefn'], auth: auth(), shellPolicy: { authorize: () => true } });
    const view = await (await console.handle(request('/api/admin/v1/modules/examplefn'))).json();
    expect(view.data.module.resources[0]).toMatchObject({
      listApiHref: '/api/admin/v1/modules/examplefn/resources/records',
      detailApiHref: '/api/admin/v1/modules/examplefn/resources/records/:id',
      presentation: expect.objectContaining({ titleField: 'name', statusField: 'state' }),
    });
  });

  it('projects context-bound resources without exposing them as standalone collection cards', async () => {
    const base = manifest().operations[0]!;
    const contextual = defineAdminCapability({
      ...manifest(),
      resources: [
        { id: 'parents', label: 'Parents', description: 'Parent records.', risk: 'standard', idField: 'id' },
        {
          id: 'records',
          label: 'Records',
          description: 'Records that require parent context.',
          risk: 'standard',
          idField: 'id',
          filterableFields: ['parentId'],
          presentation: {
            standaloneList: false,
            listOperationId: base.id,
            query: { filters: [{ field: 'parentId', inputPath: 'filter.parentId' }] },
            parent: { resourceId: 'parents', bindings: [{ sourceField: 'id', queryField: 'parentId' }] },
          },
        },
      ],
      operations: [{
        ...base,
        inputSchema: {
          type: 'object',
          properties: { filter: { type: 'object', properties: { parentId: { type: 'string' } }, required: ['parentId'], additionalProperties: false } },
          required: ['filter'],
          additionalProperties: false,
        },
      }],
    });
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(contextual, { [base.id]: async () => ({ ok: true as const, data: { items: [] } }) })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
    });
    const view = await (await console.handle(request('/api/admin/v1/modules/examplefn'))).json();
    expect(view.data.module.resources[0]).toMatchObject({ listable: true, standaloneList: false });
    expect(view.data.module.resources[0].listApiHref).toBe('/api/admin/v1/modules/examplefn/resources/records');
  });

  it('folds enabled nested resources into their owner while preserving child routes and identity', async () => {
    const ownerManifest = defineAdminCapability({
      ...manifest(),
      id: 'watchfn',
      displayName: 'WatchFn',
      navigation: [{ id: 'watchfn', label: 'WatchFn', path: '/modules/watchfn' }],
      operations: [{ ...manifest().operations[0]!, id: 'watchfn.monitors.list', permission: 'watchfn.monitors.read', target: { resource: 'monitors', collection: true } }],
    });
    const childManifest = defineAdminCapability({
      ...manifest(),
      id: 'catchfn',
      displayName: 'CatchFn',
      availability: 'nested' as const,
      owner: { moduleId: 'watchfn', mountPath: '/modules/watchfn/catchfn' },
      dependencies: ['watchfn'],
      navigation: [{ id: 'catchfn', label: 'CatchFn', path: '/modules/watchfn/catchfn', parentId: 'watchfn' }],
      operations: [{ ...manifest().operations[0]!, id: 'catchfn.errors.list', permission: 'catchfn.errors.read', target: { resource: 'errors', collection: true } }],
    });
    const ownerAdapter = createAdminCapabilityAdapter(ownerManifest, { 'watchfn.monitors.list': async () => ({ ok: true as const, data: { items: [] } }) });
    const childAdapter = createAdminCapabilityAdapter(childManifest, { 'catchfn.errors.list': async () => ({ ok: true as const, data: { items: [] } }) });
    const compose = (withChild: boolean) => createSuperConsole({
      adapters: withChild ? [ownerAdapter, childAdapter] : [ownerAdapter],
      enabledModules: withChild ? ['watchfn', 'catchfn'] : ['watchfn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
    });
    const folded = await (await compose(true).handle(request('/api/admin/v1/modules/watchfn'))).json();
    const registry = await (await compose(true).handle(request('/api/admin/v1/registry'))).json();
    expect(registry.data.enabledModules.map((module: { id: string }) => module.id)).toEqual(['watchfn', 'catchfn']);
    expect(registry.data.modules.map((module: { id: string }) => module.id)).toEqual(['watchfn']);
    expect(folded.data.module.foldedModuleIds).toEqual(['catchfn']);
    expect(folded.data.module.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'monitors', sourceModuleId: 'watchfn' }),
      expect.objectContaining({ id: 'catchfn:errors', resourceId: 'errors', sourceModuleId: 'catchfn', foldedIntoModuleId: 'watchfn', href: '/modules/watchfn/catchfn%3Aerrors', apiHref: expect.stringContaining('/modules/catchfn/') }),
    ]));
    const ownerOnly = await (await compose(false).handle(request('/api/admin/v1/modules/watchfn'))).json();
    expect(ownerOnly.data.module.foldedModuleIds).toEqual([]);
    expect(JSON.stringify(ownerOnly.data.module)).not.toContain('catchfn:errors');
  });

  it('fails startup when enabled mutations lack required infrastructure while shell-only installs work', () => {
    const capability = manifest({ destructive: true });
    const adapter = createAdminCapabilityAdapter(capability, { [capability.operations[0]!.id]: async () => ({ ok: true as const, data: { accepted: true } }) });
    expect(() => createSuperConsole({ adapters: [adapter], enabledModules: ['examplefn'], auth: auth(), shellPolicy: { authorize: () => true } })).toThrow(/audit sink/);
    expect(() => createSuperConsole({ adapters: [adapter], enabledModules: ['examplefn'], auth: auth(), shellPolicy: { authorize: () => true }, audit: new MemoryAdminAuditSink() })).toThrow(/idempotency store/);
    expect(() => createSuperConsole({ adapters: [adapter], enabledModules: ['examplefn'], auth: auth(), shellPolicy: { authorize: () => true }, audit: new MemoryAdminAuditSink(), idempotency: new MemoryAdminIdempotencyStore() })).toThrow(/staged confirmation/);
    expect(() => createSuperConsole({
      adapters: [adapter],
      enabledModules: ['examplefn'],
      auth: { ...auth(), authorizeMutation: undefined },
      shellPolicy: { authorize: () => true },
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: { issue: async () => ({ token: 'bound', expiresAt: new Date(Date.now() + 60_000).toISOString() }), prepareActivation: async () => undefined, cancelActivation: async () => undefined, activate: async () => undefined, revoke: async () => undefined, verify: async () => true },
    })).toThrow(/mutation authorization/);
    expect(() => createSuperConsole({ adapters: [], enabledModules: [], auth: auth(), shellPolicy: { authorize: () => true } })).not.toThrow();
    expect(() => createSuperConsole({ adapters: [], enabledModules: [], auth: auth() } as never)).toThrow(/shell authorization policy/);
  });

  it('issues input-bound confirmation only after input/permission/policy checks and verifies it on dispatch', async () => {
    const { console, confirmation, handler, audit } = installation({ destructive: true, permissions: ['examplefn.records.delete'] });
    const invalid = await console.handle(request('/api/admin/v1/confirmations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationId: 'examplefn.records.delete', input: {} }) }));
    expect(invalid.status).toBe(400);
    const issued = await console.handle(request('/api/admin/v1/confirmations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operationId: 'examplefn.records.delete', input: { id: 'record_1' } }) }));
    expect(issued.status).toBe(201);
    expect(await issued.json()).toMatchObject({ ok: true as const, data: { token: 'bound-token', expiresAt: expect.any(String) } });
    expect(confirmation.issue).toHaveBeenCalledWith(expect.objectContaining({
      operationId: 'examplefn.records.delete',
      input: { id: 'record_1' },
      context: expect.objectContaining({ scope: expect.objectContaining({ installationId: 'org_1' }) }),
    }));
    const successAuditId = audit.events.find((event) => event.operationId === 'superconsole.confirmations.issue' && event.outcome === 'succeeded')?.id;
    expect(successAuditId).toEqual(expect.any(String));
    expect(confirmation.prepareActivation).toHaveBeenCalledWith(expect.objectContaining({ token: 'bound-token', auditId: successAuditId }));
    expect(confirmation.activate).toHaveBeenCalledWith(expect.objectContaining({ token: 'bound-token', auditId: successAuditId }));
    expect(confirmation.revoke).not.toHaveBeenCalled();
    const executed = await console.handle(request('/api/admin/v1/modules/examplefn/records/record_1', {
      method: 'DELETE',
      headers: { 'idempotency-key': 'idem_1', 'x-admin-confirmation': 'bound-token' },
    }));
    expect(executed.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(confirmation.verify).toHaveBeenCalled();
  });

  it('never activates a staged confirmation when its terminal audit fails', async () => {
    const capability = manifest({ destructive: true });
    const issue = vi.fn(async () => ({ token: 'staged-token', expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    let active = false;
    const activate = vi.fn(async () => { active = true; });
    const revoke = vi.fn(async () => { throw new Error('revocation unavailable'); });
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, {
        'examplefn.records.delete': async () => ({ ok: true as const, data: { accepted: true } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      audit: {
        idempotentById: true,
        write: async (event) => {
          if (event.operationId === 'superconsole.confirmations.issue' && event.outcome === 'succeeded') {
            throw new Error('terminal confirmation audit unavailable');
          }
        },
      },
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: { issue, prepareActivation: async () => undefined, cancelActivation: async () => undefined, activate, revoke, verify: async () => active },
    });

    const response = await console.handle(request('/api/admin/v1/confirmations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: 'examplefn.records.delete', input: { id: 'record_1' } }),
    }));

    expect(response.status).toBe(503);
    expect(issue).toHaveBeenCalledTimes(1);
    expect(activate).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ token: 'staged-token' }));
    expect(active).toBe(false);
  });

  it('records activation failure as denied and leaves the staged token unusable', async () => {
    const capability = manifest({ destructive: true });
    const outcomes: Array<{ outcome: string; errorCode?: string }> = [];
    let active = false;
    let cancelled = false;
    const cancelActivation = vi.fn(async () => { cancelled = true; });
    const revoke = vi.fn(async () => { throw new Error('revocation unavailable'); });
    const verify = vi.fn(async () => active && !cancelled);
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, {
        'examplefn.records.delete': async () => ({ ok: true as const, data: { accepted: true } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      audit: {
        idempotentById: true,
        write: async (event) => {
          if (event.operationId === 'superconsole.confirmations.issue') {
            outcomes.push({ outcome: event.outcome, errorCode: event.errorCode });
          }
        },
      },
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: {
        issue: async () => ({ token: 'staged-token', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
        prepareActivation: async () => undefined,
        cancelActivation,
        activate: async () => { active = true; throw new Error('activation unavailable'); },
        revoke,
        verify,
      },
    });

    const response = await console.handle(request('/api/admin/v1/confirmations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: 'examplefn.records.delete', input: { id: 'record_1' } }),
    }));

    expect(response.status).toBe(503);
    expect(await verify()).toBe(false);
    expect(cancelActivation).toHaveBeenCalledWith(expect.objectContaining({
      token: 'staged-token',
      auditId: expect.any(String),
      denialAuditId: expect.any(String),
    }));
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ token: 'staged-token' }));
    expect(outcomes).toEqual([
      { outcome: 'attempted', errorCode: undefined },
      { outcome: 'succeeded', errorCode: undefined },
      { outcome: 'denied', errorCode: 'CONFIRMATION_ACTIVATION_FAILED' },
    ]);
  });

  it('returns audit unavailable when activation preparation and its denial audit both fail', async () => {
    const capability = manifest({ destructive: true });
    const activate = vi.fn(async () => undefined);
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, {
        'examplefn.records.delete': async () => ({ ok: true as const, data: { accepted: true } }),
      })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      audit: {
        idempotentById: true,
        write: async (event) => {
          if (event.operationId === 'superconsole.confirmations.issue' && event.outcome === 'denied') {
            throw new Error('denial audit unavailable');
          }
        },
      },
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: {
        issue: async () => ({ token: 'staged-token', expiresAt: new Date(Date.now() + 60_000).toISOString() }),
        prepareActivation: async () => { throw new Error('activation preparation unavailable'); },
        cancelActivation: async () => undefined,
        activate,
        revoke: async () => undefined,
        verify: async () => false,
      },
    });

    const response = await console.handle(request('/api/admin/v1/confirmations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: 'examplefn.records.delete', input: { id: 'record_1' } }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'AUDIT_UNAVAILABLE' } });
    expect(activate).not.toHaveBeenCalled();
  });

  it('returns 405/OPTIONS/HEAD semantics instead of route ambiguity', async () => {
    const { console, handler } = installation();
    expect((await console.handle(request('/api/admin/v1/registry', { method: 'POST' }))).status).toBe(405);
    const options = await console.handle(request('/api/admin/v1/registry', { method: 'OPTIONS' }));
    expect(options.status).toBe(204);
    expect(options.headers.get('allow')).toContain('GET');
    const head = await console.handle(request('/api/admin/v1/registry', { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const resourceHead = await console.handle(request('/api/admin/v1/modules/examplefn/records?limit=7', { method: 'HEAD' }));
    expect(resourceHead.status).toBe(200);
    expect(await resourceHead.text()).toBe('');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ input: { limit: 7 } }));
  });

  it('authorization-gates OpenAPI capability enumeration', async () => {
    const capability = manifest();
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, { 'examplefn.records.list': async () => ({ ok: true as const, data: { items: [] } }) })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: ({ surface }) => surface !== 'api' },
    });
    const result = await console.handle(request('/api/admin/v1/openapi.json'));
    expect(result.status).toBe(403);
    expect(JSON.stringify(await result.json())).not.toContain('examplefn.records.list');
  });

  it('projects only internal console hrefs from provider-neutral overview and search services', async () => {
    const searchManifest = manifest();
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(searchManifest, { 'examplefn.records.list': async () => ({ ok: true as const, data: { items: [] } }) })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      overview: { read: async () => ({ alerts: [{ id: 'safe', href: '/modules/examplefn/records' }, { id: 'external', href: 'https://evil.example/' }, { id: 'script', href: 'javascript:alert(1)' }] }) },
      search: {
        permission: 'examplefn.records.read',
        search: async () => ({
          results: [
            { id: 'safe', title: 'Safe', moduleId: 'examplefn', href: '/modules/examplefn/records?focus=safe' },
            { id: 'external', title: 'External', moduleId: 'examplefn', href: '//evil.example/' },
          ],
        }),
      },
    });
    const overview = await (await console.handle(request('/api/admin/v1/overview'))).json();
    expect(overview.data.alerts).toEqual([
      { id: 'safe', href: '/modules/examplefn/records' },
      { id: 'external' },
      { id: 'script' },
    ]);
    const search = await (await console.handle(request('/api/admin/v1/search?q=safe'))).json();
    expect(search.data.results).toEqual([
      expect.objectContaining({ id: 'safe', href: '/modules/examplefn/records?focus=safe' }),
    ]);
  });

  it('serves authenticated McpFn list/call and issues protocol-native bound confirmations', async () => {
    const { console, confirmation, handler, audit } = installation({ destructive: true });
    const post = (body: unknown) => console.handle(request('/api/admin/v1/mcp/transport', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    const initialized = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'superconsole-test', version: '1.0.0' } },
    });
    expect(initialized.status).toBe(200);
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const listed = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listBody = await listed.json();
    expect(listBody.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'superconsole_confirm_operation',
      'superconsole_examplefn_records_delete',
    ]);
    expect(JSON.stringify(listBody)).not.toContain('disabledfn');

    const confirmed = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'superconsole_confirm_operation',
        arguments: { operationId: 'examplefn.records.delete', input: { id: 'record_1' } },
      },
    });
    expect(await confirmed.json()).toMatchObject({ result: { structuredContent: { token: 'bound-token' } } });
    expect(confirmation.issue).toHaveBeenLastCalledWith(expect.objectContaining({
      context: expect.objectContaining({ source: 'mcp', scope: expect.objectContaining({ installationId: 'org_1' }) }),
    }));
    expect(audit.events).toContainEqual(expect.objectContaining({
      operationId: 'superconsole.confirmations.issue',
      outcome: 'succeeded',
      target: { resource: 'records', idInput: 'id', id: 'record_1' },
      input: {
        operationId: 'examplefn.records.delete',
        target: { resource: 'records', idInput: 'id', targetId: 'record_1' },
        input: { id: 'record_1' },
      },
      metadata: { tokenRecorded: false, inputRecorded: true, targetRecorded: true },
    }));

    const invoked = await post({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'superconsole_examplefn_records_delete',
        arguments: { id: 'record_1', _admin: { idempotencyKey: 'mcp-idem-1', confirmationToken: 'bound-token' } },
      },
    });
    expect(await invoked.json()).toMatchObject({
      result: { structuredContent: { ok: true, data: { accepted: true }, requestId: expect.any(String), auditId: expect.any(String) } },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('answers unauthenticated MCP preflight before session resolution', async () => {
    const capability = manifest();
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, { 'examplefn.records.list': async () => ({ ok: true as const, data: { items: [] } }) })],
      enabledModules: ['examplefn'],
      auth: auth({ authenticate: async () => null }),
      shellPolicy: { authorize: () => true },
    });
    const result = await console.handle(request('/api/admin/v1/mcp/transport', { method: 'OPTIONS' }));
    expect(result.status).toBe(204);
    expect(result.headers.get('allow')).toBe('GET, POST, DELETE, OPTIONS');
  });

  it('denies MCP discovery through shell policy without leaking tool names', async () => {
    const capability = manifest();
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, { 'examplefn.records.list': async () => ({ ok: true as const, data: { items: [] } }) })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: ({ surface }) => surface !== 'mcp' },
    });
    const result = await console.handle(request('/api/admin/v1/mcp/transport', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    expect(result.status).toBe(403);
    expect(await result.text()).not.toContain('examplefn.records.list');
  });

  it('permission-filters MCP metadata, discovery, confirmation, and direct probes per actor', async () => {
    const { console } = installation({ destructive: true, permissions: [] });
    const metadata = await (await console.handle(request('/api/admin/v1/mcp'))).json();
    expect(metadata.data).toMatchObject({ enabled: false, tools: [] });

    const post = (body: unknown) => console.handle(request('/api/admin/v1/mcp/transport', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'limited', version: '1.0.0' } } });
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const listed = await (await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
    expect(listed.result.tools).toEqual([]);
    const hidden = await (await post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'superconsole_examplefn_records_delete', arguments: {} } })).json();
    const missing = await (await post({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'unknown_tool', arguments: {} } })).json();
    expect(hidden.error.code).toBe(-32601);
    expect(missing.error.code).toBe(-32601);
    expect(JSON.stringify(listed)).not.toContain('superconsole_confirm_operation');
  });

  it('applies contextual policy to registry, MCP and confirmation discovery while retaining input policy at dispatch', async () => {
    const capability = manifest({ destructive: true });
    const handler = vi.fn(async () => ({ ok: true as const, data: { accepted: true } }));
    const infrastructure = {
      adapters: [createAdminCapabilityAdapter(capability, { 'examplefn.records.delete': handler })],
      enabledModules: ['examplefn'],
      auth: auth(),
      shellPolicy: { authorize: () => true },
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: {
        issue: async () => ({ token: 'bound', expiresAt: '2026-08-13T10:00:00.000Z' }),
        prepareActivation: async () => undefined,
        cancelActivation: async () => undefined,
        activate: async () => undefined,
        revoke: async () => undefined,
        verify: async () => true,
      },
    };
    const scopePolicy = {
      discover: ({ context }: { context: AdminOperationContext }) => ({ allowed: context.scope.environmentId === 'environment_allowed' }),
      authorize: () => ({ allowed: true }),
    };
    const scoped = createSuperConsole({ ...infrastructure, policy: scopePolicy });
    const hiddenRegistry = await (await scoped.handle(request('/api/admin/v1/registry'))).json();
    expect(hiddenRegistry.data.enabledModules).toEqual([]);
    expect(hiddenRegistry.data.modules).toEqual([]);
    expect((await (await scoped.handle(request('/api/admin/v1/mcp'))).json()).data.tools).toEqual([]);
    expect((await scoped.handle(request('/api/admin/v1/confirmations', {
      method: 'POST',
      body: JSON.stringify({ operationId: 'examplefn.records.delete', input: { id: 'record_1' } }),
    }))).status).toBe(404);
    expect((await scoped.handle(request('/api/admin/v1/modules/examplefn/records/record_1', {
      method: 'DELETE',
      headers: { 'idempotency-key': 'hidden', 'x-admin-confirmation': 'bound' },
    }))).status).toBe(404);
    const visibleRegistry = await (await scoped.handle(request('/api/admin/v1/registry?environmentId=environment_allowed'))).json();
    expect(visibleRegistry.data.enabledModules).toHaveLength(1);

    const inputPolicy = {
      discover: () => ({ allowed: true }),
      authorize: ({ input }: { input: unknown }) => ({
        allowed: Boolean(input && typeof input === 'object' && (input as { id?: unknown }).id === 'record_allowed'),
      }),
    };
    const objectBound = createSuperConsole({ ...infrastructure, policy: inputPolicy });
    expect((await (await objectBound.handle(request('/api/admin/v1/registry'))).json()).data.enabledModules).toHaveLength(1);
    expect((await objectBound.handle(request('/api/admin/v1/confirmations', {
      method: 'POST',
      body: JSON.stringify({ operationId: 'examplefn.records.delete', input: { id: 'record_denied' } }),
    }))).status).toBe(403);
    expect((await objectBound.handle(request('/api/admin/v1/modules/examplefn/records/record_denied', {
      method: 'DELETE',
      headers: { 'idempotency-key': 'object-denied', 'x-admin-confirmation': 'bound' },
    }))).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('AuthFn operator transport', () => {
  const encryptionKey = Buffer.alloc(32, 9);
  const decodeBase32 = (secret: string) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let buffer = 0;
    let bits = 0;
    const bytes: number[] = [];
    for (const char of secret.replace(/=+$/g, '').toUpperCase()) {
      const index = alphabet.indexOf(char);
      if (index < 0) continue;
      buffer = (buffer << 5) | index;
      bits += 5;
      if (bits >= 8) { bytes.push((buffer >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return Buffer.from(bytes);
  };
  const totp = (secret: string, now = Date.now()) => {
    const counter = Math.floor(now / 1000 / 30);
    const payload = Buffer.alloc(8);
    payload.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    payload.writeUInt32BE(counter >>> 0, 4);
    const digest = createHmac('sha1', decodeBase32(secret)).update(payload).digest();
    const offset = digest.at(-1)! & 0x0f;
    const binary = ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  };

  it('preserves separate AuthFn session/CSRF cookies and never bypasses a pending 2FA challenge', async () => {
    let twoFactorNow = Date.now();
    const twoFactorOptions = { encryptionKeyResolver: () => encryptionKey, now: () => new Date(twoFactorNow) };
    const config = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn-console-test',
      cookie: { secure: false },
      plugins: [authFnPasswordPlugin(), authFnTwoFactorPlugin()],
      pluginRuntime: { twoFactor: twoFactorOptions },
    };
    const bootstrap = createAuthFn(config);
    const signUp = await bootstrap.router.handle(request('/auth/sign-up/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'operator@example.test', password: 'Sup3rConsolePassword!' }),
    }));
    const signed = await signUp.json();
    const enrolledUser = { id: signed.data.session.actorId, primaryEmail: signed.data.session.primaryEmail };
    const enrollment = await createTwoFactorEnrollment(config, enrolledUser, twoFactorOptions);
    await confirmTwoFactorEnrollment(config, signed.data.session.actorId, totp(enrollment.secret, twoFactorNow), twoFactorOptions);

    const operatorAuth = createAuthFnOperatorAuth({
      config,
      resolveOperator: ({ session }) => ({ ...principal, actor: { ...principal.actor, id: session.actorId }, email: session.primaryEmail }),
      authorizeScope: ({ requested }) => requested,
    });
    const console = createSuperConsole({ adapters: [], enabledModules: [], auth: operatorAuth, shellPolicy: { authorize: () => true } });
    const signIn = await console.handle(request('/api/admin/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'operator@example.test', password: 'Sup3rConsolePassword!' }),
    }));
    expect(signIn.status).toBe(401);
    const challenge = await signIn.json();
    expect(challenge.error.code).toBe('OPERATOR_2FA_REQUIRED');
    expect(signIn.headers.getSetCookie()).toHaveLength(0);

    twoFactorNow += 30_000;
    const completed = await console.handle(request('/api/admin/v1/auth/2fa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.error.details.challengeId, code: totp(enrollment.secret, twoFactorNow) }),
    }));
    expect(completed.status).toBe(200);
    expect(completed.headers.getSetCookie()).toHaveLength(2);
    expect((await completed.json()).data.session.email).toBe('operator@example.test');
  });

  it('returns two separate cookies for successful AuthFn password sign-in', async () => {
    const config = { database: memoryAdapter({ debug: false }), namespace: 'authfn-console-cookies', cookie: { secure: false }, plugins: [authFnPasswordPlugin()] };
    const bootstrap = createAuthFn(config);
    await bootstrap.router.handle(request('/auth/sign-up/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cookie@example.test', password: 'Sup3rConsolePassword!' }) }));
    const operatorAuth = createAuthFnOperatorAuth({
      config,
      resolveOperator: ({ session }) => ({ ...principal, actor: { ...principal.actor, id: session.actorId }, email: session.primaryEmail }),
      authorizeScope: ({ requested }) => requested,
    });
    const console = createSuperConsole({ adapters: [], enabledModules: [], auth: operatorAuth, shellPolicy: { authorize: () => true } });
    const response = await console.handle(request('/api/admin/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cookie@example.test', password: 'Sup3rConsolePassword!' }) }));
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.some((cookie) => cookie.startsWith('authfn.session='))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('authfn.csrf='))).toBe(true);
    expect((await response.json()).data.session.csrfCookieName).toBe('authfn.csrf');
  });

  it('splits combined provider cookies when getSetCookie is unavailable', async () => {
    const providerHeaders = new Headers();
    providerHeaders.append('set-cookie', 'provider.session=session-token; Path=/; HttpOnly; Expires=Wed, 21 Oct 2026 07:28:00 GMT');
    providerHeaders.append('set-cookie', 'provider.csrf=csrf-token; Path=/; SameSite=Lax');
    Object.defineProperty(providerHeaders, 'getSetCookie', { value: undefined });
    const console = createSuperConsole({
      adapters: [],
      enabledModules: [],
      auth: auth({ signIn: async () => ({ principal, headers: providerHeaders }) }),
      shellPolicy: { authorize: () => true },
    });

    const signedIn = await console.handle(request('/api/admin/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'operator@example.test', password: 'password' }),
    }));

    expect(signedIn.headers.getSetCookie()).toEqual([
      'provider.session=session-token; Path=/; HttpOnly; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
      'provider.csrf=csrf-token; Path=/; SameSite=Lax',
    ]);
  });

  it('joins AuthFn routes correctly when basePath has a trailing slash', async () => {
    const config = {
      database: memoryAdapter({ debug: false }),
      namespace: 'authfn-console-basepath',
      basePath: '/account/auth/',
      cookie: { secure: false },
      plugins: [authFnPasswordPlugin()],
    };
    const bootstrap = createAuthFn(config);
    await bootstrap.router.handle(request('/account/auth/sign-up/password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'basepath@example.test', password: 'Sup3rConsolePassword!' }),
    }));
    const operatorAuth = createAuthFnOperatorAuth({
      config,
      resolveOperator: ({ session }) => ({ ...principal, actor: { ...principal.actor, id: session.actorId }, email: session.primaryEmail }),
      authorizeScope: ({ requested }) => requested,
    });
    const console = createSuperConsole({ adapters: [], enabledModules: [], auth: operatorAuth, shellPolicy: { authorize: () => true } });

    const response = await console.handle(request('/api/admin/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'basepath@example.test', password: 'Sup3rConsolePassword!' }),
    }));
    expect(response.status).toBe(200);
  });

  it('enforces AuthFn CSRF on console mutations while valid cookie CSRF succeeds', async () => {
    const config = { database: memoryAdapter({ debug: false }), namespace: 'authfn-console-mutation', cookie: { secure: false }, plugins: [authFnPasswordPlugin()] };
    const bootstrap = createAuthFn(config);
    await bootstrap.router.handle(request('/auth/sign-up/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mutation@example.test', password: 'Sup3rConsolePassword!' }) }));
    const operatorAuth = createAuthFnOperatorAuth({
      config,
      resolveOperator: ({ session }) => ({ ...principal, actor: { ...principal.actor, id: session.actorId }, email: session.primaryEmail }),
      authorizeScope: ({ requested }) => requested,
    });
    const capability = manifest({ destructive: true });
    const mutation = vi.fn(async () => ({ ok: true as const, data: { accepted: true } }));
    const console = createSuperConsole({
      adapters: [createAdminCapabilityAdapter(capability, { 'examplefn.records.delete': mutation })],
      enabledModules: ['examplefn'],
      auth: operatorAuth,
      shellPolicy: { authorize: () => true },
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: { issue: async () => ({ token: 'bound-token', expiresAt: new Date(Date.now() + 60_000).toISOString() }), prepareActivation: async () => undefined, cancelActivation: async () => undefined, activate: async () => undefined, revoke: async () => undefined, verify: async ({ token }) => token === 'bound-token' },
    });
    const signedIn = await console.handle(request('/api/admin/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mutation@example.test', password: 'Sup3rConsolePassword!' }) }));
    const cookies = signedIn.headers.getSetCookie();
    const cookie = cookieHeader(cookies);
    const csrf = cookies.find((value) => value.startsWith('authfn.csrf='))!.slice('authfn.csrf='.length, cookies.find((value) => value.startsWith('authfn.csrf='))!.indexOf(';'));
    const sessionToken = cookies.find((value) => value.startsWith('authfn.session='))!.slice('authfn.session='.length, cookies.find((value) => value.startsWith('authfn.session='))!.indexOf(';'));
    const mutationRequest = (csrfHeader?: string, authorization?: string) => console.handle(request('/api/admin/v1/modules/examplefn/records/record_1', {
      method: 'DELETE',
      headers: {
        cookie,
        ...(csrfHeader ? { 'x-authfn-csrf': csrfHeader } : {}),
        ...(authorization ? { authorization } : {}),
        'idempotency-key': `idem-${csrfHeader ?? 'missing'}`,
        'x-admin-confirmation': 'bound-token',
      },
    }));
    expect((await mutationRequest()).status).toBe(403);
    expect((await mutationRequest('wrong', `Bearer ${sessionToken}`)).status).toBe(403);
    expect((await mutationRequest(csrf)).status).toBe(200);
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it('revokes a newly issued session when the AuthFn identity is not an operator', async () => {
    const config = { database: memoryAdapter({ debug: false }), namespace: 'authfn-console-denied', cookie: { secure: false }, plugins: [authFnPasswordPlugin()] };
    const bootstrap = createAuthFn(config);
    const signUp = await bootstrap.router.handle(request('/auth/sign-up/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'denied@example.test', password: 'Sup3rConsolePassword!' }) }));
    const created = await signUp.json();
    const user = { id: created.data.session.actorId, primaryEmail: created.data.session.primaryEmail, createdAt: new Date(), updatedAt: new Date() };
    const before = await listActiveSessionsForUser(config, user);
    const operatorAuth = createAuthFnOperatorAuth({ config, resolveOperator: () => null, authorizeScope: ({ requested }) => requested });
    const console = createSuperConsole({ adapters: [], enabledModules: [], auth: operatorAuth, shellPolicy: { authorize: () => true } });
    const denied = await console.handle(request('/api/admin/v1/auth/sign-in', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'denied@example.test', password: 'Sup3rConsolePassword!' }) }));
    expect(denied.status).toBe(403);
    expect(denied.headers.getSetCookie()).toHaveLength(0);
    expect(await listActiveSessionsForUser(config, user)).toHaveLength(before.length);
  });
});
