import type { Router } from '@superfunctions/http';

/**
 * SvelteKit RequestEvent type (simplified to avoid @sveltejs/kit dependency)
 */
export interface RequestEvent {
  request: Request;
  params: Record<string, string>;
  [key: string]: any;
}

/**
 * SvelteKit RequestHandler type
 */
export type RequestHandler = (event: RequestEvent) => Promise<Response> | Response;

/**
 * Convert a Superfunctions router to a SvelteKit RequestHandler.
 * 
 * Usage in `src/routes/api/+server.ts`:
 * export const GET = toSvelteKitHandler(router);
 * export const POST = toSvelteKitHandler(router);
 */
export function toSvelteKitHandler(router: Router): RequestHandler {
  return async (event: RequestEvent) => {
    // SvelteKit provides a Web Standard Request in event.request
    return router.handle(event.request);
  };
}

/**
 * Alternative: Create all HTTP method handlers at once.
 * 
 * Usage in `src/routes/api/+server.ts`:
 * export const { GET, POST, PUT, PATCH, DELETE } = toSvelteKitHandlers(router);
 */
export function toSvelteKitHandlers(router: Router) {
  const handler = toSvelteKitHandler(router);
  
  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
    OPTIONS: handler,
    HEAD: handler,
  } as const;
}
