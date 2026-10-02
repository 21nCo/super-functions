import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Shared source uses consumer-owned dependencies and Vite's active export conditions. */
export function docsSiteCorePlugin(configUrl: string): Plugin {
  const consumer = fileURLToPath(configUrl);
  const manifest = JSON.parse(readFileSync(new URL("./package.json", configUrl), "utf8"));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (!dependencies["@docsfn/core"]) {
    throw new Error("Run shared docs tooling from a consumer declaring @docsfn/core.");
  }
  return {
    name: "docs-site-pinned-core",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      const owner = source.startsWith("@docsfn/core/") ? "@docsfn/core" : source;
      if (!["@docsfn/core", "@docsfn/sveltekit", "@sveltejs/kit", "gray-matter", "vitest", "vite"].includes(owner)) return;
      if (!dependencies[owner]) throw new Error(`Docs consumer must declare ${owner}.`);
      // Preserve browser/import/SSR conditions, query handling and package exports.
      // Dependency-owned imports are deliberately not intercepted.
      return this.resolve(source, consumer, { skipSelf: true });
    },
  };
}
