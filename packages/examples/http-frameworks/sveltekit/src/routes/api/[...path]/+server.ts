/**
 * SvelteKit Server Demo
 * 
 * This catch-all route handles all /api/* requests.
 * Run with: npm run dev (from sveltekit directory)
 */

import { toSvelteKitHandlers } from '@superfunctions/http-sveltekit';
import { apiRouter } from '../../../../shared-router';

// Export all HTTP method handlers
export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } = toSvelteKitHandlers(apiRouter);
