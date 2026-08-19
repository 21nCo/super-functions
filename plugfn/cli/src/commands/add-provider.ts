import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export async function addProviderCommand(options: {
  name?: string;
  auth: string;
  output: string;
}) {
  if (!options.name) {
    console.error('❌ Error: Provider name is required (--name <name>)');
    process.exit(1);
  }

  console.log(`🔧 Creating ${options.name} provider...\n`);

  const providerDir = join(options.output, options.name);

  // Create provider directory
  if (!existsSync(providerDir)) {
    mkdirSync(providerDir, { recursive: true });
  }

  // Generate provider template
  const template = generateProviderTemplate(options.name, options.auth);

  // Write provider file
  const filename = join(providerDir, 'index.ts');
  writeFileSync(filename, template);

  console.log(`✓ Created ${filename}`);
  console.log('\n✅ Provider created successfully!');
  console.log('\nNext steps:');
  console.log('  1. Edit the provider file to add your actions and triggers');
  console.log('  2. Register the provider in your config');
  console.log('  3. Test your provider with: plugfn test --provider ' + options.name);
}

function generateProviderTemplate(name: string, authType: string): string {
  const authConfig = getAuthConfig(authType);

  return `import { z } from 'zod';
import type { Provider, AuthType } from 'plugfn';

/**
 * ${capitalize(name)} provider
 */
export const ${name}Provider: Provider = {
  name: '${name}',
  displayName: '${capitalize(name)}',
  version: '1.0.0',
  description: 'Integration with ${capitalize(name)}',
  baseUrl: 'https://api.${name}.com',

  auth: ${authConfig},

  actions: {
    // Define your actions here
    'example.action': {
      name: 'example.action',
      displayName: 'Example Action',
      description: 'An example action',

      parameters: z.object({
        id: z.string().describe('Resource ID'),
      }),

      returns: z.object({
        id: z.string(),
        data: z.any(),
      }),

      execute: async (params, context) => {
        const response = await context.http.get(
          \`\${context.provider.baseUrl}/resource/\${params.id}\`
        );
        return response.data;
      },
    },
  },

  triggers: {
    // Define your triggers here
  },

  rateLimit: {
    requests: 100,
    window: 60000, // 1 minute
  },
};
`;
}

function getAuthConfig(authType: string): string {
  switch (authType) {
    case 'oauth2':
      return `{
    type: 'oauth2' as AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://auth.provider.com/oauth/authorize',
      tokenUrl: 'https://auth.provider.com/oauth/token',
      scopes: ['read', 'write'],
      scopeSeparator: ' ',
    },
  }`;
    case 'api-key':
      return `{
    type: 'api-key' as AuthType.ApiKey,
    config: {
      headerName: 'Authorization',
      prefix: 'Bearer',
    },
  }`;
    case 'jwt':
      return `{
    type: 'jwt' as AuthType.JWT,
    config: {
      algorithm: 'RS256',
    },
  }`;
    case 'basic':
      return `{
    type: 'basic' as AuthType.Basic,
    config: {},
  }`;
    default:
      return `{
    type: 'api-key' as AuthType.ApiKey,
    config: {
      headerName: 'Authorization',
    },
  }`;
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
