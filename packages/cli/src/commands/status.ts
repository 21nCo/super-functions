/**
 * Status command - show current schema versions and migration status
 */

import { loadConfig } from '../utils/config.js';
import { detectInstalledLibraries } from '../utils/libraries.js';
import { createAdapterFromConfig } from '../utils/adapter-helper.js';
import { diffSchemas } from '../utils/schema-diff.js';
import { discoverLibraryConfigs } from '../utils/discover-configs.js';
import { loadLibraryConfig } from '../utils/load-library-config.js';

export async function showStatus(configPath: string): Promise<void> {
  console.log('📊 Superfunctions Schema Status\n');

  // Load config
  const config = await loadConfig(configPath);
  if (!config) {
    console.log('❌ No config found. Create one with: superfunctions init');
    process.exitCode = 1;
    return;
  }

  console.log('✅ Config loaded');
  console.log(`   Adapter: ${config.adapter?.type ?? 'unknown'}`);
  console.log(`   Migrations dir: ${config.migrationsDir ?? 'not set'}\n`);

  // Detect libraries
  const libraries = detectInstalledLibraries();
  console.log(`📦 Detected ${libraries.length} Superfunctions libraries:`);
  for (const lib of libraries) {
    console.log(`   - ${lib.name}${lib.version ? ` (v${lib.version})` : ''}`);
  }
  console.log('');

  if (libraries.length === 0) {
    console.log('⚠️  No Superfunctions libraries found in node_modules');
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
    // Initialize adapter (creates schema versions table if needed)
    await connection.adapter.initialize();

    // Check if schema versions table exists
    const isHealthy = await connection.adapter.isHealthy();
    if (!isHealthy.healthy) {
      console.warn('⚠️  Database health check failed');
      if (isHealthy.lastError) {
        console.warn(`   ${isHealthy.lastError.message}`);
      }
    }

    // Get current schema versions from database
    console.log('📋 Current schema versions:');
    const currentVersions: Record<string, number> = {};

    for (const lib of libraries) {
      try {
        const version = await connection.adapter.getSchemaVersion(lib.name);
        currentVersions[lib.name] = version;
        console.log(`   ${lib.name}: ${version === 0 ? 'not installed' : `v${version}`}`);
      } catch (e: any) {
        console.log(`   ${lib.name}: error (${e.message})`);
        currentVersions[lib.name] = 0;
      }
    }
    console.log('');

    // Discover library config files
    console.log('🔍 Discovering library configurations...');
    // Pass undefined to let discoverLibraryConfigs use auto-discovery
    const discoveredConfigs = await discoverLibraryConfigs(
      process.cwd(),
      undefined
    );

    if (discoveredConfigs.length === 0) {
      console.log('⚠️  No library configurations found');
      console.log('   Create config files: <library-name>.config.ts');
      console.log('   Example: conduct.config.ts, authfn.config.ts');
      return;
    }

    console.log(`📦 Found ${discoveredConfigs.length} library config(s):`);
    for (const cfg of discoveredConfigs) {
      console.log(`   - ${cfg.libraryName} (${cfg.configPath})`);
    }
    console.log('');

    // Load library schemas from discovered configs
    const librarySchemas = [];
    for (const discovered of discoveredConfigs) {
      try {
        // Load the config file
        const libraryConfig = await loadLibraryConfig(discovered.configPath);

        // Import library package
        const libraryPackage = await import(discovered.packageName);

        // Get schema from library
        if (typeof libraryPackage.getSchema !== 'function') {
          console.warn(
            `⚠️  ${discovered.packageName} does not export getSchema function, skipping`
          );
          continue;
        }

        const schemaResult = libraryPackage.getSchema(libraryConfig);
        librarySchemas.push({
          namespace: discovered.libraryName,
          version: schemaResult.version,
          tables: schemaResult.schemas,
        });
      } catch (e: any) {
        console.warn(
          `⚠️  Failed to load schema for ${discovered.libraryName}: ${e.message}`
        );
      }
    }

    if (librarySchemas.length === 0) {
      console.log('⚠️  No library schemas could be loaded');
      console.log('   Make sure your library config files are valid and libraries export getSchema');
      return;
    }

    // Compare required vs current
    console.log('🔍 Schema analysis:');
    const diff = diffSchemas(librarySchemas, currentVersions);

    let hasOutdated = false;
    let hasNotInstalled = false;

    for (const [namespace, info] of Object.entries(diff)) {
      const statusEmoji =
        info.status === 'up-to-date'
          ? '✅'
          : info.status === 'outdated'
          ? '⚠️ '
          : '❌';

      console.log(
        `   ${statusEmoji} ${namespace}: ${info.current} / ${info.required} (${info.status})`
      );

      if (info.status === 'outdated') hasOutdated = true;
      if (info.status === 'not-installed') hasNotInstalled = true;
    }
    console.log('');

    // Show recommendations
    if (hasNotInstalled) {
      console.log('💡 Run `superfunctions generate` to create initial migrations');
    } else if (hasOutdated) {
      console.log('💡 Run `superfunctions generate` to create migration files for updates');
    } else {
      console.log('✨ All schemas are up-to-date!');
    }
  } finally {
    await connection.close();
  }
}
