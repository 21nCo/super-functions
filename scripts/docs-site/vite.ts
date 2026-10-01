import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Resolve shared imports through the consumer's exports/conditions and framework plugins. */
export function docsSiteCorePlugin(configUrl: string) {
  const consumer = fileURLToPath(configUrl);
  const dependencies = new Set([
    "@docsfn/core", "@docsfn/core/search-runtime", "@docsfn/sveltekit", "@sveltejs/kit", "gray-matter",
  ]);
  return {
    name: "docs-site-pinned-core",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/") || !dependencies.has(source)) return;
      // Keep export conditions and SvelteKit's virtual error identity, not guessed CJS sibling paths.
      return this.resolve(source, consumer, { skipSelf: true });
    },
  } satisfies Plugin;
}
