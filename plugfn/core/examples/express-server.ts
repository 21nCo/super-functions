/**
 * Example Express server with PlugFn integration
 */

import express from 'express';
import { plugFn } from '../src/index.js';
import { createPlugFnRouter } from '../src/router/index.js';
import { toExpress } from '@superfunctions/http-express';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { githubProvider, slackProvider } from '../src/providers/index.js';

const app = express();

// Initialize PlugFn
const plug = plugFn({
  database: new MemoryAdapter(),
  auth: {
    async getUserId(request: any) {
      // Extract user ID from session/token
      return request.headers['x-user-id'] || 'anonymous';
    },
    async requireAuth(request: any) {
      const userId = request.headers['x-user-id'];
      if (!userId) {
        throw new Error('Unauthorized');
      }
      return userId;
    },
  },
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  encryptionKey: process.env.ENCRYPTION_KEY || 'change-me-32-characters-long!!!',
  integrations: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scopes: ['repo', 'issues'],
    },
    slack: {
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      scopes: ['chat:write'],
    },
  },
});

// Register providers
plug.providers.register(githubProvider);
plug.providers.register(slackProvider);

// Register webhook handlers
plug.webhooks.on('github', 'issues.opened', async (event) => {
  console.log('New GitHub issue:', event.data.issue.title);

  // Notify Slack
  await plug.slack['chat.postMessage']({
    userId: 'system',
    params: {
      channel: '#engineering',
      text: `🐛 New issue: ${event.data.issue.title}\n${event.data.issue.html_url}`,
    },
  });
});

// Mount PlugFn routes
const plugfnRouter = createPlugFnRouter(plug);
app.use('/api/plugfn', toExpress(plugfnRouter));

app.use(express.json());

// Custom routes
app.get('/', (req, res) => {
  res.json({
    name: 'PlugFn Express Server',
    version: '1.0.0',
    endpoints: {
      plugfn: '/api/plugfn',
      providers: '/api/plugfn/providers',
      connections: '/api/plugfn/connections',
      callback: '/api/plugfn/callback',
      webhooks: '/api/plugfn/webhooks/{provider}/{event}',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 PlugFn API: http://localhost:${PORT}/api/plugfn`);
  console.log('\nAvailable endpoints:');
  console.log('  GET  /api/plugfn/providers');
  console.log('  GET  /api/plugfn/connections');
  console.log('  POST /api/plugfn/connections/start');
  console.log('  GET  /api/plugfn/callback');
  console.log('  POST /api/plugfn/webhooks/{provider}/{event}');
});

export { app, plug };
