/**
 * Hono adapter for @superfunctions/http
 */

import type { Router } from '@superfunctions/http';
import { Hono } from 'hono';

/**
 * Convert a @superfunctions/http Router to a Hono instance
 * 
 * Hono uses Web Standards natively, so translation is minimal.
 * 
 * Usage:
 * ```typescript
 * const router = createRouter({ routes: [...] });
 * app.route('/api', toHono(router));
 * ```
 */
export function toHono(router: Router): Hono {
  const app = new Hono();

  // Use catch-all to delegate all routing to the router
  app.all('*', async (c) => {
    // Hono's c.req.raw is already a Web Standard Request
    const webRequest = c.req.raw;
    
    // Handle with router (router does all routing)
    const webResponse = await router.handle(webRequest);
    
    // Return Web Standard Response (Hono handles this natively)
    return webResponse;
  });

  return app;
}
