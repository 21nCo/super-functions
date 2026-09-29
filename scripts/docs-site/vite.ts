import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

/** Resolve shared source with its consuming site's pin, preserving dependency-owned imports. */
export function docsSiteCorePlugin(configUrl: string): Plugin {
  const require = createRequire(configUrl);
  let packageDir = path.dirname(require.resolve("@docsfn/core"));
  while (!existsSync(path.join(packageDir, "package.json"))) {
    const parent = path.dirname(packageDir);
    if (parent === packageDir) throw new Error("Could not locate @docsfn/core package.json");
    packageDir = parent;
  }
  const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  const coreEntry = path.resolve(packageDir, manifest.exports["."].import);
  const searchEntry = path.resolve(packageDir, manifest.exports["./search-runtime"].import);
  return {
    name: "docs-site-pinned-core",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      if (source === "@docsfn/core") return coreEntry;
      if (source === "@docsfn/core/search-runtime") return searchEntry;
    },
  };
}
