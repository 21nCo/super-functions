import {
  AuthFnError,
  authfn,
  type AuthFnConfig,
  type AuthFnPluginList,
  type AuthFnServer,
  type AuthFnTypedServerConfig,
  type AuthFnSession,
} from 'authfn';
import type { AdminActor, AdminScope } from '@superfunctions/admin';

export interface AuthFnOperatorPrincipal {
  actor: AdminActor;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  defaultScope: AdminScope;
  authentication?: Readonly<{
    sessionId?: string;
    type?: string;
    methods?: readonly string[];
    csrfCookieName?: string;
    csrfHeaderName?: string;
  }>;
}

export interface AuthFnOperatorAuthOptions<
  TPrincipal extends AuthFnOperatorPrincipal = AuthFnOperatorPrincipal,
  TPlugins extends AuthFnPluginList = AuthFnPluginList,
> {
  config: AuthFnConfig<TPlugins> & AuthFnTypedServerConfig<TPlugins>;
  resolveOperator(input: {
    session: AuthFnSession;
    request: Request;
  }): Promise<TPrincipal | null> | TPrincipal | null;
  authorizeScope(input: {
    principal: TPrincipal;
    requested: AdminScope;
    request: Request;
  }): Promise<AdminScope | null> | AdminScope | null;
}

interface AuthFnEnvelope {
  ok?: boolean;
  data?: { session?: AuthFnSession | null };
  error?: { code?: string; message?: string; retryable?: boolean };
  requestId?: string;
}

class AuthFnOperatorResponseError extends Error {
  constructor(readonly response: Response, readonly payload: AuthFnEnvelope) {
    super(payload.error?.message ?? 'The authentication provider rejected the request.');
    this.name = 'AuthFnOperatorResponseError';
  }
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

function authRequest(original: Request, path: string, body?: unknown): Request {
  const url = new URL(original.url);
  url.pathname = path;
  url.search = '';
  const headers = new Headers(original.headers);
  headers.set('accept', 'application/json');
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(url, {
    method: body === undefined ? original.method : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function envelope(response: Response): Promise<AuthFnEnvelope> {
  return response.clone().json().catch(() => ({})) as Promise<AuthFnEnvelope>;
}

function throwAuthResponse(response: Response, payload: AuthFnEnvelope): never {
  throw new AuthFnOperatorResponseError(response, payload);
}

function authResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  const source = upstream.headers as Headers & { getSetCookie?: () => string[] };
  for (const cookie of source.getSetCookie?.() ?? []) headers.append('set-cookie', cookie);
  if (!source.getSetCookie && source.has('set-cookie')) headers.append('set-cookie', source.get('set-cookie')!);
  for (const name of ['cache-control', 'retry-after', 'x-request-id']) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function withCookieNames<TPrincipal extends AuthFnOperatorPrincipal>(
  authFn: AuthFnServer,
  principal: TPrincipal,
  request: Request,
): Promise<TPrincipal> {
  const names = await authFn.cookieNamesForRequest(request);
  return {
    ...principal,
    authentication: {
      ...principal.authentication,
      csrfCookieName: names.csrfCookieName,
      csrfHeaderName: 'x-authfn-csrf',
    },
  };
}

async function resolveSuccessfulOperator<
  TPrincipal extends AuthFnOperatorPrincipal,
  TPlugins extends AuthFnPluginList,
>(
  authFn: AuthFnServer,
  options: AuthFnOperatorAuthOptions<TPrincipal, TPlugins>,
  upstream: Response,
  payload: AuthFnEnvelope,
  request: Request,
): Promise<{ principal: TPrincipal; headers?: HeadersInit }> {
  if (!upstream.ok || payload.ok === false || !payload.data?.session) throwAuthResponse(upstream, payload);
  const principal = await options.resolveOperator({ session: payload.data.session, request });
  if (!principal) {
    await authFn.revokeSession(payload.data.session.id, { userId: payload.data.session.actorId });
    const denied = new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'SUPERCONSOLE_OPERATOR_FORBIDDEN',
        message: 'The authenticated identity is not an authorized Super Console operator.',
        status: 403,
      },
      requestId: payload.requestId,
    }), { status: 403, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    throwAuthResponse(denied, await envelope(denied));
  }
  return {
    principal: await withCookieNames(authFn, principal, request),
    headers: authResponseHeaders(upstream),
  };
}

/**
 * Function-owned Super Console integration. It preserves provider plugins,
 * hooks, rate limits, two-factor semantics, CSRF, and cookie behavior while
 * satisfying the console's provider-neutral operator-auth contract.
 */
export function createAuthFnOperatorAuth<
  TPrincipal extends AuthFnOperatorPrincipal,
  TPlugins extends AuthFnPluginList,
>(
  options: AuthFnOperatorAuthOptions<TPrincipal, TPlugins>,
) {
  const authFn = authfn(options.config).createServer(options.config);
  const basePath = trimTrailingSlashes(options.config.basePath ?? '/auth') || '/';
  const route = (suffix: string) => `${basePath === '/' ? '' : basePath}${suffix}`;

  return {
    async authenticate(request: Request) {
      const session = await authFn.provider.authenticate(request);
      if (!session) return null;
      const principal = await options.resolveOperator({ session, request });
      return principal ? withCookieNames(authFn, principal, request) : null;
    },
    async authorizeScope(input: { principal: TPrincipal; requested: AdminScope; request: Request }) {
      return options.authorizeScope(input);
    },
    async authorizeMutation({ request }: { principal: TPrincipal; request: Request }) {
      await authFn.authorizeMutation(request);
    },
    async signIn({ email, password, request }: { email: string; password: string; request: Request }) {
      const upstream = await authFn.router.handle(authRequest(request, route('/sign-in/password'), {
        email,
        password,
        sessionMode: 'cookie',
      }));
      return resolveSuccessfulOperator(authFn, options, upstream, await envelope(upstream), request);
    },
    async completeTwoFactor({ challengeId, code, request }: { challengeId: string; code: string; request: Request }) {
      const upstream = await authFn.router.handle(authRequest(request, route('/2fa/challenge'), { challengeId, code }));
      return resolveSuccessfulOperator(authFn, options, upstream, await envelope(upstream), request);
    },
    async signOut({ request }: { principal: TPrincipal | null; request: Request }) {
      const upstream = await authFn.router.handle(authRequest(request, route('/sign-out'), {}));
      const payload = await envelope(upstream);
      if (!upstream.ok || payload.ok === false) throwAuthResponse(upstream, payload);
      return { headers: authResponseHeaders(upstream) };
    },
    mapError(error: unknown): Response | undefined {
      if (error instanceof AuthFnOperatorResponseError) {
        if (error.payload.error?.code !== 'AUTHFN_2FA_REQUIRED') return error.response;
        return new Response(JSON.stringify({
          ...error.payload,
          error: { ...error.payload.error, code: 'OPERATOR_2FA_REQUIRED' },
        }), { status: error.response.status, headers: authResponseHeaders(error.response) });
      }
      if (error instanceof AuthFnError) {
        return new Response(JSON.stringify({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            status: error.status,
            retryable: error.retryable,
          },
        }), { status: error.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return undefined;
    },
  };
}
