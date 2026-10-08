import path from "node:path";
import { docsSiteCorePlugin } from "../../scripts/docs-site/vite";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const docsfnSvelteSrc = path.join(
  path.dirname(path.dirname(require.resolve("@docsfn/svelte/theme.css"))),
  "src"
);

export default defineConfig({
  plugins: [docsSiteCorePlugin(import.meta.url), tailwindcss(), sveltekit()],
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
    ],
  },
});
