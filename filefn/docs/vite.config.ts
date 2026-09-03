import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const docsfnSvelteSrc = path.join(
  path.dirname(path.dirname(require.resolve("@docsfn/svelte/theme.css"))),
  "src"
);

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    noExternal: ["@docsfn/core", "@docsfn/svelte"],
  },
  resolve: {
    alias: [
      { find: "@site/docs-content", replacement: path.join(docsfnSvelteSrc, "DocsContent.svelte") },
      { find: "@site/docs-layout", replacement: path.join(docsfnSvelteSrc, "DocsLayout.svelte") },
      { find: "@site/topbar", replacement: path.join(docsfnSvelteSrc, "TopBar.svelte") },
      { find: "@site/breadcrumbs", replacement: path.join(docsfnSvelteSrc, "Breadcrumbs.svelte") },
      { find: "@site/pagination", replacement: path.join(docsfnSvelteSrc, "Pagination.svelte") },
      { find: "@site/docs-sidebar", replacement: path.join(docsfnSvelteSrc, "DocsSidebar.svelte") },
      { find: "@site/docs-toc", replacement: path.join(docsfnSvelteSrc, "DocsToc.svelte") },
      { find: "@site/api-reference-renderer", replacement: path.join(docsfnSvelteSrc, "ApiReferenceRenderer.svelte") },
      { find: "@site/docs-search", replacement: path.join(docsfnSvelteSrc, "DocsSearch.svelte") },
      { find: "@searchfn/client", replacement: path.resolve(dirname, "../../searchfn/client/src/index.ts") },
      { find: "@searchfn/core", replacement: path.resolve(dirname, "../../searchfn/core/src/index.ts") },
      { find: "@searchfn/adapter-contracts", replacement: path.resolve(dirname, "../../searchfn/adapter-contracts/src/index.ts") },
      { find: "@searchfn/adapter-memory", replacement: path.resolve(dirname, "../../searchfn/adapter-memory/src/index.ts") },
      { find: "@searchfn/adapter-indexeddb", replacement: path.resolve(dirname, "../../searchfn/adapter-indexeddb/src/index.ts") },
    ],
  },
});
