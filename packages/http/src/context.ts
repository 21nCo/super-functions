/**
 * Context helpers for request handling
 */

import type { RouteContext } from './types.js';

/**
 * Create a RouteContext from a Request and path params
 */
export function createRouteContext(
  request: Request,
  params: Record<string, string>
): RouteContext {
  const url = new URL(request.url);
  const query = url.searchParams;

  // Cache for parsed bodies to avoid multiple parsing
  let jsonCache: Promise<any> | null = null;
  let textCache: Promise<string> | null = null;
  let formDataCache: Promise<FormData> | null = null;

  return {
    params,
    query,
    url,
    
    json: async <T = any>(): Promise<T> => {
      if (!jsonCache) {
        jsonCache = request.json();
      }
      return jsonCache as Promise<T>;
    },
    
    text: async (): Promise<string> => {
      if (!textCache) {
        textCache = request.text();
      }
      return textCache;
    },
    
    formData: async (): Promise<FormData> => {
      if (!formDataCache) {
        formDataCache = request.formData();
      }
      return formDataCache;
    },
  };
}

/**
 * Merge user context with route context
 */
export function mergeContexts<TContext>(
  userContext: TContext,
  routeContext: RouteContext
): TContext & RouteContext {
  return {
    ...userContext,
    ...routeContext,
  };
}
