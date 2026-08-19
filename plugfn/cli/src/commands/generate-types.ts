import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export async function generateTypesCommand(options: {
  provider?: string;
  output: string;
  all?: boolean;
}) {
  console.log('🔨 Generating TypeScript types...\n');

  if (!options.provider && !options.all) {
    console.error('❌ Error: Please specify --provider <name> or --all');
    process.exit(1);
  }

  // Create output directory
  if (!existsSync(options.output)) {
    mkdirSync(options.output, { recursive: true });
  }

  if (options.provider) {
    generateProviderTypes(options.provider, options.output);
  }

  if (options.all) {
    const providers = ['github', 'slack', 'discord', 'linear', 'stripe'];
    for (const provider of providers) {
      generateProviderTypes(provider, options.output);
    }
  }

  console.log('\n✅ Type generation complete!');
}

function generateProviderTypes(provider: string, outputDir: string) {
  const content = `/**
 * Auto-generated types for ${provider} provider
 * Generated on ${new Date().toISOString()}
 */

export interface ${capitalize(provider)}Config {
  // Configuration types
}

export interface ${capitalize(provider)}Actions {
  // Action types
}

export interface ${capitalize(provider)}Triggers {
  // Trigger types
}
`;

  const filename = join(outputDir, `${provider}.ts`);
  writeFileSync(filename, content);
  console.log(`✓ Generated types for ${provider} -> ${filename}`);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

