import path from "node:path";
import { docsSiteCorePlugin } from "../../scripts/docs-site/vite";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, type PluginOption } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [docsSiteCorePlugin(import.meta.url), tailwindcss(), sveltekit()] satisfies PluginOption[],
  ssr: {
    // Declared consumer peers resolve public exports; Turbo prepares workspace dist.
    noExternal: ["@docsfn/core", "@docsfn/svelte"],
  },
  resolve: {
    alias: [
      // Resolve shared source against this site's pinned DocsFn installation.
    ],
  },
});
