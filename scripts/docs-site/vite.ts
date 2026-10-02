import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Resolve shared source with its consuming site's pin, preserving dependency-owned imports. */
export function docsSiteCorePlugin(configUrl: string): Plugin {
  const consumer = fileURLToPath(configUrl);
  return {
    name: "docs-site-pinned-core",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      if (source !== "gray-matter" && source !== "@sveltejs/kit" && source !== "@docsfn/core" && !source.startsWith("@docsfn/core/")) return;
      return this.resolve(source, consumer, { skipSelf: true });
    },
  };
}
