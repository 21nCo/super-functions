import {
  AdminError,
  adminOpenApiScopeParameters,
  assertAdminValue,
  assertAdminScopeHierarchy,
  adminScopeRootId,
  adminScopeSupportsOperation,
  createAdminDispatcher,
  createAdminOpenApiDocument,
  createAdminRegistry,
  normalizeAdminPageLimit,
  normalizeAdminError,
  projectAdminMcpTools,
  redactAdminValue,
  evaluateAdminDiscoveryPolicy,
  type AdminCapabilityManifest,
  type AdminDispatcher,
  type AdminJsonSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminRegistryOperation,
  type AdminResult,
  type AdminScope,
} from '@superfunctions/admin';
import { createMcpFnServer, McpFnRegistry, type McpFnListedTool, type McpFnRequestExtra, type McpFnServer, type McpFnToolDefinition } from '@mcpfn/core';
import { parseModuleSelection } from './catalog.js';
import type {
  SuperConsoleOptions,
  SuperConsoleOperatorAuth,
  SuperConsolePrincipal,
  SuperConsoleRequestState,
} from './types.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface HttpErrorOptions {
  status: number;
  code: string;
  details?: unknown;
}

type SuperConsoleMcpHandler = Awaited<ReturnType<McpFnServer<AdminOperationContext>['createWebStandardHandler']>>;

class SuperConsoleHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(message: string, options: HttpErrorOptions) {
    super(message);
    this.name = 'SuperConsoleHttpError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

function response(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(JSON_HEADERS);
  // An auth provider can emit both a session cookie and a CSRF cookie. Read an incoming
  // Headers instance directly so constructing a second Headers object cannot
  // coalesce Set-Cookie values containing Expires commas.
  const incoming = extraHeaders instanceof Headers ? extraHeaders : new Headers(extraHeaders);
  incoming.forEach((value, key) => {
    if (key !== 'set-cookie') headers.append(key, value);
  });
  for (const cookie of readSetCookieHeaders(incoming)) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function splitCombinedSetCookieHeader(value: string): string[] {
  const cookies: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && value[index - 1] !== '\\') quoted = !quoted;
    if (character !== ',' || quoted) continue;
    const remainder = value.slice(index + 1);
    if (!/^\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+=/.test(remainder)) continue;
    cookies.push(value.slice(start, index).trim());
    start = index + 1;
  }
  cookies.push(value.slice(start).trim());
  return cookies.filter(Boolean);
}

function readSetCookieHeaders(headers: Headers): string[] {
  const source = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof source.getSetCookie === 'function') return source.getSetCookie();
  const combined = headers.get('set-cookie');
  return combined ? splitCombinedSetCookieHeader(combined) : [];
}

function success(data: unknown, requestId?: string, headers?: HeadersInit, status = 200): Response {
  return response({ ok: true, data, ...(requestId ? { requestId } : {}) }, status, headers);
}

function failure(error: unknown, requestId?: string, auth?: SuperConsoleOperatorAuth): Response {
  if (error instanceof SuperConsoleHttpError) {
    return response({
      ok: false,
      error: { code: error.code, message: error.message, status: error.status, ...(error.details === undefined ? {} : { details: error.details }) },
      ...(requestId ? { requestId } : {}),
    }, error.status);
  }
  const providerResponse = auth?.mapError?.(error);
  if (providerResponse) {
    const source = providerResponse;
    const headers = new Headers();
    for (const cookie of readSetCookieHeaders(source.headers)) headers.append('set-cookie', cookie);
    for (const name of ['retry-after', 'x-request-id']) {
      const value = source.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('content-type', source.headers.get('content-type') ?? 'application/json; charset=utf-8');
    headers.set('cache-control', 'no-store');
    return new Response(source.body, { status: source.status, headers });
  }
  const normalized = normalizeAdminError(error, { requestId });
  return response(normalized, normalized.error.status);
}

function readScopeValue(url: URL, request: Request, name: 'installation' | 'organization' | 'workspace' | 'project' | 'environment'): string | undefined {
  return url.searchParams.get(`${name}Id`)
    ?? url.searchParams.get(name)
    ?? request.headers.get(`x-superconsole-${name}-id`)
    ?? request.headers.get(`x-admin-${name}-id`)
    ?? undefined;
}

function requestedScope(request: Request, principal: SuperConsolePrincipal): AdminScope {
  const url = new URL(request.url);
  const installation = readScopeValue(url, request, 'installation');
  const organization = readScopeValue(url, request, 'organization');
  const workspace = readScopeValue(url, request, 'workspace');
  const project = readScopeValue(url, request, 'project');
  const environment = readScopeValue(url, request, 'environment');
  const requestedRoot = installation ?? organization ?? adminScopeRootId(principal.defaultScope);
  const rootChanged = Boolean((installation ?? organization) && requestedRoot !== adminScopeRootId(principal.defaultScope));
  const requestedWorkspace = workspace ?? (rootChanged ? undefined : principal.defaultScope.workspaceId);
  const workspaceChanged = Boolean(workspace && workspace !== principal.defaultScope.workspaceId);
  const requestedProject = project ?? (rootChanged || workspaceChanged ? undefined : principal.defaultScope.projectId);
  const projectChanged = Boolean(project && project !== principal.defaultScope.projectId);
  const environmentChanged = Boolean(environment && environment !== principal.defaultScope.environmentId);
  const hierarchyChanged = rootChanged || workspaceChanged || projectChanged || environmentChanged;
  const namespace = url.searchParams.get('namespace') ?? request.headers.get('x-superconsole-namespace');
  const region = url.searchParams.get('region') ?? request.headers.get('x-superconsole-region');
  return {
    ...(requestedRoot ? { installationId: requestedRoot } : {}),
    ...(requestedWorkspace ? { workspaceId: requestedWorkspace } : {}),
    ...(requestedProject ? { projectId: requestedProject } : {}),
    ...((environment ?? (rootChanged || workspaceChanged || projectChanged ? undefined : principal.defaultScope.environmentId))
      ? { environmentId: environment ?? principal.defaultScope.environmentId }
      : {}),
    namespace: namespace ?? (hierarchyChanged ? undefined : principal.defaultScope.namespace),
    region: region ?? (hierarchyChanged ? undefined : principal.defaultScope.region),
  };
}

function assertValidScope(scope: AdminScope): void {
  try {
    assertAdminScopeHierarchy(scope);
  } catch (error) {
    throw new SuperConsoleHttpError('The active administration scope hierarchy is invalid.', {
      status: 400,
      code: 'ADMIN_SCOPE_INVALID',
      details: normalizeAdminError(error).error.details,
    });
  }
  if (!adminScopeRootId(scope)) {
    throw new SuperConsoleHttpError('The active scope requires installationId.', { status: 400, code: 'ADMIN_SCOPE_REQUIRED' });
  }
}

function requestIdentity(request: Request): { requestId: string; correlationId?: string } {
  const validate = (name: string, value: string | null): string | undefined => {
    if (value === null) return undefined;
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value)) {
      throw new SuperConsoleHttpError(`${name} must contain 1-200 safe identifier characters.`, { status: 400, code: 'INVALID_REQUEST_IDENTITY' });
    }
    return value;
  };
  return {
    requestId: validate('x-request-id', request.headers.get('x-request-id')) ?? `req_${crypto.randomUUID()}`,
    correlationId: validate('x-correlation-id', request.headers.get('x-correlation-id')),
  };
}

const MAX_ADMIN_REQUEST_BYTES = 1024 * 1024;

async function assertBoundedRequestBody(request: Request): Promise<void> {
  if (READ_METHODS.has(request.method)) return;
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_ADMIN_REQUEST_BYTES)) {
    throw new SuperConsoleHttpError('The administration request body exceeds 1 MiB.', { status: 413, code: 'ADMIN_BODY_TOO_LARGE' });
  }
  const reader = request.clone().body?.getReader();
  if (!reader) return;
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_ADMIN_REQUEST_BYTES) {
        await reader.cancel();
        throw new SuperConsoleHttpError('The administration request body exceeds 1 MiB.', { status: 413, code: 'ADMIN_BODY_TOO_LARGE' });
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function sessionView(principal: SuperConsolePrincipal) {
  return {
    userId: principal.actor.id,
    displayName: principal.displayName,
    email: principal.email,
    avatarUrl: principal.avatarUrl,
    role: principal.role,
    permissions: principal.actor.permissions ?? [],
    csrfCookieName: principal.authentication?.csrfCookieName,
    csrfHeaderName: principal.authentication?.csrfHeaderName,
  };
}

function contextView(principal: SuperConsolePrincipal, scope: AdminScope) {
  const configured = principal.contextOptions ?? {};
  const selected = (name: 'installation' | 'organization' | 'workspace' | 'project' | 'environment', id: string | undefined) => {
    if (!id) return undefined;
    const singleton = configured[name];
    return (singleton?.id === id ? singleton : undefined)
      ?? configured[`${name}s`]?.find((candidate) => candidate.id === id)
      ?? { id, name: id };
  };
  return {
    ...configured,
    installation: selected('installation', adminScopeRootId(scope)),
    organization: selected('organization', scope.organizationId ?? scope.installationId),
    workspace: selected('workspace', scope.workspaceId),
    project: selected('project', scope.projectId),
    environment: selected('environment', scope.environmentId),
  };
}

const CONSOLE_UI_PATH = /^\/(?:$|api(?:\/|$)|audit(?:\/|$)|mcp(?:\/|$)|modules(?:\/|$)|search(?:\/|$)|settings(?:\/|$))/;

function safeConsoleHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return undefined;
  try {
    const parsed = new URL(value, 'https://superconsole.invalid');
    if (parsed.origin !== 'https://superconsole.invalid' || !CONSOLE_UI_PATH.test(parsed.pathname)) return undefined;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return undefined;
  }
}

