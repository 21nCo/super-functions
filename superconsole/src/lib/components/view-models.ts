import type { AdminJsonPrimitive, AdminJsonSchema, AdminResourcePresentation } from '@superfunctions/admin';

export type AdminStateKind =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'forbidden'
  | 'not-found';

export type HealthTone = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type ResourceTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface AdminErrorViewModel {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  correlationId?: string;
  auditId?: string;
  details?: Record<string, unknown>;
  meta?: Readonly<Record<string, unknown>>;
}

export interface OperatorSessionViewModel {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  permissions?: string[];
  csrfCookieName?: string;
  csrfHeaderName?: string;
}

export interface ContextOptionViewModel {
  id: string;
  name: string;
  slug?: string;
}

export interface OperatorContextViewModel {
  organization?: ContextOptionViewModel;
  workspace?: ContextOptionViewModel;
  project?: ContextOptionViewModel;
  environment?: ContextOptionViewModel;
  organizations?: ContextOptionViewModel[];
  workspaces?: ContextOptionViewModel[];
  projects?: ContextOptionViewModel[];
  environments?: ContextOptionViewModel[];
}

export interface AdminActionViewModel {
  id: string;
  label: string;
  description?: string;
  input?: Record<string, unknown>;
  inputSchema?: AdminJsonSchema;
  targetIdInput?: string;
  sourceModuleId?: string;
  foldedIntoModuleId?: string;
  href?: string;
  apiHref?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  tone?: 'default' | 'danger';
  requiresConfirmation?: boolean;
  disabled?: boolean;
  permission?: string;
}

export interface AdminResourceViewModel {
  id: string;
  resourceId?: string;
  idField?: string;
  sourceModuleId?: string;
  foldedIntoModuleId?: string;
  label: string;
  pluralLabel?: string;
  description?: string;
  href: string;
  apiHref?: string;
  listApiHref?: string;
  listInputSchema?: AdminJsonSchema;
  detailApiHref?: string;
  detailIdInput?: string;
  detailInputSchema?: AdminJsonSchema;
  listable?: boolean;
  standaloneList?: boolean;
  presentation?: AdminResourcePresentation;
  count?: number;
  createAction?: AdminActionViewModel;
  actions?: AdminActionViewModel[];
}

export interface AdminModuleViewModel {
  id: string;
  name: string;
  description: string;
  href: string;
  group?: string;
  enabled: boolean;
  visibleInNavigation?: boolean;
  parentModuleId?: string;
  foldedModuleIds?: string[];
  health?: HealthTone;
  healthLabel?: string;
  version?: string;
  capabilities?: string[];
  resources?: AdminResourceViewModel[];
  actions?: AdminActionViewModel[];
}

export interface RegistryViewModel {
  modules: AdminModuleViewModel[];
  surfaces?: {
    overview: boolean;
    search: boolean;
    audit: boolean;
    settings: boolean;
    api: boolean;
    mcp: boolean;
  };
  generatedAt?: string;
  apiVersion?: string;
}

export interface AlertViewModel {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'warning' | 'critical';
  href?: string;
  occurredAt?: string;
  source?: string;
}

export interface MetricViewModel {
  id: string;
  label: string;
  value: string | number;
  detail?: string;
  trend?: string;
  tone?: ResourceTone;
}

export interface ActivityViewModel {
  id: string;
  actor: string;
  action: string;
  target: string;
  occurredAt: string;
  moduleId?: string;
  outcome?: 'success' | 'failure' | 'pending';
}

export interface OverviewViewModel {
  metrics: MetricViewModel[];
  alerts: AlertViewModel[];
  activity: ActivityViewModel[];
  health: Array<{
    moduleId: string;
    moduleName: string;
    status: HealthTone;
    detail?: string;
    checkedAt?: string;
  }>;
}

export interface ShellViewModel {
  session?: OperatorSessionViewModel;
  context: OperatorContextViewModel;
  registry: RegistryViewModel;
  overview: OverviewViewModel;
  error?: AdminErrorViewModel;
  overviewError?: AdminErrorViewModel;
}

export type ShellSurface = keyof NonNullable<RegistryViewModel['surfaces']>;

export function shellSurfaceEnabled(registry: RegistryViewModel, surface: ShellSurface): boolean {
  if (registry.surfaces) return registry.surfaces[surface] === true;
  // Older embedded registries did not project optional shell services.
  return surface === 'overview';
}

export interface ResourceColumnViewModel {
  key: string;
  label: string;
  format?: 'text' | 'status' | 'datetime' | 'number' | 'code';
}

export interface ResourceRowViewModel {
  id: string;
  href?: string;
  values: Record<string, unknown>;
  actions?: AdminActionViewModel[];
}

