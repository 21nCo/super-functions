/**
 * Core router implementation
 */

import type {
  Router,
  RouterOptions,
  Route,
  Middleware,
  MatchedRoute,
} from './types.js';
import { compilePattern, matchPath, normalizePath, joinPaths, type CompiledPattern } from './path-matcher.js';
import { createRouteContext, mergeContexts } from './context.js';
import { executeMiddlewareChain, combineMiddleware } from './middleware.js';
import { RouterError, NotFoundError } from './errors.js';

interface CompiledRouteEntry<TContext> {
  route: Route<TContext>;
  compiledPattern: CompiledPattern;
  fullPath: string;
}

/**
 * Create a framework-agnostic HTTP router
 */
export function createRouter<TContext = any>(
  options: RouterOptions<TContext>
): Router<TContext> {
  const {
    routes,
    middleware: globalMiddleware = [],
    context: contextFactory,
    onError,
    basePath = '/',
  } = options;

  // Pre-compile all route patterns
  const compiledRoutes: CompiledRouteEntry<TContext>[] = routes.map((route) => {
    const fullPath = joinPaths(basePath, route.path);
    return {
      route,
      compiledPattern: compilePattern(fullPath),
      fullPath,
    };
  });

  /**
   * Match a route by method and path
   */
  function match(method: string, path: string): MatchedRoute<TContext> | null {
    const normalizedPath = normalizePath(path);

    for (const entry of compiledRoutes) {
      if (entry.route.method !== method) {
        continue;
      }

      const pathMatch = matchPath(entry.compiledPattern, normalizedPath);
      if (pathMatch.matched) {
        return {
          route: entry.route,
          params: pathMatch.params,
        };
      }
    }

    return null;
  }

  /**
   * Handle an incoming request
   */
  async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method;

      // Try to match a route
      const matched = match(method, path);

      if (!matched) {
        throw new NotFoundError(`Route not found: ${method} ${path}`);
      }

      // Create route context
      const routeContext = createRouteContext(request, matched.params);

      // Create user context
      let userContext: TContext;
      if (contextFactory !== undefined) {
        if (typeof contextFactory === 'function') {
          userContext = await (contextFactory as (request: Request) => Promise<TContext> | TContext)(request);
        } else {
          userContext = contextFactory;
        }
      } else {
        userContext = {} as TContext;
      }

      // Merge contexts
      const fullContext = mergeContexts(userContext, routeContext);

      // Combine global and route-specific middleware
      const allMiddleware = combineMiddleware(
        globalMiddleware,
        matched.route.middleware
      );

      // Execute middleware chain + handler
      const response = await executeMiddlewareChain(
        allMiddleware,
        request,
        fullContext,
        async () => matched.route.handler(request, fullContext)
      );

      return response;
    } catch (error) {
      // Handle errors
      if (onError) {
        try {
          return await onError(error as Error, request);
        } catch (handlerError) {
          // If error handler itself fails, return 500
          return Response.json(
            { error: 'Internal Server Error' },
            { status: 500 }
          );
        }
      }

      // Default error handling
      if (error instanceof RouterError) {
        return error.toResponse();
      }

      // Unknown error - don't expose details
      console.error('Router error:', error);
      return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  }

  /**
   * Get all routes
   */
  function getRoutes(): Route<TContext>[] {
    return routes;
  }

  /**
   * Add a route dynamically
   */
  function addRoute(route: Route<TContext>): void {
    routes.push(route);
    const fullPath = joinPaths(basePath, route.path);
    compiledRoutes.push({
      route,
      compiledPattern: compilePattern(fullPath),
      fullPath,
    });
  }

  /**
   * Add middleware dynamically
   */
  function use(middleware: Middleware<TContext>): void {
    globalMiddleware.push(middleware);
  }

  // Create router object
  const router: Router<TContext> = {
    handle,
    getRoutes,
    addRoute,
    use,
    match,
    handler: handle, // Alias for convenience
  };

  return router;
}