function sanitizeConsoleRecordHref(record: Record<string, unknown>): Record<string, unknown> {
  if (!('href' in record)) return record;
  const href = safeConsoleHref(record.href);
  const { href: _unsafeHref, ...safe } = record;
  return href ? { ...safe, href } : safe;
}

function deepFreezeConsoleValue<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (typeof AbortSignal !== 'undefined' && value instanceof AbortSignal) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreezeConsoleValue(child);
  return Object.freeze(value);
}

function immutableConfirmationState(
  input: unknown,
  state: SuperConsoleRequestState,
): { input: unknown; state: SuperConsoleRequestState } {
  const { signal, ...cloneableContext } = state.context;
  return {
    input: deepFreezeConsoleValue(structuredClone(input)),
    state: {
      principal: state.principal,
      context: deepFreezeConsoleValue({
        ...structuredClone(cloneableContext),
        ...(signal ? { signal } : {}),
      }),
    },
  };
}

function routeDefinition(operation: AdminOperationDefinition): { method: string; path: string } {
  if (typeof operation.route !== 'string') return operation.route;
  const [method, ...parts] = operation.route.trim().split(/\s+/);
  return { method: method ?? 'GET', path: parts.join(' ') };
}

function resourceId(entry: AdminRegistryOperation): string {
  return entry.operation.target?.resource ?? entry.operation.id.split('.')[1] ?? entry.operation.id;
}

interface ConsoleActionView {
  id: string;
  label: string;
  description: string;
  apiHref: string;
  method: string;
  tone: string;
  requiresConfirmation?: boolean;
  permission: string;
  target: AdminOperationDefinition['target'];
  inputSchema?: AdminJsonSchema;
  targetInput?: string;
  targetIdInput?: string;
  collection: boolean;
  sourceModuleId?: string;
  foldedIntoModuleId?: string;
}

interface ConsoleResourceView {
  id: string;
  resourceId: string;
  idField?: string;
  moduleId: string;
  sourceModuleId: string;
  foldedIntoModuleId?: string;
  label: string;
  pluralLabel: string;
  description?: string;
  href: string;
  apiHref?: string;
  listApiHref?: string;
  listInputSchema?: AdminJsonSchema;
  detailApiHref?: string;
  detailIdInput?: string;
  detailInputSchema?: AdminJsonSchema;
  listable: boolean;
  standaloneList: boolean;
  presentation?: NonNullable<AdminCapabilityManifest['resources']>[number]['presentation'];
  actions: ConsoleActionView[];
}

interface ConsoleModuleView {
  id: string;
  name: string;
  description: string;
  href: string;
  group: string;
  enabled: true;
  visibleInNavigation: boolean;
  parentModuleId?: string;
  health: string;
  healthLabel: string;
  version: string;
  capabilities: string[];
  resources: ConsoleResourceView[];
  actions: ConsoleActionView[];
  foldedModuleIds: string[];
  manifest: AdminCapabilityManifest;
}

function moduleView(
  manifest: AdminCapabilityManifest,
  entries: readonly AdminRegistryOperation[],
  children: readonly { manifest: AdminCapabilityManifest; entries: readonly AdminRegistryOperation[] }[] = [],
): ConsoleModuleView {
  const navigation = Array.isArray(manifest.navigation) ? manifest.navigation[0] : manifest.navigation;
  const actionView = (entry: AdminRegistryOperation) => ({
    id: entry.operation.id,
    label: entry.operation.title,
    description: entry.operation.description,
    apiHref: entry.routePath,
    method: routeDefinition(entry.operation).method,
    tone: entry.operation.safety.classification === 'destructive' ? 'danger' : 'default',
    requiresConfirmation: entry.operation.safety.requiresConfirmation,
    permission: entry.operation.permission,
    target: entry.operation.target,
    inputSchema: entry.operation.inputSchema,
    targetInput: entry.operation.target?.idInput,
    targetIdInput: entry.operation.target?.idInput,
    collection: entry.operation.target?.collection === true,
  });
  const declaredResources = manifest.resources ?? [];
  const ownResources = [...new Set(entries.map(resourceId))].map((id) => {
    const operations = entries.filter((entry) => resourceId(entry) === id);
    const resource = declaredResources.find((candidate) => candidate.id === id);
    const list = resource?.presentation?.listOperationId
      ? operations.find((entry) => entry.operation.id === resource.presentation?.listOperationId)
      : operations.find((entry) => entry.operation.id.endsWith('.list'));
    const get = resource?.presentation?.detailOperationId
      ? operations.find((entry) => entry.operation.id === resource.presentation?.detailOperationId)
      : operations.find((entry) => entry.operation.id.endsWith('.get'));
    const actions = operations
      .filter((entry) => entry !== list && entry !== get && Boolean(entry.operation.target?.idInput))
      .map(actionView);
    const label = resource?.label ?? list?.operation.title.replace(/^List\s+/i, '') ?? get?.operation.title.replace(/^Get\s+/i, '') ?? id;
    return {
      id,
      resourceId: id,
      idField: resource?.idField,
      moduleId: manifest.id,
      sourceModuleId: manifest.id,
      label,
      pluralLabel: label,
      description: resource?.description ?? list?.operation.description ?? get?.operation.description,
      ...(resource?.icon ? { icon: resource.icon } : {}),
      ...(resource ? { resource } : {}),
      href: `${navigation?.path ?? `/modules/${manifest.id}`}/${id}`,
      apiHref: list?.routePath,
      listApiHref: list?.routePath,
      listInputSchema: list?.operation.inputSchema,
      detailApiHref: get?.routePath,
      detailIdInput: get?.operation.target?.idInput,
      detailInputSchema: get?.operation.inputSchema,
      listable: Boolean(list),
      standaloneList: resource?.presentation?.standaloneList !== false,
      presentation: resource?.presentation,
      actions,
    };
  });
  const childViews = children.map(({ manifest: childManifest, entries: childEntries }) => ({
    manifest: childManifest,
    view: moduleView(childManifest, childEntries),
  }));
  const foldedResources = childViews.flatMap(({ manifest: childManifest, view: child }) => child.resources.map((resource) => ({
    ...resource,
    id: `${child.id}:${resource.resourceId}`,
    moduleId: child.id,
    sourceModuleId: child.id,
    foldedIntoModuleId: manifest.id,
    href: `${navigation?.path ?? `/modules/${manifest.id}`}/${encodeURIComponent(`${child.id}:${resource.resourceId}`)}`,
    actions: resource.actions.map((action) => ({
      ...action,
      sourceModuleId: child.id,
      foldedIntoModuleId: manifest.id,
    })),
  })));
  const foldedActions = childViews.flatMap(({ view: child }) => child.actions.map((action) => ({
    ...action,
    sourceModuleId: child.id,
    foldedIntoModuleId: manifest.id,
  })));
  const manuallyAddressedResourceIds = new Set(
    ownResources
      .filter((resource) => !resource.listable && !resource.detailApiHref)
      .map((resource) => resource.resourceId),
  );
  const manuallyAddressedActions = entries
    .filter((entry) =>
      entry.operation.safety.classification !== 'read'
      && Boolean(entry.operation.target?.idInput)
      && manuallyAddressedResourceIds.has(resourceId(entry)))
    .map((entry) => ({
      ...actionView(entry),
      targetInput: undefined,
      targetIdInput: undefined,
    }));
  return {
    id: manifest.id,
    name: manifest.displayName,
    description: manifest.description,
    href: navigation?.path ?? `/modules/${manifest.id}`,
    group: navigation?.group ?? manifest.category,
    enabled: true,
    visibleInNavigation: manifest.availability !== 'nested',
    parentModuleId: manifest.owner?.moduleId,
    health: 'unknown',
    healthLabel: manifest.health ? 'Health available' : 'No health operation declared',
    version: manifest.version,
    capabilities: [...entries.map((entry) => entry.operation.id), ...childViews.flatMap(({ view }) => view.capabilities)],
    resources: [...ownResources, ...foldedResources],
    actions: [...entries
      .filter((entry) => entry.operation.safety.classification !== 'read' && entry.operation.target?.collection === true)
      .map(actionView), ...manuallyAddressedActions, ...foldedActions],
    foldedModuleIds: childViews.map(({ view }) => view.id),
    manifest,
  };
}

