import { parseCookies, serializeSetCookie } from '@superfunctions/http';
import type { AuthFnRuntimeConfig, AuthFnCookieConfig, AuthFnEnvironment } from '../types.js';
export { resolveEnvironment } from './environment.js';

const DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_CSRF_MAX_AGE_SECONDS = DEFAULT_SESSION_MAX_AGE_SECONDS;

export interface AuthFnResolvedCookiePolicy {
  prefix: string;
  path: string;
  domain?: string;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  sessionMaxAgeSeconds: number;
  csrfMaxAgeSeconds: number;
  sessionCookieName: string;
  csrfCookieName: string;
}

export interface AuthFnCookieBundle {
  sessionCookie: string;
  csrfCookie: string;
}

export function resolveCookiePolicy(
  config: Pick<AuthFnRuntimeConfig, 'cookie'>,
  request: Request,
  runtime?: AuthFnEnvironment
): AuthFnResolvedCookiePolicy {
  const effective: AuthFnCookieConfig = {
    ...config.cookie,
    ...runtime?.cookie
  };
  const prefix = effective.prefix?.trim() || 'authfn';
  const path = effective.path ?? '/';
  const secure = typeof effective.secure === 'function'
    ? effective.secure(request)
    : effective.secure ?? true;
  const sameSite = effective.sameSite ?? 'lax';
  const domain = typeof effective.domain === 'function'
    ? effective.domain({ request, regionId: runtime?.regionId })
    : effective.domain;

  return {
    prefix,
    path,
    domain,
    secure,
    sameSite,
    sessionMaxAgeSeconds: effective.sessionMaxAgeSeconds ?? DEFAULT_SESSION_MAX_AGE_SECONDS,
    csrfMaxAgeSeconds: effective.csrfMaxAgeSeconds ?? DEFAULT_CSRF_MAX_AGE_SECONDS,
    sessionCookieName: secure ? `__Secure-${prefix}.session` : `${prefix}.session`,
    csrfCookieName: `${prefix}.csrf`
  };
}

export function readCookieValues(
  request: Request,
  cookiePolicy: AuthFnResolvedCookiePolicy
): { sessionToken?: string; csrfToken?: string } {
  const cookies = parseCookies(request);
  return {
    sessionToken: cookies[cookiePolicy.sessionCookieName],
    csrfToken: cookies[cookiePolicy.csrfCookieName]
  };
}

export function issueSessionCookies(
  cookiePolicy: AuthFnResolvedCookiePolicy,
  sessionToken: string,
  csrfToken: string
): AuthFnCookieBundle {
  return {
    sessionCookie: serializeSetCookie({
      name: cookiePolicy.sessionCookieName,
      value: sessionToken,
      path: cookiePolicy.path,
      domain: cookiePolicy.domain,
      secure: cookiePolicy.secure,
      httpOnly: true,
      sameSite: cookiePolicy.sameSite,
      maxAge: cookiePolicy.sessionMaxAgeSeconds
    }),
    csrfCookie: serializeSetCookie({
      name: cookiePolicy.csrfCookieName,
      value: csrfToken,
      path: cookiePolicy.path,
      domain: cookiePolicy.domain,
      secure: cookiePolicy.secure,
      httpOnly: false,
      sameSite: cookiePolicy.sameSite,
      maxAge: cookiePolicy.csrfMaxAgeSeconds
    })
  };
}

export function clearSessionCookies(
  cookiePolicy: AuthFnResolvedCookiePolicy
): AuthFnCookieBundle {
  const expires = new Date(0);

  return {
    sessionCookie: serializeSetCookie({
      name: cookiePolicy.sessionCookieName,
      value: '',
      path: cookiePolicy.path,
      domain: cookiePolicy.domain,
      secure: cookiePolicy.secure,
      httpOnly: true,
      sameSite: cookiePolicy.sameSite,
      maxAge: 0,
      expires
    }),
    csrfCookie: serializeSetCookie({
      name: cookiePolicy.csrfCookieName,
      value: '',
      path: cookiePolicy.path,
      domain: cookiePolicy.domain,
      secure: cookiePolicy.secure,
      httpOnly: false,
      sameSite: cookiePolicy.sameSite,
      maxAge: 0,
      expires
    })
  };
}
