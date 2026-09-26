import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const docsfnCore = path.dirname(require.resolve("@docsfn/core"));
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    // Force @docsfn/core through Vite's transform pipeline so the
    // `@searchfn/client` alias below resolves the workspace source in dev.
    // Without this, the dynamic `import("@searchfn/client")` inside
    // @docsfn/core is externalized and resolved by Node, which fails because
    // @searchfn/client is not installed as a dependency and its dist is not
    // built in the monorepo.
    noExternal: ["@docsfn/core", "@docsfn/svelte"],
  },
  resolve: {
    alias: [
      { find: "@site/docs-search", replacement: path.resolve(dirname, "../../scripts/docs-site/Search.svelte") },
      // Resolve shared source against this site's pinned DocsFn installation.
      { find: /^@docsfn\/core$/, replacement: path.join(docsfnCore, "index.js") },
      { find: "@docsfn/core/search-runtime", replacement: path.join(docsfnCore, "search-runtime.js") },
      { find: "@searchfn/client", replacement: path.resolve(dirname, "../../searchfn/client/src/index.ts") },
      { find: "@searchfn/core", replacement: path.resolve(dirname, "../../searchfn/core/src/index.ts") },
      { find: "@searchfn/adapter-contracts", replacement: path.resolve(dirname, "../../searchfn/adapter-contracts/src/index.ts") },
      { find: "@searchfn/adapter-memory", replacement: path.resolve(dirname, "../../searchfn/adapter-memory/src/index.ts") },
      { find: "@searchfn/adapter-indexeddb", replacement: path.resolve(dirname, "../../searchfn/adapter-indexeddb/src/index.ts") },
    ],
  },
});
