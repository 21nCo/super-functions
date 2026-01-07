import fs from "node:fs";
import path from "node:path";

export async function initConfig(options: { force: boolean }) {
  try {
    // Auto-detect adapter from package.json
    let adapterType = "drizzle"; // default
    try {
      const pkgPath = path.resolve(process.cwd(), "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkgContent = fs.readFileSync(pkgPath, "utf-8");
        const pkg = JSON.parse(pkgContent);
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if (allDeps["prisma"] || allDeps["@prisma/client"]) {
          adapterType = "prisma";
        } else if (allDeps["kysely"]) {
          adapterType = "kysely";
        } else if (allDeps["drizzle-orm"]) {
          adapterType = "drizzle";
        }
      }
    } catch (e) {
      // Ignore error and use default
    }

    const target = path.resolve(process.cwd(), "superfunctions.config.js");

    // Check if file exists
    if (fs.existsSync(target) && !options.force) {
      console.log("Config already exists. Use --force to overwrite.");
      return;
    }

    const template = `// superfunctions.config.js\n// Minimal JS config (use JS to avoid runtime TS loader requirements)\nimport { defineConfig } from '@superfunctions/cli';\n\nexport default defineConfig({\n  adapter: { type: '${adapterType}' },\n  migrationsDir: './migrations',\n  // Option 1: Specify files manually\n  // libraries: ['./src/index.ts', './src/server.ts'],\n  \n  // Option 2: Auto-discover (recommended)\n  autoDiscover: true,\n});\n`;

    // Write config file
    fs.writeFileSync(target, template, "utf8");
    console.log(
      `Created superfunctions.config.js (detected adapter: ${adapterType})`
    );
  } catch (error: any) {
    // Provide helpful error messages
    if (error.code === 'EACCES') {
      console.error('Error: Permission denied. Cannot write to current directory.');
      console.error('Try running with appropriate permissions or in a different directory.');
    } else if (error.code === 'ENOSPC') {
      console.error('Error: No space left on device.');
    } else if (error.code === 'EROFS') {
      console.error('Error: File system is read-only.');
    } else {
      console.error('Error creating config file:', error.message);
    }
    process.exit(1);
  }
}
