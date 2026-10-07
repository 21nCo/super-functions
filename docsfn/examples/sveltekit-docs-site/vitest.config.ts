import { resolve } from "node:path";
import { sourceAliases } from "./source-aliases.mjs";
import { fileURLToPath } from "node:url";
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    svelte({
      preprocess: vitePreprocess(),
    }),
  ],
  resolve: {
    conditions: ["browser"],
    alias: [
      ...sourceAliases.filter((alias) => alias.find !== "@uifn/svelte"),
      // Render unit tests use a minimal UI adapter; the app and the dedicated
      // DocsFn integration suite exercise the real UiFn components.
      { find: "@uifn/svelte", replacement: resolve(root, "../../svelte/src/test-utils/uifn-svelte-stub.ts") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
