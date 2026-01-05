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

  return async (request, _context, next) => {
    const requestOrigin = request.headers.get('Origin') || '';

    // Determine if origin is allowed
    let allowedOrigin: string | null = null;
    if (typeof origin === 'string') {
      allowedOrigin = origin;
    } else if (Array.isArray(origin)) {
      if (origin.includes(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    } else if (typeof origin === 'function') {
      if (origin(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    }

    // Handle preflight request
    if (request.method === 'OPTIONS') {
      const headers = new Headers();

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
    if (allowedOrigin) {
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', allowedOrigin);

      if (credentials) {
        newHeaders.set('Access-Control-Allow-Credentials', 'true');
      }

      if (exposedHeaders.length > 0) {
        newHeaders.set('Access-Control-Expose-Headers', exposedHeaders.join(', '));
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
