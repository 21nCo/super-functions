import type {
  AdminErrorViewModel,
  AdminModuleViewModel,
  OverviewViewModel,
  RegistryViewModel,
  ShellViewModel,
} from './view-models';

export const ADMIN_API_PREFIX = '/api/admin/v1';
export const ADMIN_SCOPE_QUERY_KEYS = [
  'installationId',
  'organizationId',
  'workspaceId',
  'projectId',
  'environmentId',
  'namespace',
  'region',
] as const;

const ADMIN_SCOPE_HIERARCHY = [
  {
    key: 'installationId',
    aliases: ['installationId', 'installation', 'organizationId', 'organization'],
  },
  { key: 'workspaceId', aliases: ['workspaceId', 'workspace'] },
  { key: 'projectId', aliases: ['projectId', 'project'] },
  { key: 'environmentId', aliases: ['environmentId', 'environment'] },
] as const;

export type AdminScopeQueryKey = (typeof ADMIN_SCOPE_QUERY_KEYS)[number];

export type AdminFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CONSOLE_NAVIGATION_PATH = /^\/(?:$|api(?:\/|$)|audit(?:\/|$)|mcp(?:\/|$)|modules(?:\/|$)|search(?:\/|$)|settings(?:\/|$)|sign-in(?:\/|$))/;
let operatorCsrfCookieName: string | undefined;
let operatorCsrfHeaderName = 'x-operator-csrf';

export function setOperatorCsrf(
  cookieName: string | undefined,
  headerName: string | undefined,
): void {
  operatorCsrfCookieName = cookieName?.trim() || undefined;
  operatorCsrfHeaderName = headerName?.trim().toLowerCase() || 'x-operator-csrf';
}

function readableCookies(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.cookie;
}

/**
 * Resolves the auth provider's readable double-submit token by the exact cookie name
 * projected into the authenticated session. A single-cookie fallback supports
 * sign-in bootstrap without inferring anything from HTTP-only session cookies.
 */
export function operatorCsrfToken(
  cookieHeader = readableCookies(),
  cookieName = operatorCsrfCookieName
): string | undefined {
  if (!cookieHeader) return undefined;
  const candidates: Array<{ name: string; value: string }> = [];
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (cookieName ? rawName !== cookieName : !rawName.endsWith('.csrf')) continue;
    const encoded = rawValue.join('=');
    try {
      candidates.push({ name: rawName, value: decodeURIComponent(encoded) });
    } catch {
      candidates.push({ name: rawName, value: encoded });
    }
  }
  if (cookieName) return candidates[0]?.value;
  return candidates.length === 1 ? candidates[0]?.value : undefined;
}

/** Same-origin console transport with provider-defined CSRF propagation for mutations. */
export async function fetchConsole(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: AdminFetch = globalThis.fetch
): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (!SAFE_HTTP_METHODS.has(method) && !headers.has(operatorCsrfHeaderName)) {
    const token = operatorCsrfToken();
    if (token) headers.set(operatorCsrfHeaderName, token);
  }
  return fetcher(input, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
  });
}

export type AdminApiResult<T> =
  | {
      ok: true;
      data: T;
      requestId?: string;
      correlationId?: string;
      auditId?: string;
      page?: { nextCursor?: string | null; hasMore?: boolean };
      warnings?: readonly string[];
      meta?: Readonly<Record<string, unknown>>;
    }
  | { ok: false; error: AdminErrorViewModel };

