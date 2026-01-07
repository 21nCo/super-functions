/**
 * Fastify Server Demo
 * 
 * Run with: npx tsx fastify/server.ts
 */

import Fastify from 'fastify';
import { toFastify } from '@superfunctions/http-fastify';
import { apiRouter } from '../shared-router';

const fastify = Fastify({ logger: false });
const PORT = 3003;

// Register the shared router as a plugin
await fastify.register(toFastify(apiRouter));

// Start server
await fastify.listen({ port: PORT });

console.log(`✅ Fastify server running on http://localhost:${PORT}`);
console.log(`   Try: curl http://localhost:${PORT}/api/users`);
