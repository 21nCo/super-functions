import { describe, expect, it, vi } from 'vitest';
import {
  operatorCsrfToken,
  fetchAdmin,
  fetchConsole,
  loadShellViewModel,
  materializeAdminActionHref,
  materializeAdminApiHref,
  normalizeRegistry,
  openSafeAdminDownloadReceipt,
  safeAdminDownloadHref,
  safeAvatarHref,
  safeConsoleNavigationHref,
  scopedConsoleHref,
  setOperatorCsrf,
  switchAdminContextHref,
  withAdminScope,
} from '../../src/lib/components/admin-api';
import {
  inferAdminResourceColumns,
  inferAdminResourceFields,
  inferAdminResourceTitle,
  normalizeAdminResourceRows,
} from '../../src/lib/components/view-models';
import { loadResourceDetail } from '../../src/lib/components/resource-pages';

describe('administration API boundary', () => {
  it('propagates the complete tenant scope and canonicalizes the installation root', () => {
    const scope = new URLSearchParams({
      organization: 'org-1',
      workspaceId: 'ws-1',
      project: 'project-1',
      environmentId: 'production',
      namespace: 'primary',
      region: 'ap-south-1',
    });
    expect(withAdminScope('/api/admin/v1/overview?limit=10', scope)).toBe(
      '/api/admin/v1/overview?limit=10&installationId=org-1&workspaceId=ws-1&projectId=project-1&environmentId=production&namespace=primary&region=ap-south-1'
    );
    expect(scopedConsoleHref('/modules/cifn', scope)).toBe(
      '/modules/cifn?installationId=org-1&workspaceId=ws-1&projectId=project-1&environmentId=production&namespace=primary&region=ap-south-1'
    );
  });

  it('preserves an explicitly selected canonical installation across navigation', () => {
    const scope = new URLSearchParams({
      installationId: 'install-2', workspaceId: 'ws-2', projectId: 'project-2', environmentId: 'prod-2',
    });
    expect(scopedConsoleHref('/modules/cifn', scope)).toBe(
      '/modules/cifn?installationId=install-2&workspaceId=ws-2&projectId=project-2&environmentId=prod-2'
    );
  });

  it('keeps explicit destination scope and clears invalid dependent context', () => {
    const current = new URLSearchParams({
      organizationId: 'old-org', workspaceId: 'old-workspace', projectId: 'old-project',
      environmentId: 'old-environment', namespace: 'tenant-a', region: 'us-east-1',
    });
    expect(withAdminScope('/modules/authfn?organizationId=new-org', current)).toBe(
      '/modules/authfn?organizationId=new-org'
    );
    expect(switchAdminContextHref(
      '/modules/authfn?organizationId=old-org&workspaceId=old-workspace&projectId=old-project&environmentId=old-environment&namespace=tenant-a&region=us-east-1',
      'organization',
      'new-org'
    )).toBe('/modules/authfn?installationId=new-org');
  });

  it('scopes confirmation and action requests to the same four-level context', () => {
    const scope = new URLSearchParams({
      organizationId: 'org-1', workspaceId: 'ws-1', projectId: 'project-1', environmentId: 'prod',
    });
    const suffix = '?installationId=org-1&workspaceId=ws-1&projectId=project-1&environmentId=prod';
    expect(scopedConsoleHref('/api/admin/v1/confirmations', scope)).toBe(`/api/admin/v1/confirmations${suffix}`);
    expect(scopedConsoleHref('/api/admin/v1/modules/sendfn/messages/send', scope)).toBe(`/api/admin/v1/modules/sendfn/messages/send${suffix}`);
  });

  it('normalizes function-owned manifests into enabled console navigation', () => {
    const registry = normalizeRegistry({
      modules: [{
        enabled: true,
        manifest: {
          id: 'authfn',
          displayName: 'AuthFn',
          version: '1.2.3',
          description: 'Identity administration',
          category: 'Identity',
          navigation: { path: '/modules/authfn', group: 'Platform' },
        },
      }],
    });
    expect(registry.modules[0]).toMatchObject({
      id: 'authfn',
      name: 'AuthFn',
      href: '/modules/authfn',
      group: 'Platform',
      enabled: true,
    });
  });

  it('returns typed permission errors and preserves request IDs', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: { code: 'PERMISSION_DENIED', message: 'Missing role' },
      requestId: 'req-1',
      correlationId: 'corr-1',
      auditId: 'audit-1',
      meta: { policy: 'operator' },
    }), { status: 403, headers: { 'content-type': 'application/json' } }));
    const result = await fetchAdmin(fetcher, '/api/admin/v1/audit');
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        status: 403,
        code: 'PERMISSION_DENIED',
        requestId: 'req-1',
        correlationId: 'corr-1',
        auditId: 'audit-1',
        meta: { policy: 'operator' },
      }),
    });
  });

  it('propagates the readable provider CSRF cookie on console mutations', async () => {
    setOperatorCsrf('authfn.csrf', 'x-authfn-csrf');
    document.cookie = 'authfn.csrf=csrf_token%2F1; path=/';
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('x-authfn-csrf')).toBe('csrf_token/1');
      expect(init?.credentials).toBe('same-origin');
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    expect(operatorCsrfToken()).toBe('csrf_token/1');
    await fetchConsole('/api/admin/v1/auth/sign-out', { method: 'POST' }, fetcher);
  });

  it('uses the exact projected provider CSRF cookie name and only an unambiguous fallback', () => {
    setOperatorCsrf('__Secure-west.csrf', 'x-provider-csrf');
    expect(operatorCsrfToken(
      '__Secure-east.csrf=east; __Secure-west.csrf=west-secure; authfn.csrf=default'
    )).toBe('west-secure');
    setOperatorCsrf('custom-xsrf-token', 'x-provider-csrf');
    expect(operatorCsrfToken('authfn.csrf=wrong; custom-xsrf-token=custom-value')).toBe('custom-value');
    setOperatorCsrf(undefined, undefined);
    expect(operatorCsrfToken('east.csrf=east; west.csrf=west')).toBeUndefined();
    expect(operatorCsrfToken('only.csrf=only')).toBe('only');
  });

  it('does not attach an operator CSRF header to read requests', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('x-authfn-csrf')).toBe(false);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await fetchConsole('/api/admin/v1/overview', {}, fetcher);
  });

  it('rejects unsafe download and avatar URLs', () => {
    expect(safeAdminDownloadHref('javascript:alert(1)')).toBeUndefined();
    expect(safeAdminDownloadHref('/api/admin/v1/modules/cifn/artifacts/1')).toBe('/api/admin/v1/modules/cifn/artifacts/1');
    expect(safeAdminDownloadHref('https://storage.example.test/signed', { signedExternal: false })).toBeUndefined();
    expect(safeAdminDownloadHref('https://storage.example.test/signed', { signedExternal: true })).toBe('https://storage.example.test/signed');
    expect(safeAdminDownloadHref('/api/admin/v1/openapi.json', {
      scope: new URLSearchParams({ organizationId: 'org-1', environmentId: 'prod' }),
    })).toBe('/api/admin/v1/openapi.json?installationId=org-1&environmentId=prod');
    expect(safeAdminDownloadHref('https://storage.example.test/signed?token=one', {
      signedExternal: true,
      scope: new URLSearchParams({ organizationId: 'org-1' }),
    })).toBe('https://storage.example.test/signed?token=one');
    expect(safeAdminDownloadHref('/proxy/files/file-1/download')).toBe('/proxy/files/file-1/download');
    expect(safeAdminDownloadHref('/proxy/files/file-1/versions/version-1/download')).toBe('/proxy/files/file-1/versions/version-1/download');
    expect(safeAdminDownloadHref('/proxy/files/file-1/artifacts/artifact-1/download')).toBe('/proxy/files/file-1/artifacts/artifact-1/download');
    expect(safeAdminDownloadHref('/proxy/files/file-1/delete')).toBeUndefined();
    expect(safeConsoleNavigationHref('/modules/authfn/users')).toBe('/modules/authfn/users');
    expect(safeConsoleNavigationHref('javascript:alert(1)')).toBeUndefined();
    expect(safeConsoleNavigationHref('data:text/html,hello')).toBeUndefined();
    expect(safeConsoleNavigationHref('https://evil.example/modules/authfn')).toBeUndefined();
    expect(safeConsoleNavigationHref('https://operator:secret@superconsole.local/modules/authfn')).toBeUndefined();
    expect(safeConsoleNavigationHref('/outside-console')).toBeUndefined();
    expect(safeAvatarHref('javascript:alert(1)')).toBeUndefined();
    expect(safeAvatarHref('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
    expect(safeAvatarHref('https://images.example.test/operator.png')).toBe('https://images.example.test/operator.png');
    expect(safeAvatarHref('http://images.example.test/operator.png')).toBeUndefined();
  });

  it('fails closed for every provider-header download receipt', async () => {
    await expect(openSafeAdminDownloadReceipt({
      url: 'https://storage.example.test/signed-object',
      headers: { 'x-goog-encryption-key': 'base64-customer-key' },
    })).rejects.toThrow('provider headers are never sent from the browser');
  });

  it('materializes declared administration route parameters from bound input', () => {
    expect(materializeAdminApiHref(
      '/api/admin/v1/modules/authfn/users/:id/sessions/{sessionId}',
      { id: 'user/1', sessionId: 'session 2' }
    )).toBe('/api/admin/v1/modules/authfn/users/user%2F1/sessions/session%202');
    expect(materializeAdminApiHref('/api/admin/v1/modules/authfn/users/:id', {})).toBeUndefined();
  });

  it('serializes GET and DELETE operation input as schema-compatible query values', () => {
    expect(materializeAdminActionHref(
      '/api/admin/v1/modules/filefn/files/:id',
      { id: 'file/1', reason: 'expired', payload: { recursive: true }, tags: ['one', 'two'] },
      'DELETE'
    )).toBe('/api/admin/v1/modules/filefn/files/file%2F1?reason=expired&payload=%7B%22recursive%22%3Atrue%7D&tags=%5B%22one%22%2C%22two%22%5D');
    expect(materializeAdminActionHref('/api/admin/v1/modules/filefn/files/:id', { id: 'file-1' }, 'POST')).toBe(
      '/api/admin/v1/modules/filefn/files/file-1'
    );
  });

  it('preserves administration envelope metadata outside the domain payload', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { items: [{ id: 'one' }] },
      requestId: 'req-1',
      correlationId: 'corr-1',
      auditId: 'audit-1',
      page: { nextCursor: 'next-1', hasMore: true },
      warnings: ['partial evidence'],
      meta: { source: 'watchfn' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(fetchAdmin<{ items: Array<{ id: string }> }>(fetcher, '/api/admin/v1/items')).resolves.toEqual({
      ok: true,
      data: { items: [{ id: 'one' }] },
      requestId: 'req-1',
      correlationId: 'corr-1',
      auditId: 'audit-1',
      page: { nextCursor: 'next-1', hasMore: true },
      warnings: ['partial evidence'],
      meta: { source: 'watchfn' },
    });
  });

  it('loads registry and overview with the same active scope', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      const body = String(input).includes('/registry')
        ? { data: { modules: [], session: { userId: 'user-1', displayName: 'Admin', role: 'owner' } } }
        : { data: { metrics: [], alerts: [], activity: [], health: [] } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const shell = await loadShellViewModel(fetcher, new URLSearchParams({ environmentId: 'prod' }));
    expect(calls).toEqual([
      '/api/admin/v1/registry?environmentId=prod',
      '/api/admin/v1/overview?environmentId=prod',
    ]);
    expect(shell.session?.displayName).toBe('Admin');
  });

  it('projects canonical admin items without exposing sensitive values', () => {
    const items = [{ id: 'user-1', email: 'admin@example.test', status: 'active', apiToken: 'redacted-me' }];
    const columns = inferAdminResourceColumns(items);
    expect(columns.map((column) => column.key)).toEqual(['id', 'email', 'status']);
    expect(normalizeAdminResourceRows(items, columns, {
      id: 'users',
      idField: 'id',
      label: 'Users',
      href: '/modules/authfn/users',
      detailApiHref: '/api/admin/v1/modules/authfn/resources/users/:id',
      detailInputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
      actions: [{ id: 'authfn.users.disable', label: 'Disable', apiHref: '/actions/disable', method: 'POST', targetIdInput: 'userId' }],
    })).toEqual([expect.objectContaining({
      id: 'user-1',
      href: '/modules/authfn/users/user-1',
      values: { id: 'user-1', email: 'admin@example.test', status: 'active' },
      actions: [expect.objectContaining({ input: { userId: 'user-1' } })],
    })]);
    expect(inferAdminResourceTitle(items[0], 'user-1')).toBe('admin@example.test');
    expect(inferAdminResourceFields(items[0]).map((field) => field.label)).not.toContain('Api Token');
  });

  it('uses declared identities, preserves composite detail keys, and omits list-only links', () => {
    const columns = inferAdminResourceColumns([{ _id: 'document-1', queue: 'emails' }]);
    expect(normalizeAdminResourceRows([{ _id: 'document-1' }], columns, {
      id: 'documents', idField: '_id', label: 'Documents', href: '/modules/cmsfn/documents',
      detailApiHref: '/api/admin/v1/modules/cmsfn/resources/documents/:id', detailIdInput: 'id',
      detailInputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    })[0]).toMatchObject({ id: 'document-1', href: '/modules/cmsfn/documents/document-1' });

    expect(normalizeAdminResourceRows([{ id: 'job-1', queue: 'emails' }], columns, {
      id: 'jobs', idField: 'id', label: 'Jobs', href: '/modules/flowfn/jobs',
      detailApiHref: '/api/admin/v1/modules/flowfn/resources/jobs/:id', detailIdInput: 'id',
      detailInputSchema: { type: 'object', properties: { queue: { type: 'string' }, id: { type: 'string' } }, required: ['queue', 'id'], additionalProperties: false },
    })[0]).toMatchObject({ id: 'job-1', href: '/modules/flowfn/jobs/job-1?queue=emails' });

    expect(normalizeAdminResourceRows([{ id: 'event-1' }], columns, {
      id: 'events', idField: 'id', label: 'Events', href: '/modules/flowfn/events',
    })[0]).not.toHaveProperty('href');
  });

  it('materializes every required composite detail input from the row URL', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/admin/v1/modules/flowfn/resources/jobs/job-1?queue=emails');
      return new Response(JSON.stringify({ ok: true, data: { item: { id: 'job-1', queue: 'emails' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const registry = { modules: [{
      id: 'flowfn', name: 'FlowFn', description: 'Flows', href: '/modules/flowfn', enabled: true,
      resources: [{
        id: 'jobs', idField: 'id', label: 'Jobs', href: '/modules/flowfn/jobs',
        detailApiHref: '/api/admin/v1/modules/flowfn/resources/jobs/:id', detailIdInput: 'id',
        detailInputSchema: { type: 'object' as const, properties: { queue: { type: 'string' as const }, id: { type: 'string' as const } }, required: ['queue', 'id'], additionalProperties: false },
      }],
    }] };

    const loaded = await loadResourceDetail({
      fetcher, registry, moduleId: 'flowfn', resourceId: 'jobs', identity: 'job-1',
      url: new URL('https://console.example.test/modules/flowfn/jobs/job-1?queue=emails'),
    });
    expect(loaded.loadError).toBeUndefined();
    expect(loaded.view).toMatchObject({ id: 'job-1', title: 'job-1' });

    const missingFetcher = vi.fn();
    const missing = await loadResourceDetail({
      fetcher: missingFetcher, registry, moduleId: 'flowfn', resourceId: 'jobs', identity: 'job-1',
      url: new URL('https://console.example.test/modules/flowfn/jobs/job-1'),
    });
    expect(missing.loadError).toMatchObject({ status: 400, code: 'RESOURCE_DETAIL_INPUT_REQUIRED' });
    expect(missingFetcher).not.toHaveBeenCalled();
  });
});
