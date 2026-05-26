/**
 * Complete workflow example demonstrating all PlugFn features
 */

import { plugFn } from '../src/index.js';
import { MemoryAdapter } from '../src/storage/adapters/memory.js';
import {
  githubProvider,
  slackProvider,
  linearProvider,
  stripeProvider,
} from '../src/providers/index.js';

// Setup
const adapter = new MemoryAdapter();

const demoAuthProvider = {
  async getUserId(request: any): Promise<string | null> {
    return 'demo-user-123';
  },
  async requireAuth(request: any): Promise<string> {
    return 'demo-user-123';
  },
};

const plug = plugFn({
  database: adapter,
  auth: demoAuthProvider,
  baseUrl: 'https://myapp.com',
  encryptionKey: 'demo-encryption-key-32-chars!!',
  integrations: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID || 'demo-client-id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'demo-secret',
      scopes: ['repo', 'issues', 'user'],
    },
    slack: {
      clientId: process.env.SLACK_CLIENT_ID || 'demo-client-id',
      clientSecret: process.env.SLACK_CLIENT_SECRET || 'demo-secret',
      scopes: ['chat:write', 'channels:read'],
    },
    linear: {
      clientId: process.env.LINEAR_CLIENT_ID || 'demo-client-id',
      clientSecret: process.env.LINEAR_CLIENT_SECRET || 'demo-secret',
      scopes: ['read', 'write'],
    },
    stripe: {
      type: 'api-key',
      apiKey: process.env.STRIPE_API_KEY || 'demo-api-key',
    },
  },
  cache: {
    enabled: true,
    ttl: 300000,
  },
  rateLimit: {
    enabled: true,
    respectProviderLimits: true,
  },
});

// Register providers
plug.providers.register(githubProvider);
plug.providers.register(slackProvider);
plug.providers.register(linearProvider);
plug.providers.register(stripeProvider);

async function demonstrateFeatures() {
  console.log('🚀 PlugFn Complete Workflow Example\n');
  console.log('=' .repeat(60));

  // 1. Provider Management
  console.log('\n📦 1. Provider Management');
  console.log('-'.repeat(60));
  
  const providers = plug.providers.list();
  console.log(`Registered providers: ${providers.length}`);
  providers.forEach((p) => {
    const actionCount = Object.keys(p.actions).length;
    const triggerCount = p.triggers ? Object.keys(p.triggers).length : 0;
    console.log(`  ✓ ${p.displayName} (${actionCount} actions, ${triggerCount} triggers)`);
  });

  // 2. Webhook Handlers
  console.log('\n🪝 2. Webhook Event Handlers');
  console.log('-'.repeat(60));

  // GitHub: Issue opened -> Notify Slack and create Linear issue
  plug.webhooks.on('github', 'issues.opened', async (event) => {
    console.log(`  📬 GitHub webhook: Issue "${event.data.issue.title}" opened`);
    
    // This would send a Slack notification (in real scenario with connection)
    console.log('  → Would send Slack notification');
    console.log('  → Would create Linear issue');
  });

  // Stripe: Payment succeeded -> Send confirmation
  plug.webhooks.on('stripe', 'payment_intent.succeeded', async (event) => {
    console.log(`  💰 Stripe webhook: Payment $${event.data.amount / 100} succeeded`);
    console.log('  → Would send confirmation email');
  });

  console.log('  ✓ Registered 2 webhook handlers');

  // 3. Batch Actions
  console.log('\n⚡ 3. Batch Action Execution');
  console.log('-'.repeat(60));
  console.log('  (Requires active connections - demo mode)');

  // 4. Workflows (Conceptual)
  console.log('\n🔄 4. Workflow Automation');
  console.log('-'.repeat(60));
  console.log('  Workflow: GitHub Issue → Slack + Linear');
  console.log('  Trigger: github.issues.opened');
  console.log('  Actions:');
  console.log('    1. Post to Slack #engineering');
  console.log('    2. Create Linear issue');
  console.log('    3. Comment on GitHub with Linear link');
  console.log('  ✓ Workflow definition ready (requires setup to execute)');

  // 5. Metrics
  console.log('\n📊 5. Metrics & Monitoring');
  console.log('-'.repeat(60));
  
  const metrics = await plug.getMetrics({
    timeRange: 'last-24h',
    groupBy: 'provider',
  });
  
  console.log(`  Total requests: ${metrics.totalRequests}`);
  console.log(`  Success rate: ${metrics.successRate.toFixed(2)}%`);
  console.log(`  Avg response time: ${metrics.avgResponseTime.toFixed(0)}ms`);

  // 6. Connection Management (Demo)
  console.log('\n🔐 6. OAuth & Connection Management');
  console.log('-'.repeat(60));
  console.log('  OAuth Flow:');
  console.log('    1. POST /api/plugfn/connections/start');
  console.log('    2. User authorizes on provider');
  console.log('    3. GET /api/plugfn/callback?code=xxx&state=yyy');
  console.log('    4. Connection created & token stored (encrypted)');
  console.log('  ✓ OAuth flow ready');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('✅ Complete Workflow Demonstration');
  console.log('='.repeat(60));
  console.log('\nKey Features Demonstrated:');
  console.log('  ✓ Multi-provider support (GitHub, Slack, Linear, Stripe)');
  console.log('  ✓ Webhook event handling');
  console.log('  ✓ Workflow automation patterns');
  console.log('  ✓ Metrics & monitoring');
  console.log('  ✓ OAuth connection management');
  console.log('  ✓ Type-safe action execution');
  console.log('  ✓ Built-in caching & rate limiting');
  
  console.log('\n📚 Next Steps:');
  console.log('  1. Set up your database adapter');
  console.log('  2. Configure provider credentials');
  console.log('  3. Mount HTTP router (Express/Hono)');
  console.log('  4. Create OAuth connections');
  console.log('  5. Execute actions and build workflows!');
  
  console.log('\n📖 Documentation: https://docs.superfunctions.dev/plugfn');
}

// Run the demo
demonstrateFeatures().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

