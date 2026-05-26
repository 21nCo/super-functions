/**
 * Basic usage example for PlugFn SDK
 * This file demonstrates how to use the PlugFn SDK
 */

import { plugFn } from '../src/index.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import { githubProvider } from '../src/providers/github/index.js';

// Create a simple auth provider for demo
const demoAuthProvider = {
  async getUserId(request: any): Promise<string | null> {
    return 'demo-user-123';
  },
  async requireAuth(request: any): Promise<string> {
    return 'demo-user-123';
  },
};

// Initialize PlugFn
const plug = plugFn({
  database: new MemoryAdapter(),
  auth: demoAuthProvider,
  baseUrl: 'https://myapp.com',
  encryptionKey: 'your-32-character-encryption-key-here!!',
  integrations: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || 'your-github-client-id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'your-github-client-secret',
      scopes: ['repo', 'issues', 'user'],
    },
  },
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
  },
  rateLimit: {
    enabled: true,
    respectProviderLimits: true,
  },
  retry: {
    enabled: true,
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',
  },
});

// Register GitHub provider
plug.providers.register(githubProvider);

async function main() {
  console.log('🚀 PlugFn Basic Usage Example\n');

  // 1. Get OAuth authorization URL
  console.log('1. Getting OAuth authorization URL...');
  try {
    const authUrl = await plug.connections.getAuthUrl({
      userId: 'demo-user-123',
      provider: 'github',
      redirectUri: 'https://myapp.com/integrations/callback',
      state: 'random-state-string',
    });
    console.log('   Auth URL:', authUrl.substring(0, 50) + '...\n');
  } catch (error) {
    console.log('   (Demo mode - OAuth flow requires real credentials)\n');
  }

  // 2. List available providers
  console.log('2. Listing available providers...');
  const providers = plug.providers.list();
  console.log(`   Found ${providers.length} provider(s):`);
  providers.forEach((p) => {
    console.log(`   - ${p.displayName} (${p.name})`);
  });
  console.log();

  // 3. Execute an action (would require a real connection)
  console.log('3. Example: Creating a GitHub issue');
  console.log('   (Requires active connection - skipped in demo)\n');

  // 4. Register webhook handler
  console.log('4. Registering webhook handler...');
  plug.webhooks.on('github', 'issues.opened', async (event) => {
    console.log('   📬 Webhook received: New issue opened!');
    console.log('   Issue:', event.data?.issue?.title);
  });
  console.log('   ✓ Handler registered for github.issues.opened\n');

  // 5. Get metrics
  console.log('5. Getting metrics...');
  const metrics = await plug.getMetrics({
    timeRange: 'last-24h',
    groupBy: 'provider',
  });
  console.log('   Total requests:', metrics.totalRequests);
  console.log('   Success rate:', metrics.successRate.toFixed(2) + '%\n');

  console.log('✅ Example completed!');
}

// Run the example
main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

