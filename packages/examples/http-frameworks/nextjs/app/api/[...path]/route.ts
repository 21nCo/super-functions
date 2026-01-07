/**
 * Next.js App Router Demo
 * 
 * This catch-all route handles all /api/* requests.
 * Run with: npm run dev (from nextjs directory)
 */

import { toNextHandlers } from '@superfunctions/http-next';
import { apiRouter } from '../../../../shared-router';

// Export all HTTP method handlers
export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } = toNextHandlers(apiRouter);

// Enable edge runtime (optional)
// export const runtime = 'edge';
