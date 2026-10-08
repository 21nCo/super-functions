import path from "node:path";
import { sourceAliases } from "./source-aliases.mjs";
import { fileURLToPath } from "node:url";
import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

const thisFilePath = fileURLToPath(import.meta.url);
const thisDirectory = path.dirname(thisFilePath);
const fromDocsRoot = (...segments) => path.resolve(thisDirectory, ...segments);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess({ script: true }),
  kit: {
    adapter: adapter(),
    alias: {
      ...sourceAliases,
      "@docsfn/core": fromDocsRoot("../core/src/index.ts"),
      "@docsfn/provider-fs": fromDocsRoot("../provider-fs/src/index.ts"),
      "@docsfn/sveltekit": fromDocsRoot("../sveltekit/src/index.ts"),
      "@docsfn/svelte": fromDocsRoot("../svelte/src/index.ts"),
    },
  },
};

export default config;
