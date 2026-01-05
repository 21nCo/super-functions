/**
 * Express Server Demo
 * 
 * Run with: npx tsx express/server.ts
 */

import express from 'express';
import { toExpress } from '@superfunctions/http-express';
import { apiRouter } from '../shared-router';

const app = express();
const PORT = 3001;

// Body parsing middleware
app.use(express.json());

// Mount the shared router
app.use(toExpress(apiRouter));

// Start server
app.listen(PORT, () => {
  console.log(`✅ Express server running on http://localhost:${PORT}`);
  console.log(`   Try: curl http://localhost:${PORT}/api/users`);
});
