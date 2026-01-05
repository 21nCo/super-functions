/**
 * Generate command - create migration files from schema diffs
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../utils/config.js';
import { createAdapterFromConfig, getRawConnection } from '../utils/adapter-helper.js';
import { diffTables, createMigrationPlan } from '../utils/schema-diff.js';
import {
  generateDrizzleMigration,
  generatePrismaMigration,
  generateKyselyMigration,
  type Dialect,
} from '../utils/generators.js';
import {
  introspectPostgres,
  introspectMySQL,
  introspectSQLite,
} from '../utils/introspection.js';
import { parseLibraryInitializations } from '../utils/parse-library-init.js';
import { getSuperfunctionsRegistry, discoverSuperfunctionsPackages } from '../utils/discover-packages.js';
import { autoDiscoverLibraryFiles, toRelativePaths } from '../utils/auto-discover.js';
import type { TableSchema } from '@superfunctions/db';

export async function generateMigrations(
  configPath: string,
  libraryFilter?: string,
  dryRun: boolean = false
): Promise<void> {
  console.log('🔨 Generating migrations...\n');

  // Load config
  const config = await loadConfig(configPath);
  if (!config) {
    console.log('❌ No config found. Create one with: superfunctions init');
    process.exitCode = 1;
    return;
  }

  const adapterType = config.adapter?.type;
  if (!adapterType) {
    console.log('❌ adapter.type is required in config');
    process.exitCode = 1;
    return;
  }

  const migrationsDir = config.migrationsDir ?? './migrations';

  console.log('✅ Config loaded');
  console.log(`   Adapter: ${adapterType}`);
  console.log(`   Migrations dir: ${migrationsDir}\n`);

  // Discover superfunctions packages
  console.log('🔍 Discovering superfunctions libraries...');
  const discoveredPackages = discoverSuperfunctionsPackages(process.cwd());
  
  if (discoveredPackages.length === 0) {
    console.log('⚠️  No superfunctions libraries found in node_modules');
    console.log('   Make sure libraries have "superfunctions" metadata in package.json');
    console.log('   Example:');
    console.log('   {');
    console.log('     "name": "conduct",');
    console.log('     "superfunctions": {');
    console.log('       "initFunction": "createConductBackend"');
    console.log('     }');
    console.log('   }');
  } else {
    console.log(`   ✅ Found ${discoveredPackages.length} superfunctions library(ies):`);
    for (const pkg of discoveredPackages) {
      console.log(`      - ${pkg.packageName} (${pkg.initFunction})`);
    }
  }
  console.log('');
  
  // Build registry from discovered packages
  const registry = getSuperfunctionsRegistry(process.cwd());
  
  // Determine which files to parse
  let filesToParse: string[] = [];
  
  if (config.libraries && config.libraries.length > 0) {
    // Use explicitly specified files
    console.log('📂 Using specified library files...');
    filesToParse = config.libraries.map(p => path.resolve(process.cwd(), p));
  } else if (config.autoDiscover) {
    // Auto-discover files
    console.log('🔍 Auto-discovering library initialization files...');
    const discoveredFiles = await autoDiscoverLibraryFiles(
      process.cwd(),
      registry,
      config.autoDiscover
    );
    
    if (discoveredFiles.length === 0) {
      console.log('❌ No library initialization files found');
      console.log('   Try specifying files explicitly:');
      console.log('   libraries: ["./src/conduct.ts", "./src/auth.ts"]');
      process.exitCode = 1;
      return;
    }
    
    filesToParse = discoveredFiles;
    console.log(`   ✅ Found ${filesToParse.length} file(s) with initializations:`);
    const relativePaths = toRelativePaths(filesToParse, process.cwd());
    for (const relPath of relativePaths) {
      console.log(`      - ${relPath}`);
    }
  } else {
    console.log('❌ No library files specified in config');
    console.log('   Option 1: Specify files explicitly');
    console.log('   libraries: ["./src/conduct.ts", "./src/auth.ts"]');
    console.log('');
    console.log('   Option 2: Enable auto-discovery');
    console.log('   autoDiscover: true');
    process.exitCode = 1;
    return;
  }
  
  console.log('');
  
  // Parse library initialization files
  console.log('📖 Parsing library initialization files...');
  const allLibraryInits: any[] = [];
  
  for (const filePath of filesToParse) {
    if (!fs.existsSync(filePath)) {
      console.log(`   ⚠️  File not found: ${filePath}`);
      continue;
    }
    
    try {
      const inits = parseLibraryInitializations(filePath, registry);
      if (inits.length > 0) {
        const displayPath = path.relative(process.cwd(), filePath);
        console.log(`   ✅ ${displayPath}: Found ${inits.length} initialization(s)`);
        allLibraryInits.push(...inits);
      }
    } catch (e: any) {
      const displayPath = path.relative(process.cwd(), filePath);
      console.log(`   ❌ ${displayPath}: Parse error - ${e.message}`);
    }
  }

  if (allLibraryInits.length === 0) {
    console.log('\n⚠️  No library initializations found');
    console.log('   Make sure your files contain calls like:');
    console.log('   - createConductBackend({ ... })');
    console.log('   - createAuthFn({ ... })');
    console.log('   - createSendFn({ ... })');
    process.exitCode = 1;
    return;
  }
  
  // Filter if specified
  const libraryInitsToProcess = libraryFilter
    ? allLibraryInits.filter(init => init.libraryName === libraryFilter)
    : allLibraryInits;

  console.log(`\n📦 Found ${libraryInitsToProcess.length} library initialization(s):`);
  for (const init of libraryInitsToProcess) {
    console.log(`   - ${init.libraryName} (${init.functionName})`);
  }
  console.log('');

  // Load library configs and generate schemas
  const librarySchemas: Array<{
    namespace: string;
    version: number;
    tables: TableSchema[];
  }> = [];

  for (const init of libraryInitsToProcess) {
    try {
      console.log(`📖 Processing ${init.libraryName}...`);

      // Import library's schema generator
      const libraryPackage = await import(init.packageName);

      if (!libraryPackage.getSchema) {
        console.log(`   ⚠️  ${init.libraryName} doesn't export getSchema function`);
        console.log(`   Library must export getSchema(config) for CLI integration`);
        console.log(`   Skipping...\n`);
        continue;
      }

      // Generate schema from extracted config
      const schema = libraryPackage.getSchema(init.config);

      librarySchemas.push({
        namespace: init.libraryName,
        version: schema.version,
        tables: schema.schemas,
      });

      console.log(`   ✅ Generated schema (v${schema.version}, ${schema.schemas.length} tables)\n`);
    } catch (e: any) {
      console.error(`   ❌ Error processing ${init.libraryName}:`, e.message);
      console.log(`   Skipping...\n`);
    }
  }

  if (librarySchemas.length === 0) {
    console.log('❌ No valid schemas generated');
    process.exitCode = 1;
    return;
  }

  // Connect to database
  let connection;
  try {
    console.log('🔌 Connecting to database...');
    connection = await createAdapterFromConfig(config);
    console.log('✅ Connected\n');
  } catch (e: any) {
    console.error('❌ Failed to connect to database:', e.message);
    console.log('\n💡 Tip: Make sure your database is running and connection details are correct');
    process.exitCode = 1;
    return;
  }

  try {
    // Initialize adapter
    await connection.adapter.initialize();

    // Introspect current database schema
    console.log('🔍 Introspecting database schema...');
    const rawConn = getRawConnection(connection);
    let currentTables;

    if (connection.dialect === 'postgres') {
      currentTables = await introspectPostgres(rawConn, 'public');
    } else if (connection.dialect === 'mysql') {
      const dbName = config.adapter?.drizzle?.connectionString?.split('/').pop()?.split('?')[0] ?? 'database';
      currentTables = await introspectMySQL(rawConn, dbName);
    } else if (connection.dialect === 'sqlite') {
      currentTables = await introspectSQLite(rawConn);
    } else {
      throw new Error(`Unsupported dialect: ${connection.dialect}`);
    }

    console.log(`   Found ${currentTables.length} existing tables\n`);

    // Generate migrations for each library
    const generatedFiles: Array<{ namespace: string; filename: string; content: string }> = [];

    for (const lib of librarySchemas) {
      console.log(`📝 Analyzing ${lib.namespace}...`);

      // Get current version from database
      const currentVersion = await connection.adapter.getSchemaVersion(lib.namespace);
      console.log(`   Current version: ${currentVersion === 0 ? 'not installed' : `v${currentVersion}`}`);
      console.log(`   Target version: v${lib.version}`);

      if (currentVersion >= lib.version) {
        console.log(`   ✅ Already up-to-date\n`);
        continue;
      }

      // Compare schemas
      const tableDiffs = diffTables(lib.tables, currentTables);

      if (tableDiffs.length === 0) {
        console.log(`   ℹ️  No schema changes detected\n`);
        continue;
      }

      console.log(`   Found ${tableDiffs.length} change(s):`);
      for (const diff of tableDiffs) {
        if (diff.action === 'create') {
          console.log(`      - CREATE table ${diff.tableName}`);
        } else if (diff.action === 'alter') {
          console.log(`      - ALTER table ${diff.tableName}`);
          if (diff.missingColumns && diff.missingColumns.length > 0) {
            console.log(`        + Add columns: ${diff.missingColumns.join(', ')}`);
          }
          if (diff.extraColumns && diff.extraColumns.length > 0) {
            console.log(`        - Extra columns: ${diff.extraColumns.join(', ')}`);
          }
        } else if (diff.action === 'drop') {
          console.log(`      - DROP table ${diff.tableName}`);
        }
      }

      // Create migration plan
      const plan = createMigrationPlan(lib.namespace, currentVersion, lib.version, tableDiffs);

      // Generate migration file based on adapter type
      let migrationFile: { filename: string; content: string };

      if (adapterType === 'drizzle') {
        migrationFile = generateDrizzleMigration(plan, lib.tables, connection.dialect as Dialect);
      } else if (adapterType === 'prisma') {
        migrationFile = generatePrismaMigration(plan, lib.tables, connection.dialect as Dialect);
      } else if (adapterType === 'kysely') {
        migrationFile = generateKyselyMigration(plan, lib.tables, connection.dialect as Dialect);
      } else {
        console.log(`   ⚠️  Unsupported adapter type: ${adapterType}`);
        continue;
      }

      generatedFiles.push({
        namespace: lib.namespace,
        filename: migrationFile.filename,
        content: migrationFile.content,
      });

      console.log(`   ✅ Generated: ${migrationFile.filename}\n`);
    }

    if (generatedFiles.length === 0) {
      console.log('✨ No migrations needed - all schemas are up-to-date!');
      return;
    }

    // Write files (unless dry run)
    if (dryRun) {
      console.log('📄 Dry run - showing generated files:\n');
      for (const file of generatedFiles) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`File: ${file.filename}`);
        console.log('='.repeat(60));
        console.log(file.content);
      }
      console.log(`\n${'='.repeat(60)}\n`);
      console.log('💡 Run without --dry-run to write these files');
    } else {
      // Ensure migrations directory exists
      if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
        console.log(`📁 Created directory: ${migrationsDir}\n`);
      }

      console.log('💾 Writing migration files...\n');
      for (const file of generatedFiles) {
        const fullPath = path.join(migrationsDir, file.filename);

        // For Prisma, need to create directory for migration
        if (adapterType === 'prisma') {
          const migrationDir = path.dirname(fullPath);
          if (!fs.existsSync(migrationDir)) {
            fs.mkdirSync(migrationDir, { recursive: true });
          }
        }

        fs.writeFileSync(fullPath, file.content, 'utf-8');
        console.log(`   ✅ ${fullPath}`);
      }

      console.log(`\n✨ Generated ${generatedFiles.length} migration file(s)`);
      console.log('\n💡 Next steps:');
      console.log('   1. Review the generated migration files');
      console.log('   2. Apply migrations using your ORM tool:');
      if (adapterType === 'drizzle') {
        console.log('      npx drizzle-kit push');
      } else if (adapterType === 'prisma') {
        console.log('      npx prisma migrate deploy');
      } else if (adapterType === 'kysely') {
        console.log('      npx kysely migrate latest');
      }
      console.log('   3. (Optional) Run `superfunctions migrate` to apply via CLI');
    }
  } finally {
    await connection.close();
  }
}
