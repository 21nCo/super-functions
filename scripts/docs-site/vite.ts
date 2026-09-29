import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Resolve shared source with its consuming site's pin, preserving dependency-owned imports. */
export function docsSiteCorePlugin(configUrl: string): Plugin {
  const require = createRequire(configUrl);
  const coreEntry = require.resolve("@docsfn/core");
  const searchEntry = require.resolve("@docsfn/core/search-runtime");
  return {
    name: "docs-site-pinned-core",
    resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      if (source === "@docsfn/core") return coreEntry;
      if (source === "@docsfn/core/search-runtime") return searchEntry;
    },
  };
}
