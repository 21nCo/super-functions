import { BadRequestError } from './errors.js';
import { AUTH_ROUTE_MODES } from './types.js';
import type { CookieSameSite, HttpRouteMeta, SetCookieInput } from './types.js';

const VALID_SAME_SITE_VALUES: ReadonlySet<CookieSameSite> = new Set(['lax', 'strict', 'none']);
const COOKIE_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const UNSAFE_COOKIE_ATTRIBUTE_RE = /[\r\n\0;]/;

function normalizeSameSite(value: CookieSameSite | undefined): CookieSameSite {
  const normalized = value ?? 'lax';
  if (!VALID_SAME_SITE_VALUES.has(normalized)) {
    throw new BadRequestError('Invalid SameSite value', 'HTTP_META_INVALID');
  }
  return normalized;
}

function titleCaseSameSite(value: CookieSameSite): string {
  switch (value) {
    case 'lax':
      return 'Lax';
    case 'strict':
      return 'Strict';
    case 'none':
      return 'None';
  }
}

/**
 * Parse a Cookie header into a deterministic key/value map.
 */
export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  const cookies = Object.create(null) as Record<string, string>;
  if (!header) {
    return cookies;
  }

  for (const segment of header.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const name = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

/**
 * Parse cookies from a Web Request.
 */
export function parseCookies(request: Request): Record<string, string> {
  return parseCookieHeader(request.headers.get('cookie'));
}

/**
 * Serialize a Set-Cookie header value.
 */
export function serializeSetCookie(input: SetCookieInput): string {
  if (!input.name || input.name.trim().length === 0) {
    throw new BadRequestError('Cookie name is required', 'HTTP_META_INVALID');
  }

  if (!COOKIE_NAME_RE.test(input.name)) {
    throw new BadRequestError('Invalid cookie name', 'HTTP_META_INVALID');
  }

  const sameSite = normalizeSameSite(input.sameSite);
  const path = input.path ?? '/';
  if (UNSAFE_COOKIE_ATTRIBUTE_RE.test(path)) {
    throw new BadRequestError('Invalid cookie path', 'HTTP_META_INVALID');
  }
  if (input.domain && UNSAFE_COOKIE_ATTRIBUTE_RE.test(input.domain)) {
    throw new BadRequestError('Invalid cookie domain', 'HTTP_META_INVALID');
  }
  if (sameSite === 'none' && input.secure === false) {
    throw new BadRequestError('SameSite=None cookies must be Secure', 'HTTP_META_INVALID');
  }

  const parts = [`${input.name}=${encodeURIComponent(input.value)}`];

  parts.push(`Path=${path}`);

  if (input.domain) {
    parts.push(`Domain=${input.domain}`);
  }

  if (typeof input.maxAge === 'number') {
    parts.push(`Max-Age=${Math.trunc(input.maxAge)}`);
  }

  if (input.expires) {
    parts.push(`Expires=${input.expires.toUTCString()}`);
  }

  if (input.secure ?? true) {
    parts.push('Secure');
  }

  if (input.httpOnly ?? true) {
    parts.push('HttpOnly');
  }

  parts.push(`SameSite=${titleCaseSameSite(sameSite)}`);

  return parts.join('; ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Runtime validator for route metadata intended for shared auth/OpenAPI usage.
 */
export function assertValidRouteMeta(value: unknown): asserts value is HttpRouteMeta {
  if (!isRecord(value)) {
    throw new BadRequestError('Route metadata must be an object', 'HTTP_META_INVALID');
  }

  if (value.auth !== undefined) {
    if (!isRecord(value.auth)) {
      throw new BadRequestError('Route auth metadata must be an object', 'HTTP_META_INVALID');
    }
    const mode = value.auth.mode;
    if (typeof mode !== 'string' || !AUTH_ROUTE_MODES.includes(mode as (typeof AUTH_ROUTE_MODES)[number])) {
      throw new BadRequestError('Invalid auth route metadata mode', 'HTTP_META_INVALID');
    }
    if (value.auth.csrf !== undefined && typeof value.auth.csrf !== 'boolean') {
      throw new BadRequestError('Route auth metadata csrf must be a boolean', 'HTTP_META_INVALID');
    }
    if (
      value.auth.scopes !== undefined &&
      (!Array.isArray(value.auth.scopes) || value.auth.scopes.some((scope) => typeof scope !== 'string'))
    ) {
      throw new BadRequestError('Route auth metadata scopes must be a string array', 'HTTP_META_INVALID');
    }
  }

  if (value.openapi !== undefined && !isRecord(value.openapi)) {
    throw new BadRequestError('Route OpenAPI metadata must be an object', 'HTTP_META_INVALID');
  }
}
