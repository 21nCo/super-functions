#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateDrizzleSchema } from './drizzle-codegen.js';
import { generateTypes } from './codegen.js';
import { validateSchema, unwrapEnvelope } from '@datafn/core';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    schema: { type: 'string' },
    adapter: { type: 'string' },
    database: { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
});

const command = positionals[0];

if (values.version) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  console.log(pkg.version);
  process.exit(0);
}

if (values.help || !command) {
  printHelp();
  process.exit(0);
}

(async () => {
  if (command === 'generate') {
    await generateCommand();
  } else if (command === 'generate-types') {
    console.error(`✗ 'generate-types' has been replaced by 'generate'\n  Usage: datafn generate --adapter drizzle --database postgres`);
    process.exit(1);
  } else if (command === 'validate') {
    await validateCommand();
  } else if (command === 'generate-migration') {
    console.error(`✗ 'generate-migration' has been removed\n  Use your ORM's migration tools instead:\n    drizzle-kit generate\n    drizzle-kit migrate`);
    process.exit(1);
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
})().catch((error) => {
  console.error(error instanceof Error ? `✗ Error: ${error.message}` : error);
  process.exit(1);
});

function validateAndResolveExplicitPath(path: string): string {
  const ext = extname(path);

  if (ext === '.json') {
    return resolve(path);
  }

  if (ext === '.ts') {
    if (!path.endsWith('.datafn.ts')) {
      throw new Error(
        `Invalid schema file extension\n` +
          `  Expected: *.datafn.ts or *.json\n` +
          `  Got: ${path}\n\n` +
          `  TypeScript schema files must use .datafn.ts extension for security.`
      );
    }
    return resolve(path);
  }

  throw new Error(
    `Unsupported schema file extension: ${ext}\n` + `  Supported: .json, .datafn.ts`
  );
}

function autoDiscoverSchema(): string {
  const candidates = [
    './schema.datafn.ts',
    './src/schema.datafn.ts',
    './schema.json',
    './src/schema.json',
  ];

  for (const candidate of candidates) {
    const fullPath = resolve(candidate);
    if (existsSync(fullPath)) {
      console.log(`✓ Found schema: ${candidate}`);
      return fullPath;
    }
  }

  throw new Error(
    'No schema file found\n' +
      '  Searched locations:\n' +
      '    - ./schema.datafn.ts\n' +
      '    - ./src/schema.datafn.ts\n' +
      '    - ./schema.json\n' +
      '    - ./src/schema.json\n\n' +
      '  Provide explicit path: --schema <path>'
  );
}

function resolveSchemaPath(): string {
  if (values.schema) {
    return validateAndResolveExplicitPath(values.schema);
  }
  return autoDiscoverSchema();
}

async function loadTypeScriptSchema(path: string): Promise<unknown> {
  const absolutePath = resolve(path);
  const fileUrl = pathToFileURL(absolutePath).href;

  const tryImport = async (): Promise<unknown> => {
    const module = await import(fileUrl);
    const schema = module.default ?? module.schema;
    if (!schema) {
      throw new Error(
        `No schema export found in ${path}\n\n` +
          `  Expected export format:\n` +
          `    export default { resources: [...], relations: [...] };\n` +
          `  Or:\n` +
          `    export const schema = { resources: [...], relations: [...] };\n\n` +
          `  See: https://datafn.dev/docs/cli/generate-types`
      );
    }
    return schema;
  };

  try {
    return await tryImport();
  } catch (err: any) {
    if (err.message.includes('No schema export found')) {
      throw err;
    }
    const needTsx =
      err.code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
      err.message?.includes('Unknown file extension');
    if (needTsx && typeof (globalThis as any).Bun === 'undefined') {
      try {
        const { register } = await import('tsx/esm/api');
        register();
        return await tryImport();
      } catch (tsxErr: any) {
        throw new Error(
          `Failed to load TypeScript schema from ${path}\n\n` +
            `  TypeScript loading requires 'tsx' package in Node.js.\n` +
            `  Install: npm install tsx --save-dev\n` +
            `  Or use Bun for native TypeScript support.\n\n` +
            `  Original error: ${err.message}`
        );
      }
    }
    throw new Error(
      `Failed to load TypeScript schema from ${path}\n` +
        `  ${err.message}\n\n` +
        `  Common issues:\n` +
        `    - Syntax errors in the .datafn.ts file\n` +
        `    - Missing dependencies imported in schema\n` +
        `    - Circular imports\n`
    );
  }
}

async function loadSchema(path: string): Promise<unknown> {
  const ext = extname(path);

  if (ext === '.json') {
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  if (ext === '.ts') {
    return await loadTypeScriptSchema(path);
  }

  throw new Error(`Unsupported file extension: ${ext}`);
}

async function validateCommand() {
  try {
    const schemaPath = resolveSchemaPath();
    const schema = await loadSchema(schemaPath);
    const result = validateSchema(schema);
    unwrapEnvelope(result);
    console.log(`✓ Schema is valid: ${schemaPath}`);
  } catch (err: any) {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  }
}

async function generateCommand() {
  try {
    if (!values.adapter) {
      throw new Error('--adapter is required\n  Supported: drizzle');
    }
    if (!values.database) {
      throw new Error('--database is required\n  Supported: postgres, mysql, sqlite');
    }
    if (values.adapter !== 'drizzle') {
      throw new Error(`Unsupported adapter: ${values.adapter}\n  Currently supported: drizzle`);
    }
    const validDatabases = ['postgres', 'mysql', 'sqlite'];
    if (!validDatabases.includes(values.database)) {
      throw new Error(`Unsupported database: ${values.database}\n  Supported: ${validDatabases.join(', ')}`);
    }

    const schemaPath = resolveSchemaPath();
    const schema = await loadSchema(schemaPath);

    const drizzleOutput = generateDrizzleSchema(schema, values.database as any);
    const outputDir = resolve(values.output || './');
    const schemaOutputPath = join(outputDir, 'datafn-schema.drizzle.ts');

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(schemaOutputPath, drizzleOutput);
    console.log(`✓ Schema written to: ${schemaOutputPath}`);

    const typesOutput = generateTypes(schema);
    const typesOutputPath = join(outputDir, 'datafn-types.ts');
    writeFileSync(typesOutputPath, typesOutput);
    console.log(`✓ Types written to: ${typesOutputPath}`);
  } catch (err: any) {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
@datafn/cli - DataFn CLI

Usage:
  datafn <command> [options]

Commands:
  generate              Generate ORM schema and TypeScript types from DataFn schema
  validate              Validate a DataFn schema file without generating output

Options:
  --adapter <name>     ORM adapter: drizzle (required)
  --database <name>    Database: postgres, mysql, sqlite (required)
  --schema <path>      Path to schema file (.json or .datafn.ts)
                       Optional: Auto-discovers schema.datafn.ts if omitted
  --output <dir>       Output directory (default: ./)
  -h, --help           Show this help message
  -v, --version        Show version

Examples:
  # Generate Drizzle schema + TypeScript types (auto-discover schema)
  datafn generate --adapter drizzle --database postgres

  # Generate from specific schema file
  datafn generate --adapter drizzle --database postgres --schema ./schema.datafn.ts

  # Generate to specific output directory
  datafn generate --adapter drizzle --database sqlite --output ./src/db/

  # Validate a schema file
  datafn validate --schema ./schema.datafn.ts

TypeScript Schema Files:
  TypeScript schema files must use the .datafn.ts extension (e.g., schema.datafn.ts)
  Auto-discovery searches in this order:
    1. ./schema.datafn.ts
    2. ./src/schema.datafn.ts
    3. ./schema.json
    4. ./src/schema.json

Production Workflow:
  1. Edit schema.datafn.ts
  2. datafn generate --adapter drizzle --database postgres
  3. drizzle-kit generate  (generates migration SQL)
  4. drizzle-kit migrate   (applies to database)
`);
}
