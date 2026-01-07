/**
 * Hono Server Demo
 * 
 * Run with: npx tsx hono/server.ts
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { toHono } from '@superfunctions/http-hono';
import { apiRouter } from '../shared-router';

const app = new Hono();
const PORT = 3002;

// Mount the shared router
app.route('/', toHono(apiRouter));

// Start server
serve({
  fetch: app.fetch,
  port: PORT,
}, () => {
  console.log(`✅ Hono server running on http://localhost:${PORT}`);
  console.log(`   Try: curl http://localhost:${PORT}/api/users`);
});
