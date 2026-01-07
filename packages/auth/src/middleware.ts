/**
 * Middleware utilities for integrating auth with @superfunctions/http
 */

import type { AuthProvider, AuthSession } from './types.js';
import { AuthenticationError, AuthorizationError } from './types.js';

/**
 * Create authentication middleware for @superfunctions/http
 * 
 * This middleware authenticates requests using the provided auth provider
 * and attaches the session to the context.
 * 
 * @example
 * ```typescript
 * import { createAuthMiddleware } from '@superfunctions/auth';
 * import { createRouter } from '@superfunctions/http';
 * 
 * const authMiddleware = createAuthMiddleware(authProvider);
 * 
 * const router = createRouter({
 *   middleware: [authMiddleware],
 *   routes: [...]
 * });
 * ```
 */
export function createAuthMiddleware<TSession extends AuthSession>(
  provider: AuthProvider<TSession>,
  options?: {
    /** Skip authentication for specific paths */
    skipPaths?: string[];
    /** Custom context key for session (default: 'auth') */
    contextKey?: string;
  }
) {
  const skipPaths = options?.skipPaths || [];
  const contextKey = options?.contextKey || 'auth';

  return async (
    request: Request,
    context: any,
    next: () => Promise<Response>
  ): Promise<Response> => {
    // Check if path should skip authentication
    const url = new URL(request.url);
    if (skipPaths.some(path => url.pathname === path || url.pathname.endsWith(path))) {
      return next();
    }

    // Authenticate request
    const session = await provider.authenticate(request);

    if (!session) {
      throw new AuthenticationError('Authentication required');
    }

    // Attach session to context
    context[contextKey] = session;

    return next();
  };
}

/**
 * Create resource authorization middleware
 * 
 * This middleware checks if the authenticated session has access to a specific resource.
 * Requires that authentication middleware has already run.
 * 
 * @example
 * ```typescript
 * import { createResourceAuthMiddleware } from '@superfunctions/auth';
 * 
 * const resourceAuth = createResourceAuthMiddleware(authProvider, {
 *   resourceHeader: 'x-project-id'
 * });
 * ```
 */
export function createResourceAuthMiddleware<TSession extends AuthSession>(
  provider: AuthProvider<TSession>,
  options?: {
    /** Header name containing the resource ID (default: 'x-resource-id') */
    resourceHeader?: string;
    /** Custom context key where session is stored (default: 'auth') */
    contextKey?: string;
    /** Skip paths that don't require resource authorization */
    skipPaths?: string[];
  }
) {
  const resourceHeader = options?.resourceHeader || 'x-resource-id';
  const contextKey = options?.contextKey || 'auth';
  const skipPaths = options?.skipPaths || [];

  return async (
    request: Request,
    context: any,
    next: () => Promise<Response>
  ): Promise<Response> => {
    // Check if path should skip resource authorization
    const url = new URL(request.url);
    if (skipPaths.some(path => url.pathname === path || url.pathname.endsWith(path))) {
      return next();
    }

    const session = context[contextKey] as TSession;

    // If no session exists, skip (auth middleware should have already handled this)
    if (!session) {
      return next();
    }

    // Get resource ID from header
    const resourceId = request.headers.get(resourceHeader);

    if (!resourceId) {
      throw new AuthorizationError(`Missing ${resourceHeader} header`);
    }

    // Check authorization using provider if it supports it
    if (provider.authorize) {
      const authorized = await provider.authorize(session, resourceId);
      if (!authorized) {
        throw new AuthorizationError('Access denied to resource');
      }
    } else {
      // Default: check if resource ID is in session's resourceIds
      if (!session.resourceIds.includes(resourceId)) {
        throw new AuthorizationError('Access denied to resource');
      }
    }

    // Store resource ID in context for convenience
    context.resourceId = resourceId;

    return next();
  };
}
