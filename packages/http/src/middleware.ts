/**
 * Middleware chain execution
 */

import type { Middleware, RouteContext } from './types.js';

/**
 * Execute a chain of middleware functions
 * Middleware can:
 * - Call next() to continue to the next middleware/handler
 * - Return a Response to short-circuit the chain
 * - Throw an error to trigger error handling
 */
export async function executeMiddlewareChain<TContext>(
  middlewares: Middleware<TContext>[],
  request: Request,
  context: TContext & RouteContext,
  finalHandler: () => Promise<Response>
): Promise<Response> {
  let index = 0;

  const next = async (): Promise<Response> => {
    // If we've reached the end of middleware, call the final handler
    if (index >= middlewares.length) {
      return finalHandler();
    }

    // Get current middleware and increment index
    const middleware = middlewares[index++];
    
    // Execute middleware
    return middleware(request, context, next);
  };

  return next();
}

/**
 * Combine multiple middleware arrays into one
 */
export function combineMiddleware<TContext>(
  ...middlewareArrays: (Middleware<TContext>[] | undefined)[]
): Middleware<TContext>[] {
  return middlewareArrays.filter((arr): arr is Middleware<TContext>[] => !!arr).flat();
}
