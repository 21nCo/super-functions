import type { Router } from '@superfunctions/http';

// Next.js App Router handler type signature (Edge/runtime-agnostic)
export type NextHandler = (request: Request, context: { params?: Record<string, string> }) => Promise<Response> | Response;

/**
 * Convert a Superfunctions router to a Next.js App Router route handlers object.
 *
 * Usage in `app/api/route.ts`:
 * export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = toNextHandlers(router)
 */
export function toNextHandlers(router: Router) {
  const wrap = (): NextHandler => async (request) => {
    // Next provides a Web Standard Request; pass through directly to the router.
    // If your router is mounted under a base path (e.g. /api), set basePath when creating it.
    return router.handle(request);
  };

  return {
    GET: wrap(),
    POST: wrap(),
    PUT: wrap(),
    PATCH: wrap(),
    DELETE: wrap(),
    OPTIONS: wrap(),
    HEAD: wrap(),
  } as const;
}
