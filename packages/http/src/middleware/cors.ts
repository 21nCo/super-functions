/**
 * CORS middleware
 */

import type { Middleware, CorsOptions } from '../types.js';

/**
 * Create CORS middleware with configurable options
 */
export function corsMiddleware<TContext = any>(
  options: CorsOptions = {}
): Middleware<TContext> {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    exposedHeaders = [],
    credentials = false,
    maxAge = 86400, // 24 hours
  } = options;

  // `Access-Control-Allow-Origin: *` together with credentials is rejected by
  // browsers, so credentialed responses must reflect a concrete origin. When
  // credentials are enabled with the wildcard default, reflect the request
  // origin (and set Vary: Origin) instead of emitting the invalid combination.
  const reflectForCredentials = credentials && origin === '*';

  return async (request, _context, next) => {
    const requestOrigin = request.headers.get('Origin') || '';

    // Determine if origin is allowed. `varyOnOrigin` tracks whether the allowed
    // origin was computed from the request origin, which requires Vary: Origin
    // so shared/CDN caches don't serve one origin's response to another.
    let allowedOrigin: string | null = null;
    let varyOnOrigin = false;
    if (typeof origin === 'string') {
      if (reflectForCredentials) {
        allowedOrigin = requestOrigin || null;
        varyOnOrigin = true;
      } else {
        allowedOrigin = origin;
      }
    } else if (Array.isArray(origin)) {
      varyOnOrigin = true;
      if (origin.includes(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    } else if (typeof origin === 'function') {
      varyOnOrigin = true;
      if (origin(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    }

    // Handle preflight request
    if (request.method === 'OPTIONS') {
      const headers = new Headers();

      if (varyOnOrigin) {
        headers.append('Vary', 'Origin');
      }

      if (allowedOrigin) {
        headers.set('Access-Control-Allow-Origin', allowedOrigin);
      }

      headers.set('Access-Control-Allow-Methods', methods.join(', '));
      headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));

      if (credentials) {
        headers.set('Access-Control-Allow-Credentials', 'true');
      }

      if (maxAge) {
        headers.set('Access-Control-Max-Age', maxAge.toString());
      }

      if (exposedHeaders.length > 0) {
        headers.set('Access-Control-Expose-Headers', exposedHeaders.join(', '));
      }

      return new Response(null, { status: 204, headers });
    }

    // Handle actual request
    const response = await next();

    // Add CORS headers to response
    if (allowedOrigin || varyOnOrigin) {
      const newHeaders = new Headers(response.headers);

      // Set Vary: Origin whenever the allowed origin is derived from the
      // request origin, even if this particular origin was rejected, so caches
      // key on Origin and never serve a cross-origin response to another origin.
      if (varyOnOrigin) {
        newHeaders.append('Vary', 'Origin');
      }

      if (allowedOrigin) {
        newHeaders.set('Access-Control-Allow-Origin', allowedOrigin);

        if (credentials) {
          newHeaders.set('Access-Control-Allow-Credentials', 'true');
        }

        if (exposedHeaders.length > 0) {
          newHeaders.set('Access-Control-Expose-Headers', exposedHeaders.join(', '));
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  };
}
