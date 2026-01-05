import fs from "node:fs";
import path from "node:path";

export async function initConfig(options: { force: boolean }) {
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
  if (fs.existsSync(target) && !options.force) {
    console.log("Config already exists. Use --force to overwrite.");
    return;
  }
  const template = `// superfunctions.config.js\n// Minimal JS config (use JS to avoid runtime TS loader requirements)\nimport { defineConfig } from '@superfunctions/cli';\n\nexport default defineConfig({\n  adapter: { type: '${adapterType}' },\n  migrationsDir: './migrations',\n  // Option 1: Specify files manually\n  // libraries: ['./src/index.ts', './src/server.ts'],\n  \n  // Option 2: Auto-discover (recommended)\n  autoDiscover: true,\n});\n`;
  fs.writeFileSync(target, template, "utf8");
  console.log(
    `Created superfunctions.config.js (detected adapter: ${adapterType})`
  );
}