function parseScalar(schema: AdminJsonSchema | undefined, raw: string): unknown {
  const types = schema?.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (types.includes('integer') || types.includes('number')) return Number(raw);
  if (types.includes('boolean')) return raw === 'true' ? true : raw === 'false' ? false : raw;
  if (types.includes('array') || types.includes('object')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function extractPathParams(entry: AdminRegistryOperation, concretePath: string): Record<string, string> {
  const pattern = entry.routePath.split('/').filter(Boolean);
  const concrete = concretePath.split('?')[0]!.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  pattern.forEach((part, index) => {
    const match = /^:([A-Za-z_][A-Za-z0-9_]*)$/.exec(part) ?? /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(part);
    if (match && concrete[index] !== undefined) params[match[1]!] = decodeURIComponent(concrete[index]!);
  });
  return params;
}

async function operationInput(request: Request, entry: AdminRegistryOperation, matchedPath: string): Promise<Record<string, unknown>> {
  const schema = entry.operation.inputSchema;
  const input: Record<string, unknown> = {};
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'DELETE') {
    const url = new URL(request.url);
    url.searchParams.forEach((value, key) => {
      if (['installationId', 'organizationId', 'workspaceId', 'projectId', 'environmentId', 'installation', 'organization', 'workspace', 'project', 'environment', 'namespace', 'region'].includes(key)) return;
      const canonicalKey = key === 'q' && schema?.properties?.search ? 'search' : key;
      input[canonicalKey] = parseScalar(schema?.properties?.[canonicalKey], value);
    });
  } else {
    const text = await request.text();
    if (text.trim()) {
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new SuperConsoleHttpError('The request body must be valid JSON.', { status: 400, code: 'INVALID_JSON' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SuperConsoleHttpError('The request body must be a JSON object.', { status: 400, code: 'INVALID_BODY' });
      Object.assign(input, body);
    }
  }
  const params = extractPathParams(entry, matchedPath);
  for (const [key, value] of Object.entries(params)) input[key] = parseScalar(schema?.properties?.[key], value);
  return input;
}

function resultResponse(result: AdminResult): Response {
  const status = result.ok === false ? result.error.status : 200;
  return response(result, status, result.requestId ? { 'x-request-id': result.requestId } : undefined);
}

export class SuperConsole {
  readonly registry;
  readonly dispatcher: AdminDispatcher;
  readonly openApi;
  readonly mcpTools;
  readonly mcpServer;
  private readonly options: SuperConsoleOptions;
  private readonly now: () => Date;
  private mcpHandlerPromise?: Promise<SuperConsoleMcpHandler>;

  constructor(options: SuperConsoleOptions) {
    if (options.apiBasePath !== undefined && options.apiBasePath !== '/api/admin/v1') {
      throw new Error('The bundled Super Console UI currently requires apiBasePath to be /api/admin/v1.');
    }
    const enabledModules = parseModuleSelection(
      options.enabledModules,
      options.adapters.map((adapter) => adapter.manifest),
    );
    this.options = options;
    this.now = options.now ?? (() => new Date());
    this.registry = createAdminRegistry({
      adapters: options.adapters,
      enabledModules,
      apiBasePath: options.apiBasePath ?? '/api/admin/v1',
    });
    this.validateInfrastructure(options);
    this.dispatcher = createAdminDispatcher({
      registry: this.registry,
      audit: options.audit,
      idempotency: options.idempotency,
      policy: options.policy,
      confirmation: options.confirmation,
      now: this.now,
    });
    this.openApi = this.buildOpenApi();
    const projectedTools = projectAdminMcpTools({ registry: this.registry, dispatcher: this.dispatcher });
    this.mcpTools = this.registry.operations.some((entry) => entry.operation.safety.requiresConfirmation)
      ? [...projectedTools, this.confirmationMcpTool()]
      : projectedTools;
    const mcpRegistry = new McpFnRegistry<AdminOperationContext>().registerAll(this.mcpTools);
    this.mcpServer = createMcpFnServer({
      info: {
        name: this.options.serverName ?? 'super-console',
        version: '1.0.0',
        instructions: 'Administer only enabled Superfunctions in the authenticated installation/workspace/project/environment scope.',
      },
      registry: mcpRegistry,
      context: (extra) => this.mcpContext(extra),
      toolVisibility: ({ tool, context }) => this.mcpToolVisible(tool, context),
      transports: ['streamable-http'],
    });
  }

  private validateInfrastructure(options: SuperConsoleOptions): void {
    if (!options.shellPolicy?.authorize) {
      throw new Error('Super Console startup requires an explicit shell authorization policy.');
    }
    const operations = this.registry.operations.map((entry) => entry.operation);
    if (operations.some((operation) => operation.safety.audit === 'required') && typeof options.audit?.write !== 'function') {
      throw new Error('Super Console startup requires an audit sink because enabled mutations declare required audit.');
    }
    if (operations.some((operation) => operation.safety.classification !== 'read' && operation.safety.idempotent)
      && (typeof options.idempotency?.begin !== 'function'
        || typeof options.idempotency?.complete !== 'function'
        || typeof options.idempotency?.release !== 'function')) {
      throw new Error('Super Console startup requires an atomic idempotency store because enabled mutations declare idempotent execution.');
    }
    if (operations.some((operation) => operation.safety.classification !== 'read') && typeof options.auth.authorizeMutation !== 'function') {
      throw new Error('Super Console startup requires operator-auth mutation authorization because enabled operations can mutate state.');
    }
    if (operations.some((operation) => operation.safety.requiresConfirmation)
      && (typeof options.confirmation?.issue !== 'function'
        || typeof options.confirmation?.prepareActivation !== 'function'
        || typeof options.confirmation?.cancelActivation !== 'function'
        || typeof options.confirmation?.activate !== 'function'
        || typeof options.confirmation?.revoke !== 'function'
        || typeof options.confirmation?.verify !== 'function')) {
      throw new Error('Super Console startup requires staged confirmation issue, durable activation preparation and cancellation, activation, revocation, and verification because enabled operations require confirmation.');
    }
    if (options.openApiSecuritySchemes
      && (!options.openApiSecuritySchemes.operatorSession || !options.openApiSecuritySchemes.operatorApiKey)) {
      throw new Error('Super Console OpenAPI security overrides must define operatorSession and operatorApiKey.');
    }
  }

  async handle(request: Request): Promise<Response> {
    let identity = { requestId: `req_${crypto.randomUUID()}` } as { requestId: string; correlationId?: string };
    try {
      identity = requestIdentity(request);
      await assertBoundedRequestBody(request);
      const url = new URL(request.url);
      const relative = this.relativePath(url.pathname);
      if (request.method === 'OPTIONS') return this.optionsResponse(relative, identity.requestId);
      if (relative === 'mcp/transport') {
        if (!['GET', 'POST', 'DELETE'].includes(request.method)) throw new SuperConsoleHttpError('The MCP transport does not support the requested method.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
        return await this.handleMcp(request, identity);
      }
      if (relative === 'auth/sign-in') return await this.signIn(request, identity.requestId);
      if (relative === 'auth/2fa') return await this.completeTwoFactor(request, identity.requestId);
      if (relative === 'auth/sign-out') return await this.signOut(request, identity.requestId);

      const state = await this.state(request, identity);
      if (!READ_METHODS.has(request.method)) await this.options.auth.authorizeMutation?.({ principal: state.principal, request });

      const getOrHead = request.method === 'GET' || request.method === 'HEAD';
      if (relative === '' && getOrHead) return this.headAware(request, success({ name: this.options.serverName ?? 'Super Console', apiVersion: 'v1' }, identity.requestId));
      if (relative === 'registry' && getOrHead) { await this.authorizeShell('registry', state); return this.headAware(request, success(await this.registryView(state), identity.requestId)); }
      if (relative === 'overview' && getOrHead) { await this.authorizeShell('overview', state); return this.headAware(request, success(await this.overviewView(state), identity.requestId)); }
      if (relative === 'openapi.json' && getOrHead) { await this.authorizeShell('api', state); return this.headAware(request, response(this.openApi, 200, { 'x-request-id': identity.requestId })); }
      if (relative === 'mcp' && getOrHead) { await this.authorizeShell('mcp', state); return this.headAware(request, success(await this.mcpView(state), identity.requestId)); }
      if (relative === 'search' && getOrHead) return this.headAware(request, success(await this.search(request, state), identity.requestId));
      if (relative === 'audit' && getOrHead) return this.headAware(request, success(await this.audit(request, state), identity.requestId));
      if (relative === 'settings' && getOrHead) { await this.authorizeShell('settings', state); return this.headAware(request, success(await this.settings(state), identity.requestId)); }
      if (relative === 'confirmations' && request.method === 'POST') return await this.issueConfirmation(request, state);
      if (relative.startsWith('settings/policies/') && request.method === 'PATCH') {
        await this.authorizeShell('settings', state);
        return await this.updatePolicy(request, decodeURIComponent(relative.slice('settings/policies/'.length)), state);
      }
      if (relative.startsWith('operations/') && request.method === 'POST') return await this.invokeOperation(request, decodeURIComponent(relative.slice('operations/'.length)), state);
      if (relative.startsWith('modules/')) return await this.moduleRequest(request, relative, state);
      if (this.isKnownEndpoint(relative)) throw new SuperConsoleHttpError('This administration endpoint does not support the requested method.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
      throw new SuperConsoleHttpError('No administration endpoint exists at this path.', { status: 404, code: 'ADMIN_ROUTE_NOT_FOUND' });
    } catch (error) {
      return failure(error, identity.requestId, this.options.auth);
    }
  }

  private headAware(request: Request, result: Response): Response {
    return request.method === 'HEAD' ? new Response(null, { status: result.status, headers: result.headers }) : result;
  }

  private isKnownEndpoint(relative: string): boolean {
    return ['', 'registry', 'overview', 'openapi.json', 'mcp', 'mcp/transport', 'search', 'audit', 'settings', 'confirmations', 'auth/sign-in', 'auth/2fa', 'auth/sign-out'].includes(relative)
      || relative.startsWith('settings/policies/')
      || relative.startsWith('operations/');
  }

  private optionsResponse(relative: string, requestId: string): Response {
    const methods = relative === 'mcp/transport'
      ? ['GET', 'POST', 'DELETE', 'OPTIONS']
      : relative === 'auth/sign-in' || relative === 'auth/2fa' || relative === 'auth/sign-out' || relative === 'confirmations' || relative.startsWith('operations/')
      ? ['POST', 'OPTIONS']
      : relative.startsWith('settings/policies/')
        ? ['PATCH', 'OPTIONS']
        : relative.startsWith('modules/')
          ? ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
          : this.isKnownEndpoint(relative)
            ? ['GET', 'HEAD', 'OPTIONS']
            : undefined;
    if (!methods) throw new SuperConsoleHttpError('No administration endpoint exists at this path.', { status: 404, code: 'ADMIN_ROUTE_NOT_FOUND' });
    return new Response(null, { status: 204, headers: { allow: methods.join(', '), 'x-request-id': requestId, 'cache-control': 'no-store' } });
  }

  private relativePath(pathname: string): string {
    const prefix = this.registry.apiBasePath;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) throw new SuperConsoleHttpError('The request is outside the administration API.', { status: 404, code: 'ADMIN_ROUTE_NOT_FOUND' });
    const suffix = pathname.slice(prefix.length);
    if (suffix.includes('\\') || suffix.includes('//')) {
      throw new SuperConsoleHttpError('The administration path is not canonical.', { status: 400, code: 'INVALID_ADMIN_PATH' });
    }
    const rawSegments = suffix.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const decodedSegments = rawSegments.map((segment) => {
      let decoded = segment;
      for (let depth = 0; depth < 4; depth += 1) {
        let next: string;
        try {
          next = decodeURIComponent(decoded);
        } catch {
          throw new SuperConsoleHttpError('The administration path contains invalid percent encoding.', { status: 400, code: 'INVALID_ADMIN_PATH' });
        }
        const unsafeDecodedSegment = next === '.' || next === '..'
          || /[\\\u0000-\u001f\u007f]/.test(next)
          || next.split('/').some((part) => part === '.' || part === '..');
        const decodedSeparatorCount = decoded.split('/').length - 1;
        const nextSeparatorCount = next.split('/').length - 1;
        if (unsafeDecodedSegment || (depth > 0 && nextSeparatorCount > decodedSeparatorCount)) {
          throw new SuperConsoleHttpError('The administration path contains an unsafe segment.', { status: 400, code: 'INVALID_ADMIN_PATH' });
        }
        if (next === decoded) return segment;
        decoded = next;
      }
      if (/%[0-9a-f]{2}/i.test(decoded)) {
        throw new SuperConsoleHttpError('The administration path contains unstable nested encoding.', { status: 400, code: 'INVALID_ADMIN_PATH' });
      }
      return segment;
    });
    return decodedSegments.join('/');
  }

  private async state(request: Request, identity: { requestId: string; correlationId?: string }): Promise<SuperConsoleRequestState> {
    const principal = await this.options.auth.authenticate(request);
    if (!principal) throw new SuperConsoleHttpError('Authentication is required.', { status: 401, code: 'AUTHENTICATION_REQUIRED' });
    assertValidScope(principal.defaultScope);
    const requested = requestedScope(request, principal);
    assertValidScope(requested);
    const scope = await this.options.auth.authorizeScope({ principal, requested, request });
    if (!scope) throw new SuperConsoleHttpError('The operator cannot access the requested scope.', { status: 403, code: 'ADMIN_SCOPE_FORBIDDEN' });
    assertValidScope(scope);
    return {
      principal,
      context: {
        scope,
        actor: principal.actor,
        requestId: identity.requestId,
        correlationId: identity.correlationId,
        source: 'rest',
        idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
        confirmationToken: request.headers.get('x-admin-confirmation') ?? undefined,
        signal: request.signal,
        now: this.now(),
      },
    };
  }

  private async signIn(request: Request, requestId: string): Promise<Response> {
    if (request.method !== 'POST') throw new SuperConsoleHttpError('Sign-in requires POST.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    if (!this.options.auth.signIn) throw new SuperConsoleHttpError('This deployment does not expose password sign-in.', { status: 501, code: 'AUTH_SIGN_IN_UNAVAILABLE' });
    const body = await request.json().catch(() => undefined) as { email?: unknown; password?: unknown } | undefined;
    if (typeof body?.email !== 'string' || typeof body.password !== 'string' || !body.email || !body.password) {
      throw new SuperConsoleHttpError('Email and password are required.', { status: 400, code: 'AUTH_CREDENTIALS_REQUIRED' });
    }
    const result = await this.options.auth.signIn({ email: body.email, password: body.password, request });
    return success({ session: sessionView(result.principal) }, requestId, result.headers);
  }

  private async signOut(request: Request, requestId: string): Promise<Response> {
    if (request.method !== 'POST') throw new SuperConsoleHttpError('Sign-out requires POST.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    if (!this.options.auth.signOut) throw new SuperConsoleHttpError('This deployment does not expose sign-out.', { status: 501, code: 'AUTH_SIGN_OUT_UNAVAILABLE' });
    const principal = await this.options.auth.authenticate(request);
    if (!principal) throw new SuperConsoleHttpError('Authentication is required.', { status: 401, code: 'AUTHENTICATION_REQUIRED' });
    await this.options.auth.authorizeMutation?.({ principal, request });
    const result = await this.options.auth.signOut({ principal, request });
    return success({ signedOut: true }, requestId, result.headers);
  }

  private async completeTwoFactor(request: Request, requestId: string): Promise<Response> {
    if (request.method !== 'POST') throw new SuperConsoleHttpError('Two-factor completion requires POST.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    if (!this.options.auth.completeTwoFactor) throw new SuperConsoleHttpError('This deployment does not expose two-factor sign-in.', { status: 501, code: 'AUTH_2FA_UNAVAILABLE' });
    const body = await request.json().catch(() => undefined) as { challengeId?: unknown; code?: unknown } | undefined;
    if (typeof body?.challengeId !== 'string' || typeof body.code !== 'string' || !body.challengeId || !body.code) {
      throw new SuperConsoleHttpError('challengeId and code are required.', { status: 400, code: 'AUTH_2FA_INPUT_REQUIRED' });
    }
    const result = await this.options.auth.completeTwoFactor({ challengeId: body.challengeId, code: body.code, request });
    return success({ session: sessionView(result.principal) }, requestId, result.headers);
  }

  private async operationDiscoverable(entry: AdminRegistryOperation, state: SuperConsoleRequestState): Promise<boolean> {
    if (!adminScopeSupportsOperation(state.context.scope, entry.manifest, entry.operation)) return false;
    const decision = await evaluateAdminDiscoveryPolicy(this.options.policy, entry, state.context);
    return decision.allowed;
  }

  private async permittedEntries(moduleId: string, state: SuperConsoleRequestState): Promise<AdminRegistryOperation[]> {
    const candidates = this.registry.operations.filter((entry) => entry.moduleId === moduleId);
    const decisions = await Promise.all(candidates.map((entry) => this.operationDiscoverable(entry, state)));
    return candidates.filter((_, index) => decisions[index]);
  }

  private async projectedManifest(manifest: AdminCapabilityManifest, state: SuperConsoleRequestState): Promise<AdminCapabilityManifest> {
    const operations = (await this.permittedEntries(manifest.id, state)).map((entry) => entry.operation);
    const visibleResources = new Set(operations.map((operation) => operation.target.resource));
    const healthVisible = !manifest.health?.operationId
      ? true
      : operations.some((operation) => operation.id === manifest.health?.operationId);
    return {
      ...manifest,
      operations,
      ...(manifest.resources ? { resources: manifest.resources.filter((resource) => visibleResources.has(resource.id)) } : {}),
      ...(manifest.health && healthVisible ? { health: manifest.health } : { health: undefined }),
      ...(manifest.navigation
        ? {
            navigation: (Array.isArray(manifest.navigation) ? manifest.navigation : [manifest.navigation])
              .filter((item) => !item.requiredPermission || this.hasPermission(state.principal.actor.permissions, item.requiredPermission)),
          }
        : {}),
    };
  }

  private async registryView(state: SuperConsoleRequestState) {
    const projected = await Promise.all(this.registry.manifests.map((manifest) => this.projectedManifest(manifest, state)));
    const visible = projected.filter((manifest) => {
      if (manifest.availability === 'nested') return false;
      return manifest.operations.length > 0 || projected.some((child) =>
        child.owner?.moduleId === manifest.id && child.operations.length > 0);
    });
    return {
      enabledModules: projected.filter((manifest) => manifest.operations.length > 0),
      // Nested products remain enabled for API/OpenAPI/MCP discovery, but only
      // their owner exposes them to the operator shell navigation model.
      modules: await Promise.all(visible.map((manifest) => this.moduleViewFor(manifest, state))),
      surfaces: await this.authorizedSurfaces(state),
      generatedAt: this.now().toISOString(),
      apiVersion: 'v1',
      session: sessionView(state.principal),
      context: contextView(state.principal, state.context.scope),
    };
  }

  private async moduleViewFor(manifest: AdminCapabilityManifest, state: SuperConsoleRequestState) {
    const projectedManifest = await this.projectedManifest(manifest, state);
    const projectedChildren = await Promise.all(this.registry.manifests
      .filter((candidate) => candidate.owner?.moduleId === manifest.id)
      .map((candidate) => this.projectedManifest(candidate, state)));
    const children = await Promise.all(projectedChildren
      .filter((candidate) => candidate.operations.length > 0)
      .map(async (candidate) => ({
        manifest: candidate,
        entries: await this.permittedEntries(candidate.id, state),
      })));
    return moduleView(
      projectedManifest,
      await this.permittedEntries(manifest.id, state),
      children,
    );
  }

  private async overviewView(state: SuperConsoleRequestState) {
    if (this.options.overview?.permission) this.requirePermission(state.principal, this.options.overview.permission);
    const supplied = await this.options.overview?.read({ context: state.context });
    return {
      metrics: supplied?.metrics ?? [
        { id: 'enabled-modules', label: 'Enabled modules', value: this.registry.enabledModuleIds.length },
        { id: 'admin-operations', label: 'Administration operations', value: this.registry.operations.length },
      ],
      alerts: (supplied?.alerts ?? []).map(sanitizeConsoleRecordHref),
      activity: supplied?.activity ?? [],
      health: supplied?.health ?? this.registry.manifests.map((manifest) => ({
        moduleId: manifest.id,
        moduleName: manifest.displayName,
        status: 'unknown',
        detail: manifest.health ? 'Health declared; no overview provider result was supplied.' : 'No health operation declared.',
      })),
      session: sessionView(state.principal),
      context: contextView(state.principal, state.context.scope),
    };
  }

  private async mcpView(state: SuperConsoleRequestState) {
    const decisions = await Promise.all(this.mcpTools.map((tool) => this.mcpMetadataVisible(tool.metadata, state.context)));
    const tools = this.mcpTools.filter((_, index) => decisions[index]);
    return {
      enabled: tools.length > 0,
      serverName: this.options.serverName ?? 'Super Console',
      transport: 'McpFn',
      endpoint: `${this.registry.apiBasePath}/mcp/transport`,
      tools: tools.map((tool) => {
        const metadata = tool.metadata?.['mcpfn/superconsole'] as Record<string, unknown> | undefined;
        return {
          name: tool.name,
          description: tool.description,
          moduleId: metadata?.moduleId,
          mutation: tool.annotations?.readOnlyHint === false,
          permission: metadata?.permission,
          annotations: tool.annotations,
        };
      }),
      clients: [],
    };
  }

  private async handleMcp(request: Request, identity: { requestId: string; correlationId?: string }): Promise<Response> {
    const state = await this.state(request, identity);
    await this.authorizeShell('mcp', state);
    if (await this.mcpRequestRequiresMutationAuthorization(request)) {
      await this.options.auth.authorizeMutation?.({ principal: state.principal, request });
    }
    this.mcpHandlerPromise ??= this.mcpServer.createWebStandardHandler({ enableJsonResponse: true });
    const handler = await this.mcpHandlerPromise;
    return handler(request, {
      authInfo: {
        token: `operator:${state.principal.actor.id}`,
        clientId: state.principal.actor.id,
        scopes: [...(state.principal.actor.permissions ?? [])],
        extra: { adminContext: state.context, adminPrincipal: state.principal },
      },
    });
  }

  private async mcpRequestRequiresMutationAuthorization(request: Request): Promise<boolean> {
    if (request.method === 'DELETE') return true;
    if (request.method !== 'POST') return false;
    const body = await request.clone().json().catch(() => undefined) as unknown;
    const messages = Array.isArray(body) ? body : [body];
    return messages.some((message) => {
      if (!message || typeof message !== 'object') return false;
      const candidate = message as { method?: unknown; params?: { name?: unknown } };
      if (candidate.method !== 'tools/call' || typeof candidate.params?.name !== 'string') return false;
      const tool = this.mcpTools.find((entry) => entry.name === candidate.params!.name);
      return tool?.annotations?.readOnlyHint === false;
    });
  }

  private mcpContext(extra: McpFnRequestExtra): AdminOperationContext {
    const context = extra.authInfo?.extra?.adminContext;
    if (!context || typeof context !== 'object') throw new AdminError('unauthenticated', 'Authenticated Super Console MCP context is required.');
    return context as AdminOperationContext;
  }

  private mcpToolVisible(tool: McpFnListedTool, context: AdminOperationContext): Promise<boolean> {
    return this.mcpMetadataVisible(tool._meta, context);
  }

  private async mcpMetadataVisible(metadata: Record<string, unknown> | undefined, context: AdminOperationContext): Promise<boolean> {
    const projected = metadata?.['mcpfn/superconsole'];
    if (!projected || typeof projected !== 'object') return false;
    const values = projected as { operationId?: unknown; permission?: unknown };
    if (values.operationId === 'superconsole.confirmations.issue') {
      const entries = this.registry.operations.filter((entry) => entry.operation.safety.requiresConfirmation);
      const decisions = await Promise.all(entries.map((entry) =>
        evaluateAdminDiscoveryPolicy(this.options.policy, entry, context)
          .then((decision) => decision.allowed && adminScopeSupportsOperation(context.scope, entry.manifest, entry.operation))));
      return decisions.some(Boolean);
    }
    if (typeof values.operationId !== 'string' || typeof values.permission !== 'string') return false;
    const entry = this.registry.getOperation(values.operationId);
    return Boolean(entry && await this.operationDiscoverable(entry, {
      principal: { actor: context.actor } as SuperConsolePrincipal,
      context,
    }));
  }

  private async search(request: Request, state: SuperConsoleRequestState) {
    await this.authorizeShell('search', state);
    if (!this.options.search) throw new SuperConsoleHttpError('The console search service is unavailable.', { status: 503, code: 'SEARCH_UNAVAILABLE' });
    this.requirePermission(state.principal, this.options.search.permission);
    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.trim() ?? '';
    if (!query) return { results: [], total: 0 };
    const result = await this.options.search.search({
      query,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: normalizeAdminPageLimit(url.searchParams.get('limit') ?? undefined, { defaultLimit: 25, maxLimit: 100 }),
      context: state.context,
    });
    return {
      ...result,
      results: result.results.flatMap((candidate) => {
        const href = safeConsoleHref(candidate.href);
        return href ? [{ ...candidate, href }] : [];
      }),
    };
  }

  private async audit(request: Request, state: SuperConsoleRequestState) {
    await this.authorizeShell('audit', state);
    const url = new URL(request.url);
    const filters = Object.fromEntries(['actor', 'module', 'outcome', 'q'].flatMap((name) => {
      const value = url.searchParams.get(name);
      return value ? [[name, value] as const] : [];
    }));
    const limit = normalizeAdminPageLimit(url.searchParams.get('limit') ?? undefined, { defaultLimit: 50, maxLimit: 200 });
    if (this.options.auditQuery) {
      this.requirePermission(state.principal, this.options.auditQuery.permission);
      return this.options.auditQuery.list({ cursor: url.searchParams.get('cursor') ?? undefined, limit, filters, context: state.context });
    }
    throw new SuperConsoleHttpError('The audit query service is unavailable.', { status: 503, code: 'AUDIT_UNAVAILABLE' });
  }

  private async settings(state: SuperConsoleRequestState) {
    if (this.options.settings?.permission) this.requirePermission(state.principal, this.options.settings.permission);
    const supplied = await this.options.settings?.read({ context: state.context });
    return {
      deploymentMode: 'self-hosted',
      configurationSource: 'explicit deploy-time module registration',
      tenantHierarchy: ['installation', 'workspace', 'project', 'environment'],
      policies: supplied?.policies ?? [],
      retention: supplied?.retention ?? [],
      enabledModules: this.registry.enabledModuleIds,
    };
  }

  private async updatePolicy(request: Request, policyId: string, state: SuperConsoleRequestState): Promise<Response> {
    const operationId = this.options.settings?.updatePolicyOperationId;
    if (!operationId) throw new SuperConsoleHttpError('No function-owned mutable settings operation is configured.', { status: 404, code: 'POLICY_NOT_MUTABLE' });
    const body = await request.json().catch(() => undefined) as { enabled?: unknown } | undefined;
    if (typeof body?.enabled !== 'boolean') throw new SuperConsoleHttpError('Policy enabled must be boolean.', { status: 400, code: 'INVALID_POLICY_UPDATE' });
    return resultResponse(await this.dispatcher.dispatch({ operationId, input: { id: policyId, payload: { enabled: body.enabled } }, context: state.context }));
  }

  private async invokeOperation(request: Request, operationId: string, state: SuperConsoleRequestState): Promise<Response> {
    const entry = this.registry.requireOperation(operationId);
    if (!(await this.operationDiscoverable(entry, state))) {
      throw new SuperConsoleHttpError('The requested administration operation is unavailable.', { status: 404, code: 'OPERATION_NOT_ENABLED' });
    }
    const text = await request.text();
    let body: unknown = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new SuperConsoleHttpError('The request body must be valid JSON.', { status: 400, code: 'INVALID_JSON' });
      }
    }
    return resultResponse(await this.dispatcher.dispatch({ operationId, input: body, context: state.context }));
  }

  private async issueConfirmation(request: Request, state: SuperConsoleRequestState): Promise<Response> {
    if (!this.options.confirmation) throw new SuperConsoleHttpError('Confirmation issuance is unavailable.', { status: 503, code: 'CONFIRMATION_UNAVAILABLE' });
    const body = await request.json().catch(() => undefined) as { operationId?: unknown; input?: unknown } | undefined;
    if (typeof body?.operationId !== 'string') throw new SuperConsoleHttpError('operationId is required.', { status: 400, code: 'CONFIRMATION_OPERATION_REQUIRED' });
    return success(await this.confirmOperation(body.operationId, body.input ?? {}, state), state.context.requestId, undefined, 201);
  }

  private async confirmOperation(operationId: string, input: unknown, state: SuperConsoleRequestState) {
    const started = this.now();
    if (!this.options.audit) {
      throw new SuperConsoleHttpError('Confirmation issuance requires an administration audit sink.', { status: 503, code: 'AUDIT_UNAVAILABLE' });
    }
    let entry: AdminRegistryOperation;
    let immutable: { input: unknown; state: SuperConsoleRequestState };
    try {
      entry = this.registry.requireOperation(operationId);
      if (!(await this.operationDiscoverable(entry, state))) {
        throw new AdminError('not_found', 'The requested confirmation operation is unavailable.');
      }
      if (!entry.operation.safety.requiresConfirmation) throw new SuperConsoleHttpError('This operation does not require a confirmation token.', { status: 400, code: 'CONFIRMATION_NOT_REQUIRED' });
      const schema = entry.operation.inputSchema;
      if (!schema) throw new SuperConsoleHttpError('The operation has no input schema.', { status: 500, code: 'OPERATION_SCHEMA_MISSING' });
      assertAdminValue(schema, input);
      immutable = immutableConfirmationState(input, state);
    } catch (error) {
      await this.auditConfirmation(undefined, operationId, undefined, state.context, 'denied', started, normalizeAdminError(error).error.code);
      throw error;
    }
    try {
      await this.auditConfirmation(entry, operationId, immutable.input, immutable.state.context, 'attempted', started);
    } catch {
      throw new SuperConsoleHttpError('The confirmation attempt could not be audited.', { status: 503, code: 'AUDIT_UNAVAILABLE', details: { retryable: true } });
    }
    let receipt: { token: string; expiresAt: string };
    try {
      receipt = await this.performConfirmOperation(entry, immutable.input, immutable.state);
    } catch (error) {
      await this.auditConfirmation(entry, operationId, immutable.input, immutable.state.context, 'denied', started, normalizeAdminError(error).error.code);
      throw error;
    }
    const confirmation = this.options.confirmation;
    if (!confirmation) throw new SuperConsoleHttpError('Confirmation issuance is unavailable.', { status: 503, code: 'CONFIRMATION_UNAVAILABLE' });
    const successAuditId = `audit_${crypto.randomUUID()}`;
    try {
      await confirmation.prepareActivation({
        token: receipt.token,
        auditId: successAuditId,
        operationId,
        input: immutable.input,
        principal: immutable.state.principal,
        context: immutable.state.context,
      });
    } catch {
      try {
        await confirmation.revoke({
          token: receipt.token,
          operationId,
          input: immutable.input,
          principal: immutable.state.principal,
          context: immutable.state.context,
        });
      } catch {
        // The token remains staged and unusable when activation preparation fails.
      }
      try {
        await this.auditConfirmation(entry, operationId, immutable.input, immutable.state.context, 'denied', started, 'CONFIRMATION_ACTIVATION_PREPARE_FAILED');
      } catch {
        throw new SuperConsoleHttpError('The confirmation activation preparation failure could not be audited.', { status: 503, code: 'AUDIT_UNAVAILABLE', details: { retryable: true } });
      }
      throw new SuperConsoleHttpError('The confirmation token could not be prepared for activation.', { status: 503, code: 'CONFIRMATION_ACTIVATION_FAILED', details: { retryable: true } });
    }
    try {
      await this.auditConfirmation(entry, operationId, immutable.input, immutable.state.context, 'succeeded', started, undefined, successAuditId);
    } catch {
      try {
        await confirmation.revoke({
          token: receipt.token,
          operationId,
          input: immutable.input,
          principal: immutable.state.principal,
          context: immutable.state.context,
        });
      } catch {
        // The token is still staged and unusable because activation has not run.
      }
      throw new SuperConsoleHttpError('The confirmation issuance could not be audited.', { status: 503, code: 'AUDIT_UNAVAILABLE', details: { retryable: true } });
    }
    try {
      await confirmation.activate({
        token: receipt.token,
        auditId: successAuditId,
        operationId,
        input: immutable.input,
        principal: immutable.state.principal,
        context: immutable.state.context,
      });
    } catch (error) {
      const denialAuditId = `audit_${crypto.randomUUID()}`;
      let cancellationDurable = false;
      try {
        await confirmation.cancelActivation({
          token: receipt.token,
          auditId: successAuditId,
          denialAuditId,
          operationId,
          input: immutable.input,
          principal: immutable.state.principal,
          context: immutable.state.context,
        });
        cancellationDurable = true;
      } catch {
        // A durable revoke below is an equivalent cancellation fence.
      }
      try {
        await confirmation.revoke({
          token: receipt.token,
          operationId,
          input: immutable.input,
          principal: immutable.state.principal,
          context: immutable.state.context,
        });
        cancellationDurable = true;
      } catch {
        // The explicit cancellation record, when present, remains authoritative.
      }
      if (!cancellationDurable) {
        throw new SuperConsoleHttpError('The confirmation activation failure could not be durably cancelled.', { status: 503, code: 'CONFIRMATION_ACTIVATION_FAILED', details: { retryable: true } });
      }
      try {
        await this.auditConfirmation(
          entry,
          operationId,
          immutable.input,
          immutable.state.context,
          'denied',
          started,
          'CONFIRMATION_ACTIVATION_FAILED',
          denialAuditId,
        );
      } catch {
        throw new SuperConsoleHttpError('The confirmation activation failure could not be audited.', { status: 503, code: 'AUDIT_UNAVAILABLE', details: { retryable: true } });
      }
      throw new SuperConsoleHttpError('The confirmation token could not be activated.', { status: 503, code: 'CONFIRMATION_ACTIVATION_FAILED', details: { retryable: true } });
    }
    return receipt;
  }

  private async performConfirmOperation(entry: AdminRegistryOperation, input: unknown, state: SuperConsoleRequestState) {
    if (!this.options.confirmation) throw new SuperConsoleHttpError('Confirmation issuance is unavailable.', { status: 503, code: 'CONFIRMATION_UNAVAILABLE' });
    const permission = entry.operation.permission;
    this.requirePermission(state.principal, permission);
    if (this.options.policy) {
      const decision = await this.options.policy.authorize({ entry, input, context: state.context });
      if (!decision.allowed) throw new SuperConsoleHttpError(decision.reason ?? 'The confirmation policy denied this operation.', { status: 403, code: 'CONFIRMATION_DENIED' });
    }
    const issued = await this.options.confirmation.issue({
      operationId: entry.operation.id,
      input,
      principal: state.principal,
      context: state.context,
    });
    if (!issued.token || Number.isNaN(new Date(issued.expiresAt).valueOf())) throw new SuperConsoleHttpError('The confirmation service returned an invalid token receipt.', { status: 503, code: 'CONFIRMATION_ISSUE_FAILED' });
    return issued;
  }

  private async auditConfirmation(
    entry: AdminRegistryOperation | undefined,
    confirmedOperationId: string,
    confirmedInput: unknown,
    context: AdminOperationContext,
    outcome: 'attempted' | 'succeeded' | 'denied',
    started: Date,
    errorCode?: string,
    auditId?: string,
  ): Promise<void> {
    if (!this.options.audit) return;
    const safeInput = entry
      ? redactAdminValue(confirmedInput, entry.operation.redaction?.inputFields ?? [])
      : undefined;
    let target:
      | { resource: string; collection: true }
      | { resource: string; collection?: false; idInput: string; targetId: unknown }
      | undefined;
    if (!entry) {
      target = undefined;
    } else if (entry.operation.target.collection === true) {
      target = { resource: entry.operation.target.resource, collection: true };
    } else {
      const { resource, idInput } = entry.operation.target;
      target = {
        resource,
        idInput,
        targetId: safeInput && typeof safeInput === 'object' && !Array.isArray(safeInput)
          ? (safeInput as Record<string, unknown>)[idInput]
          : undefined,
      };
    }
    await this.options.audit.write({
      id: auditId ?? `audit_${crypto.randomUUID()}`,
      timestamp: this.now().toISOString(),
      actorId: context.actor.id,
      actorType: context.actor.type,
      scope: context.scope,
      moduleId: 'superconsole',
      operationId: 'superconsole.confirmations.issue',
      classification: 'write',
      permission: 'superconsole.confirmations.issue',
      source: context.source,
      requestId: context.requestId,
      correlationId: context.correlationId,
      target: target?.collection === true
        ? { resource: target.resource, collection: true }
        : target
          ? {
              resource: target.resource,
              idInput: target.idInput,
              ...(typeof target.targetId === 'string' || typeof target.targetId === 'number' ? { id: target.targetId } : {}),
            }
          : { resource: 'unknown', collection: true },
      input: {
        operationId: confirmedOperationId,
        ...(target ? { target } : {}),
        ...(entry ? { input: safeInput } : {}),
      },
      outcome,
      ...(errorCode ? { errorCode } : {}),
      durationMs: Math.max(0, this.now().getTime() - started.getTime()),
      metadata: { tokenRecorded: false, inputRecorded: Boolean(entry), targetRecorded: Boolean(target) },
    });
  }

  private confirmationMcpTool(): McpFnToolDefinition<AdminOperationContext> {
    return {
      name: 'superconsole_confirm_operation',
      title: 'Confirm a Super Console operation',
      description: 'Issue an expiring actor/scope/operation/input-bound confirmation token without executing the domain mutation.',
      inputSchema: {
        type: 'object',
        properties: {
          operationId: { type: 'string', minLength: 1 },
          input: { type: 'object' },
        },
        required: ['operationId', 'input'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 1 },
          expiresAt: { type: 'string', format: 'date-time' },
        },
        required: ['token', 'expiresAt'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      metadata: { 'mcpfn/superconsole': { moduleId: 'superconsole', operationId: 'superconsole.confirmations.issue', safety: { classification: 'write', idempotent: false, audit: 'required' } } },
      handler: async (args, context, extra) => {
        const principal = extra.authInfo?.extra?.adminPrincipal;
        if (!principal || typeof principal !== 'object') throw new AdminError('unauthenticated', 'Authenticated Super Console MCP principal is required.');
        const receipt = await this.confirmOperation(String(args.operationId ?? ''), args.input ?? {}, {
          principal: principal as SuperConsolePrincipal,
          context: { ...context, source: 'mcp' },
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(receipt) }],
          structuredContent: receipt,
        };
      },
    };
  }

  private async moduleRequest(request: Request, relative: string, state: SuperConsoleRequestState): Promise<Response> {
    const [, encodedModuleId, ...rest] = relative.split('/');
    const moduleId = decodeURIComponent(encodedModuleId ?? '');
    if (!this.registry.hasModule(moduleId)) throw new SuperConsoleHttpError(`${moduleId || 'The requested module'} is not enabled.`, { status: 404, code: 'MODULE_NOT_ENABLED' });
    if (rest.length === 0 && (request.method === 'GET' || request.method === 'HEAD')) {
      await this.authorizeShell('registry', state);
      const manifest = this.registry.requireManifest(moduleId);
      const view = await this.moduleViewFor(manifest, state);
      if (view.capabilities.length === 0) {
        throw new SuperConsoleHttpError('No module capabilities are visible to the active operator.', { status: 404, code: 'MODULE_NOT_ENABLED' });
      }
      return this.headAware(request, success({
        module: view,
        summary: [
          { id: 'resources', label: 'Resources', value: view.resources.length },
          { id: 'operations', label: 'Operations', value: view.capabilities.length },
        ],
        notices: [],
      }, state.context.requestId));
    }

    const url = new URL(request.url);
    let matchedPath = url.pathname;
    const resourceAliasPath = rest[0] !== 'resources'
      ? `${this.registry.apiBasePath}/modules/${encodeURIComponent(moduleId)}/resources/${rest.join('/')}`
      : undefined;
    const routeMethod = request.method === 'HEAD' ? 'GET' : request.method;
    let entry = this.registry.matchRoute(routeMethod, matchedPath);
    if (!entry && resourceAliasPath) {
      entry = this.registry.matchRoute(routeMethod, resourceAliasPath);
      if (entry) matchedPath = resourceAliasPath;
    }
    if (!entry) {
      const methodExists = this.registry.operations.some((candidate) => candidate.moduleId === moduleId &&
        [matchedPath, resourceAliasPath].filter((path): path is string => Boolean(path)).some((path) =>
          this.registry.matchRoute(routeDefinition(candidate.operation).method, path)?.operation.id === candidate.operation.id));
      if (methodExists) throw new SuperConsoleHttpError('This module operation does not support the requested method.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    }
    if (!entry || entry.moduleId !== moduleId) throw new SuperConsoleHttpError('The requested module operation is not enabled.', { status: 404, code: 'OPERATION_NOT_ENABLED' });
    if (!(await this.operationDiscoverable(entry, state))) {
      throw new SuperConsoleHttpError('The requested module operation is not enabled.', { status: 404, code: 'OPERATION_NOT_ENABLED' });
    }
    if (entry.operation.safety.classification !== 'read' && READ_METHODS.has(request.method)) {
      await this.options.auth.authorizeMutation?.({ principal: state.principal, request });
    }
    const input = await operationInput(request, entry, matchedPath);
    const dispatched = await this.dispatcher.dispatch({ operationId: entry.operation.id, input, context: state.context });
    return this.headAware(request, resultResponse(dispatched));
  }

  private requirePermission(principal: SuperConsolePrincipal, permission: string): void {
    if (!this.hasPermission(principal.actor.permissions, permission)) {
      throw new SuperConsoleHttpError('The active operator lacks the required permission.', { status: 403, code: 'PERMISSION_DENIED' });
    }
  }

  private hasPermission(permissions: readonly string[] | undefined, permission: string): boolean {
    return Boolean(permissions?.includes('*') || permissions?.includes(permission));
  }

  private async authorizeShell(surface: 'registry' | 'overview' | 'api' | 'mcp' | 'settings' | 'audit' | 'search', state: SuperConsoleRequestState): Promise<void> {
    if (!(await this.options.shellPolicy.authorize({ surface, principal: state.principal, context: state.context }))) {
      throw new SuperConsoleHttpError('The active operator cannot access this administration surface.', { status: 403, code: 'PERMISSION_DENIED' });
    }
  }

  private async authorizedSurfaces(state: SuperConsoleRequestState) {
    const policy = async (surface: 'overview' | 'api' | 'mcp' | 'settings' | 'audit' | 'search') =>
      this.options.shellPolicy.authorize({ surface, principal: state.principal, context: state.context });
    const hasPermission = (permission?: string) => !permission
      || state.principal.actor.permissions?.includes('*')
      || state.principal.actor.permissions?.includes(permission)
      || false;
    const [overview, api, mcp, settings, audit, search, toolVisibility] = await Promise.all([
      policy('overview'),
      policy('api'),
      policy('mcp'),
      policy('settings'),
      policy('audit'),
      policy('search'),
      Promise.all(this.mcpTools.map((tool) => this.mcpMetadataVisible(tool.metadata, state.context))),
    ]);
    return {
      overview: Boolean(overview) && hasPermission(this.options.overview?.permission),
      api: Boolean(api),
      mcp: Boolean(mcp) && toolVisibility.some(Boolean),
      settings: Boolean(settings) && hasPermission(this.options.settings?.permission),
      audit: Boolean(audit) && Boolean(this.options.auditQuery) && hasPermission(this.options.auditQuery?.permission),
      search: Boolean(search) && Boolean(this.options.search) && hasPermission(this.options.search?.permission),
    };
  }

  private buildOpenApi() {
    const document = createAdminOpenApiDocument(this.registry, {
      title: `${this.options.serverName ?? 'Super Console'} Administration API`,
      version: '1.0.0',
      description: 'Self-hosted operator administration powered by enabled Superfunctions.',
      securitySchemes: this.options.openApiSecuritySchemes,
      csrfHeader: this.options.openApiCsrfHeader,
    });
    const authenticated = [{ operatorSession: [] }, { operatorApiKey: [] }];
    const scopeParameters = () => adminOpenApiScopeParameters();
    const jsonBody = (schema: Record<string, unknown>) => ({
      required: true,
      content: { 'application/json': { schema } },
    });
    const envelope = (data: Record<string, unknown>) => ({
      type: 'object',
      properties: {
        ok: { type: 'boolean', const: true },
        data,
        requestId: { type: 'string' },
        correlationId: { type: 'string' },
        auditId: { type: 'string' },
        page: { type: 'object', properties: { nextCursor: { type: ['string', 'null'] }, hasMore: { type: 'boolean' } }, additionalProperties: false },
        warnings: { type: 'array', items: { type: 'string' } },
        meta: { type: 'object', additionalProperties: true },
      },
      required: ['ok', 'data'],
    });
    const errorResponse = (description: string) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminError' } } } });
    const jsonResponse = (description: string, data: Record<string, unknown>) => ({
      description,
      content: { 'application/json': { schema: envelope(data) } },
    });
    const stringQuery = (name: string, required = false) => ({ name, in: 'query', required, schema: { type: 'string' } });
    const pageQueries = [stringQuery('cursor'), { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200 } }];
    const csrfParameters = this.options.openApiCsrfHeader ? [{
      name: this.options.openApiCsrfHeader.name,
      in: 'header',
      required: false,
      description: this.options.openApiCsrfHeader.description
        ?? "Required for unsafe requests authenticated by the provider's cookie session.",
      schema: { type: 'string', minLength: 1 },
    }] : [];
    const sessionSchema = {
      type: 'object',
      properties: { userId: { type: 'string' }, displayName: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } }, csrfCookieName: { type: 'string', description: 'Exact non-HttpOnly operator-auth CSRF cookie name selected for this runtime request.' }, csrfHeaderName: { type: 'string', description: 'Exact operator-auth CSRF request header selected for this runtime request.' } },
      required: ['userId', 'displayName', 'role', 'permissions'],
    };
    Object.assign(document.paths, {
      [`${this.registry.apiBasePath}/registry`]: { get: { operationId: 'superconsole.registry.get', summary: 'Discover enabled modules', security: authenticated, parameters: scopeParameters(), responses: { '200': jsonResponse('Enabled registry', { type: 'object', properties: { enabledModules: { type: 'array', items: { type: 'object' } }, modules: { type: 'array', items: { type: 'object' } }, surfaces: { type: 'object' } }, required: ['enabledModules', 'modules', 'surfaces'] }) } } },
      [`${this.registry.apiBasePath}/overview`]: { get: { operationId: 'superconsole.overview.get', summary: 'Read operator overview', security: authenticated, parameters: scopeParameters(), responses: { '200': jsonResponse('Overview', { type: 'object' }) } } },
      [`${this.registry.apiBasePath}/search`]: { get: { operationId: 'superconsole.search.query', summary: 'Search administration resources', security: authenticated, parameters: [stringQuery('q', true), ...pageQueries, ...scopeParameters()], responses: { '200': jsonResponse('Search results', { type: 'object', properties: { results: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' }, nextCursor: { type: 'string' } }, required: ['results'] }) } } },
      [`${this.registry.apiBasePath}/audit`]: { get: { operationId: 'superconsole.audit.list', summary: 'Query the audit stream', security: authenticated, parameters: [...pageQueries, ...['actor', 'module', 'outcome', 'q'].map((name) => stringQuery(name)), ...scopeParameters()], responses: { '200': jsonResponse('Audit events', { type: 'object', properties: { events: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' }, nextCursor: { type: 'string' } }, required: ['events'] }) } } },
      [`${this.registry.apiBasePath}/settings`]: { get: { operationId: 'superconsole.settings.get', summary: 'Read deployment settings', security: authenticated, parameters: scopeParameters(), responses: { '200': jsonResponse('Settings', { type: 'object' }) } } },
      [`${this.registry.apiBasePath}/mcp`]: { get: { operationId: 'superconsole.mcp.get', summary: 'Read McpFn tool metadata', security: authenticated, parameters: scopeParameters(), responses: { '200': jsonResponse('MCP metadata', { type: 'object', properties: { endpoint: { type: 'string' }, tools: { type: 'array', items: { type: 'object' } } }, required: ['endpoint', 'tools'] }) } } },
      [`${this.registry.apiBasePath}/mcp/transport`]: {
        post: { operationId: 'superconsole.mcp.transport', summary: 'Authenticated McpFn streamable HTTP transport', security: authenticated, parameters: [...csrfParameters, ...scopeParameters()], requestBody: jsonBody({ oneOf: [{ type: 'object' }, { type: 'array', items: { type: 'object' }, minItems: 1 }], description: 'MCP JSON-RPC request or batch.' }), responses: { '200': { description: 'MCP JSON-RPC response', content: { 'application/json': { schema: { type: 'object' } }, 'text/event-stream': { schema: { type: 'string' } } } } } },
        delete: { operationId: 'superconsole.mcp.disconnect', summary: 'Disconnect an authenticated McpFn session', security: authenticated, parameters: [...csrfParameters, ...scopeParameters()], responses: { '200': { description: 'MCP session disconnected.' } } },
      },
      [`${this.registry.apiBasePath}/confirmations`]: { post: { operationId: 'superconsole.confirmations.issue', summary: 'Issue an actor/scope/operation/input-bound confirmation token', security: authenticated, parameters: [...csrfParameters, ...scopeParameters()], requestBody: jsonBody({ type: 'object', properties: { operationId: { type: 'string' }, input: { type: 'object' } }, required: ['operationId', 'input'], additionalProperties: false }), responses: { '201': jsonResponse('Confirmation receipt', { type: 'object', properties: { token: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' } }, required: ['token', 'expiresAt'] }) } } },
      [`${this.registry.apiBasePath}/settings/policies/{policyId}`]: { patch: { operationId: 'superconsole.settings.policies.update', summary: 'Update a deployment policy through its configured function operation', security: authenticated, parameters: [{ name: 'policyId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 1 } }, ...csrfParameters, ...scopeParameters()], requestBody: jsonBody({ type: 'object', additionalProperties: true }), responses: { '200': jsonResponse('Updated deployment policy', { type: 'object', additionalProperties: true }), '4XX': errorResponse('Policy update rejected'), '5XX': errorResponse('Policy dependency or server failure') } } },
      [`${this.registry.apiBasePath}/operations/{operationId}`]: { post: { operationId: 'superconsole.operations.invoke', summary: 'Invoke one enabled operation by ID', security: authenticated, parameters: [{ name: 'operationId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string', minLength: 1 } }, { name: 'X-Admin-Confirmation', in: 'header', required: false, schema: { type: 'string', minLength: 1 } }, ...csrfParameters, ...scopeParameters()], requestBody: jsonBody({ type: 'object', additionalProperties: true }), responses: { '200': jsonResponse('Administration operation envelope', {}), '4XX': errorResponse('Administration request rejected'), '5XX': errorResponse('Administration dependency or server failure') } } },
      [`${this.registry.apiBasePath}/auth/sign-in`]: { post: { operationId: 'superconsole.auth.signIn', summary: 'Sign in through the configured operator-auth provider', security: [], requestBody: jsonBody({ type: 'object', properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } }, required: ['email', 'password'], additionalProperties: false }), responses: { '200': jsonResponse('Operator session', { type: 'object', properties: { session: sessionSchema }, required: ['session'] }), '401': { description: 'Invalid credentials or two-factor challenge' } } } },
      [`${this.registry.apiBasePath}/auth/2fa`]: { post: { operationId: 'superconsole.auth.completeTwoFactor', summary: 'Complete a provider-defined two-factor sign-in challenge', security: [], requestBody: jsonBody({ type: 'object', properties: { challengeId: { type: 'string' }, code: { type: 'string' } }, required: ['challengeId', 'code'], additionalProperties: false }), responses: { '200': jsonResponse('Operator session', { type: 'object', properties: { session: sessionSchema }, required: ['session'] }) } } },
      [`${this.registry.apiBasePath}/auth/sign-out`]: { post: { operationId: 'superconsole.auth.signOut', summary: 'Sign out through the configured operator-auth provider', security: authenticated, parameters: [...csrfParameters, ...scopeParameters()], responses: { '200': jsonResponse('Session revoked', { type: 'object', properties: { signedOut: { type: 'boolean', const: true } }, required: ['signedOut'] }) } } },
    });
    return document;
  }
}

export function createSuperConsole(options: SuperConsoleOptions): SuperConsole {
  return new SuperConsole(options);
}
