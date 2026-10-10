import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

interface DependencyManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function dependencyMap(input: unknown): Record<string, string> | undefined {
  if (input === undefined) return;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid docs consumer dependency map");
  }
  return Object.fromEntries(Object.entries(input).map(([name, version]): [string, string] => {
    if (typeof version !== "string") throw new Error(`Invalid docs dependency declaration: ${name}`);
    return [name, version];
  }));
}

function dependencyManifest(input: unknown): DependencyManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid docs consumer package.json");
  }
  return {
    dependencies: dependencyMap("dependencies" in input ? input.dependencies : undefined),
    devDependencies: dependencyMap("devDependencies" in input ? input.devDependencies : undefined),
  };
}

/** Shared source uses consumer-owned dependencies and Vite's active export conditions. */
export function docsSiteCorePlugin(configUrl: string) {
  const consumer = fileURLToPath(configUrl);
  const manifest = dependencyManifest(JSON.parse(readFileSync(new URL("./package.json", configUrl), "utf8")));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  if (!dependencies["@docsfn/core"]) {
    throw new Error("Run shared docs tooling from a consumer declaring @docsfn/core.");
  }
  return {
    name: "docs-site-pinned-core",
    enforce: "pre",
    config() {
      if (dependencies["gray-matter"]) {
        // Dev SSR needs CJS-to-ESM prebundling from the actual consumer owner.
        // Production uses Rollup's normal bundling, including Cloudflare builds.
        return { ssr: {
          optimizeDeps: { include: ["gray-matter"] },
          // Shared source's bare imports have no standalone parent install.
          // Keep ESM adapters in Vite so its consumer resolver stays in charge.
          noExternal: ["@docsfn/core", "@docsfn/provider-fs", "@docsfn/sveltekit", "@sveltejs/kit"],
        } };
      }
    },
    async resolveId(source, importer) {
      if (!importer?.replaceAll("\\", "/").includes("/scripts/docs-site/")) return;
      const owner = ["@docsfn/core", "@docsfn/provider-fs", "@docsfn/sveltekit", "@sveltejs/kit", "gray-matter", "vitest", "vite"]
        .find((name) => source === name || source.startsWith(`${name}/`));
      if (!owner) return;
      if (!dependencies[owner]) throw new Error(`Docs consumer must declare ${owner}.`);
      // Preserve browser/import/SSR conditions and dependency-owned imports.
      return this.resolve(source, consumer, { skipSelf: true });
    },
  } satisfies Plugin;
}
