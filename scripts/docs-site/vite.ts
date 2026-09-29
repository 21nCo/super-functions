import path from "node:path";
import { createRequire } from "node:module";

/** Resolve shared source with its consuming site's pin, preserving dependency-owned imports. */
export function docsSiteCorePlugin(configUrl: string) {
  const require = createRequire(configUrl);
  const directory = path.dirname(require.resolve("@docsfn/core"));
  return {
    name: "docs-site-pinned-core",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      if (source === "@docsfn/core") return path.join(directory, "index.js");
      if (source === "@docsfn/core/search-runtime") return path.join(directory, "search-runtime.js");
    },
  };
}
