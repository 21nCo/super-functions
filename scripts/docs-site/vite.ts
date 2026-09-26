import path from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Resolve shared source with its consuming site's pin, preserving dependency-owned imports. */
export function docsSiteCorePlugin(configUrl: string): Plugin {
  const require = createRequire(configUrl);
  const directory = path.dirname(require.resolve("@docsfn/core"));
  return {
    name: "docs-site-pinned-core",
    resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      if (source === "@docsfn/core") return path.join(directory, "index.js");
      if (source === "@docsfn/core/search-runtime") return path.join(directory, "search-runtime.js");
    },
  };
}