export interface ResourceListViewModel {
  module: AdminModuleViewModel;
  resource: AdminResourceViewModel;
  columns: ResourceColumnViewModel[];
  rows: ResourceRowViewModel[];
  total?: number;
  nextCursor?: string;
  searchEnabled?: boolean;
  filters?: Array<{
    field: string;
    label: string;
    value: string;
    options?: readonly AdminJsonPrimitive[];
  }>;
  error?: AdminErrorViewModel;
}

export interface RelatedResourceViewModel {
  resourceId: string;
  label: string;
  description?: string;
  href: string;
}

export interface ResourceDetailViewModel {
  module: AdminModuleViewModel;
  resource: AdminResourceViewModel;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  fields: Array<{ label: string; value: unknown; format?: ResourceColumnViewModel['format'] }>;
  actions?: AdminActionViewModel[];
  related?: RelatedResourceViewModel[];
  audit?: ActivityViewModel[];
  error?: AdminErrorViewModel;
}

export interface AuditEventViewModel extends ActivityViewModel {
  requestId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_ADMIN_FIELD = /(?:password|passwd|secret|token|credential|authorization|cookie|csrf|private[-_]?key|api[-_]?key|otp|salt|hash|^value$)/i;

export function isAdminRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDisplayScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function adminFieldLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function adminFieldFormat(key: string, value: unknown): ResourceColumnViewModel['format'] {
  if (/(?:status|state|outcome|health)$/i.test(key)) return 'status';
  if (/(?:at|date|timestamp|time)$/i.test(key) && typeof value === 'string') return 'datetime';
  if (typeof value === 'number') return 'number';
  if (/(?:^id$|id$|key$|ref$|slug$)/i.test(key)) return 'code';
  return 'text';
}

function safeScalarEntries(record: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(record).filter(
    ([key, value]) => !SENSITIVE_ADMIN_FIELD.test(key) && isDisplayScalar(value)
  );
}

export function readAdminPresentationField(record: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((value, segment) =>
    isAdminRecord(value) ? value[segment] : undefined, record);
}

/** Infer a compact, scalar-only table shape from the canonical `{ items }` contract. */
export function inferAdminResourceColumns(items: readonly unknown[]): ResourceColumnViewModel[] {
  const keys: string[] = [];
  for (const item of items) {
    if (!isAdminRecord(item)) continue;
    const values = isAdminRecord(item.values) ? item.values : item;
    for (const [key] of safeScalarEntries(values)) {
      if (!keys.includes(key)) keys.push(key);
      if (keys.length >= 8) break;
    }
    if (keys.length >= 8) break;
  }
  return keys.map((key) => {
    const sample = items
      .filter(isAdminRecord)
      .map((item) => isAdminRecord(item.values) ? item.values[key] : item[key])
      .find((value) => value !== null && value !== undefined);
    return { key, label: adminFieldLabel(key), format: adminFieldFormat(key, sample) };
  });
}

function adminItemId(
  item: Record<string, unknown>,
  resourceId: string,
  idField?: string
): string | undefined {
  const singular = resourceId.endsWith('ies')
    ? `${resourceId.slice(0, -3)}y`
    : resourceId.endsWith('s')
      ? resourceId.slice(0, -1)
      : resourceId;
  for (const key of [...new Set([idField, 'id', `${singular}Id`, 'runId', 'key', 'slug'].filter(Boolean))] as string[]) {
    const value = item[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function detailInputForRow(
  item: Record<string, unknown>,
  source: Record<string, unknown>,
  resource: AdminResourceViewModel,
  identity: string
): Record<string, unknown> | undefined {
  if (!resource.detailApiHref) return undefined;
  const idInput = resource.detailIdInput ?? 'id';
  const input: Record<string, unknown> = { [idInput]: identity };
  const required = resource.detailInputSchema?.type === 'object'
    ? resource.detailInputSchema.required ?? []
    : [];
  for (const key of required) {
    if (key === idInput) continue;
    const value = source[key] ?? item[key];
    if (value === undefined || value === null || value === '') return undefined;
    input[key] = value;
  }
  return input;
}

function detailHref(
  href: string,
  input: Record<string, unknown>,
  idInput: string
): string {
  const url = new URL(`${href}/${encodeURIComponent(String(input[idInput]))}`, 'http://superconsole.local');
  for (const [key, value] of Object.entries(input)) {
    if (key === idInput) continue;
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Normalize canonical admin items while retaining explicitly supplied row metadata. */
export function normalizeAdminResourceRows(
  items: readonly unknown[],
  columns: readonly ResourceColumnViewModel[],
  resource: AdminResourceViewModel
): ResourceRowViewModel[] {
  return items.flatMap((item, index) => {
    if (!isAdminRecord(item)) return [];
    const explicitValues = isAdminRecord(item.values) ? item.values : undefined;
    const source = explicitValues ?? item;
    const identity = adminItemId(item, resource.id, resource.idField)
      ?? adminItemId(source, resource.id, resource.idField);
    const values = Object.fromEntries(columns.map(({ key }) => [key, readAdminPresentationField(source, key)]));
    const explicitHref = typeof item.href === 'string' ? item.href : undefined;
    const detailInput = identity ? detailInputForRow(item, source, resource, identity) : undefined;
    const sourceActions = resource.actions ?? [];
    const boundActions = identity
      ? sourceActions.filter((action) => Boolean(action.targetIdInput)).map((action) => {
          const actionInput = { ...(action.input ?? {}), [action.targetIdInput!]: identity };
          const required = action.inputSchema?.type === 'object' ? action.inputSchema.required ?? [] : [];
          for (const key of required) {
            if (actionInput[key] !== undefined) continue;
            const value = source[key] ?? item[key];
            if (value !== undefined) actionInput[key] = value;
          }
          return { ...action, input: actionInput };
        })
      : [];
    const href = explicitHref ?? (detailInput
      ? detailHref(resource.href, detailInput, resource.detailIdInput ?? 'id')
      : undefined);
    return [{
      id: identity ?? `row-${index}`,
      ...(href ? { href } : {}),
      values,
      actions: boundActions,
    }];
  });
}

export function inferAdminResourceFields(item: unknown): ResourceDetailViewModel['fields'] {
  if (!isAdminRecord(item)) return [];
  return safeScalarEntries(item).map(([key, value]) => ({
    label: adminFieldLabel(key),
    value,
    format: adminFieldFormat(key, value),
  }));
}

export function inferAdminResourceTitle(item: unknown, fallback: string): string {
  if (!isAdminRecord(item)) return fallback;
  for (const key of ['displayName', 'name', 'title', 'label', 'email', 'id', 'runId', 'key', 'slug']) {
    const value = item[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value)) return String(value);
  }
  return fallback;
}

export function inferAdminResourceStatus(item: unknown): string | undefined {
  if (!isAdminRecord(item)) return undefined;
  for (const key of ['status', 'state', 'outcome', 'health']) {
    if (typeof item[key] === 'string') return item[key];
  }
  return undefined;
}

export function enabledNavigationModules(registry: RegistryViewModel): AdminModuleViewModel[] {
  return registry.modules
    .filter(
      (module) =>
        module.enabled &&
        module.visibleInNavigation !== false &&
        !module.parentModuleId
    )
    .sort((left, right) => {
      const groupOrder = (left.group ?? '').localeCompare(right.group ?? '');
      return groupOrder || left.name.localeCompare(right.name);
    });
}

export function moduleById(
  registry: RegistryViewModel,
  moduleId: string
): AdminModuleViewModel | undefined {
  return registry.modules.find(
    (module) => module.enabled && module.id.toLowerCase() === moduleId.toLowerCase()
  );
}

export function registryHasModule(registry: RegistryViewModel, moduleId: string): boolean {
  return moduleById(registry, moduleId) !== undefined;
}

/** Whether a projected registry actually exposes a built-in console destination. */
export function consoleDestinationEnabled(registry: RegistryViewModel, href: string): boolean {
  let candidate: URL;
  try {
    candidate = new URL(href, 'http://superconsole.local');
  } catch {
    return false;
  }
  if (candidate.origin !== 'http://superconsole.local' || candidate.username || candidate.password) return false;
  const pathname = candidate.pathname;
  if (pathname === '/') return shellSurfaceEnabled(registry, 'overview');
  if (pathname === '/audit' || pathname.startsWith('/audit/')) return shellSurfaceEnabled(registry, 'audit');
  if (pathname === '/api' || pathname.startsWith('/api/')) return shellSurfaceEnabled(registry, 'api');
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) return shellSurfaceEnabled(registry, 'mcp');
  if (pathname === '/search' || pathname.startsWith('/search/')) {
    return shellSurfaceEnabled(registry, 'search');
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return shellSurfaceEnabled(registry, 'settings');
  const moduleMatch = /^\/modules\/([^/]+)/.exec(pathname);
  if (moduleMatch) {
    try {
      return registryHasModule(registry, decodeURIComponent(moduleMatch[1]!));
    } catch {
      return false;
    }
  }
  return pathname === '/sign-in';
}

export function formatValue(
  value: unknown,
  format: ResourceColumnViewModel['format'] = 'text'
): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'datetime') {
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
  }
  if (format === 'number' && typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function statusTone(status: string | undefined): ResourceTone {
  switch (status?.toLowerCase()) {
    case 'healthy':
    case 'active':
    case 'enabled':
    case 'success':
    case 'succeeded':
    case 'completed':
      return 'success';
    case 'queued':
    case 'pending':
    case 'running':
    case 'degraded':
    case 'warning':
      return 'warning';
    case 'critical':
    case 'error':
    case 'failed':
    case 'failure':
    case 'disabled':
      return 'danger';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}
