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

/** Resolve a router from the complete SvelteKit event for request-scoped bindings. */
export type RouterFactory = (event: RequestEvent) => Promise<Router> | Router;
export type RouterSource = Router | RouterFactory;

/**
 * Convert a Superfunctions router to a SvelteKit RequestHandler.
 * 
 * Usage in `src/routes/api/+server.ts`:
 * export const GET = toSvelteKitHandler(router);
 * export const POST = toSvelteKitHandler(router);
 */
export function toSvelteKitHandler(source: RouterSource): RequestHandler {
  return async (event: RequestEvent) => {
    // SvelteKit provides a Web Standard Request in event.request
    const router = typeof source === 'function' ? await source(event) : source;
    return router.handle(event.request);
  };
}

/**
 * Alternative: Create all HTTP method handlers at once.
 * 
 * Usage in `src/routes/api/+server.ts`:
 * export const { GET, POST, PUT, PATCH, DELETE } = toSvelteKitHandlers(router);
 */
export function toSvelteKitHandlers(source: RouterSource) {
  const handler = toSvelteKitHandler(source);
  
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
