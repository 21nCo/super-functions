import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export async function initCommand(options: { directory: string }) {
  const { directory } = options;

  console.log(`🚀 Initializing PlugFn project in ${directory}...\n`);

  // Create directories
  const dirs = [
    'src',
    'src/providers',
    'src/workflows',
    'types',
  ];

  for (const dir of dirs) {
    const path = join(directory, dir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
      console.log(`✓ Created ${dir}/`);
    }
  }

  // Create config file
  const configPath = join(directory, 'plugfn.config.ts');
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      `import { plugFn } from '@superfunctions/plugfn';
import { drizzleAdapter } from '@superfunctions/db/adapters';

// Configure your database
// const db = drizzle(client, { schema });
// const adapter = drizzleAdapter({ db, dialect: 'postgres' });

// Configure your auth provider
// const auth = createAuthFn({ database: adapter });

export const plug = plugFn({
  // database: adapter,
  // auth: auth.provider,
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  encryptionKey: process.env.ENCRYPTION_KEY!,
  integrations: {
    // Configure your integrations here
    // github: {
    //   clientId: process.env.GITHUB_CLIENT_ID,
    //   clientSecret: process.env.GITHUB_CLIENT_SECRET,
    //   scopes: ['repo', 'user']
    // }
  },
  cache: {
    enabled: true,
    ttl: 300000
  },
  rateLimit: {
    enabled: true,
    respectProviderLimits: true
  }
});
`
    );
    console.log(`✓ Created plugfn.config.ts`);
  }

  // Create .env.example
  const envPath = join(directory, '.env.example');
  if (!existsSync(envPath)) {
    writeFileSync(
      envPath,
      `# PlugFn Configuration
BASE_URL=http://localhost:3000
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=replace-with-a-32-byte-hex-key

# Provider Credentials
# GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# SLACK_CLIENT_ID=
# SLACK_CLIENT_SECRET=
# STRIPE_API_KEY=
`
    );
    console.log(`✓ Created .env.example`);
  }

  // Create example file
  const examplePath = join(directory, 'src/example.ts');
  if (!existsSync(examplePath)) {
    writeFileSync(
      examplePath,
      `import { plug } from '../plugfn.config.js';
import { githubProvider } from '@superfunctions/plugfn/providers';

// Register providers
plug.providers.register(githubProvider);

// Example: Get auth URL
async function connectGitHub(userId: string) {
  const authUrl = await plug.connections.getAuthUrl({
    userId,
    provider: 'github',
    redirectUri: 'http://localhost:3000/api/plugfn/callback',
    state: 'random-state'
  });
  
  console.log('Auth URL:', authUrl);
  return authUrl;
}

// Example: Execute action
async function createIssue(userId: string) {
  const issue = await plug.github['issues.create']({
    userId,
    params: {
      owner: 'myorg',
      repo: 'myrepo',
      title: 'Test issue from PlugFn'
    }
  });
  
  console.log('Created issue:', issue);
  return issue;
}

// Example: Register webhook handler
plug.webhooks.on('github', 'issues.opened', async (event) => {
  console.log('New issue:', event.data.issue.title);
});
`
    );
    console.log(`✓ Created src/example.ts`);
  }

  console.log('\n✅ PlugFn project initialized!');
  console.log('\nNext steps:');
  console.log('  1. Copy .env.example to .env and add your credentials');
  console.log('  2. Configure your database and auth in plugfn.config.ts');
  console.log('  3. Register providers and start building!');
  console.log('\nDocumentation: https://docs.superfunctions.dev/plugfn');
}
