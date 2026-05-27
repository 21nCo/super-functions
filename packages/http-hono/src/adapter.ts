/**
 * Hono adapter for @superfunctions/http
 */

import type { Router } from '@superfunctions/http';
import type { Context } from 'hono';
import { Hono } from 'hono';

export interface ToHonoOptions {
  /** Override mount prefix when Hono routePath inference is unavailable */
  mountPath?: string;
}

/**
 * Convert a @superfunctions/http Router to a Hono instance
 *
 * Hono uses Web Standards natively, so translation is minimal.
 * When mounted with `app.route('/api', toHono(router))`, the adapter
 * rewrites the request path relative to the mount point (same behavior
 * as the Express adapter's use of `req.url`).
 *
 * Usage:
 * ```typescript
 * const router = createRouter({ routes: [...] });
 * app.route('/api', toHono(router));
 * ```
 */
export function toHono(
  router: Router,
  options: ToHonoOptions = {}
): import('hono').Hono {
  const app = new Hono();

  app.all('*', async (c: Context) => {
    const routePath =
      c.req.matchedRoutes?.at(-1)?.path ?? c.req.routePath;
    const mountPrefix =
      options.mountPath ??
      getMountPrefixFromRoutePath(routePath, c.req.raw.url, c.req.param());
    if (hasConsumedBody(c.req.raw)) {
      return Response.json(
        {
          error:
            'Request body was already consumed by Hono middleware before reaching the Superfunctions router',
        },
        { status: 400 }
      );
    }
    const webRequest = toMountedRequest(c.req.raw, mountPrefix);
    return router.handle(webRequest);
  });

  return app;
}

function getMountPrefixFromRoutePath(
  routePath: unknown,
  requestUrl?: string,
  params: Record<string, string> = {}
): string {
  if (typeof routePath !== 'string' || routePath.length === 0) {
    return '';
  }

  if (routePath.endsWith('/*')) {
    return resolveConcreteMountPrefix(routePath.slice(0, -2), requestUrl, params);
  }

  return routePath === '*' ? '' : resolveConcreteMountPrefix(routePath, requestUrl, params);
}

function resolveConcreteMountPrefix(
  routePath: string,
  requestUrl?: string,
  params: Record<string, string> = {}
): string {
  if (!routePath.includes(':') || !requestUrl) {
    return routePath;
  }

  const url = new URL(requestUrl);
  const routeSegments = routePath.split('/').filter(Boolean);
  const pathSegments = url.pathname.split('/').filter(Boolean);

  if (routeSegments.length > pathSegments.length) {
    return routePath;
  }

  const resolvedSegments = routeSegments.map((segment, index) => {
    if (!segment.startsWith(':')) {
      return segment;
    }

    const rawSegment = pathSegments[index];
    if (rawSegment !== undefined) {
      return rawSegment;
    }

    const paramName = segment.slice(1);
    const paramValue = params[paramName];
    return paramValue !== undefined ? encodeURIComponent(paramValue) : segment;
  });

  return `/${resolvedSegments.join('/')}`;
}

function toMountedRequest(request: Request, mountPrefix: string): Request {
  if (!mountPrefix) {
    return request;
  }

  const url = new URL(request.url);
  if (
    url.pathname === mountPrefix ||
    url.pathname.startsWith(`${mountPrefix}/`)
  ) {
    url.pathname = url.pathname.slice(mountPrefix.length) || '/';
  }

  return new Request(url, request);
}

function hasConsumedBody(request: Request): boolean {
  return request.bodyUsed && request.method !== 'GET' && request.method !== 'HEAD';
}
