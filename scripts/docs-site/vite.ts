import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Resolve shared source with its consuming site's pin, preserving dependency-owned imports. */
export function docsSiteCorePlugin(configUrl: string) {
  const require = createRequire(configUrl);
  const directory = path.dirname(require.resolve("@docsfn/core"));
  const sveltekitDirectory = path.dirname(require.resolve("@docsfn/sveltekit"));
  return {
    name: "docs-site-pinned-core",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      if (source === "@docsfn/core") return path.join(directory, "index.js");
      if (source === "@docsfn/core/search-runtime") return path.join(directory, "search-runtime.js");
      if (source === "@docsfn/sveltekit") return path.join(sveltekitDirectory, "index.mjs");
      if (source === "@sveltejs/kit") return this.resolve(source, fileURLToPath(configUrl), { skipSelf: true });
      if (source === "gray-matter") return require.resolve("gray-matter");
    },
  } satisfies Plugin;
}