export function withAdminScope(path: string, scope?: URLSearchParams): string {
  if (!scope) return path;
  const url = new URL(path, 'http://superconsole.local');
  const explicitBoundary = ADMIN_SCOPE_HIERARCHY.findIndex(({ aliases }) =>
    aliases.some((alias) => url.searchParams.has(alias))
  );
  for (const [index, { key, aliases }] of ADMIN_SCOPE_HIERARCHY.entries()) {
    if (aliases.some((alias) => url.searchParams.has(alias))) continue;
    if (explicitBoundary >= 0 && index > explicitBoundary) continue;
    const value = aliases.map((alias) => scope.get(alias)).find(Boolean);
    if (value) url.searchParams.set(key, value);
  }
  if (explicitBoundary < 0) {
    for (const key of ['namespace', 'region'] as const) {
      if (url.searchParams.has(key)) continue;
      const value = scope.get(key);
      if (value) url.searchParams.set(key, value);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function scopedConsoleHref(path: string, current: URLSearchParams): string {
  return withAdminScope(path, current);
}

export function switchAdminContextHref(
  href: string,
  level: 'organization' | 'workspace' | 'project' | 'environment',
  value: string
): string {
  const url = new URL(href, 'http://superconsole.local');
  const hierarchy = ['organization', 'workspace', 'project', 'environment'] as const;
  if (level === 'organization') {
    for (const alias of ADMIN_SCOPE_HIERARCHY[0].aliases) url.searchParams.delete(alias);
    url.searchParams.set('installationId', value);
  } else {
    url.searchParams.set(`${level}Id`, value);
    url.searchParams.delete(level);
  }
  for (const dependent of hierarchy.slice(hierarchy.indexOf(level) + 1)) {
    url.searchParams.delete(`${dependent}Id`);
    url.searchParams.delete(dependent);
  }
  url.searchParams.delete('namespace');
  url.searchParams.delete('region');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Accept only credential-free, same-origin destinations for console navigation. */
export function safeConsoleNavigationHref(
  href: string | undefined,
  origin = 'http://superconsole.local'
): string | undefined {
  if (!href) return undefined;
  let candidate: URL;
  try {
    candidate = new URL(href, origin);
  } catch {
    return undefined;
  }
  if (candidate.username || candidate.password) return undefined;
  if (candidate.origin !== new URL(origin).origin) return undefined;
  if (!['http:', 'https:'].includes(candidate.protocol)) return undefined;
  if (!CONSOLE_NAVIGATION_PATH.test(candidate.pathname)) return undefined;
  return `${candidate.pathname}${candidate.search}${candidate.hash}`;
}

/** Materialize declared route parameters without guessing resource identity names. */
export function materializeAdminApiHref(
  href: string | undefined,
  input: Record<string, unknown>
): string | undefined {
  if (!href) return undefined;
  let complete = true;
  const materialized = href.replace(
    /:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_match, colonName: string | undefined, braceName: string | undefined) => {
      const name = colonName ?? braceName ?? '';
      const value = input[name];
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        complete = false;
        return '';
      }
      return encodeURIComponent(String(value));
    }
  );
  return complete ? materialized : undefined;
}

/**
 * Materialize path parameters and encode non-body operation input exactly as
 * the administration server and generated client do. Object and array values
 * remain lossless JSON query values.
 */
export function materializeAdminActionHref(
  href: string | undefined,
  input: Record<string, unknown>,
  method = 'POST'
): string | undefined {
  const materialized = materializeAdminApiHref(href, input);
  if (!materialized) return undefined;
  if (!['GET', 'HEAD', 'DELETE'].includes(method.toUpperCase())) return materialized;

  const pathInputs = new Set<string>();
  href?.replace(
    /:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
    (_match, colonName: string | undefined, braceName: string | undefined) => {
      pathInputs.add(colonName ?? braceName ?? '');
      return '';
    }
  );
  const url = new URL(materialized, 'http://superconsole.local');
  for (const [key, value] of Object.entries(input)) {
    if (pathInputs.has(key) || value === undefined) continue;
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeAdminDownloadHref(
  href: string | undefined,
  options: { origin?: string; signedExternal?: boolean; scope?: URLSearchParams } = {}
): string | undefined {
  if (!href) return undefined;
  const origin = options.origin ?? 'http://superconsole.local';
  let candidate: URL;
  try {
    candidate = new URL(href, origin);
  } catch {
    return undefined;
  }
  if (candidate.username || candidate.password) return undefined;
  const sameOrigin = candidate.origin === new URL(origin).origin;
  if (sameOrigin && candidate.pathname.startsWith('/api/admin/')) {
    return withAdminScope(
      `${candidate.pathname}${candidate.search}${candidate.hash}`,
      options.scope
    );
  }
  if (options.signedExternal && candidate.protocol === 'https:') return candidate.href;
  return undefined;
}

export function openSafeAdminDownload(
  href: string | undefined,
  options: { signedExternal?: boolean } = {}
): boolean {
  if (!href || typeof window === 'undefined') return false;
  const safeHref = safeAdminDownloadHref(href, {
    origin: window.location.origin,
    signedExternal: options.signedExternal,
    scope: new URL(window.location.href).searchParams,
  });
  if (!safeHref) return false;
  const popup = window.open(safeHref, '_blank', 'noopener,noreferrer');
  if (popup) popup.opener = null;
  return popup !== null;
}

export interface AdminDownloadReceipt {
  url: string;
  headers?: Record<string, string>;
  signedExternal?: boolean;
}

export async function openSafeAdminDownloadReceipt(
  receipt: AdminDownloadReceipt,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const safeHref = safeAdminDownloadHref(receipt.url, {
    origin: window.location.origin,
    signedExternal: receipt.signedExternal ?? true,
    scope: new URL(window.location.href).searchParams,
  });
  if (!safeHref) return false;
  const headers = new Headers();
  let hasHeaders = false;
  for (const [name, value] of Object.entries(receipt.headers ?? {})) {
    if (value !== '[REDACTED]') {
      headers.set(name, value);
      hasHeaders = true;
    }
  }
  if (!hasHeaders) {
    return openSafeAdminDownload(safeHref, { signedExternal: receipt.signedExternal ?? true });
  }

  const response = await fetcher(safeHref, {
    headers,
    credentials: 'omit',
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`The download provider returned HTTP ${response.status}.`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = '';
  anchor.rel = 'noopener noreferrer';
  anchor.click();
  URL.revokeObjectURL(objectUrl);
  return true;
}

export function safeAvatarHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(href)) return href;
  let candidate: URL;
  try {
    candidate = new URL(href, typeof window === 'undefined' ? 'http://superconsole.local' : window.location.origin);
  } catch {
    return undefined;
  }
  if (candidate.username || candidate.password) return undefined;
  const currentOrigin = typeof window === 'undefined'
    ? 'http://superconsole.local'
    : window.location.origin;
  if (candidate.origin === currentOrigin && ['http:', 'https:'].includes(candidate.protocol)) {
    return candidate.href;
  }
  return candidate.protocol === 'https:' ? candidate.href : undefined;
}

interface ApiEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
  correlationId?: string;
  auditId?: string;
  page?: { nextCursor?: string | null; hasMore?: boolean };
  warnings?: readonly string[];
  meta?: Readonly<Record<string, unknown>>;
}

function requestIdFrom(response: Response, body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'requestId' in body) {
    const value = (body as { requestId?: unknown }).requestId;
    if (typeof value === 'string') return value;
  }
  return response.headers.get('x-request-id') ?? undefined;
}

export async function fetchAdmin<T>(
  fetcher: AdminFetch,
  path: string,
  init: RequestInit = {}
): Promise<AdminApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  try {
    const response = await fetchConsole(path, {
      ...init,
      headers,
      cache: 'no-store',
    }, fetcher);
    const contentType = response.headers.get('content-type') ?? '';
    const body: unknown = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    const envelope =
      body && typeof body === 'object' ? (body as ApiEnvelope<T>) : undefined;
    const requestId = requestIdFrom(response, body);

    if (!response.ok || envelope?.ok === false) {
      return {
        ok: false,
        error: {
          status: response.status,
          code:
            envelope?.error?.code ??
            (response.status === 401
              ? 'AUTHENTICATION_REQUIRED'
              : response.status === 403
                ? 'PERMISSION_DENIED'
                : response.status === 404
                  ? 'NOT_FOUND'
                  : 'ADMIN_API_ERROR'),
          message:
            envelope?.error?.message ??
            (typeof body === 'string' && body.trim()
              ? body
              : `The administration API returned HTTP ${response.status}.`),
          requestId,
          correlationId: envelope?.correlationId,
          auditId: envelope?.auditId,
          details: envelope?.error?.details,
          meta: envelope?.meta,
        },
      };
    }

    return {
      ok: true,
      data: (envelope && 'data' in envelope ? envelope.data : body) as T,
      requestId,
      ...(envelope?.correlationId !== undefined ? { correlationId: envelope.correlationId } : {}),
      ...(envelope?.auditId !== undefined ? { auditId: envelope.auditId } : {}),
      ...(envelope?.page !== undefined ? { page: envelope.page } : {}),
      ...(envelope?.warnings !== undefined ? { warnings: envelope.warnings } : {}),
      ...(envelope?.meta !== undefined ? { meta: envelope.meta } : {}),
    };
  } catch (cause) {
    return {
      ok: false,
      error: {
        status: 503,
        code: 'ADMIN_API_UNAVAILABLE',
        message: cause instanceof Error ? cause.message : 'The administration API is unavailable.',
      },
    };
  }
}

function normalizeModule(candidate: AdminModuleViewModel): AdminModuleViewModel {
  const record = candidate as unknown as Record<string, unknown>;
  const manifest = record.manifest && typeof record.manifest === 'object'
    ? (record.manifest as Record<string, unknown>)
    : record;
  const navigation = Array.isArray(manifest.navigation)
    ? manifest.navigation[0]
    : manifest.navigation;
  const nav = navigation && typeof navigation === 'object'
    ? (navigation as Record<string, unknown>)
    : {};
  const owner = manifest.owner && typeof manifest.owner === 'object'
    ? (manifest.owner as Record<string, unknown>)
    : {};
  const id = String(manifest.id ?? candidate.id);
  const name = String(manifest.displayName ?? candidate.name ?? id);
  const href = safeConsoleNavigationHref(String(nav.path ?? candidate.href ?? `/modules/${id}`));
  const resources = (candidate.resources ?? []).flatMap((resource) => {
    const resourceHref = safeConsoleNavigationHref(resource.href);
    return resourceHref ? [{ ...resource, href: resourceHref }] : [];
  });
  return {
    ...candidate,
    id,
    name,
    description: String(manifest.description ?? candidate.description ?? `Operate ${name}.`),
    href: href ?? `/modules/${encodeURIComponent(id)}`,
    group: String(nav.group ?? manifest.category ?? candidate.group ?? 'Functions'),
    version: String(manifest.version ?? candidate.version ?? ''),
    parentModuleId: String(candidate.parentModuleId ?? owner.moduleId ?? '') || undefined,
    enabled: candidate.enabled !== false,
    resources,
    actions: candidate.actions ?? [],
  };
}

export function normalizeRegistry(candidate: unknown): RegistryViewModel {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const rawModules = Array.isArray((source as { modules?: unknown[] }).modules)
    ? (source as { modules: AdminModuleViewModel[] }).modules
    : [];
  const rawSurfaces = (source as { surfaces?: unknown }).surfaces;
  const surfaces = rawSurfaces && typeof rawSurfaces === 'object'
    ? {
        overview: (rawSurfaces as Record<string, unknown>).overview === true,
        search: (rawSurfaces as Record<string, unknown>).search === true,
        audit: (rawSurfaces as Record<string, unknown>).audit === true,
        settings: (rawSurfaces as Record<string, unknown>).settings === true,
        api: (rawSurfaces as Record<string, unknown>).api === true,
        mcp: (rawSurfaces as Record<string, unknown>).mcp === true,
      }
    : undefined;
  return {
    ...(source as Partial<RegistryViewModel>),
    modules: rawModules.map(normalizeModule).filter((module) => module.enabled),
    surfaces,
  };
}

export function normalizeOverview(candidate: unknown): OverviewViewModel {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const overview = source as Partial<OverviewViewModel>;
  return {
    metrics: Array.isArray(overview.metrics) ? overview.metrics : [],
    alerts: Array.isArray(overview.alerts) ? overview.alerts.map((alert) => ({
      ...alert,
      href: safeConsoleNavigationHref(alert.href),
    })) : [],
    activity: Array.isArray(overview.activity) ? overview.activity : [],
    health: Array.isArray(overview.health) ? overview.health : [],
  };
}

export async function loadShellViewModel(
  fetcher: AdminFetch,
  scope?: URLSearchParams
): Promise<ShellViewModel> {
  const [registryResult, overviewResult] = await Promise.all([
    fetchAdmin<RegistryViewModel>(
      fetcher,
      withAdminScope(`${ADMIN_API_PREFIX}/registry`, scope)
    ),
    fetchAdmin<OverviewViewModel>(
      fetcher,
      withAdminScope(`${ADMIN_API_PREFIX}/overview`, scope)
    ),
  ]);

  const primaryError = !registryResult.ok ? registryResult.error : undefined;
  const registry = registryResult.ok ? normalizeRegistry(registryResult.data) : { modules: [] };
  const overview = overviewResult.ok
    ? normalizeOverview(overviewResult.data)
    : { metrics: [], alerts: [], activity: [], health: [] };

  const registryData = registryResult.ok && registryResult.data && typeof registryResult.data === 'object'
    ? (registryResult.data as unknown as Record<string, unknown>)
    : {};
  const overviewData = overviewResult.ok && overviewResult.data && typeof overviewResult.data === 'object'
    ? (overviewResult.data as unknown as Record<string, unknown>)
    : {};

  return {
    session: (registryData.session ?? overviewData.session) as ShellViewModel['session'],
    context: ((registryData.context ?? overviewData.context ?? {}) as ShellViewModel['context']),
    registry,
    overview,
    error: primaryError,
    overviewError: !overviewResult.ok ? overviewResult.error : undefined,
  };
}
