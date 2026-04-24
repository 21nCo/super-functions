/**
 * Generate ORM-specific schema files from library abstract schemas
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadConfig } from "../utils/config.js";
import { parseLibraryInitializations } from "../utils/parse-library-init.js";
import {
  getSuperfunctionsRegistry,
  discoverSuperfunctionsPackages,
  findNearestNodeModulesPath,
} from "../utils/discover-packages.js";
import { autoDiscoverLibraryFiles } from "../utils/auto-discover.js";
import {
  generateDrizzleSchemaFile,
  generatePrismaSchemaFile,
  generateKyselySchemaFile,
} from "../utils/schema-generators.js";

export interface GenerateSchemaOptions {
  config: string;
  library?: string;
  adapter: "drizzle" | "prisma" | "kysely";
  output: string;
  force: boolean;
}

export async function generateSchemas(
  options: GenerateSchemaOptions
): Promise<void> {
  console.log("🔨 Generating ORM schema files...\n");

  // Load config
  const config = await loadConfig(options.config);
  if (!config) {
    console.log("❌ No config found. Create one with: superfunctions init");
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Config loaded`);
  console.log(`   Adapter: ${options.adapter}`);
  console.log(`   Output: ${options.output}\n`);

  // Discover libraries
  console.log("🔍 Discovering superfunctions libraries...");
  const discoveredPackages = discoverSuperfunctionsPackages(process.cwd());

  if (discoveredPackages.length === 0) {
    console.log("⚠️  No superfunctions libraries found in node_modules");
    console.log("   Checking config for manually specified libraries...\n");
  } else {
    console.log(`   ✅ Found ${discoveredPackages.length} library(ies):`);
    for (const pkg of discoveredPackages) {
      console.log(`      - ${pkg.packageName}`);
    }
  }
  console.log("");

  // Build registry
  const registry = getSuperfunctionsRegistry(process.cwd());

  // Determine which files to parse
  let filesToParse: string[] = [];

  if (config.libraries && config.libraries.length > 0) {
    filesToParse = config.libraries.map((p) => path.resolve(process.cwd(), p));
  } else if (config.autoDiscover) {
    const discoveredFiles = await autoDiscoverLibraryFiles(
      process.cwd(),
      registry,
      config.autoDiscover
    );
    filesToParse = discoveredFiles;
  } else {
    console.log("❌ No library files specified in config");
    process.exitCode = 1;
    return;
  }

  // Parse library initializations
  console.log("📖 Parsing library initialization files...");
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
        console.log(
          `   ✅ ${displayPath}: Found ${inits.length} initialization(s)`
        );
        allLibraryInits.push(...inits);
      }
    } catch (e: any) {
      console.log(`   ❌ Parse error: ${e.message}`);
    }
  }

  if (allLibraryInits.length === 0) {
    console.log("\n⚠️  No library initializations found");
    process.exitCode = 1;
    return;
  }

  // Filter by library if specified
  const libraryInitsToProcess = options.library
    ? allLibraryInits.filter((init) => init.libraryName === options.library)
    : allLibraryInits;

  console.log(
    `\n📦 Processing ${libraryInitsToProcess.length} library(ies):\n`
  );

  // Generate schemas for each library
  for (const init of libraryInitsToProcess) {
    try {
      console.log(`🔨 Generating schema for ${init.libraryName}...`);

      // Import library's getSchema function from user's project context
      // For ESM packages with exports, we need to resolve the package path and import directly
      const require = createRequire(path.join(process.cwd(), 'package.json'));
      let resolvedPath: string;
      try {
        resolvedPath = require.resolve(init.packageName);
      } catch {
        // If require.resolve fails (e.g., ESM with exports), construct the path manually
        const nearestNodeModulesPath = findNearestNodeModulesPath(process.cwd());
        if (!nearestNodeModulesPath) {
          throw new Error(`Unable to locate node_modules for ${init.packageName}`);
        }

        const packageRoot = path.join(nearestNodeModulesPath, init.packageName);
        const pkgJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
        resolvedPath = path.join(
          packageRoot,
          resolveLibraryPackageEntryPoint(pkgJson)
        );
      }
      const libraryPackage = await import(resolvedPath);

      if (!libraryPackage.getSchema) {
        console.log(
          `   ⚠️  ${init.libraryName} doesn't export getSchema function`
        );
        console.log(`   Skipping...\n`);
        continue;
      }

      // Get abstract schema
      const abstractSchema = libraryPackage.getSchema(init.config);

      // Ensure output directory exists
      const outputDir = path.resolve(process.cwd(), options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Generate ORM-specific schema file
      const outputFile = path.join(
        outputDir,
        `${init.libraryName}-schema.${options.adapter === "prisma" ? "prisma" : "ts"}`
      );

      // Check if file exists
      if (fs.existsSync(outputFile) && !options.force) {
        console.log(`   ⚠️  File exists: ${outputFile}`);
        console.log(`   Use --force to overwrite`);
        console.log(`   Skipping...\n`);
        continue;
      }

      // Generate based on adapter type
      let content: string;
      switch (options.adapter) {
        case "drizzle":
          content = generateDrizzleSchemaFile(
            abstractSchema,
            init.libraryName,
            init.config.namespace || init.libraryName
          );
          break;
        case "prisma":
          content = generatePrismaSchemaFile(
            abstractSchema,
            init.libraryName,
            init.config.namespace || init.libraryName
          );
          break;
        case "kysely":
          content = generateKyselySchemaFile(
            abstractSchema,
            init.libraryName,
            init.config.namespace || init.libraryName
          );
          break;
        default:
          throw new Error(`Unsupported adapter: ${options.adapter}`);
      }

      // Write file
      fs.writeFileSync(outputFile, content, "utf-8");

      console.log(
        `   ✅ Generated: ${path.relative(process.cwd(), outputFile)}`
      );
      console.log(`   Tables: ${abstractSchema.schemas.length}`);
      console.log(`   Version: ${abstractSchema.version}\n`);
    } catch (e: any) {
      console.error(`   ❌ Error processing ${init.libraryName}:`, e.message);
      console.log(`   Skipping...\n`);
    }
  }

  console.log("✅ Schema generation complete!\n");
  console.log("📝 Next steps:");
  console.log("   1. Import generated schema in your code");
  console.log(
    "   2. Pass schema to ORM constructor (e.g., drizzle(client, { schema }))"
  );
  console.log(
    "   3. Pass ORM instance to adapter (no schema parameter needed)"
  );
}

export function resolveLibraryPackageEntryPoint(
  packageJson: Record<string, any>
): string {
  const exportRoot = packageJson.exports?.['.'];
  const resolvedExport = resolvePackageExportTarget(exportRoot);

  if (resolvedExport) {
    return resolvedExport;
  }

  if (typeof packageJson.main === 'string' && packageJson.main.length > 0) {
    return packageJson.main;
  }

  return 'index.js';
}

function resolvePackageExportTarget(target: unknown): string | null {
  if (typeof target === 'string' && target.length > 0) {
    return target;
  }

  if (!target || typeof target !== 'object') {
    return null;
  }

  const candidate =
    (target as Record<string, unknown>).import
    ?? (target as Record<string, unknown>).default
    ?? (target as Record<string, unknown>).require;

  return resolvePackageExportTarget(candidate);
}
