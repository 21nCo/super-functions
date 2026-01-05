#!/usr/bin/env node

/**
 * @superfunctions/cli - CLI tool for schema management
 */

import { Command } from "commander";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("superfunctions")
  .description("CLI tool for Superfunctions schema management and migrations")
  .version(pkg.version);

program
  .command("status")
  .description("Check schema version status for all libraries")
  .option(
    "-c, --config <path>",
    "Path to superfunctions config",
    "superfunctions.config.js"
  )
  .action(async (opts) => {
    const { showStatus } = await import("./commands/status.js");
    try {
      await showStatus(opts.config);
    } catch (e: any) {
      console.error("❌ Error:", e.message);
      process.exitCode = 1;
    }
  });

program
  .command("init")
  .description("Initialize a superfunctions.config.js in the current directory")
  .option("-f, --force", "Overwrite if exists", false)
  .action(async (opts) => {
    const { initConfig } = await import("./commands/init.js");
    await initConfig(opts);
  });

program
  .command("generate-migration [library]")
  .description("Generate migrations for libraries")
  .option(
    "-c, --config <path>",
    "Path to superfunctions config",
    "superfunctions.config.js"
  )
  .option(
    "--dry-run",
    "Show what would be generated without writing files",
    false
  )
  .action(async (library, options) => {
    const { generateMigrations } = await import("./commands/generate.js");
    try {
      await generateMigrations(options.config, library, options.dryRun);
    } catch (e: any) {
      console.error("❌ Error:", e.message);
      process.exitCode = 1;
    }
  });

program
  .command("generate-schema")
  .description(
    "Generate ORM-specific schema files from library abstract schemas"
  )
  .option(
    "-c, --config <path>",
    "Path to superfunctions config",
    "superfunctions.config.js"
  )
  .option("-l, --library <name>", "Generate schema for specific library only")
  .option(
    "-a, --adapter <type>",
    "Target adapter (drizzle|prisma|kysely)",
    "drizzle"
  )
  .option("-o, --output <path>", "Output directory", "./superfunctions")
  .option("--force", "Overwrite existing files", false)
  .action(async (options) => {
    const { generateSchemas } = await import("./commands/generate-schema.js");
    try {
      await generateSchemas(options);
    } catch (e: any) {
      console.error("❌ Error:", e.message);
      process.exitCode = 1;
    }
  });

program
  .command("validate")
  .description("Validate configuration file structure")
  .option(
    "-c, --config <path>",
    "Path to superfunctions config",
    "superfunctions.config.js"
  )
  .action(async (opts) => {
    const { loadConfig } = await import("./utils/config.js");
    try {
      const cfg = await loadConfig(opts.config);
      if (!cfg) {
        console.log("Config not found");
        return;
      }
      if (!cfg.adapter?.type) throw new Error("adapter.type is required");
      if (!cfg.migrationsDir) throw new Error("migrationsDir is required");
      console.log("✅ Config is valid");
    } catch (e: any) {
      console.error("❌ Config invalid:", e.message);
      process.exitCode = 1;
    }
  });

program
  .command("how-to-migrate")
  .description("Apply migrations using your ORM tool")
  .option(
    "-c, --config <path>",
    "Path to superfunctions config",
    "superfunctions.config.js"
  )
  .action(async (opts) => {
    const { loadConfig } = await import("./utils/config.js");
    try {
      const cfg = await loadConfig(opts.config);
      if (!cfg) {
        console.log("❌ No config found");
        return;
      }
      const adapterType = cfg.adapter?.type;
      console.log("🚀 To apply migrations, use your ORM tool:\n");
      if (adapterType === "drizzle") {
        console.log("   npx drizzle-kit push");
        console.log("   # or: npx drizzle-kit migrate");
      } else if (adapterType === "prisma") {
        console.log("   npx prisma migrate deploy");
      } else if (adapterType === "kysely") {
        console.log("   npx kysely migrate latest");
      } else {
        console.log("   (Unknown adapter type)");
      }
      console.log(
        "\n💡 This ensures migrations are applied using your ORM's official tools."
      );
    } catch (e: any) {
      console.error("❌ Error:", e.message);
      process.exitCode = 1;
    }
  });

program.parse();
